import { describe, it, expect } from 'vitest';
import { quote, waMessagePrice, bandFor } from './pricing';
import { PLANS, PRICE_BOOK } from './price-book.seed';

const book = PRICE_BOOK.map((p) => ({ minPaise: p.listPaise, maxPaise: p.listPaise, meta: {}, ...p }));
const plan = (c: string) => ({ ...(PLANS.find((p) => p.code === c) as any) });

describe('pricing (docs/01 §4.3 worked examples)', () => {
  it('150-student school on Essential pays the floor: ₹16,989 ex GST, ₹20,047 incl', () => {
    const q = quote({ planCode: 'essential', students: 150, cycle: 'yearly', addons: [], includeSetup: true }, plan('essential'), book, '09');
    expect(q.subtotalPaise).toBe(1698900);
    expect(Math.round(q.totalPaise / 100)).toBe(20047);
    expect(q.cgstPaise + q.sgstPaise).toBe(q.taxPaise);
    expect(q.igstPaise).toBe(0);
  });
  it('250 students Essential: ₹19,999', () => {
    const q = quote({ planCode: 'essential', students: 250, cycle: 'yearly', addons: [], includeSetup: true }, plan('essential'), book, '09');
    expect(q.subtotalPaise).toBe(1999900);
  });
  it('800 students Professional: ₹99,999, IGST for a Delhi school billed from UP', () => {
    const q = quote({ planCode: 'professional', students: 800, cycle: 'yearly', addons: [], includeSetup: true, placeOfSupply: '07' }, plan('professional'), book, '09');
    expect(q.subtotalPaise).toBe(9999900);
    expect(q.igstPaise).toBe(Math.round(9999900 * 0.18));
    expect(q.band).toBe('setup_s3');
  });
  it('2,000 students Professional gets 10% volume discount: ₹2,14,999', () => {
    const q = quote({ planCode: 'professional', students: 2000, cycle: 'yearly', addons: [], includeSetup: true }, plan('professional'), book, '09');
    expect(q.subtotalPaise).toBe(21499900);
    expect(q.volumeDiscountPct).toBe(10);
  });
  it('quarterly billing has no free months', () => {
    const q = quote({ planCode: 'professional', students: 800, cycle: 'quarterly', addons: [], includeSetup: false }, plan('professional'), book, '09');
    expect(q.subtotalPaise).toBe(800 * 1000 * 3);
  });
  it('rejects unit price outside the price-book range', () => {
    expect(() => quote({ planCode: 'essential', students: 500, cycle: 'yearly', addons: [], includeSetup: false, unitPricePaise: 200 }, plan('essential'), book, '09')).toThrow();
  });
  it('per-vehicle GPS add-on is monthly × billed months', () => {
    const q = quote({ planCode: 'professional', students: 800, cycle: 'yearly', addons: [{ code: 'gps_vehicle', quantity: 6 }], includeSetup: false }, plan('professional'), book, '09');
    expect(q.lines.find((l) => l.code === 'gps_vehicle')!.amountPaise).toBe(6 * 10 * 19900);
  });
  it('early conversion halves setup', () => {
    const q = quote({ planCode: 'essential', students: 250, cycle: 'yearly', addons: [], includeSetup: true, earlyConversion: true }, plan('essential'), book, '09');
    expect(q.lines.find((l) => l.code === 'setup_s1')!.amountPaise).toBe(250000);
  });
  it('coaching flat plan with extra learners', () => {
    const q = quote({ planCode: 'coaching_growth', students: 2100, cycle: 'yearly', addons: [], includeSetup: true }, plan('coaching_growth'), book, '09');
    expect(q.lines[0]!.amountPaise).toBe(399900 * 10);
    expect(q.lines.find((l) => l.code === 'extra_learner')!.amountPaise).toBe(100 * 10 * 200);
  });
  it('bands', () => {
    expect(bandFor(300, book).code).toBe('setup_s1');
    expect(bandFor(301, book).code).toBe('setup_s2');
    expect(bandFor(9000, book).code).toBe('setup_s6');
  });
  it('WhatsApp utility = Meta ₹0.115 + ₹0.04 fee', () => {
    const p = waMessagePrice('utility', book);
    expect(p.pricePaise).toBeCloseTo(15.5);
    expect(p.pricePaise * 1.18).toBeCloseTo(18.29, 1);
    expect(waMessagePrice('service', book).pricePaise).toBe(0);
  });
});
