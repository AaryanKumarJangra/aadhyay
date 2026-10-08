import { gstSplit } from '../common/money';

export interface PlanRow { code: string; pricingUnit: string; pricePerUnitPaise: number; minMonthlyPaise: number; rangeMinPaise: number; rangeMaxPaise: number; learnerLimit: number | null; name: string }
export interface PriceRow { code: string; kind: string; name: string; unit: string; listPaise: number; minPaise: number; maxPaise: number; meta: any }
export interface QuoteInput {
  planCode: string;
  students: number;
  cycle: 'quarterly' | 'yearly';
  addons: { code: string; quantity: number }[];
  unitPricePaise?: number;
  includeSetup: boolean;
  placeOfSupply?: string;
  earlyConversion?: boolean;
  staffCount?: number;
}
export interface QuoteLine { code: string; description: string; qty: number; unitPaise: number; amountPaise: number; sac: string }
export interface Quote {
  planCode: string;
  cycle: 'quarterly' | 'yearly';
  months: number; // service months covered
  billedMonths: number; // yearly: 10 (2 free)
  band: string | null;
  volumeDiscountPct: number;
  lines: QuoteLine[];
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
  totalPaise: number;
  effectivePerStudentYearPaise: number | null;
}

export class PricingError extends Error {}

/** Setup band by student count. */
export function bandFor(students: number, book: PriceRow[]) {
  const bands = book.filter((p) => p.kind === 'setup' && p.meta?.maxStudents).sort((a, b) => a.meta.maxStudents - b.meta.maxStudents);
  return bands.find((b) => students <= b.meta.maxStudents) ?? bands[bands.length - 1]!;
}

const PER_MONTH_UNITS = new Set(['per_month', 'per_vehicle_month', 'per_student_month', 'per_learner_month', 'per_staff_month']);

/**
 * Pure pricing engine (docs/01 §3–§6):
 *   subscription = max(students × rate × (1 − volumeDiscount), monthlyFloor) × billedMonths
 *   yearly = pay 10 months, get 12; quarterly = 3 months at list.
 *   + per-month add-ons × billedMonths, + one-time add-ons, + setup fee (band), then GST (CGST+SGST or IGST).
 */
export function quote(input: QuoteInput, plan: PlanRow, book: PriceRow[], supplierState: string): Quote {
  const months = input.cycle === 'yearly' ? 12 : 3;
  const billedMonths = input.cycle === 'yearly' ? 10 : 3;
  const lines: QuoteLine[] = [];
  const isStudentPlan = plan.pricingUnit === 'student';
  const band = isStudentPlan ? bandFor(input.students, book) : null;
  const volumeDiscountPct = band?.meta?.volumeDiscountPct ?? 0;

  let rate = input.unitPricePaise ?? plan.pricePerUnitPaise;
  if (rate < plan.rangeMinPaise || rate > plan.rangeMaxPaise) throw new PricingError(`Unit price must be within ${plan.rangeMinPaise}–${plan.rangeMaxPaise} paise`);

  if (isStudentPlan) {
    const monthly = Math.max(Math.round(input.students * rate * (1 - volumeDiscountPct / 100)), plan.minMonthlyPaise);
    const floorApplied = monthly === plan.minMonthlyPaise && input.students * rate * (1 - volumeDiscountPct / 100) < plan.minMonthlyPaise;
    lines.push({
      code: plan.code,
      description: floorApplied
        ? `${plan.name} plan — minimum monthly charge × ${billedMonths} months${input.cycle === 'yearly' ? ' (12 months service)' : ''}`
        : `${plan.name} plan — ${input.students} students × ₹${(rate / 100).toFixed(2)}${volumeDiscountPct ? ` − ${volumeDiscountPct}% volume discount` : ''} × ${billedMonths} months${input.cycle === 'yearly' ? ' (12 months service)' : ''}`,
      qty: billedMonths,
      unitPaise: monthly,
      amountPaise: monthly * billedMonths,
      sac: '998314',
    });
  } else {
    lines.push({ code: plan.code, description: `${plan.name} plan × ${billedMonths} months`, qty: billedMonths, unitPaise: rate, amountPaise: rate * billedMonths, sac: '998314' });
    if (plan.learnerLimit && input.students > plan.learnerLimit) {
      const extra = book.find((b) => b.code === 'extra_learner');
      if (extra) {
        const qty = input.students - plan.learnerLimit;
        lines.push({ code: extra.code, description: `${qty} extra learners × ${billedMonths} months`, qty: qty * billedMonths, unitPaise: extra.listPaise, amountPaise: qty * billedMonths * extra.listPaise, sac: '998314' });
      }
    }
  }

  for (const a of input.addons) {
    const p = book.find((b) => b.code === a.code);
    if (!p) throw new PricingError(`Unknown add-on ${a.code}`);
    const qty = p.unit === 'per_student_month' ? input.students : a.quantity;
    const periods = PER_MONTH_UNITS.has(p.unit) ? billedMonths : p.unit === 'per_year' ? (input.cycle === 'yearly' ? 1 : 0.25) : 1;
    const amount = Math.round(qty * periods * p.listPaise);
    lines.push({ code: p.code, description: `${p.name}${qty !== 1 ? ` × ${qty}` : ''}${PER_MONTH_UNITS.has(p.unit) ? ` × ${billedMonths} months` : ''}`, qty: qty * periods, unitPaise: p.listPaise, amountPaise: amount, sac: '998314' });
    if (p.meta?.perStaffPaise && input.staffCount) {
      const amt = input.staffCount * billedMonths * p.meta.perStaffPaise;
      lines.push({ code: `${p.code}_staff`, description: `${p.name} — ${input.staffCount} staff × ${billedMonths} months`, qty: input.staffCount * billedMonths, unitPaise: p.meta.perStaffPaise, amountPaise: amt, sac: '998314' });
    }
  }

  if (input.includeSetup) {
    const setup = isStudentPlan ? band! : book.find((b) => b.code === (plan.code === 'creator_starter' ? 'setup_creator' : 'setup_coaching'));
    if (setup && setup.listPaise > 0) {
      const amt = input.earlyConversion ? Math.round((setup.listPaise * 0.5) / 100) * 100 : setup.listPaise; // whole rupees
      lines.push({ code: setup.code, description: `${setup.name}${input.earlyConversion ? ' — 50% early-conversion discount' : ''}`, qty: 1, unitPaise: amt, amountPaise: amt, sac: '998313' });
    }
  }

  const subtotalPaise = lines.reduce((s, l) => s + l.amountPaise, 0);
  const g = gstSplit(subtotalPaise, supplierState, input.placeOfSupply ?? supplierState);
  const subscriptionPart = lines.filter((l) => !l.code.startsWith('setup')).reduce((s, l) => s + l.amountPaise, 0);
  return {
    planCode: plan.code, cycle: input.cycle, months, billedMonths, band: band?.code ?? null, volumeDiscountPct, lines, subtotalPaise,
    cgstPaise: g.cgstPaise, sgstPaise: g.sgstPaise, igstPaise: g.igstPaise, taxPaise: g.taxPaise, totalPaise: g.totalPaise,
    effectivePerStudentYearPaise: isStudentPlan && input.students ? Math.round(((subscriptionPart / months) * 12) / input.students) : null,
  };
}

/** WhatsApp per-message price to tenant (ex-GST, fractional paise): Meta rate + Aadhyay fee. */
export function waMessagePrice(category: 'marketing' | 'utility' | 'authentication' | 'service', book: PriceRow[]) {
  if (category === 'service') return { costPaise: 0, pricePaise: 0 };
  const meta = book.find((b) => b.code === `meta_wa_${category}`);
  const fee = book.find((b) => b.code === 'wa_platform_fee');
  const cost = meta?.meta?.exactPaise ?? meta?.listPaise ?? 0;
  const f = fee?.meta?.exactPaise ?? fee?.listPaise ?? 0;
  return { costPaise: cost * 1.18, pricePaise: cost + f }; // our cost includes Meta's GST (claimed back as ITC)
}
