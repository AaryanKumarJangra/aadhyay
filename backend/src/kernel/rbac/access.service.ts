import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, or, gte, lte, sql } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { RedisService } from '../redis/redis.service';
import { membership, roleAssignment, role } from '../../db/schema';
import type { Scope } from '../context/request-context';

export interface AccessInfo {
  membershipIds: string[];
  kinds: string[];
  personIds: Record<string, string>;
  permissions: string[];
  scopes: Scope[];
}

@Injectable()
export class AccessService {
  constructor(private readonly db: DbService, private readonly redis: RedisService) {}

  private async version(tenantId: string) {
    return (await this.redis.client.get(`accv:${tenantId}`)) ?? '0';
  }
  /** Call after any role / membership change in a tenant. */
  async bust(tenantId: string) {
    await this.redis.client.incr(`accv:${tenantId}`);
  }

  async load(tenantId: string, userId: string): Promise<AccessInfo | null> {
    const v = await this.version(tenantId);
    const ck = `acc:${tenantId}:${userId}:${v}`;
    const cached = await this.redis.getJson<AccessInfo>(ck);
    if (cached) return cached;
    const mems = await this.db.admin.select().from(membership).where(and(eq(membership.tenantId, tenantId), eq(membership.userId, userId), eq(membership.status, 'active')));
    if (!mems.length) return null;
    const now = new Date();
    const assigns = await this.db.admin
      .select({ perms: role.permissions, scopeKind: roleAssignment.scopeKind, scopeId: roleAssignment.scopeId })
      .from(roleAssignment)
      .innerJoin(role, eq(role.id, roleAssignment.roleId))
      .where(
        and(
          inArray(roleAssignment.membershipId, mems.map((m) => m.id)),
          or(isNull(roleAssignment.validFrom), lte(roleAssignment.validFrom, now)),
          or(isNull(roleAssignment.validTo), gte(roleAssignment.validTo, now)),
        ),
      );
    const perms = new Set<string>();
    const scopes: Scope[] = [];
    for (const a of assigns) {
      a.perms.forEach((p) => perms.add(p));
      scopes.push({ kind: a.scopeKind, id: a.scopeId });
    }
    const kinds = mems.map((m) => m.kind);
    if (kinds.includes('guardian') || kinds.includes('student')) perms.add('self.*');
    const info: AccessInfo = {
      membershipIds: mems.map((m) => m.id),
      kinds,
      personIds: Object.fromEntries(mems.filter((m) => m.personId).map((m) => [m.kind, m.personId!])),
      permissions: [...perms],
      scopes,
    };
    await this.redis.setJson(ck, info, 300);
    return info;
  }
}
