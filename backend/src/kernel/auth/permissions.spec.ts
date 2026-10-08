import { describe, it, expect } from 'vitest';
import { permissionMatches, hasPermission, ROLE_TEMPLATES } from '@aadhyay/contracts';

describe('permissionMatches', () => {
  it.each([
    ['*', 'fees.receipt.view', true],
    ['fees.receipt.view', 'fees.receipt.view', true],
    ['fees.*', 'fees.receipt.view', true],
    ['fees.*', 'fees', false],
    ['fees.*', 'feesx.receipt.view', false],
    ['fees.*.view', 'fees.receipt.view', true],
    ['fees.*.view', 'fees.dashboard.view', true],
    ['fees.*.view', 'fees.receipt.edit', false],
    ['fees.*.view', 'fees.receipt.view.extra', false],
    ['fees.payment.*', 'fees.payment.create', true],
    ['fees.payment.*', 'fees.refund.create', false],
    ['people.student.view', 'people.student.edit', false],
    ['people.student.view', 'people.student', false],
  ])('%s grants %s → %s', (granted, required, ok) => expect(permissionMatches(granted, required)).toBe(ok));

  it('role templates grant what the roles need, and nothing outside it', () => {
    const p = (role: string) => ROLE_TEMPLATES[role]!.permissions;
    expect(hasPermission(p('principal'), 'fees.dashboard.view')).toBe(true);
    expect(hasPermission(p('principal'), 'fees.payment.create')).toBe(false);
    expect(hasPermission(p('teacher'), 'academics.class.view')).toBe(true);
    expect(hasPermission(p('teacher'), 'academics.class.edit')).toBe(false);
    expect(hasPermission(p('teacher'), 'timetable.slot.view')).toBe(true);
    expect(hasPermission(p('teacher'), 'fees.dashboard.view')).toBe(false);
    expect(hasPermission(p('driver'), 'people.student.view')).toBe(false);
    expect(hasPermission(p('guardian'), 'people.student.view')).toBe(false);
  });
});
