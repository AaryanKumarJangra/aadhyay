import { describe, it, expect } from 'vitest';
import { computePayslip, workingDaysIn } from './payroll-math';

describe('payroll', () => {
  it('teacher ₹25,000 basic + 40% HRA, PF capped, no ESI above limit, UP no PT', () => {
    const p = computePayslip({ basicPaise: 2_500_000, components: [{ code: 'HRA', kind: 'earning', type: 'percent_basic', value: 40 }], pfEnabled: true, esiEnabled: true, ptState: 'UP', tdsMonthlyPaise: 0 }, 26, 26);
    expect(p.grossPaise).toBe(3_500_000);
    expect(p.deductions).toEqual({ PF: 180_000 });
    expect(p.netPaise).toBe(3_320_000);
  });
  it('support staff ₹12,000 with ESI and loss of pay', () => {
    const p = computePayslip({ basicPaise: 1_200_000, components: [], pfEnabled: true, esiEnabled: true, ptState: null, tdsMonthlyPaise: 0 }, 26, 24);
    expect(p.earnings.BASIC).toBe(Math.round(1_200_000 * 24 / 26));
    expect(p.deductions.ESI).toBe(Math.ceil(p.grossPaise * 0.0075));
  });
  it('Maharashtra PT slab', () => {
    const p = computePayslip({ basicPaise: 1_200_000, components: [], pfEnabled: false, esiEnabled: false, ptState: 'MH', tdsMonthlyPaise: 0 }, 26, 26);
    expect(p.deductions.PT).toBe(20_000);
  });
  it('working days exclude Sundays and holidays', () => {
    expect(workingDaysIn('2026-10', new Set(['2026-10-02']))).toBe(27 - 1); // Oct 2026: 27 non-Sundays, Gandhi Jayanti holiday
  });
});
