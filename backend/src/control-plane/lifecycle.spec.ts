import { describe, it, expect } from 'vitest';
import { nextTransition, reminderDue } from './lifecycle';
const D = 86400000;
const now = new Date('2026-10-07T06:00:00Z');

describe('tenant lifecycle', () => {
  it('trial past end → grace with 30 days', () => {
    const t = nextTransition({ status: 'trial', periodEndsAt: new Date(now.getTime() - 1000), graceEndsAt: null, suspendedAt: null }, now)!;
    expect(t.to).toBe('grace');
    expect((t.patch.graceEndsAt as Date).getTime()).toBe(now.getTime() - 1000 + 30 * D);
  });
  it('grace past end → suspended with purge date in 12 months', () => {
    const t = nextTransition({ status: 'grace', periodEndsAt: null, graceEndsAt: new Date(now.getTime() - 1), suspendedAt: null }, now)!;
    expect(t.to).toBe('suspended');
    expect((t.patch.purgeAt as Date).getTime()).toBe(now.getTime() + 365 * D);
  });
  it('suspended 90 days → archived, 365 days → purged', () => {
    expect(nextTransition({ status: 'suspended', periodEndsAt: null, graceEndsAt: null, suspendedAt: new Date(now.getTime() - 90 * D) }, now)!.to).toBe('archived');
    expect(nextTransition({ status: 'archived', periodEndsAt: null, graceEndsAt: null, suspendedAt: new Date(now.getTime() - 365 * D) }, now)!.to).toBe('purged');
  });
  it('active not expired → no change', () => {
    expect(nextTransition({ status: 'active', periodEndsAt: new Date(now.getTime() + D), graceEndsAt: null, suspendedAt: null }, now)).toBeNull();
  });
  it('reminders at T-15, T-7, T-3, T-1', () => {
    for (const d of [15, 7, 3, 1]) expect(reminderDue({ status: 'active', periodEndsAt: new Date(now.getTime() + d * D - 1000), graceEndsAt: null, suspendedAt: null }, now)?.daysLeft).toBe(d);
    expect(reminderDue({ status: 'active', periodEndsAt: new Date(now.getTime() + 10 * D - 1000), graceEndsAt: null, suspendedAt: null }, now)).toBeNull();
  });
  it('purge warnings at 30/7/1 days', () => {
    const r = reminderDue({ status: 'archived', periodEndsAt: null, graceEndsAt: null, suspendedAt: new Date(now.getTime() - 358 * D - 1000) }, now);
    expect(r).toEqual({ kind: 'purge_warning', daysLeft: 7 });
  });
});
