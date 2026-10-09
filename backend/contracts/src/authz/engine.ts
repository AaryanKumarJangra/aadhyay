/**
 * Authorization engine — pure functions shared by the API (enforcement) and the web/mobile apps (navigation, previews,
 * "why can't I" explanations). The API is the only place that enforces; clients use the same rules for UX.
 *
 *   ALLOW = module enabled AND a grant matches the permission AND its scope covers the resource AND its conditions pass
 */
import { permissionMatches } from '../permissions';
import { MODULE_KEYS, CORE_MODULES } from '../modules';
import { PERMISSION_INDEX, SCOPE_LABEL, SCOPE_LEVELS, type Conditions, type ScopeLevel } from './catalogue';

export interface GrantSource {
  roleId?: string;
  roleKey: string;
  roleName: string;
  assignmentId?: string;
}

/** Concrete ids a narrowed grant covers, resolved server-side from role assignments and academic allocations. */
export interface ScopeIds {
  sectionIds?: string[];
  subjectSections?: { sectionId: string; subjectId: string }[];
}

export interface Grant {
  /** A catalogue key or a wildcard pattern (`*`, `fees.*`, `fees.payment.*`). */
  pattern: string;
  scope: ScopeLevel;
  conditions?: Conditions;
  ids?: ScopeIds;
  source: GrantSource;
}

export interface Principal {
  userId: string;
  grants: Grant[];
  /** Enabled module keys for the tenant (core modules are always on). */
  modules: Iterable<string>;
  self: { studentIds: string[]; staffId?: string | null; guardianId?: string | null };
}

/** What is being acted on. Omit it to ask "can the user do this anywhere?". */
export interface ResourceRef {
  sectionId?: string | null;
  /** Every listed section must be covered (e.g. a notice sent to several sections). */
  sectionIds?: string[];
  subjectId?: string | null;
  studentId?: string | null;
  ownerUserId?: string | null;
  staffId?: string | null;
  amountPaise?: number;
  /** Record date and "today" in the tenant timezone, for sameDayOnly. */
  date?: string;
  today?: string;
}

export type DenyCode = 'MODULE_DISABLED' | 'NO_PERMISSION' | 'OUT_OF_SCOPE' | 'CONDITION_FAILED';

export interface Decision {
  allowed: boolean;
  code: 'ALLOWED' | DenyCode;
  permission: string;
  reason: string;
  scope?: ScopeLevel;
  source?: GrantSource;
  conditions?: Conditions;
  /** Allowed, but the action must be queued for a second approver (maker-checker). */
  requiresApproval?: boolean;
}

const rank = (s: ScopeLevel) => SCOPE_LEVELS.indexOf(s);
const MODULE_SET = new Set<string>(MODULE_KEYS);
const CORE_SET = new Set<string>(CORE_MODULES);

export function moduleOf(key: string): string | null {
  const m = key.split('.')[0]!;
  return MODULE_SET.has(m) ? m : null;
}

export function labelOf(key: string): string {
  const p = PERMISSION_INDEX.get(key);
  return p ? `${p.moduleLabel} → ${p.resourceLabel}: ${p.phrase}` : key;
}

const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** One-line, human description of a grant: "Can mark attendance for assigned classes & sections." */
export function describeGrant(key: string, scope: ScopeLevel, conditions?: Conditions): string {
  if (key === '*') return 'Full access to every module, setting and record.';
  const p = PERMISSION_INDEX.get(key);
  const phrase = p?.phrase ?? key;
  const where = key === '*' ? '' : scope === 'tenant' ? ' across the institution' : scope === 'own' ? ' for their own records' : ` for ${SCOPE_LABEL[scope].toLowerCase()}`;
  const cond = [
    conditions?.maxAmountPaise !== undefined ? ` up to ${inr(conditions.maxAmountPaise)}` : '',
    conditions?.sameDayOnly ? ' on the same day only' : '',
    conditions?.makerChecker ? ', with a second person approving' : '',
  ].join('');
  return `Can ${phrase}${where}${cond}.`;
}

export function matchingGrants(grants: readonly Grant[], key: string): Grant[] {
  return grants.filter((g) => permissionMatches(g.pattern, key)).sort((a, b) => rank(a.scope) - rank(b.scope));
}

function covers(g: Grant, r: ResourceRef, p: Principal): boolean {
  switch (g.scope) {
    case 'tenant':
      return true;
    case 'section': {
      const ids = new Set(g.ids?.sectionIds ?? []);
      if (r.sectionIds?.length) return r.sectionIds.every((s) => ids.has(s));
      return !!r.sectionId && ids.has(r.sectionId);
    }
    case 'subject':
      return !!r.sectionId && !!r.subjectId && (g.ids?.subjectSections ?? []).some((x) => x.sectionId === r.sectionId && x.subjectId === r.subjectId);
    case 'own':
      return (
        (!!r.studentId && p.self.studentIds.includes(r.studentId)) ||
        (!!r.ownerUserId && r.ownerUserId === p.userId) ||
        (!!r.staffId && !!p.self.staffId && r.staffId === p.self.staffId)
      );
  }
}

function conditionFailure(g: Grant, r: ResourceRef): string | null {
  const c = g.conditions;
  if (!c) return null;
  if (c.maxAmountPaise !== undefined && r.amountPaise !== undefined && r.amountPaise > c.maxAmountPaise) return `only up to ${inr(c.maxAmountPaise)}`;
  if (c.sameDayOnly && r.date && r.today && r.date !== r.today) return 'only on the same day';
  return null;
}

const roleList = (grants: readonly Grant[]) => [...new Set(grants.map((g) => g.source.roleName))];

export function decide(p: Principal, key: string, resource?: ResourceRef): Decision {
  const info = PERMISSION_INDEX.get(key);
  const label = info ? `${info.phrase}` : key;
  const mod = moduleOf(key);
  const modules = new Set(p.modules);
  if (mod && !CORE_SET.has(mod) && !modules.has(mod)) {
    return { allowed: false, code: 'MODULE_DISABLED', permission: key, reason: `The ${info?.moduleLabel ?? mod} module is not enabled for this institution.` };
  }
  const matches = matchingGrants(p.grants, key);
  if (!matches.length) {
    const roles = roleList(p.grants);
    const reason = roles.length
      ? `Your role${roles.length > 1 ? 's' : ''} ${roles.map((r) => `“${r}”`).join(', ')} ${roles.length > 1 ? 'do' : 'does'} not allow you to ${label} (${key}).`
      : `You do not have a role that allows you to ${label} (${key}).`;
    return { allowed: false, code: 'NO_PERMISSION', permission: key, reason };
  }
  if (!resource) {
    const g = matches[0]!;
    return { allowed: true, code: 'ALLOWED', permission: key, reason: describeGrant(key, g.scope, g.conditions), scope: g.scope, source: g.source, conditions: g.conditions, requiresApproval: !!g.conditions?.makerChecker };
  }
  let condFail: { g: Grant; why: string } | null = null;
  for (const g of matches) {
    if (!covers(g, resource, p)) continue;
    const why = conditionFailure(g, resource);
    if (why) { condFail ??= { g, why }; continue; }
    return { allowed: true, code: 'ALLOWED', permission: key, reason: describeGrant(key, g.scope, g.conditions), scope: g.scope, source: g.source, conditions: g.conditions, requiresApproval: !!g.conditions?.makerChecker };
  }
  if (condFail) {
    return { allowed: false, code: 'CONDITION_FAILED', permission: key, scope: condFail.g.scope, source: condFail.g.source, conditions: condFail.g.conditions, reason: `Your role “${condFail.g.source.roleName}” allows you to ${label} ${condFail.why}.` };
  }
  const g = matches[0]!;
  return {
    allowed: false, code: 'OUT_OF_SCOPE', permission: key, scope: g.scope, source: g.source,
    reason: `Your role “${g.source.roleName}” allows you to ${label} only for ${SCOPE_LABEL[g.scope].toLowerCase()}; this record is outside that scope.`,
  };
}

/** For list queries: which rows may the user see under this permission? */
export type ScopeFilter =
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'some'; sectionIds: string[]; subjectSections: { sectionId: string; subjectId: string }[]; own: boolean };

export function scopeFilter(p: Principal, key: string): ScopeFilter {
  if (decide(p, key).code === 'MODULE_DISABLED') return { kind: 'none' };
  const matches = matchingGrants(p.grants, key);
  if (!matches.length) return { kind: 'none' };
  if (matches.some((g) => g.scope === 'tenant')) return { kind: 'all' };
  const sectionIds = new Set<string>();
  const subjectSections: { sectionId: string; subjectId: string }[] = [];
  let own = false;
  for (const g of matches) {
    if (g.scope === 'section') g.ids?.sectionIds?.forEach((s) => sectionIds.add(s));
    if (g.scope === 'subject') subjectSections.push(...(g.ids?.subjectSections ?? []));
    if (g.scope === 'own') own = true;
  }
  return { kind: 'some', sectionIds: [...sectionIds], subjectSections, own };
}

/** Effective access rows for a person: one row per catalogue permission they hold (wildcards expanded). */
export interface EffectiveRow {
  key: string;
  module: string;
  moduleLabel: string;
  resourceLabel: string;
  action: string;
  scope: ScopeLevel;
  conditions?: Conditions;
  source: GrantSource;
  explanation: string;
  sensitive: boolean;
}

export function effectiveAccess(p: Principal): EffectiveRow[] {
  const modules = new Set(p.modules);
  const out: EffectiveRow[] = [];
  for (const info of PERMISSION_INDEX.values()) {
    if (info.module !== 'self' && !CORE_SET.has(info.module) && !modules.has(info.module)) continue;
    const g = matchingGrants(p.grants, info.key)[0];
    if (!g) continue;
    out.push({
      key: info.key, module: info.module, moduleLabel: info.moduleLabel, resourceLabel: info.resourceLabel, action: info.action,
      scope: g.scope, conditions: g.conditions, source: g.source, explanation: describeGrant(info.key, g.scope, g.conditions), sensitive: !!info.sensitive,
    });
  }
  return out;
}

/** Client-side convenience: does the principal hold the permission in any scope? (UX only — never security.) */
export function can(p: Pick<Principal, 'grants' | 'modules'>, key: string): boolean {
  return decide({ userId: '', self: { studentIds: [] }, ...p }, key).allowed;
}

// ---------------------------------------------------------------------------------------------------------------
// Grant authority (docs/redesign/03-AUTHORIZATION.md §Grant authority)
// ---------------------------------------------------------------------------------------------------------------

export interface RoleDraft {
  permissions: string[];
  scopes?: Record<string, ScopeLevel>;
  conditions?: Record<string, Conditions>;
}

/** Catalogue keys a pattern grants (`fees.*` → every fees key). Unknown exact keys return []. */
export function expandPattern(pattern: string): string[] {
  return [...PERMISSION_INDEX.keys()].filter((k) => permissionMatches(pattern, k));
}

/** `inner` is at least as strict as `outer` (smaller limit, same-day and maker-checker kept). */
export function conditionsWithin(inner: Conditions | undefined, outer: Conditions | undefined): boolean {
  if (!outer) return true;
  const i = inner ?? {};
  if (outer.maxAmountPaise !== undefined && (i.maxAmountPaise === undefined || i.maxAmountPaise > outer.maxAmountPaise)) return false;
  if (outer.sameDayOnly && !i.sameDayOnly) return false;
  if (outer.makerChecker && !i.makerChecker) return false;
  return true;
}

export interface RoleValidation { ok: boolean; problems: { pattern: string; key?: string; reason: string }[] }

/** Structural checks: every pattern grants something real, and each scope is one the API enforces for it. */
export function validateRole(r: RoleDraft): RoleValidation {
  const problems: RoleValidation['problems'] = [];
  for (const p of r.permissions) {
    const keys = p === '*' ? ['*'] : expandPattern(p);
    if (!keys.length) { problems.push({ pattern: p, reason: `“${p}” is not a known permission.` }); continue; }
    const scope = r.scopes?.[p] ?? 'tenant';
    const info = PERMISSION_INDEX.get(p);
    if (!info && p.includes('*') && scope !== 'tenant') { problems.push({ pattern: p, reason: `Wildcard “${p}” can only be granted for the entire institution.` }); continue; }
    if (info && !info.scopes.includes(scope)) problems.push({ pattern: p, key: p, reason: `“${info.phrase}” cannot be limited to ${SCOPE_LABEL[scope].toLowerCase()}.` });
    const cond = r.conditions?.[p];
    if (cond && info) {
      const allowed = new Set(info.conditions ?? []);
      for (const c of Object.keys(cond)) if (!allowed.has(c as never)) problems.push({ pattern: p, key: p, reason: `“${info.phrase}” does not support the ${c} condition.` });
    }
  }
  return { ok: !problems.length, problems };
}

/**
 * Can `actor` grant this role (create/edit it, or assign it to someone)? Only what the actor holds institution-wide,
 * with conditions at least as strict as their own. Full access (`*`) and role design (`org.role.*`) are Owner-only.
 */
export function grantAuthority(actor: Pick<Principal, 'grants'>, r: RoleDraft): RoleValidation {
  const problems: RoleValidation['problems'] = [];
  const actorIsOwner = actor.grants.some((g) => g.pattern === '*' && g.scope === 'tenant' && !g.conditions);
  if (actorIsOwner) return { ok: true, problems };
  for (const p of r.permissions) {
    if (p === '*') { problems.push({ pattern: p, reason: 'Only the institution owner can grant full access.' }); continue; }
    for (const key of expandPattern(p)) {
      if (key.startsWith('org.role.') && key !== 'org.role.view') { problems.push({ pattern: p, key, reason: 'Only the institution owner can grant role management.' }); continue; }
      const mine = matchingGrants(actor.grants, key).filter((g) => g.scope === 'tenant');
      const want = r.conditions?.[p];
      if (!mine.length) problems.push({ pattern: p, key, reason: `You cannot grant “${PERMISSION_INDEX.get(key)?.phrase ?? key}” because you do not hold it for the entire institution.` });
      else if (!mine.some((g) => conditionsWithin(want, g.conditions))) problems.push({ pattern: p, key, reason: `You can grant “${PERMISSION_INDEX.get(key)?.phrase ?? key}” only with your own limits (${describeGrant(key, 'tenant', mine[0]!.conditions).replace(/^Can /, '').replace(/\.$/, '')}).` });
    }
  }
  return { ok: !problems.length, problems };
}
