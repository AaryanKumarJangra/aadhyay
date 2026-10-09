import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  CATALOGUE, CORE_MODULES, ROLE_TEMPLATES, SCOPE_LABEL, SCOPE_LEVELS, decide, describeGrant, effectiveAccess, expandPattern, grantAuthority,
  isKnownPermission, validateRole, type ModuleDef, type Principal,
} from '@aadhyay/contracts';
import { Can, AllowSuspended } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { Ctx } from '../../kernel/context/request-context';
import { badRequest, notFound } from '../../common/errors';
import { DbService } from '../../db/db.service';
import { membership, user } from '../../db/schema';
import { AccessService } from '../../kernel/rbac/access.service';
import { ACCESS_CONTACT, principal } from '../../kernel/authz/authz';

const scope = z.enum(SCOPE_LEVELS);
const conditions = z.object({ maxAmountPaise: z.number().int().nonnegative().optional(), sameDayOnly: z.boolean().optional(), makerChecker: z.boolean().optional() }).strict();
export const roleDraft = z.object({
  permissions: z.array(z.string().min(1)).max(500),
  scopes: z.record(z.string(), scope).default({}),
  conditions: z.record(z.string(), conditions).default({}),
});

/**
 * Roles & permissions support API: the catalogue, effective access, explanations and live role previews.
 * Everything here is read-only; role and membership changes live in OrgController.
 */
@Controller('access')
export class AccessController {
  constructor(private readonly db: DbService, private readonly access: AccessService) {}

  /** The permission catalogue, with each module's availability for this institution. */
  @AllowSuspended() @Get('catalogue')
  catalogue() {
    const enabled = new Set(Ctx.get().modules ?? []);
    return {
      scopes: SCOPE_LEVELS.map((s) => ({ key: s, label: SCOPE_LABEL[s] })),
      modules: Object.entries(CATALOGUE).map(([key, m]) => ({
        key, label: (m as ModuleDef).label, enabled: enabled.has(key) || (CORE_MODULES as string[]).includes(key),
        resources: Object.entries((m as ModuleDef).resources).map(([r, rd]) => ({
          key: r, label: rd.label,
          actions: Object.entries(rd.actions).map(([a, ad]) => ({ key: `${key}.${r}.${a}`, action: a, phrase: ad.phrase, scopes: ad.scopes ?? ['tenant'], conditions: ad.conditions ?? [], sensitive: !!ad.sensitive })),
        })),
      })),
      templates: Object.entries(ROLE_TEMPLATES).map(([key, t]) => ({ key, name: t.name, description: t.description, kind: t.kind })),
      contact: ACCESS_CONTACT,
    };
  }

  /** "What can I do here?" — the current user's effective access, with the role each permission comes from. */
  @AllowSuspended() @Get('me')
  me() {
    const c = Ctx.get();
    return { roles: c.roles ?? [], rows: effectiveAccess(principal()) };
  }

  /** "Why can't I do this?" — the engine's decision for the current user, in words. */
  @AllowSuspended() @Post('explain')
  explain(@Body(Z(z.object({ permission: z.string(), resource: z.object({ sectionId: z.string().uuid().optional(), studentId: z.string().uuid().optional(), subjectId: z.string().uuid().optional(), amountPaise: z.number().int().optional() }).optional() }))) b: any) {
    if (!isKnownPermission(b.permission)) throw badRequest(`Unknown permission ${b.permission}`);
    return { ...decide(principal(), b.permission, b.resource), contact: ACCESS_CONTACT };
  }

  /** Effective access of another member (Users & staff → "View effective access"). */
  @Can('org.member.view') @Get('members/:membershipId')
  async member(@Param('membershipId') id: string) {
    const tid = Ctx.tenantId();
    const [m] = await this.db.admin.select({ userId: membership.userId, name: user.name, kind: membership.kind }).from(membership).innerJoin(user, eq(user.id, membership.userId)).where(and(eq(membership.id, id), eq(membership.tenantId, tid)));
    if (!m) throw notFound('Member');
    const acc = await this.access.load(tid, m.userId);
    const p: Principal = { userId: m.userId, grants: acc?.grants ?? [], modules: Ctx.get().modules ?? [], self: { studentIds: acc?.studentIds ?? [], staffId: acc?.personIds.staff ?? null } };
    return { name: m.name, kind: m.kind, roles: acc?.roles ?? [], rows: effectiveAccess(p) };
  }

  /** Live preview while editing a role: plain-language summary, structural problems, and what *you* may not grant. */
  @Can('org.role.view') @Post('roles/preview')
  preview(@Body(Z(roleDraft)) b: z.infer<typeof roleDraft>) {
    const lines = b.permissions.flatMap((p) => (p === '*' ? [{ key: '*', text: describeGrant('*', 'tenant') }] : expandPattern(p).map((k) => ({ key: k, text: describeGrant(k, b.scopes[p] ?? 'tenant', b.conditions[p]) }))));
    return { lines, validation: validateRole(b), authority: grantAuthority(principal(), b) };
  }
}
