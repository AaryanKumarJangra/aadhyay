import { daysBetween } from '../../common/dates';

export interface LateRule { perDayPaise: number; maxPaise: number; graceDays: number }
/** Late fee = (days overdue − grace) × per-day, capped at max (0 = no cap). */
export function lateFee(dueOn: string, on: string, rule: LateRule | undefined): number {
  if (!rule || !rule.perDayPaise) return 0;
  const days = daysBetween(dueOn, on) - (rule.graceDays ?? 0);
  if (days <= 0) return 0;
  const amt = days * rule.perDayPaise;
  return rule.maxPaise ? Math.min(amt, rule.maxPaise) : amt;
}

export interface FeeLine { id: string; amountPaise: number; discountPaise: number; paidPaise: number; lateFeePaise: number; dueOn: string; lateDuePaise: number }
export const outstanding = (f: FeeLine) => f.amountPaise - f.discountPaise - f.paidPaise + Math.max(0, f.lateDuePaise - f.lateFeePaise);

/**
 * Allocate a payment across fees, oldest due first. Late fee for a line is settled before its principal.
 * Returns allocations and any unallocated remainder (advance).
 */
export function allocate(amountPaise: number, fees: FeeLine[]) {
  let left = amountPaise;
  const out: { studentFeeId: string; principalPaise: number; lateFeePaise: number }[] = [];
  for (const f of [...fees].sort((a, b) => a.dueOn.localeCompare(b.dueOn))) {
    if (left <= 0) break;
    const lateOwed = Math.max(0, f.lateDuePaise - f.lateFeePaise);
    const late = Math.min(left, lateOwed);
    left -= late;
    const principalOwed = f.amountPaise - f.discountPaise - f.paidPaise;
    const principal = Math.min(left, Math.max(0, principalOwed));
    left -= principal;
    if (late || principal) out.push({ studentFeeId: f.id, principalPaise: principal, lateFeePaise: late });
  }
  return { allocations: out, remainderPaise: left };
}
