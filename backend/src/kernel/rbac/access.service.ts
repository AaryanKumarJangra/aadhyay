import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, or, gte, lte } from 'drizzle-orm';
import type { Grant, ScopeLevel, Conditions } from '@aadhyay/contracts';
import { DbService } from '../../db/db.service';
import { RedisService } from '../redis/redis.service';
import { membership, roleAssignment, role, section, classSubject, studentGuardian } from '../../db/schema';

export interface AccessInfo {
  membershipIds: string[];
  kinds: string[];
  personIds: Record<string, string>;
  /** Granted patterns (for legacy `hasPermission` checks and navigation). */
  permissions: string[];
  /** Grants with resolved scope ids — what the authorization engine decides on. */
  grants: Grant[];
  roles: { key: string; name: string }[];
  /** Students this user may see as "own": themselves and/or their children. */
  studentIds: string[];
}

const PORTAL_ROLE: Record<string, string> = { guardian: 'Parent / Guardian', student: 'Student' };

/**
 * Loads a user's access in a tenant: memberships → role assignments → grants.
 *
 * A grant's scope is the narrower of the role's per-permission scope (roles.scopes) and the assignment's scope
 * (role_assignments.scope_kind/id). "Assigned sections" are the explicit section/class assignment plus the academic
 * allocation (class teacher of a section, or subject teacher via class_subjects). "Assigned subjects" are the
 * (section, subject) pairs from class_subjects.
 */
@Injectable()
export class AccessService {
  constructor(private readonly db: DbService, private readonly redis: RedisService) {}

  private async version(tenantId: string) {
    return (await this.redis.client.get(`accv:${tenantId}`)) ?? '0';
  }
  /** Call after any role, membership, guardian-link or teaching-allocation change in a tenant. */
  async bust(tenantId: string) {
    await this.redis.client.incr(`accv:${tenantId}`);
  }

  async load(tenantId: string, userId: string): Promise<AccessInfo | null> {
    const v = await this.version(tenantId);
    const ck = `acc2:${tenantId}:${userId}:${v}`;
    const cached = await this.redis.getJson<AccessInfo>(ck);
    if (cached) return cached;
    const info = await this.compute(tenantId, userId);
    if (info) await this.redis.setJson(ck, info, 300);
    return info;
  }

  private async compute(tenantId: string, userId: string): Promise<AccessInfo | null> {
    const db = this.db.admin;
    const mems = await db.select().from(membership).where(and(eq(membership.tenantId, tenantId), eq(membership.userId, userId), eq(membership.status, 'active')));
    if (!mems.length) return null;
    const now = new Date();
    const assigns = await db
      .select({ assignmentId: roleAssignment.id, scopeKind: roleAssignment.scopeKind, scopeId: roleAssignment.scopeId, roleId: role.id, roleKey: role.key, roleName: role.name, perms: role.permissions, scopes: role.scopes, conditions: role.conditions })
      .from(roleAssignment)
      .innerJoin(role, eq(role.id, roleAssignment.roleId))
      .where(and(
        eq(roleAssignment.tenantId, tenantId),
        inArray(roleAssignment.membershipId, mems.map((m) => m.id)),
        or(isNull(roleAssignment.validFrom), lte(roleAssignment.validFrom, now)),
        or(isNull(roleAssignment.validTo), gte(roleAssignment.validTo, now)),
      ));

    const personIds = Object.fromEntries(mems.filter((m) => m.personId).map((m) => [m.kind, m.personId!])) as Record<string, string>;
    const staffId = personIds.staff;

    // Teaching allocation (only staff have one).
    let allocSections: string[] = [];
    let subjectSections: { sectionId: string; subjectId: string }[] = [];
    if (staffId) {
      const asClassTeacher = await db.select({ id: section.id }).from(section).where(and(eq(section.tenantId, tenantId), eq(section.classTeacherId, staffId)));
      const teaches = await db.select({ classId: classSubject.classId, sectionId: classSubject.sectionId, subjectId: classSubject.subjectId }).from(classSubject).where(and(eq(classSubject.tenantId, tenantId), eq(classSubject.teacherId, staffId)));
      const wholeClass = [...new Set(teaches.filter((t) => !t.sectionId).map((t) => t.classId))];
      const classSections = wholeClass.length ? await db.select({ id: section.id, classId: section.classId }).from(section).where(and(eq(section.tenantId, tenantId), inArray(section.classId, wholeClass))) : [];
      subjectSections = teaches.flatMap((t) => (t.sectionId ? [{ sectionId: t.sectionId, subjectId: t.subjectId }] : classSections.filter((s) => s.classId === t.classId).map((s) => ({ sectionId: s.id, subjectId: t.subjectId }))));
      allocSections = [...new Set([...asClassTeacher.map((s) => s.id), ...subjectSections.map((s) => s.sectionId)])];
    }

    // Sections named explicitly on assignments (class → all its sections).
    const classIds = assigns.filter((a) => a.scopeKind === 'class' && a.scopeId).map((a) => a.scopeId!);
    const sectionsOfClass = classIds.length ? await db.select({ id: section.id, classId: section.classId }).from(section).where(and(eq(section.tenantId, tenantId), inArray(section.classId, classIds))) : [];
    const explicitSections = (a: (typeof assigns)[number]): string[] | null =>
      a.scopeKind === 'section' && a.scopeId ? [a.scopeId] : a.scopeKind === 'class' && a.scopeId ? sectionsOfClass.filter((s) => s.classId === a.scopeId).map((s) => s.id) : null;

    const grants: Grant[] = [];
    for (const a of assigns) {
      const source = { roleId: a.roleId, roleKey: a.roleKey, roleName: a.roleName, assignmentId: a.assignmentId };
      const explicit = explicitSections(a);
      for (const pattern of a.perms) {
        const roleScope = ((a.scopes as Record<string, ScopeLevel>)[pattern] ?? 'tenant') as ScopeLevel;
        const conditions = (a.conditions as Record<string, Conditions>)[pattern];
        let scope: ScopeLevel = roleScope;
        let ids: Grant['ids'];
        if (a.scopeKind === 'own' || roleScope === 'own') scope = 'own';
        else if (roleScope === 'subject') ids = { subjectSections: explicit ? subjectSections.filter((s) => explicit.includes(s.sectionId)) : subjectSections };
        else if (roleScope === 'section') { ids = { sectionIds: [...new Set([...allocSections, ...(explicit ?? [])])] }; }
        else if (explicit) { scope = 'section'; ids = { sectionIds: explicit }; } // tenant-wide role narrowed by its assignment
        grants.push({ pattern, scope, ...(conditions ? { conditions } : {}), ...(ids ? { ids } : {}), source });
      }
    }

    const kinds = mems.map((m) => m.kind);
    for (const k of ['guardian', 'student']) {
      if (kinds.includes(k as any) && !grants.some((g) => g.pattern === 'self.*' && g.source.roleKey === k)) grants.push({ pattern: 'self.*', scope: 'own', source: { roleKey: k, roleName: PORTAL_ROLE[k]! } });
    }

    const studentIds: string[] = [];
    if (personIds.student) studentIds.push(personIds.student);
    if (personIds.guardian) {
      const kids = await db.select({ id: studentGuardian.studentId }).from(studentGuardian).where(and(eq(studentGuardian.tenantId, tenantId), eq(studentGuardian.guardianId, personIds.guardian)));
      studentIds.push(...kids.map((k) => k.id));
    }

    const roles = [...new Map(grants.map((g) => [g.source.roleKey, { key: g.source.roleKey, name: g.source.roleName }])).values()];
    return { membershipIds: mems.map((m) => m.id), kinds, personIds, permissions: [...new Set(grants.map((g) => g.pattern))], grants, roles, studentIds: [...new Set(studentIds)] };
  }
}
