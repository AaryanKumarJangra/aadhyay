import { and, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { decide, scopeFilter, MODULE_KEYS, type Decision, type PermissionKey, type Principal, type ResourceRef, type ScopeFilter } from '@aadhyay/contracts';
import { Ctx } from '../context/request-context';
import { AppError } from '../../common/errors';
import { todayIn } from '../../common/dates';

/** Who to ask when access is denied (shown to the user next to the reason). */
export const ACCESS_CONTACT = 'Institution Owner or Administrator';

/** Machine-readable 403 body: `{ error: { code: 'FORBIDDEN', message, details: { reason, permission, denial, scope, role, contact } } }`. */
export function denied(d: Decision): AppError {
  if (d.code === 'MODULE_DISABLED') return new AppError('MODULE_DISABLED', d.reason, { permission: d.permission, denial: d.code, contact: ACCESS_CONTACT });
  return new AppError('FORBIDDEN', d.reason, {
    permission: d.permission, denial: d.code, scope: d.scope ?? null, role: d.source?.roleName ?? null, contact: ACCESS_CONTACT,
  });
}

/** The current request's principal for the authorization engine. */
export function principal(): Principal {
  const c = Ctx.get();
  return {
    userId: c.userId ?? '',
    grants: c.grants ?? [],
    modules: c.modules ?? MODULE_KEYS,
    self: { studentIds: c.studentIds ?? [], staffId: c.personIds?.staff ?? null, guardianId: c.personIds?.guardian ?? null },
  };
}

/**
 * Service-level authorization. Controllers declare *what* permission is needed (`@Can`); services that act on a specific
 * record call `Authz.assert` with that record, and list endpoints narrow their query with `Authz.where`.
 */
export const Authz = {
  decide(key: PermissionKey, resource?: ResourceRef): Decision {
    const r = resource && (resource.date && !resource.today) ? { ...resource, today: todayIn(Ctx.get().tenantTz) } : resource;
    return decide(principal(), key, r);
  },
  /** Throws a structured 403 unless allowed. Returns the decision (check `requiresApproval` for maker-checker). */
  assert(key: PermissionKey, resource?: ResourceRef): Decision {
    const d = Authz.decide(key, resource);
    if (!d.allowed) throw denied(d);
    return d;
  },
  /** Allowed if any one of the keys allows it (alternatives, like `@Can(a, b)`). */
  assertAny(keys: PermissionKey[], resource?: ResourceRef): Decision {
    let first: Decision | undefined;
    for (const k of keys) {
      const d = Authz.decide(k, resource);
      if (d.allowed) return d;
      // Prefer the most informative denial: scope/condition beats "no permission".
      if (!first || (first.code === 'NO_PERMISSION' && d.code !== 'NO_PERMISSION')) first = d;
    }
    throw denied(first!);
  },
  filter(key: PermissionKey): ScopeFilter {
    return scopeFilter(principal(), key);
  },
  /**
   * SQL condition restricting a list to what the user may see under `key`.
   * `cols.section` limits to covered sections, `cols.student` to own students. Returns `undefined` for tenant-wide
   * access and a never-true condition when nothing is visible.
   */
  where(key: PermissionKey, cols: { section?: PgColumn | SQL; student?: PgColumn | SQL; subject?: PgColumn | SQL }): SQL | undefined {
    const f = Authz.filter(key);
    if (f.kind === 'all') return undefined;
    const never = sql`false`;
    if (f.kind === 'none') return never;
    const parts: SQL[] = [];
    const secs = new Set([...f.sectionIds, ...(cols.subject ? [] : f.subjectSections.map((s) => s.sectionId))]);
    if (cols.section && secs.size) parts.push(inArray(cols.section as PgColumn, [...secs]));
    if (cols.section && cols.subject && f.subjectSections.length) {
      parts.push(or(...f.subjectSections.map((s) => and(sql`${cols.section} = ${s.sectionId}`, sql`${cols.subject} = ${s.subjectId}`)))!);
    }
    if (f.own && cols.student) {
      const ids = Ctx.get().studentIds ?? [];
      if (ids.length) parts.push(inArray(cols.student as PgColumn, ids));
    }
    return parts.length ? or(...parts) : never;
  },
  /** Like `where`, for rows that list several students in a uuid/text array column (e.g. behaviour incidents). */
  whereStudentArray(key: PermissionKey, col: PgColumn): SQL | undefined {
    const f = Authz.filter(key);
    if (f.kind === 'all') return undefined;
    if (f.kind === 'none') return sql`false`;
    const parts: SQL[] = [];
    const ids = Ctx.get().studentIds ?? [];
    if (f.own && ids.length) parts.push(sql`${col} && ${sql.param(ids)}::text[]`);
    const secs = [...new Set([...f.sectionIds, ...f.subjectSections.map((s) => s.sectionId)])];
    if (secs.length) parts.push(sql`exists (select 1 from enrollments e join academic_sessions s on s.id = e.session_id and s.is_current where e.student_id::text = any(${col}) and e.section_id = any(${sql.param(secs)}::uuid[]))`);
    return parts.length ? or(...parts) : sql`false`;
  },
};
