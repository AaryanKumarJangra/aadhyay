/**
 * Price book seed — mirrors docs/01-BUSINESS-PLAN.md §4–§7 exactly. All amounts ex-GST, in paise.
 * Change prices in the control plane (DB), not here; this is only the initial seed.
 */
export const PLANS = [
  { code: 'essential', name: 'Essential', segment: null, pricingUnit: 'student', pricePerUnitPaise: 600, minMonthlyPaise: 119900, rangeMinPaise: 500, rangeMaxPaise: 800, learnerLimit: null, sortOrder: 1 },
  { code: 'professional', name: 'Professional', segment: null, pricingUnit: 'student', pricePerUnitPaise: 1000, minMonthlyPaise: 299900, rangeMinPaise: 800, rangeMaxPaise: 1300, learnerLimit: null, sortOrder: 2 },
  { code: 'enterprise', name: 'Enterprise', segment: null, pricingUnit: 'student', pricePerUnitPaise: 1500, minMonthlyPaise: 799900, rangeMinPaise: 1300, rangeMaxPaise: 2000, learnerLimit: null, sortOrder: 3 },
  { code: 'creator_starter', name: 'Creator Starter', segment: 'creator', pricingUnit: 'flat', pricePerUnitPaise: 99900, minMonthlyPaise: 99900, rangeMinPaise: 79900, rangeMaxPaise: 149900, learnerLimit: 300, sortOrder: 4 },
  { code: 'coaching_growth', name: 'Coaching Growth', segment: 'coaching', pricingUnit: 'flat', pricePerUnitPaise: 399900, minMonthlyPaise: 399900, rangeMinPaise: 299900, rangeMaxPaise: 499900, learnerLimit: 2000, sortOrder: 5 },
  { code: 'coaching_pro', name: 'Coaching Pro', segment: 'coaching', pricingUnit: 'flat', pricePerUnitPaise: 999900, minMonthlyPaise: 999900, rangeMinPaise: 799900, rangeMaxPaise: 1299900, learnerLimit: 10000, sortOrder: 6 },
] as const;

type PB = { code: string; kind: string; name: string; unit: string; listPaise: number; minPaise?: number; maxPaise?: number; meta?: Record<string, unknown> };
export const PRICE_BOOK: PB[] = [
  // Setup fees by strength band (§4.2)
  { code: 'setup_s1', kind: 'setup', name: 'Setup (up to 300 students)', unit: 'one_time', listPaise: 499900, meta: { maxStudents: 300, volumeDiscountPct: 0 } },
  { code: 'setup_s2', kind: 'setup', name: 'Setup (301–750)', unit: 'one_time', listPaise: 999900, meta: { maxStudents: 750, volumeDiscountPct: 0 } },
  { code: 'setup_s3', kind: 'setup', name: 'Setup (751–1,500)', unit: 'one_time', listPaise: 1999900, meta: { maxStudents: 1500, volumeDiscountPct: 0 } },
  { code: 'setup_s4', kind: 'setup', name: 'Setup (1,501–3,000)', unit: 'one_time', listPaise: 3499900, meta: { maxStudents: 3000, volumeDiscountPct: 10 } },
  { code: 'setup_s5', kind: 'setup', name: 'Setup (3,001–6,000)', unit: 'one_time', listPaise: 5499900, meta: { maxStudents: 6000, volumeDiscountPct: 15 } },
  { code: 'setup_s6', kind: 'setup', name: 'Setup (6,000+ / university)', unit: 'one_time', listPaise: 9999900, minPaise: 9999900, maxPaise: 99999900, meta: { maxStudents: 10_000_000, volumeDiscountPct: 15, custom: true } },
  { code: 'setup_coaching', kind: 'setup', name: 'Coaching setup', unit: 'one_time', listPaise: 399900 },
  { code: 'setup_creator', kind: 'setup', name: 'Creator setup (self-serve)', unit: 'one_time', listPaise: 0 },
  // Add-ons (§6)
  { code: 'gps_vehicle', kind: 'addon', name: 'GPS device integration', unit: 'per_vehicle_month', listPaise: 19900 },
  { code: 'device_attendance', kind: 'addon', name: 'Device attendance (RFID/face/biometric)', unit: 'per_student_month', listPaise: 100, meta: { module: 'attendance' } },
  { code: 'college_pack', kind: 'addon', name: 'College pack', unit: 'per_student_month', listPaise: 300, meta: { module: 'college' } },
  { code: 'hostel', kind: 'addon', name: 'Hostel', unit: 'per_student_month', listPaise: 100, meta: { module: 'hostel' } },
  { code: 'extra_branch', kind: 'addon', name: 'Additional branch', unit: 'per_month', listPaise: 149900, meta: { module: 'multibranch' } },
  { code: 'hr_payroll', kind: 'addon', name: 'HR & payroll (Essential)', unit: 'per_month', listPaise: 39900, meta: { module: 'hr', perStaffPaise: 1200 } },
  { code: 'ai_copilot', kind: 'addon', name: 'AI copilot', unit: 'per_month', listPaise: 79900, meta: { module: 'ai' } },
  { code: 'wa_onboarding', kind: 'addon', name: 'WhatsApp Channel onboarding', unit: 'one_time', listPaise: 199900, meta: { module: 'whatsapp' } },
  { code: 'storage_25gb', kind: 'addon', name: 'Extra storage 25 GB', unit: 'per_month', listPaise: 12900 },
  { code: 'domain_byo', kind: 'domain', name: 'Custom domain (bring your own)', unit: 'per_year', listPaise: 199900 },
  { code: 'domain_managed', kind: 'domain', name: 'Managed domain', unit: 'per_year', listPaise: 299900, meta: { plusRegistrarCost: true } },
  { code: 'growth_bundle', kind: 'domain', name: 'Growth bundle (domain + SEO)', unit: 'per_year', listPaise: 899900 },
  { code: 'flavour_android', kind: 'flavour', name: 'White-label Android app (one-time)', unit: 'one_time', listPaise: 999900 },
  { code: 'flavour_android_monthly', kind: 'flavour', name: 'White-label Android app (monthly)', unit: 'per_month', listPaise: 79900 },
  { code: 'flavour_ios', kind: 'flavour', name: 'White-label iOS app (one-time)', unit: 'one_time', listPaise: 999900 },
  { code: 'data_entry', kind: 'service', name: 'Data entry / migration', unit: 'per_student', listPaise: 300 },
  { code: 'extra_learner', kind: 'addon', name: 'Extra active learner (coaching)', unit: 'per_learner_month', listPaise: 200 },
  // Usage (§7.1) — Aadhyay fee on top of Meta's rate. exactPaise supports fractional paise.
  { code: 'wa_platform_fee', kind: 'usage', name: 'WhatsApp platform fee', unit: 'per_message', listPaise: 4, minPaise: 0, maxPaise: 10, meta: { exactPaise: 4 } },
  { code: 'meta_wa_marketing', kind: 'usage', name: 'Meta rate — marketing', unit: 'per_message', listPaise: 86, meta: { exactPaise: 86.31, passThrough: true } },
  { code: 'meta_wa_utility', kind: 'usage', name: 'Meta rate — utility', unit: 'per_message', listPaise: 12, meta: { exactPaise: 11.5, passThrough: true } },
  { code: 'meta_wa_authentication', kind: 'usage', name: 'Meta rate — authentication', unit: 'per_message', listPaise: 12, meta: { exactPaise: 11.5, passThrough: true } },
  { code: 'sms', kind: 'usage', name: 'SMS (DLT)', unit: 'per_message', listPaise: 20, meta: { exactPaise: 20, costPaise: 18 } },
  { code: 'voice_min', kind: 'usage', name: 'AI voice agent', unit: 'per_minute', listPaise: 700 },
  { code: 'voice_pack_1000', kind: 'usage', name: 'AI voice 1,000-minute pack', unit: 'one_time', listPaise: 599900 },
];

/** Starter wallet credit on trial (₹100). */
export const TRIAL_WALLET_CREDIT_PAISE = 10000;
export const TRIAL_DAYS = 90;
export const GRACE_DAYS = 30;
export const ARCHIVE_AFTER_SUSPEND_DAYS = 90;
export const PURGE_AFTER_SUSPEND_DAYS = 365;
export const EARLY_CONVERSION_DAY = 60;
export const EARLY_CONVERSION_SETUP_DISCOUNT = 0.5;
