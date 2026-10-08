import { GRACE_DAYS, ARCHIVE_AFTER_SUSPEND_DAYS, PURGE_AFTER_SUSPEND_DAYS } from './price-book.seed';
import { DAY } from '../common/dates';

export interface LifecycleTenant {
  status: 'trial' | 'active' | 'grace' | 'suspended' | 'archived' | 'purged';
  periodEndsAt: Date | null;
  graceEndsAt: Date | null;
  suspendedAt: Date | null;
}
export interface Transition { to: LifecycleTenant['status']; patch: Partial<Record<string, Date | string | null>> }

/** Pure state machine (docs/03 §7): trial|active → grace (+30d) → suspended → archived (+90d) → purged (+12 months). */
export function nextTransition(t: LifecycleTenant, now = new Date()): Transition | null {
  const end = t.periodEndsAt;
  if ((t.status === 'trial' || t.status === 'active') && end && now >= end) {
    return { to: 'grace', patch: { status: 'grace', graceEndsAt: new Date(end.getTime() + GRACE_DAYS * DAY) } };
  }
  if (t.status === 'grace' && t.graceEndsAt && now >= t.graceEndsAt) {
    return { to: 'suspended', patch: { status: 'suspended', suspendedAt: now, purgeAt: new Date(now.getTime() + PURGE_AFTER_SUSPEND_DAYS * DAY) } };
  }
  if (t.status === 'suspended' && t.suspendedAt && now.getTime() - t.suspendedAt.getTime() >= ARCHIVE_AFTER_SUSPEND_DAYS * DAY) {
    return { to: 'archived', patch: { status: 'archived', archivedAt: now } };
  }
  if (t.status === 'archived' && t.suspendedAt && now.getTime() - t.suspendedAt.getTime() >= PURGE_AFTER_SUSPEND_DAYS * DAY) {
    return { to: 'purged', patch: { status: 'purged' } };
  }
  return null;
}

/** Reminder days before expiry: T-15, T-7, T-3, T-1, T0; then weekly during grace; final notices before purge at 30/7/1 days. */
export function reminderDue(t: LifecycleTenant, now = new Date()): { kind: string; daysLeft: number } | null {
  const dayDiff = (d: Date) => Math.ceil((d.getTime() - now.getTime()) / DAY);
  if ((t.status === 'trial' || t.status === 'active') && t.periodEndsAt) {
    const left = dayDiff(t.periodEndsAt);
    if ([15, 7, 3, 1, 0].includes(left)) return { kind: t.status === 'trial' ? 'trial_ending' : 'renewal_due', daysLeft: left };
  }
  if (t.status === 'grace' && t.graceEndsAt) {
    const left = dayDiff(t.graceEndsAt);
    if (left === 7) return { kind: 'suspension_warning', daysLeft: left }; // safety features stop warning
    if (left > 0 && left % 7 === 0) return { kind: 'grace', daysLeft: left };
  }
  if ((t.status === 'suspended' || t.status === 'archived') && t.suspendedAt) {
    const left = dayDiff(new Date(t.suspendedAt.getTime() + PURGE_AFTER_SUSPEND_DAYS * DAY));
    if ([30, 7, 1].includes(left)) return { kind: 'purge_warning', daysLeft: left };
  }
  return null;
}
