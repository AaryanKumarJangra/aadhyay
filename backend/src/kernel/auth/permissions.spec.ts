import { describe, it, expect } from 'vitest';
import {
  permissionMatches, decide, scopeFilter, grantAuthority, validateRole, effectiveAccess, describeGrant, materialise,
  ROLE_TEMPLATES, MODULE_KEYS, type Grant, type Principal,
} from '@aadhyay/contracts';

describe('permissionMatches', () => {
  it.each([
    ['*', 'fees.receipt.view', true],
    ['fees.receipt.view', 'fees.receipt.view', true],
    ['fees.*', 'fees.receipt.view', true],
    ['fees.*', 'fees', false],
    ['fees.*', 'feesx.receipt.view', false],
    ['fees.*.view', 'fees.receipt.view', true],
    ['fees.*.view', 'fees.receipt.edit', false],
    ['fees.*.view', 'fees.receipt.view.extra', false],
    ['fees.payment.*', 'fees.payment.create', true],
    ['fees.payment.*', 'fees.refund.create', false],
    ['people.student.view', 'people.student.edit', false],
  ])('%s grants %s → %s', (granted, required, ok) => expect(permissionMatches(granted, required)).toBe(ok));
});

const S8A = '00000000-0000-0000-0000-0000000008a0';
const S9B = '00000000-0000-0000-0000-0000000009b0';
const S10C = '00000000-0000-0000-0000-000000010c00';
const MATHS = '00000000-0000-0000-0000-0000000000aa';
const SCIENCE = '00000000-0000-0000-0000-0000000000bb';
const KID = '00000000-0000-0000-0000-00000000c111';
const OTHER_KID = '00000000-0000-0000-0000-00000000c222';

/** Expands a role template into grants the way AccessService does, with given allocations. */
function principalFor(roleKey: string, opts: { sections?: string[]; subjects?: { sectionId: string; subjectId: string }[]; kids?: string[]; modules?: string[] } = {}): Principal {
  const t = ROLE_TEMPLATES[roleKey]!;
  const m = materialise(t);
  const grants: Grant[] = m.permissions.map((pattern) => {
    const scope = m.scopes[pattern] ?? 'tenant';
    return {
      pattern, scope, conditions: m.conditions[pattern],
      ids: scope === 'section' ? { sectionIds: opts.sections ?? [] } : scope === 'subject' ? { subjectSections: opts.subjects ?? [] } : undefined,
      source: { roleKey, roleName: t.name },
    };
  });
  return { userId: 'u1', grants, modules: opts.modules ?? MODULE_KEYS, self: { studentIds: opts.kids ?? [], staffId: 'staff-1' } };
}

describe('role templates', () => {
  it('are structurally valid (every pattern known, every scope enforceable)', () => {
    for (const [key, t] of Object.entries(ROLE_TEMPLATES)) expect(validateRole(materialise(t)), key).toEqual({ ok: true, problems: [] });
  });
  it('follow the attendance matrix (docs/redesign §17)', () => {
    const teacher = principalFor('teacher', { sections: [S8A, S9B] });
    expect(decide(teacher, 'attendance.student.create', { sectionId: S8A }).allowed).toBe(true);
    expect(decide(teacher, 'attendance.student.create', { sectionId: S10C }).code).toBe('OUT_OF_SCOPE');
    expect(decide(teacher, 'attendance.student.view', { sectionId: S10C }).code).toBe('OUT_OF_SCOPE');
    expect(decide(teacher, 'attendance.student.approve').code).toBe('NO_PERMISSION');
    expect(decide(teacher, 'attendance.student.export').code).toBe('NO_PERMISSION');
    expect(decide(teacher, 'attendance.settings.manage').code).toBe('NO_PERMISSION');
    const parent = principalFor('guardian', { kids: [KID] });
    expect(decide(parent, 'attendance.student.create').code).toBe('NO_PERMISSION');
    expect(decide(parent, 'self.*', { studentId: KID }).allowed).toBe(true);
    expect(decide(parent, 'self.*', { studentId: OTHER_KID }).code).toBe('OUT_OF_SCOPE');
    expect(decide(principalFor('driver'), 'attendance.student.view').code).toBe('NO_PERMISSION');
    expect(decide(principalFor('accountant'), 'attendance.student.view').code).toBe('NO_PERMISSION');
    for (const k of ['principal', 'owner']) {
      const p = principalFor(k);
      for (const perm of ['attendance.student.view', 'attendance.student.create', 'attendance.student.edit', 'attendance.student.approve'] as const) {
        expect(decide(p, perm, { sectionId: S10C }).allowed, `${k} ${perm}`).toBe(true);
      }
    }
  });
  it('keep teachers, librarians and drivers out of money and HR', () => {
    expect(decide(principalFor('teacher', { sections: [S8A] }), 'fees.payment.view').allowed).toBe(false);
    expect(decide(principalFor('teacher'), 'payroll.run.view').allowed).toBe(false);
    expect(decide(principalFor('librarian'), 'fees.payment.refund').allowed).toBe(false);
    expect(decide(principalFor('driver'), 'hr.leave.view').allowed).toBe(false);
    expect(decide(principalFor('driver'), 'people.student.view').allowed).toBe(false);
    expect(decide(principalFor('accountant'), 'exams.marks.edit').allowed).toBe(false);
    expect(decide(principalFor('principal'), 'fees.payment.create').allowed).toBe(false);
    expect(decide(principalFor('principal'), 'fees.dashboard.view').allowed).toBe(true);
  });
});

describe('decide', () => {
  it('limits marks entry to the assigned (section, subject) pair', () => {
    const t = principalFor('teacher', { sections: [S8A], subjects: [{ sectionId: S8A, subjectId: MATHS }] });
    expect(decide(t, 'exams.marks.create', { sectionId: S8A, subjectId: MATHS }).allowed).toBe(true);
    expect(decide(t, 'exams.marks.create', { sectionId: S8A, subjectId: SCIENCE }).code).toBe('OUT_OF_SCOPE');
  });
  it('enforces conditions: same-day edits, amount limits, maker-checker', () => {
    const t = principalFor('teacher', { sections: [S8A] });
    expect(decide(t, 'attendance.student.edit', { sectionId: S8A, date: '2026-10-09', today: '2026-10-09' }).allowed).toBe(true);
    const late = decide(t, 'attendance.student.edit', { sectionId: S8A, date: '2026-10-08', today: '2026-10-09' });
    expect(late.code).toBe('CONDITION_FAILED');
    expect(late.reason).toMatch(/same day/);
    const acct = principalFor('accountant');
    expect(decide(acct, 'fees.payment.refund', { amountPaise: 500_000 })).toMatchObject({ allowed: true, requiresApproval: true });
    const big = decide(acct, 'fees.payment.refund', { amountPaise: 2_000_000 });
    expect(big.code).toBe('CONDITION_FAILED');
    expect(big.reason).toContain('10,000');
  });
  it('denies everything in a disabled module, even for the owner', () => {
    const owner = principalFor('owner', { modules: ['org', 'people'] });
    expect(decide(owner, 'transport.trip.view').code).toBe('MODULE_DISABLED');
    expect(decide(owner, 'org.settings.edit').allowed).toBe(true);
  });
  it('explains denials in words, naming the role and the permission', () => {
    const d = decide(principalFor('teacher', { sections: [S8A] }), 'fees.payment.refund');
    expect(d.reason).toBe('Your role “Teacher” does not allow you to issue fee refunds (fees.payment.refund).');
    expect(describeGrant('fees.payment.refund', 'tenant', { maxAmountPaise: 1_000_000, makerChecker: true }))
      .toBe('Can issue fee refunds across the institution up to ₹10,000, with a second person approving.');
    expect(describeGrant('attendance.student.create', 'section')).toBe('Can mark attendance for assigned classes & sections.');
  });
});

describe('scopeFilter', () => {
  it('is tenant-wide, narrowed or empty', () => {
    expect(scopeFilter(principalFor('principal'), 'people.student.view')).toEqual({ kind: 'all' });
    expect(scopeFilter(principalFor('teacher', { sections: [S8A, S9B] }), 'people.student.view')).toMatchObject({ kind: 'some', sectionIds: [S8A, S9B], own: false });
    expect(scopeFilter(principalFor('driver'), 'people.student.view')).toEqual({ kind: 'none' });
  });
});

describe('grant authority', () => {
  const principal = principalFor('principal');
  it('lets a principal assign Teacher but not Accountant or Owner', () => {
    expect(grantAuthority(principal, materialise(ROLE_TEMPLATES.teacher!)).ok).toBe(true);
    const acct = grantAuthority(principal, materialise(ROLE_TEMPLATES.accountant!));
    expect(acct.ok).toBe(false);
    expect(acct.problems.map((p) => p.key)).toContain('fees.payment.create');
    expect(grantAuthority(principal, materialise(ROLE_TEMPLATES.owner!)).problems[0]!.reason).toMatch(/owner/i);
  });
  it('never lets anyone but the owner hand out role management', () => {
    const p = { grants: [{ pattern: 'org.*', scope: 'tenant' as const, source: { roleKey: 'x', roleName: 'X' } }] };
    expect(grantAuthority(p, { permissions: ['org.role.edit'] }).ok).toBe(false);
    expect(grantAuthority(p, { permissions: ['org.member.view'] }).ok).toBe(true);
  });
  it('does not allow loosening your own limits', () => {
    const acct = principalFor('accountant');
    expect(grantAuthority(acct, { permissions: ['fees.payment.refund'], conditions: { 'fees.payment.refund': { maxAmountPaise: 500_000, makerChecker: true } } }).ok).toBe(true);
    expect(grantAuthority(acct, { permissions: ['fees.payment.refund'] }).ok).toBe(false);
    expect(grantAuthority(acct, { permissions: ['fees.payment.refund'], conditions: { 'fees.payment.refund': { maxAmountPaise: 5_000_000, makerChecker: true } } }).ok).toBe(false);
  });
  it('rejects unknown permissions and unenforceable scopes', () => {
    expect(validateRole({ permissions: ['fees.payment.teleport'] }).ok).toBe(false);
    expect(validateRole({ permissions: ['fees.payment.refund'], scopes: { 'fees.payment.refund': 'section' } }).ok).toBe(false);
    expect(validateRole({ permissions: ['fees.*'], scopes: { 'fees.*': 'section' } }).ok).toBe(false);
  });
});

describe('effectiveAccess', () => {
  it('lists what a teacher can do, with scope and source', () => {
    const rows = effectiveAccess(principalFor('teacher', { sections: [S8A] }));
    const mark = rows.find((r) => r.key === 'attendance.student.create')!;
    expect(mark).toMatchObject({ scope: 'section', source: { roleName: 'Teacher' } });
    expect(rows.some((r) => r.module === 'fees')).toBe(false);
    expect(rows.some((r) => r.module === 'payroll')).toBe(false);
  });
});
