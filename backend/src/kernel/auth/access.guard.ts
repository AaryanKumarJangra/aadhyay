import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { hasPermission, type ModuleKey } from '@aadhyay/contracts';
import type { FastifyRequest } from 'fastify';
import { AppError, forbidden } from '../../common/errors';
import { Ctx } from '../context/request-context';
import { TokenService, AccessClaims } from './token.service';
import { TenantService } from '../tenancy/tenant.service';
import { AccessService } from '../rbac/access.service';
import { RedisService } from '../redis/redis.service';
import { DbService } from '../../db/db.service';
import { attendanceDevice } from '../../db/schema';
import { sha256 } from '../../common/crypto';
import {
  META_ALLOW_SUSPENDED, META_DEVICE, META_MODULE, META_PERM, META_PLATFORM, META_PUBLIC, META_TENANT,
} from './decorators';

const BLOCKED_STATES = new Set(['suspended', 'archived', 'purged']);

/**
 * Single global guard (order matters, so it is one class):
 * token → platform check → tenant resolution → membership & permissions → suspension → module → permission.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly tenants: TenantService,
    private readonly access: AccessService,
    private readonly redis: RedisService,
    private readonly db: DbService,
  ) {}

  private meta<T>(key: string, ctx: ExecutionContext): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [ctx.getHandler(), ctx.getClass()]);
  }

  async canActivate(ec: ExecutionContext): Promise<boolean> {
    if (ec.getType() !== 'http') return true;
    const req = ec.switchToHttp().getRequest<FastifyRequest>();
    const ctx = Ctx.get();
    const isPublic = !!this.meta<boolean>(META_PUBLIC, ec);
    const tenantMode = this.meta<string>(META_TENANT, ec) ?? (isPublic ? 'optional' : 'required');
    const platformRoles = this.meta<string[]>(META_PLATFORM, ec);
    const isDevice = !!this.meta<boolean>(META_DEVICE, ec);

    // 1. Device key (attendance scanners, GPS boxes)
    if (isDevice) {
      const key = req.headers['x-device-key'];
      if (typeof key !== 'string') throw new AppError('UNAUTHENTICATED', 'Device key required');
      const [d] = await this.db.admin.select().from(attendanceDevice).where(eq(attendanceDevice.apiKeyHash, sha256(key))).limit(1);
      if (!d || !d.isActive) throw new AppError('UNAUTHENTICATED', 'Invalid device key');
      ctx.tenantId = d.tenantId;
      ctx.permissions = new Set(['attendance.device.*']);
      (req as any).device = d;
      return true;
    }

    // 2. Bearer token
    const auth = req.headers.authorization;
    let claims: AccessClaims | undefined;
    if (auth?.startsWith('Bearer ')) {
      try {
        claims = await this.tokens.verify(auth.slice(7));
      } catch {
        if (!isPublic) throw new AppError('UNAUTHENTICATED', 'Session expired, please log in again');
      }
      if (claims && (await this.redis.client.exists(`revoked:${claims.sid}`))) {
        throw new AppError('UNAUTHENTICATED', 'Session revoked');
      }
    }

    // 3. Platform (control plane)
    if (platformRoles) {
      if (claims?.typ !== 'platform') throw new AppError('UNAUTHENTICATED', 'Platform login required');
      if (!platformRoles.includes('*') && !platformRoles.includes(claims.role!) && claims.role !== 'super_admin') throw forbidden();
      ctx.platformUser = { id: claims.sub, role: claims.role! };
      return true;
    }
    if (claims?.typ === 'access') {
      ctx.userId = claims.sub;
      ctx.sessionId = claims.sid;
    }
    if (!isPublic && !ctx.userId) throw new AppError('UNAUTHENTICATED', 'Login required');

    // 4. Tenant resolution: token → X-Tenant header → host
    if (tenantMode !== 'none') {
      const headerKey = req.headers['x-tenant'];
      let t = claims?.tid ? await this.tenants.byIdOrSlug(claims.tid) : null;
      if (!t && typeof headerKey === 'string' && headerKey) t = headerKey.includes('.') ? await this.tenants.byHost(headerKey) : await this.tenants.byIdOrSlug(headerKey);
      if (!t) {
        const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? '';
        t = await this.tenants.byHost(host);
      }
      if (claims?.tid && t && t.id !== claims.tid) throw forbidden('Tenant mismatch');
      if (!t && tenantMode === 'required') throw new AppError('BAD_REQUEST', 'Select an institution first');
      if (t) {
        ctx.tenantId = t.id;
        ctx.tenantSlug = t.slug;
        ctx.tenantStatus = t.status;
        ctx.tenantTz = t.timezone;
        if (ctx.userId) {
          const acc = await this.access.load(t.id, ctx.userId);
          if (!acc && tenantMode === 'required' && !isPublic) throw forbidden('You are not a member of this institution');
          if (acc) {
            ctx.membershipIds = acc.membershipIds;
            ctx.kinds = acc.kinds;
            ctx.personIds = acc.personIds;
            ctx.permissions = new Set(acc.permissions);
            ctx.scopes = { all: acc.scopes };
          }
        }
        if (BLOCKED_STATES.has(t.status) && !isPublic && !this.meta<boolean>(META_ALLOW_SUSPENDED, ec)) {
          const isAdmin = ctx.permissions?.has('*');
          throw new AppError('TENANT_SUSPENDED', isAdmin ? 'Subscription expired. Please renew to continue.' : 'Service is temporarily unavailable. Please contact your institution.', { canPay: !!isAdmin });
        }
        const mod = this.meta<ModuleKey>(META_MODULE, ec);
        if (mod && !(await this.tenants.isModuleEnabled(t.id, mod))) throw new AppError('MODULE_DISABLED', `The ${mod} module is not enabled for this institution`);
      }
    }

    // 5. Permission
    const perms = this.meta<string[]>(META_PERM, ec);
    if (perms?.length) {
      const granted = ctx.permissions ?? new Set<string>();
      if (!perms.some((p) => hasPermission(granted, p))) throw forbidden();
    }
    return true;
  }
}
