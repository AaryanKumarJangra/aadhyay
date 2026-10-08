import { describe, it, expect } from 'vitest';
import { lateFee, allocate } from './fee-math';

describe('fee math', () => {
  it('late fee with grace and cap', () => {
    const r = { perDayPaise: 1000, maxPaise: 20000, graceDays: 5 };
    expect(lateFee('2026-04-10', '2026-04-14', r)).toBe(0);
    expect(lateFee('2026-04-10', '2026-04-20', r)).toBe(5000);
    expect(lateFee('2026-04-10', '2026-06-20', r)).toBe(20000);
  });
  it('allocates oldest first, late fee before principal, remainder kept', () => {
    const fees = [
      { id: 'b', amountPaise: 300000, discountPaise: 0, paidPaise: 0, lateFeePaise: 0, dueOn: '2026-07-10', lateDuePaise: 0 },
      { id: 'a', amountPaise: 300000, discountPaise: 50000, paidPaise: 100000, lateFeePaise: 0, dueOn: '2026-04-10', lateDuePaise: 5000 },
    ];
    const r = allocate(200000, fees);
    expect(r.allocations).toEqual([{ studentFeeId: 'a', principalPaise: 150000, lateFeePaise: 5000 }, { studentFeeId: 'b', principalPaise: 45000, lateFeePaise: 0 }]);
    expect(r.remainderPaise).toBe(0);
    expect(allocate(10_000_000, fees).remainderPaise).toBe(10_000_000 - 155000 - 300000);
  });
});
