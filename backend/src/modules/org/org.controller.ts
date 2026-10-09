import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Org, ROLE_TEMPLATES, grantAuthority, validateRole, type RoleDraft } from '@aadhyay/contracts';
import { DbService } from '../../db/db.service';
import { tenant, academicSession, branch, role, roleAssignment, membership, user, customFieldDef, tenantModule, section, schoolClass } from '../../db/schema';
import { Can, AllowSuspended } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { Ctx } from '../../kernel/context/request-context';
import { AppError, badRequest, conflict, notFound } from '../../common/errors';
import { principal, ACCESS_CONTACT } from '../../kernel/authz/authz';
import { AuditService } from '../../kernel/audit/audit.service';
import { roleDraft } from './access.controller';
import { MembersService } from './members.service';
import { AccessService } from '../../kernel/rbac/access.service';
import { TenantService } from '../../kernel/tenancy/tenant.service';
import { crudController } from '../../common/crud';

@Controller('org')
export class OrgController {
  constructor(private readonly db: DbService, private readonly members: MembersService, private readonly access: AccessService, private readonly tenants: TenantService, private readonly audit: AuditService) {}

  /** Grant authority: refuse with every reason when the actor may not grant (or take away) this role. */
  private assertAuthority(r: RoleDraft, verb: string) {
    const a = grantAuthority(principal(), r);
    if (!a.ok) throw new AppError('FORBIDDEN', `You cannot ${verb}: ${a.problems[0]!.reason}`, { denial: 'GRANT_AUTHORITY', problems: a.problems, contact: ACCESS_CONTACT });
  }
  private assertValid(r: RoleDraft) {
    const v = validateRole(r);
    if (!v.ok) throw new AppError('VALIDATION_FAILED', v.problems[0]!.reason, { problems: v.problems });
  }
  private draftOf(r: { permissions: string[]; scopes: unknown; conditions: unknown }): RoleDraft {
    return { permissions: r.permissions, scopes: (r.scopes ?? {}) as any, conditions: (r.conditions ?? {}) as any };
  }
  /** Roles currently held by a membership. */
  private async rolesOf(membershipId: string) {
    return this.db.admin.select({ id: role.id, key: role.key, name: role.name, permissions: role.permissions, scopes: role.scopes, conditions: role.conditions })
      .from(roleAssignment).innerJoin(role, eq(role.id, roleAssignment.roleId)).where(and(eq(roleAssignment.membershipId, membershipId), eq(roleAssignment.tenantId, Ctx.tenantId())));
  }
  private async ownerCount() {
    const [r] = await this.db.admin.select({ n: sql<number>`count(distinct ${roleAssignment.membershipId})::int` }).from(roleAssignment)
      .innerJoin(role, eq(role.id, roleAssignment.roleId)).innerJoin(membership, eq(membership.id, roleAssignment.membershipId))
      .where(and(eq(roleAssignment.tenantId, Ctx.tenantId()), eq(role.key, 'owner'), eq(membership.status, 'active')));
    return r?.n ?? 0;
  }
  private isSelf(membershipId: string) {
    return (Ctx.get().membershipIds ?? []).includes(membershipId);
  }
  private actorIsOwner() {
    return (Ctx.get().grants ?? []).some((g) => g.pattern === '*' && g.scope === 'tenant');
  }

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
  async roles() {
    const rows = await this.db.t((tx) => tx.select().from(role).orderBy(role.name));
    const counts = await this.db.admin.select({ roleId: roleAssignment.roleId, n: sql<number>`count(*)::int` }).from(roleAssignment).where(eq(roleAssignment.tenantId, Ctx.tenantId())).groupBy(roleAssignment.roleId);
    const p = principal();
    return rows.map((r) => ({ ...r, members: counts.find((c) => c.roleId === r.id)?.n ?? 0, canEdit: r.key !== 'owner' && grantAuthority(p, this.draftOf(r)).ok }));
  }
  @Get('role-templates') @Can('org.role.view')
  templates() {
    return ROLE_TEMPLATES;
  }
  @Can('org.role.create') @Post('roles')
  async createRole(@Body(Z(Org.roleInput.merge(roleDraft.pick({ scopes: true, conditions: true })))) b: any) {
    const draft = this.draftOf(b);
    this.assertValid(draft);
    this.assertAuthority(draft, 'create this role');
    const [r] = await this.db.t((tx) => tx.insert(role).values({ tenantId: Ctx.tenantId(), key: b.key, name: b.name, description: b.description, ...draft, isSystem: false, isCustomized: true }).returning());
    await this.audit.record('role.create', 'role', r!.id, { after: draft, name: b.name });
    return r;
  }
  @Can('org.role.edit') @Patch('roles/:id')
  async updateRole(@Param('id') id: string, @Body(Z(Org.roleInput.omit({ key: true }).partial().merge(roleDraft.pick({ scopes: true, conditions: true }).partial()))) b: any) {
    const [cur] = await this.db.t((tx) => tx.select().from(role).where(eq(role.id, id)));
    if (!cur) throw notFound('Role');
    if (cur.key === 'owner') throw new AppError('FORBIDDEN', 'The Owner role always has full access and cannot be edited.', { denial: 'PROTECTED_ROLE' });
    const next = this.draftOf({ permissions: b.permissions ?? cur.permissions, scopes: b.scopes ?? cur.scopes, conditions: b.conditions ?? cur.conditions });
    this.assertValid(next);
    this.assertAuthority(this.draftOf(cur), 'change this role');
    this.assertAuthority(next, 'save this role');
    const [r] = await this.db.t((tx) => tx.update(role).set({ name: b.name ?? cur.name, description: b.description ?? cur.description, ...next, isCustomized: true }).where(eq(role.id, id)).returning());
    await this.access.bust(Ctx.tenantId());
    await this.audit.record('role.update', 'role', id, { before: this.draftOf(cur), after: next });
    return r;
  }
  @Can('org.role.delete') @Delete('roles/:id')
  async deleteRole(@Param('id') id: string) {
    const [r] = await this.db.t((tx) => tx.select().from(role).where(eq(role.id, id)));
    if (!r) throw notFound('Role');
    if (r.isSystem) throw badRequest('System roles cannot be deleted; edit them instead');
    this.assertAuthority(this.draftOf(r), 'delete this role');
    const [used] = await this.db.admin.select({ n: sql<number>`count(*)::int` }).from(roleAssignment).where(and(eq(roleAssignment.roleId, id), eq(roleAssignment.tenantId, Ctx.tenantId())));
    if (used!.n) throw conflict(`${used!.n} ${used!.n === 1 ? 'person has' : 'people have'} this role. Move them to another role first.`);
    await this.db.t((tx) => tx.delete(role).where(eq(role.id, id)));
    await this.access.bust(Ctx.tenantId());
    await this.audit.record('role.delete', 'role', id, { before: this.draftOf(r), name: r.name });
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
  /** Roles by key in this tenant; every key must exist. */
  private async rolesByKey(keys: string[]) {
    if (!keys.length) return [];
    const rows = await this.db.admin.select().from(role).where(and(eq(role.tenantId, Ctx.tenantId()), inArray(role.key, keys)));
    const missing = keys.filter((k) => !rows.some((r) => r.key === k));
    if (missing.length) throw badRequest(`Unknown role: ${missing.join(', ')}`);
    return rows;
  }
  /** A scoped assignment must point at a real section or class of this institution. */
  private async assertScopeTarget(kind: string, id?: string) {
    if (kind !== 'section' && kind !== 'class') return;
    if (!id) throw badRequest(`Choose the ${kind} this role applies to`);
    const tbl = kind === 'section' ? section : schoolClass;
    const [x] = await this.db.t((tx) => tx.select({ id: tbl.id }).from(tbl).where(eq(tbl.id, id)));
    if (!x) throw badRequest(`That ${kind} does not exist`);
  }

  @Can('org.member.create') @Post('members')
  async invite(@Body(Z(Org.inviteMember)) b: any) {
    for (const r of await this.rolesByKey(b.roleKeys)) this.assertAuthority(this.draftOf(r), `give the role \u201c${r.name}\u201d`);
    await this.assertScopeTarget(b.scopeKind, b.scopeId);
    const res = await this.members.link(b);
    await this.audit.record('member.invite', 'membership', res.membershipId, { roles: b.roleKeys, scopeKind: b.scopeKind, scopeId: b.scopeId ?? null });
    return res;
  }
  @Can('org.member.edit') @Post('members/:id/roles')
  async setRoles(@Param('id') id: string, @Body(Z(z.object({ roleKeys: z.array(z.string()), scopeKind: z.enum(['tenant', 'branch', 'class', 'section', 'own']).default('tenant'), scopeId: z.string().uuid().optional(), replace: z.boolean().default(true) }))) b: any) {
    const [m] = await this.db.admin.select().from(membership).where(and(eq(membership.id, id), eq(membership.tenantId, Ctx.tenantId())));
    if (!m) throw notFound('Member');
    if (this.isSelf(id) && !this.actorIsOwner()) throw new AppError('FORBIDDEN', 'You cannot change your own roles. Ask the institution owner.', { denial: 'SELF_ASSIGNMENT', contact: ACCESS_CONTACT });
    const adding = await this.rolesByKey(b.roleKeys);
    const current = await this.rolesOf(id);
    const removing = b.replace ? current.filter((c) => !b.roleKeys.includes(c.key)) : [];
    for (const r of adding) this.assertAuthority(this.draftOf(r), `give the role \u201c${r.name}\u201d`);
    for (const r of removing) this.assertAuthority(this.draftOf(r), `take away the role \u201c${r.name}\u201d`);
    if (removing.some((r) => r.key === 'owner') && (await this.ownerCount()) <= 1) throw conflict('This is the only owner. Make someone else an owner first.');
    await this.assertScopeTarget(b.scopeKind, b.scopeId);
    if (b.replace) await this.db.admin.delete(roleAssignment).where(and(eq(roleAssignment.membershipId, id), eq(roleAssignment.tenantId, Ctx.tenantId())));
    await this.members.assignRoles(id, b.roleKeys, b.scopeKind, b.scopeId);
    await this.audit.record('member.roles', 'membership', id, { before: current.map((r) => r.key), after: b.roleKeys, scopeKind: b.scopeKind, scopeId: b.scopeId ?? null });
    return { ok: true };
  }
  @Can('org.member.delete') @Delete('members/:id')
  async removeMember(@Param('id') id: string) {
    if (this.isSelf(id)) throw new AppError('FORBIDDEN', 'You cannot deactivate your own login.', { denial: 'SELF_ASSIGNMENT' });
    const current = await this.rolesOf(id);
    for (const r of current) this.assertAuthority(this.draftOf(r), `deactivate someone with the role \u201c${r.name}\u201d`);
    if (current.some((r) => r.key === 'owner') && (await this.ownerCount()) <= 1) throw conflict('This is the only owner and cannot be deactivated.');
    await this.members.revoke(id);
    await this.audit.record('member.deactivate', 'membership', id, { roles: current.map((r) => r.key) });
    return { ok: true };
  }

  @Can('org.settings.view') @Get('modules')
  async modules() {
    return this.db.admin.select().from(tenantModule).where(eq(tenantModule.tenantId, Ctx.tenantId()));
  }
}

export const BranchCrud = crudController({ path: 'org/branches', module: 'org', perm: 'org.branch', table: branch as any, create: Org.branchInput, search: [branch.name, branch.code], sort: { column: branch.name, dir: 'asc' } });
export const CustomFieldCrud = crudController({
  path: 'org/custom-fields', module: 'org', perm: 'org.customfield', table: customFieldDef as any,
  create: z.object({ entity: z.enum(['student', 'staff', 'guardian', 'lead']), key: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/), label: z.string(), type: z.enum(['text', 'number', 'date', 'select', 'boolean']), options: z.array(z.string()).default([]), required: z.boolean().default(false), order: z.number().int().default(0) }),
  filters: { entity: customFieldDef.entity }, sort: { column: customFieldDef.order, dir: 'asc' },
});
