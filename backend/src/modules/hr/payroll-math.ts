/**
 * Indian payroll math (simplified, configurable). Confirm statutory rates with a CA each year.
 *  - PF (employee): 12% of basic, basic capped at ₹15,000 for PF wages → max ₹1,800/month.
 *  - ESI (employee): 0.75% of gross when gross ≤ ₹21,000/month.
 *  - Professional tax: state slab (UP, Delhi, Haryana: none; table extendable).
 */
export interface Component { code: string; kind: 'earning' | 'deduction'; type: 'fixed' | 'percent_basic'; value: number }
export interface Structure { basicPaise: number; components: Component[]; pfEnabled: boolean; esiEnabled: boolean; ptState?: string | null; tdsMonthlyPaise: number }

export const PF_WAGE_CAP = 1_500_000;
export const ESI_GROSS_LIMIT = 2_100_000;
export const PT_SLABS: Record<string, { upToPaise: number; taxPaise: number }[]> = {
  MH: [{ upToPaise: 750_000, taxPaise: 0 }, { upToPaise: 1_000_000, taxPaise: 17_500 }, { upToPaise: Infinity, taxPaise: 20_000 }],
  KA: [{ upToPaise: 2_500_000, taxPaise: 0 }, { upToPaise: Infinity, taxPaise: 20_000 }],
  WB: [{ upToPaise: 1_000_000, taxPaise: 0 }, { upToPaise: 1_500_000, taxPaise: 11_000 }, { upToPaise: 2_500_000, taxPaise: 13_000 }, { upToPaise: 4_000_000, taxPaise: 15_000 }, { upToPaise: Infinity, taxPaise: 20_000 }],
  UP: [], DL: [], HR: [], UK: [], RJ: [],
};

export function computePayslip(s: Structure, workingDays: number, paidDays: number) {
  const ratio = workingDays > 0 ? Math.min(1, paidDays / workingDays) : 0;
  const earnings: Record<string, number> = { BASIC: Math.round(s.basicPaise * ratio) };
  for (const c of s.components.filter((c) => c.kind === 'earning')) {
    const full = c.type === 'percent_basic' ? (s.basicPaise * c.value) / 100 : c.value;
    earnings[c.code] = Math.round(full * ratio);
  }
  const gross = Object.values(earnings).reduce((a, b) => a + b, 0);
  const deductions: Record<string, number> = {};
  if (s.pfEnabled) deductions.PF = Math.round(Math.min(earnings.BASIC!, PF_WAGE_CAP) * 0.12);
  if (s.esiEnabled && gross <= ESI_GROSS_LIMIT) deductions.ESI = Math.ceil(gross * 0.0075);
  const slab = s.ptState ? PT_SLABS[s.ptState]?.find((x) => gross <= x.upToPaise) : undefined;
  if (slab?.taxPaise) deductions.PT = slab.taxPaise;
  if (s.tdsMonthlyPaise) deductions.TDS = s.tdsMonthlyPaise;
  for (const c of s.components.filter((c) => c.kind === 'deduction')) deductions[c.code] = Math.round(c.type === 'percent_basic' ? (earnings.BASIC! * c.value) / 100 : c.value * ratio);
  const totalDed = Object.values(deductions).reduce((a, b) => a + b, 0);
  return { earnings, deductions, grossPaise: gross, netPaise: gross - totalDed };
}

/** Working days in a month excluding Sundays and listed holidays (YYYY-MM-DD). */
export function workingDaysIn(month: string, holidays: Set<string>) {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  let n = 0;
  for (let d = 1; d <= days; d++) {
    const iso = `${month}-${String(d).padStart(2, '0')}`;
    if (new Date(iso + 'T00:00:00Z').getUTCDay() !== 0 && !holidays.has(iso)) n++;
  }
  return n;
}
