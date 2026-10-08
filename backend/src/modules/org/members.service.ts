import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { membership, role, roleAssignment, guardian, staff, student } from '../../db/schema';
import { AuthService } from '../../kernel/auth/auth.service';
import { AccessService } from '../../kernel/rbac/access.service';
import { Ctx } from '../../kernel/context/request-context';

/** Links a person record (staff/student/guardian) to a global user login + tenant membership + roles. */
@Injectable()
export class MembersService {
  constructor(private readonly db: DbService, private readonly auth: AuthService, private readonly access: AccessService) {}

  async link(opts: { phone: string; name: string; kind: 'staff' | 'student' | 'guardian' | 'alumni'; personId?: string; roleKeys?: string[]; scopeKind?: 'tenant' | 'branch' | 'class' | 'section' | 'own'; scopeId?: string }) {
    const tenantId = Ctx.tenantId();
    const u = await this.auth.ensureUser(opts.phone, opts.name);
    const [m] = await this.db.admin
      .insert(membership)
      .values({ tenantId, userId: u.id, kind: opts.kind, personId: opts.personId })
      .onConflictDoUpdate({ target: [membership.tenantId, membership.userId, membership.kind], set: { personId: opts.personId, status: 'active' } })
      .returning();
    if (opts.personId) {
      const tbl = opts.kind === 'guardian' ? guardian : opts.kind === 'staff' ? staff : opts.kind === 'student' ? student : null;
      if (tbl) await this.db.admin.update(tbl).set({ userId: u.id } as any).where(and(eq(tbl.id, opts.personId), eq(tbl.tenantId, tenantId)));
    }
    if (opts.roleKeys?.length) await this.assignRoles(m!.id, opts.roleKeys, opts.scopeKind, opts.scopeId);
    await this.access.bust(tenantId);
    return { userId: u.id, membershipId: m!.id };
  }

  async assignRoles(membershipId: string, roleKeys: string[], scopeKind: 'tenant' | 'branch' | 'class' | 'section' | 'own' = 'tenant', scopeId?: string) {
    const tenantId = Ctx.tenantId();
    const roles = await this.db.admin.select().from(role).where(and(eq(role.tenantId, tenantId), inArray(role.key, roleKeys)));
    for (const r of roles) {
      const [exists] = await this.db.admin.select({ id: roleAssignment.id }).from(roleAssignment).where(and(eq(roleAssignment.membershipId, membershipId), eq(roleAssignment.roleId, r.id))).limit(1);
      if (!exists) await this.db.admin.insert(roleAssignment).values({ tenantId, membershipId, roleId: r.id, scopeKind, scopeId: scopeId ?? null });
    }
    await this.access.bust(tenantId);
  }

  async revoke(membershipId: string) {
    const tenantId = Ctx.tenantId();
    await this.db.admin.update(membership).set({ status: 'inactive' }).where(and(eq(membership.id, membershipId), eq(membership.tenantId, tenantId)));
    await this.access.bust(tenantId);
  }
}
