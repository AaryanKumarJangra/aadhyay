import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Org, ROLE_TEMPLATES } from '@aadhyay/contracts';
import { DbService } from '../../db/db.service';
import { tenant, academicSession, branch, role, roleAssignment, membership, user, customFieldDef, tenantModule } from '../../db/schema';
import { Can, AllowSuspended } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { Ctx } from '../../kernel/context/request-context';
import { badRequest, notFound } from '../../common/errors';
import { MembersService } from './members.service';
import { AccessService } from '../../kernel/rbac/access.service';
import { TenantService } from '../../kernel/tenancy/tenant.service';
import { crudController } from '../../common/crud';

@Controller('org')
export class OrgController {
  constructor(private readonly db: DbService, private readonly members: MembersService, private readonly access: AccessService, private readonly tenants: TenantService) {}

  @AllowSuspended() @Get('profile')
  async profile() {
    const [t] = await this.db.admin.select().from(tenant).where(eq(tenant.id, Ctx.tenantId()));
    const modules = await this.tenants.enabledModules(t!.id);
    return { id: t!.id, slug: t!.slug, name: t!.name, segment: t!.segment, status: t!.status, city: t!.city, state: t!.state, stateCode: t!.stateCode, gstin: t!.gstin, timezone: t!.timezone, branding: t!.branding, settings: t!.settings, planCode: t!.planCode, modules: [...modules], trialEndsAt: t!.trialEndsAt, periodEndsAt: t!.periodEndsAt };
  }

  @Can('org.settings.edit') @Patch('profile')
  async updateProfile(@Body(Z(z.object({ name: z.string().min(2).optional(), city: z.string().optional(), state: z.string().optional(), stateCode: z.string().regex(/^\d{2}$/).optional(), gstin: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/).optional(), billingEmail: z.string().email().optional() }))) b: any) {
    const [t] = await this.db.admin.update(tenant).set(b).where(eq(tenant.id, Ctx.tenantId())).returning();
    await this.tenants.invalidate(t!);
    return t;
  }

  @Can('org.settings.edit') @Patch('branding')
  async branding(@Body(Z(Org.brandingInput)) b: any) {
    const [t] = await this.db.admin.update(tenant).set({ branding: sql`${tenant.branding} || ${JSON.stringify(b)}::jsonb` }).where(eq(tenant.id, Ctx.tenantId())).returning();
    return t!.branding;
  }

  @Can('org.settings.edit') @Patch('settings')
  async settings(@Body(Z(z.record(z.string(), z.unknown()))) b: Record<string, unknown>) {
    delete (b as any).payments; // gateway keys use the dedicated endpoint (encrypted)
    const [t] = await this.db.admin.update(tenant).set({ settings: sql`${tenant.settings} || ${JSON.stringify(b)}::jsonb` }).where(eq(tenant.id, Ctx.tenantId())).returning();
    return t!.settings;
  }

  // ---- Academic sessions ----
  @Can('org.session.view') @Get('sessions')
  sessions() {
    return this.db.t((tx) => tx.select().from(academicSession).orderBy(academicSession.startsOn));
  }
  @Can('org.session.create') @Post('sessions')
  async createSession(@Body(Z(Org.sessionInput)) b: any) {
    return this.db.t(async (tx) => {
      if (b.isCurrent) await tx.update(academicSession).set({ isCurrent: false });
      const [r] = await tx.insert(academicSession).values({ ...b, tenantId: Ctx.tenantId() }).returning();
      return r;
    });
  }
  @Can('org.session.edit') @Post('sessions/:id/make-current')
  async makeCurrent(@Param('id') id: string) {
    return this.db.t(async (tx) => {
      await tx.update(academicSession).set({ isCurrent: false });
      const [r] = await tx.update(academicSession).set({ isCurrent: true }).where(eq(academicSession.id, id)).returning();
      if (!r) throw notFound('Session');
      return r;
    });
  }

  // ---- Roles & permissions (custom roles: docs/03 §2.2) ----
  @Can('org.role.view') @Get('roles')
  roles() {
    return this.db.t((tx) => tx.select().from(role).orderBy(role.name));
  }
  @Get('role-templates') @Can('org.role.view')
  templates() {
    return ROLE_TEMPLATES;
  }
  @Can('org.role.create') @Post('roles')
  async createRole(@Body(Z(Org.roleInput)) b: any) {
    const [r] = await this.db.t((tx) => tx.insert(role).values({ ...b, tenantId: Ctx.tenantId() }).returning());
    return r;
  }
  @Can('org.role.edit') @Patch('roles/:id')
  async updateRole(@Param('id') id: string, @Body(Z(Org.roleInput.partial())) b: any) {
    const [r] = await this.db.t((tx) => tx.update(role).set({ name: b.name, description: b.description, permissions: b.permissions }).where(eq(role.id, id)).returning());
    if (!r) throw notFound('Role');
    await this.access.bust(Ctx.tenantId());
    return r;
  }
  @Can('org.role.delete') @Delete('roles/:id')
  async deleteRole(@Param('id') id: string) {
    const [r] = await this.db.t((tx) => tx.select().from(role).where(eq(role.id, id)));
    if (!r) throw notFound('Role');
    if (r.isSystem) throw badRequest('System roles cannot be deleted; edit them instead');
    await this.db.t((tx) => tx.delete(role).where(eq(role.id, id)));
    await this.access.bust(Ctx.tenantId());
    return { ok: true };
  }

  // ---- Members (logins) ----
  @Can('org.member.view') @Get('members')
  async listMembers() {
    const tid = Ctx.tenantId();
    const rows = await this.db.admin
      .select({ membershipId: membership.id, kind: membership.kind, status: membership.status, personId: membership.personId, userId: user.id, name: user.name, phone: user.phone, email: user.email, lastActiveAt: user.lastActiveAt })
      .from(membership).innerJoin(user, eq(user.id, membership.userId)).where(and(eq(membership.tenantId, tid), eq(membership.kind, 'staff')));
    const assigns = await this.db.admin.select({ membershipId: roleAssignment.membershipId, roleKey: role.key, roleName: role.name, scopeKind: roleAssignment.scopeKind, scopeId: roleAssignment.scopeId })
      .from(roleAssignment).innerJoin(role, eq(role.id, roleAssignment.roleId)).where(eq(roleAssignment.tenantId, tid));
    return rows.map((r) => ({ ...r, roles: assigns.filter((a) => a.membershipId === r.membershipId) }));
  }
  @Can('org.member.create') @Post('members')
  invite(@Body(Z(Org.inviteMember)) b: any) {
    return this.members.link(b);
  }
  @Can('org.member.edit') @Post('members/:id/roles')
  async setRoles(@Param('id') id: string, @Body(Z(z.object({ roleKeys: z.array(z.string()), scopeKind: z.enum(['tenant', 'branch', 'class', 'section', 'own']).default('tenant'), scopeId: z.string().uuid().optional(), replace: z.boolean().default(true) }))) b: any) {
    if (b.replace) await this.db.admin.delete(roleAssignment).where(and(eq(roleAssignment.membershipId, id), eq(roleAssignment.tenantId, Ctx.tenantId())));
    await this.members.assignRoles(id, b.roleKeys, b.scopeKind, b.scopeId);
    return { ok: true };
  }
  @Can('org.member.delete') @Delete('members/:id')
  async removeMember(@Param('id') id: string) {
    await this.members.revoke(id);
    return { ok: true };
  }

  @Can('org.settings.view') @Get('modules')
  async modules() {
    return this.db.admin.select().from(tenantModule).where(eq(tenantModule.tenantId, Ctx.tenantId()));
  }
}

export const BranchCrud = crudController({ path: 'org/branches', module: 'org', perm: 'org.branch', table: branch as any, create: Org.branchInput, search: [branch.name, branch.code], sort: { column: branch.name, dir: 'asc' } });
export const CustomFieldCrud = crudController({
  path: 'org/custom-fields', module: 'org', perm: 'org.settings', table: customFieldDef as any,
  create: z.object({ entity: z.enum(['student', 'staff', 'guardian', 'lead']), key: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/), label: z.string(), type: z.enum(['text', 'number', 'date', 'select', 'boolean']), options: z.array(z.string()).default([]), required: z.boolean().default(false), order: z.number().int().default(0) }),
  filters: { entity: customFieldDef.entity }, sort: { column: customFieldDef.order, dir: 'asc' },
});
