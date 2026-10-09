'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { AlertTriangle, ArrowLeft, ArrowRight, Building2, Check, GraduationCap, Landmark, Plus, Rocket, School, Sparkles, Trash2, UserRound, Users } from 'lucide-react';
import { CATALOGUE, CORE_MODULES, MODULE_KEYS, Org, PLAN_MODULES, missingDependencies } from '@aadhyay/contracts';
import { ccall } from '@/lib/control-client';
import { cx } from '@/lib/format';
import { Alert, Badge, Button, Input, Select } from '@/components/ui';

type Form = z.input<typeof Org.onboardingInput>;
type Plan = { code: string; name: string; segment: string | null; pricePerUnitPaise: number; pricingUnit: string; minMonthlyPaise: number };
type Quote = { lines: { code: string; description: string; amountPaise: number }[]; subtotalPaise: number; taxPaise: number; totalPaise: number; effectivePerStudentYearPaise?: number };

const SEGMENTS = [
  { v: 'school', label: 'School', hint: 'Classes & sections, K-12', icon: School },
  { v: 'college', label: 'College / University', hint: 'Programmes, semesters, credits', icon: Landmark },
  { v: 'coaching', label: 'Coaching', hint: 'Courses, batches, centres', icon: GraduationCap },
  { v: 'institute', label: 'Institute', hint: 'Courses & batches', icon: Building2 },
  { v: 'creator', label: 'Creator', hint: 'Courses, cohorts, learners', icon: Sparkles },
] as const;
const MODEL: Record<string, { levels: string; detail: string }> = {
  school: { levels: 'Class → Section → Student', detail: 'Class teachers and subject teachers per section; CBSE/ICSE/State grade scales.' },
  college: { levels: 'Programme → Semester → Course → Credits', detail: 'CBCS credits with SGPA/CGPA, departments, placements.' },
  coaching: { levels: 'Course → Batch → Centre → Learner', detail: 'Test series, ranks and online tests.' },
  institute: { levels: 'Course → Batch → Learner', detail: 'Short courses and certifications.' },
  creator: { levels: 'Course → Cohort → Learner', detail: 'LMS courses, coupons and certificates.' },
};
const STATES: [string, string][] = [['Delhi', '07'], ['Haryana', '06'], ['Uttar Pradesh', '09'], ['Rajasthan', '08'], ['Punjab', '03'], ['Maharashtra', '27'], ['Karnataka', '29'], ['Tamil Nadu', '33'], ['Gujarat', '24'], ['Madhya Pradesh', '23'], ['Bihar', '10'], ['West Bengal', '19'], ['Uttarakhand', '05'], ['Telangana', '36'], ['Kerala', '32']];
const TEMPLATES: Record<string, string[]> = {
  school: ['modern-school', 'classic-school', 'premium-school', 'academic', 'minimal'], college: ['university', 'modern-campus', 'research'],
  coaching: ['result-oriented', 'test-prep', 'premium-institute'], institute: ['premium-institute', 'minimal'], creator: ['course-creator', 'personal-brand', 'academy'],
};
const STEPS = ['Type', 'Basics', 'Academic model', 'Branches', 'Plan', 'Modules', 'Branding', 'Website', 'Domain', 'Admins', 'Data import', 'Review'] as const;
const STEP_FIELDS: FieldPath<Form>[][] = [
  ['segment'], ['institutionName', 'shortName', 'legalName', 'code', 'phone', 'email', 'address', 'city', 'state', 'stateCode', 'timezone'], [], ['branches'], ['planCode', 'cycle', 'approxStudents'],
  ['modules'], ['branding.primaryColor', 'branding.accentColor', 'branding.tagline'], ['website.enabled', 'website.template'], ['slug', 'customDomain'], ['owner.name', 'owner.phone', 'owner.email', 'principal.name', 'principal.phone'], [], [],
];
const inr = (p: number) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const modLabel = (k: string) => (CATALOGUE as Record<string, { label: string }>)[k]?.label ?? k.replace(/-/g, ' ');
/** Empty optional inputs must be `undefined`, not '' (which fails email/phone/domain validation). */
const opt = { setValueAs: (x: unknown) => (x === '' || x === null ? undefined : x) };
/** A plan's modules plus everything they depend on (a plan's defaults must never be an invalid combination). */
const planModules = (code: string) => {
  let set = (PLAN_MODULES[code] ?? []).filter((m) => !(CORE_MODULES as string[]).includes(m)) as string[];
  for (let i = 0; i < 3; i++) set = [...new Set([...set, ...missingDependencies(set).flatMap((d) => d.needs)])];
  return set;
};
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export function OnboardingWizard({ plans, baseDomain }: { plans: Plan[]; baseDomain: string }) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<{ slug: string; tenantId: string; websiteUrl: string; domain: { host: string; instructions: { type: string; name: string; value: string }[] } | null } | null>(null);
  const [serverErr, setServerErr] = useState('');
  const [hasPrincipal, setHasPrincipal] = useState(false);
  const { register, handleSubmit, watch, setValue, trigger, control, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(Org.onboardingInput), mode: 'onTouched',
    defaultValues: { segment: 'school', timezone: 'Asia/Kolkata', stateCode: '09', state: 'Uttar Pradesh', branches: [], planCode: 'professional', cycle: 'yearly', approxStudents: 500, modules: planModules('professional'), branding: { primaryColor: '#2563EB', accentColor: '#4F46E5' }, website: { enabled: true, template: 'modern-school' } },
  });
  const branches = useFieldArray({ control, name: 'branches' });
  const v = watch();
  const segPlans = plans.filter((p) => (v.segment === 'coaching' || v.segment === 'creator' ? p.segment === v.segment : !p.segment));
  const included = new Set<string>(PLAN_MODULES[v.planCode] ?? []);
  const missing = missingDependencies(v.modules ?? []);
  const slug = v.slug || slugify(v.institutionName ?? '');

  useEffect(() => { if (!segPlans.some((p) => p.code === v.planCode) && segPlans[0]) { setValue('planCode', segPlans[0].code); setValue('modules', planModules(segPlans[0].code)); } }, [v.segment]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = TEMPLATES[v.segment ?? 'school'] ?? []; if (!t.includes(v.website?.template ?? '')) setValue('website.template', t[0]!); }, [v.segment]); // eslint-disable-line react-hooks/exhaustive-deps

  const [quote, setQuote] = useState<Quote | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch('/api/v1/public/quote', { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ planCode: v.planCode, students: Number(v.approxStudents) || 1, cycle: v.cycle, addons: [], includeSetup: true }) })
        .then((r) => (r.ok ? r.json() : null)).then(setQuote).catch(() => undefined);
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [v.planCode, v.approxStudents, v.cycle]);

  const next = async () => { if (await trigger(STEP_FIELDS[step] as FieldPath<Form>[])) setStep((s) => Math.min(STEPS.length - 1, s + 1)); };
  const submit = handleSubmit(async (data) => {
    setServerErr('');
    try {
      const body = { ...data, slug: data.slug || slug, principal: hasPrincipal ? data.principal : undefined, customDomain: data.customDomain || undefined, email: data.email || undefined, phone: data.phone || undefined };
      setDone(await ccall('/onboarding', { body }));
    } catch (e) { setServerErr(e instanceof Error ? e.message : 'Could not create the institution'); }
  }, () => setServerErr('Some details are missing or invalid. Go back through the steps marked in red.'));

  if (done) return (
    <div className="mx-auto max-w-xl rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-ok-soft text-ok"><Check className="size-6" /></span>
      <h2 className="mt-4 text-xl font-semibold">{v.institutionName} is ready</h2>
      <p className="mt-2 text-sm text-muted">Roles, academic year, branches, modules, website pages, admissions pipeline and ledgers have been created. The owner can sign in with their phone number now.</p>
      <ul className="mt-6 space-y-2 text-left text-[13px]">
        <li className="flex justify-between rounded-lg bg-sunken px-3 py-2"><span className="text-muted">Website</span><span className="font-medium">{done.slug}.{baseDomain}</span></li>
        {done.domain && done.domain.instructions.map((i) => <li key={i.type} className="rounded-lg bg-sunken px-3 py-2"><span className="text-muted">{i.type} record for {done.domain!.host}:</span> <code className="break-all">{i.name} → {i.value}</code></li>)}
      </ul>
      <div className="mt-6 flex justify-center gap-2"><Link href={`/control/tenants/${done.tenantId}`} className="inline-flex h-9 items-center rounded-md bg-brand px-4 text-sm font-medium text-white">Open Tenant 360</Link><Link href="/control/onboarding" onClick={() => location.reload()} className="inline-flex h-9 items-center rounded-md border border-line px-4 text-sm font-medium">Onboard another</Link></div>
    </div>
  );

  const stepHasError = (i: number) => STEP_FIELDS[i]!.some((f) => f.split('.').reduce<any>((o, k) => o?.[k], errors));

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (step === STEPS.length - 1) void submit(); else void next(); }} noValidate className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <ol className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className="shrink-0">
            <button type="button" onClick={() => i < step && setStep(i)} disabled={i > step} aria-current={i === step ? 'step' : undefined}
              className={cx('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px]', i === step ? 'bg-brand-soft font-semibold text-brand' : i < step ? 'text-ink-2 hover:bg-sunken' : 'text-faint')}>
              <span className={cx('grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold', stepHasError(i) ? 'bg-bad text-white' : i < step ? 'bg-ok text-white' : i === step ? 'bg-brand text-white' : 'bg-sunken text-muted')}>{i < step && !stepHasError(i) ? <Check className="size-3.5" /> : i + 1}</span>
              <span className="whitespace-nowrap">{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <section className="min-w-0 rounded-xl border border-line bg-surface shadow-sm">
        <header className="border-b border-line px-6 py-4"><p className="text-xs text-muted">Step {step + 1} of {STEPS.length}</p><h2 className="text-lg font-semibold">{STEPS[step]}</h2></header>
        <div className="space-y-5 p-6">
          {step === 0 && (
            <div role="radiogroup" aria-label="Institution type" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {SEGMENTS.map((s) => (
                <button key={s.v} type="button" role="radio" aria-checked={v.segment === s.v} onClick={() => setValue('segment', s.v)}
                  className={cx('flex items-start gap-3 rounded-xl border p-4 text-left transition-colors', v.segment === s.v ? 'border-brand bg-brand-soft ring-2 ring-brand/20' : 'border-line hover:border-line-strong')}>
                  <span className="grid size-10 place-items-center rounded-lg bg-surface text-brand ring-1 ring-line"><s.icon className="size-5" /></span>
                  <span><span className="block font-semibold text-ink">{s.label}</span><span className="text-xs text-muted">{s.hint}</span></span>
                </button>
              ))}
            </div>
          )}
          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Institution name" required {...register('institutionName')} error={errors.institutionName?.message} wrapperClassName="sm:col-span-2" />
              <Input label="Short name" {...register('shortName', opt)} placeholder="e.g. DPS Meerut" />
              <Input label="Institution code" {...register('code', opt)} placeholder="Affiliation / internal code" />
              <Input label="Legal name" {...register('legalName', opt)} placeholder="Trust or company name on invoices" wrapperClassName="sm:col-span-2" />
              <Input label="Phone" inputMode="tel" {...register('phone', opt)} error={errors.phone?.message} placeholder="+91…" />
              <Input label="Email" type="email" {...register('email', opt)} error={errors.email?.message} />
              <Input label="Address" {...register('address', opt)} wrapperClassName="sm:col-span-2" />
              <Input label="City" required {...register('city')} error={errors.city?.message} />
              <Select label="State" required value={v.state} onChange={(e) => { const st = STATES.find(([n]) => n === e.target.value); setValue('state', e.target.value); if (st) setValue('stateCode', st[1]); }} options={STATES.map(([n]) => ({ value: n, label: n }))} />
              <Input label="GST state code" {...register('stateCode')} error={errors.stateCode?.message} hint="Decides CGST+SGST vs IGST on invoices" />
              <Select label="Timezone" {...register('timezone')} options={[{ value: 'Asia/Kolkata', label: 'India (IST)' }, { value: 'Asia/Dubai', label: 'Gulf (GST+4)' }, { value: 'Asia/Kathmandu', label: 'Nepal' }]} />
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-line bg-surface-2 p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Structure</p><p className="mt-1 text-lg font-semibold text-ink">{MODEL[v.segment ?? 'school']!.levels}</p><p className="mt-1 text-sm text-muted">{MODEL[v.segment ?? 'school']!.detail}</p></div>
              <Alert tone="info">Terminology across the console, apps and website follows this model (e.g. “Batch” instead of “Section” for coaching). The institution can create its classes or courses after setup, or import them in the data import step.</Alert>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <Alert tone="info">A main branch is created automatically from the institution’s address. Add other campuses here.</Alert>
              {branches.fields.map((f, i) => (
                <div key={f.id} className="grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-[1fr_140px_1fr_auto] sm:items-end">
                  <Input label="Branch name" required {...register(`branches.${i}.name`)} error={errors.branches?.[i]?.name?.message} />
                  <Input label="Code" required {...register(`branches.${i}.code`)} error={errors.branches?.[i]?.code?.message} />
                  <Input label="Head / principal" {...register(`branches.${i}.headName`, opt)} />
                  <Button variant="ghost" icon={<Trash2 />} onClick={() => branches.remove(i)} aria-label={`Remove branch ${i + 1}`} />
                  <Input label="Address" {...register(`branches.${i}.address`, opt)} wrapperClassName="sm:col-span-2" />
                  <Input label="Contact phone" {...register(`branches.${i}.phone`, opt)} wrapperClassName="sm:col-span-2" />
                </div>
              ))}
              <Button variant="secondary" icon={<Plus />} onClick={() => branches.append({ name: '', code: '' })}>Add branch</Button>
            </div>
          )}
          {step === 4 && (
            <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
              <div className="space-y-4">
                <div role="radiogroup" aria-label="Plan" className="grid gap-3 md:grid-cols-3">
                  {segPlans.map((p) => (
                    <button key={p.code} type="button" role="radio" aria-checked={v.planCode === p.code} onClick={() => { setValue('planCode', p.code); setValue('modules', planModules(p.code)); }}
                      className={cx('rounded-xl border p-4 text-left', v.planCode === p.code ? 'border-brand bg-brand-soft ring-2 ring-brand/20' : 'border-line hover:border-line-strong')}>
                      <p className="font-semibold">{p.name}</p>
                      <p className="mt-1 text-xl font-semibold tabular">{inr(p.pricePerUnitPaise)}<span className="text-xs font-normal text-muted">{p.pricingUnit === 'student' ? ' /student/month' : ' /month'}</span></p>
                      <p className="text-xs text-muted">Minimum {inr(p.minMonthlyPaise)}/month · {(PLAN_MODULES[p.code] ?? []).length} modules</p>
                    </button>
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Approximate active students" type="number" min={1} {...register('approxStudents', { valueAsNumber: true })} error={errors.approxStudents?.message} />
                  <Select label="Billing frequency" {...register('cycle')} options={[{ value: 'yearly', label: 'Yearly (pay 10 months, get 12)' }, { value: 'quarterly', label: 'Quarterly' }]} />
                </div>
                <Alert tone="info">The institution starts on a 90-day trial with these modules. Prices come from the live price book; the first invoice uses a snapshot of them.</Alert>
              </div>
              <aside className="rounded-xl border border-line bg-surface-2 p-4 text-[13px]">
                <p className="font-semibold">Estimate</p>
                {quote ? (
                  <dl className="mt-3 space-y-1.5">
                    {quote.lines.map((l) => <div key={l.code} className="flex justify-between gap-3"><dt className="text-muted">{l.description}</dt><dd className="tabular">{inr(l.amountPaise)}</dd></div>)}
                    <div className="flex justify-between border-t border-line pt-1.5"><dt>Subtotal</dt><dd className="tabular">{inr(quote.subtotalPaise)}</dd></div>
                    <div className="flex justify-between text-muted"><dt>GST 18%</dt><dd className="tabular">{inr(quote.taxPaise)}</dd></div>
                    <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd className="tabular">{inr(quote.totalPaise)}</dd></div>
                    {quote.effectivePerStudentYearPaise ? <p className="text-xs text-muted">≈ {inr(quote.effectivePerStudentYearPaise)} per student per year</p> : null}
                  </dl>
                ) : <p className="mt-3 text-muted">Calculating…</p>}
              </aside>
            </div>
          )}
          {step === 5 && (
            <div className="space-y-4">
              {missing.length > 0 && (
                <Alert tone="warn" title="Some modules need others to work" action={<Button size="sm" variant="secondary" onClick={() => setValue('modules', [...new Set([...(v.modules ?? []), ...missing.flatMap((m) => m.needs)])])}>Add required</Button>}>
                  <ul className="list-disc pl-4">{missing.map((m) => <li key={m.module}>{modLabel(m.module)} needs {m.needs.map(modLabel).join(', ')}</li>)}</ul>
                </Alert>
              )}
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {MODULE_KEYS.map((m) => {
                  const core = (CORE_MODULES as string[]).includes(m);
                  const on = core || (v.modules ?? []).includes(m);
                  const state = core ? 'Core' : included.has(m) ? 'Included' : 'Add-on';
                  return (
                    <li key={m}>
                      <label className={cx('flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5', on ? 'border-brand/30 bg-brand-soft/60' : 'border-line', core && 'cursor-default')}>
                        <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={on} disabled={core} onChange={() => setValue('modules', on ? (v.modules ?? []).filter((x) => x !== m) : [...(v.modules ?? []), m], { shouldValidate: true })} />
                        <span className="flex-1 text-[13px] font-medium capitalize text-ink">{modLabel(m)}</span>
                        <Badge tone={state === 'Included' ? 'ok' : state === 'Core' ? 'neutral' : 'warn'}>{state}</Badge>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {errors.modules && <p className="text-sm text-bad">{errors.modules.message}</p>}
            </div>
          )}
          {step === 6 && (
            <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-[13px] font-medium text-ink-2">Primary<input type="color" value={v.branding?.primaryColor} onChange={(e) => setValue('branding.primaryColor', e.target.value.toUpperCase())} className="mt-1.5 h-10 w-full cursor-pointer rounded-md border border-line" /></label>
                  <label className="text-[13px] font-medium text-ink-2">Accent<input type="color" value={v.branding?.accentColor} onChange={(e) => setValue('branding.accentColor', e.target.value.toUpperCase())} className="mt-1.5 h-10 w-full cursor-pointer rounded-md border border-line" /></label>
                </div>
                <Input label="Tagline" {...register('branding.tagline', opt)} placeholder="Shown on the website and login screen" />
                <Alert tone="info">Logo, favicon, app icon, splash, letterhead, signature and seal are uploaded by the institution in Settings → Branding (files go to secure storage). This step sets the colours everything derives from.</Alert>
              </div>
              <BrandPreview name={v.institutionName || 'Your institution'} primary={v.branding?.primaryColor ?? '#2563EB'} accent={v.branding?.accentColor ?? '#4F46E5'} tagline={v.branding?.tagline} />
            </div>
          )}
          {step === 7 && (
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={!!v.website?.enabled} onChange={(e) => setValue('website.enabled', e.target.checked)} /> Publish a website at launch (home, about, admissions with enquiry form, contact)</label>
              <div role="radiogroup" aria-label="Website template" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {(TEMPLATES[v.segment ?? 'school'] ?? []).map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={v.website?.template === t} disabled={!v.website?.enabled} onClick={() => setValue('website.template', t)}
                    className={cx('overflow-hidden rounded-xl border text-left disabled:opacity-50', v.website?.template === t ? 'border-brand ring-2 ring-brand/20' : 'border-line')}>
                    <div className="h-24 p-3" style={{ background: `linear-gradient(135deg, ${v.branding?.primaryColor}, ${v.branding?.accentColor})` }}><div className="h-2 w-16 rounded bg-white/70" /><div className="mt-2 h-3 w-28 rounded bg-white/90" /><div className="mt-1 h-2 w-20 rounded bg-white/60" /></div>
                    <p className="px-3 py-2 text-[13px] font-medium capitalize">{t.replace(/-/g, ' ')}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 8 && (
            <div className="space-y-4">
              <Input label="Free subdomain" {...register('slug', opt)} placeholder={slug} error={errors.slug?.message} hint={`Website: ${slug || 'your-name'}.${baseDomain} · leave blank to use the suggestion`} />
              <Input label="Custom domain (optional)" {...register('customDomain', opt)} placeholder="www.school.com" error={errors.customDomain?.message} hint="We’ll show the DNS records (TXT + CNAME) after creation; it goes live once verified." />
            </div>
          )}
          {step === 9 && (
            <div className="space-y-5">
              <fieldset className="grid gap-4 rounded-lg border border-line p-4 sm:grid-cols-3"><legend className="flex items-center gap-1.5 px-1 text-[13px] font-semibold"><UserRound className="size-4" />Owner / Director (full access)</legend>
                <Input label="Name" required {...register('owner.name')} error={errors.owner?.name?.message} />
                <Input label="Mobile" required inputMode="tel" placeholder="+91…" {...register('owner.phone')} error={errors.owner?.phone?.message} />
                <Input label="Email" type="email" {...register('owner.email', opt)} error={errors.owner?.email?.message} />
              </fieldset>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={hasPrincipal} onChange={(e) => setHasPrincipal(e.target.checked)} /> Also add a Principal / Director</label>
              {hasPrincipal && (
                <fieldset className="grid gap-4 rounded-lg border border-line p-4 sm:grid-cols-3"><legend className="flex items-center gap-1.5 px-1 text-[13px] font-semibold"><Users className="size-4" />Principal</legend>
                  <Input label="Name" required {...register('principal.name')} error={errors.principal?.name?.message} />
                  <Input label="Mobile" required inputMode="tel" placeholder="+91…" {...register('principal.phone')} error={errors.principal?.phone?.message} />
                  <Input label="Email" type="email" {...register('principal.email', opt)} />
                </fieldset>
              )}
              <Alert tone="info">They sign in with their mobile number (OTP). They can set a password and turn on two-factor authentication from their profile.</Alert>
            </div>
          )}
          {step === 10 && (
            <div className="space-y-3">
              <Alert tone="info" title="Import happens inside the institution, after creation">Student, parent and staff records are the institution’s personal data, so the platform doesn’t upload them here. After creation the owner imports them inside their own console (the import validates rows and runs a dry run before anything is saved).</Alert>
              <p className="text-sm text-muted">Nothing to do on this step — continue to review.</p>
            </div>
          )}
          {step === 11 && (
            <div className="space-y-4 text-[13px]">
              <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {[
                  ['Type', SEGMENTS.find((s) => s.v === v.segment)?.label], ['Name', v.institutionName], ['Location', `${v.city ?? ''}, ${v.state ?? ''}`], ['Branches', `Main + ${v.branches?.length ?? 0}`],
                  ['Plan', `${plans.find((p) => p.code === v.planCode)?.name} · ${v.cycle}`], ['Estimated total', quote ? inr(quote.totalPaise) : '—'],
                  ['Modules', `${(v.modules ?? []).length + CORE_MODULES.length} on`], ['Website', v.website?.enabled ? `${v.website.template} · ${slug}.${baseDomain}` : 'Off'],
                  ['Custom domain', v.customDomain || 'None'], ['Owner', `${v.owner?.name ?? ''} · ${v.owner?.phone ?? ''}`], ['Principal', hasPrincipal ? `${v.principal?.name ?? ''} · ${v.principal?.phone ?? ''}` : 'Not added'],
                ].map(([k, val]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-medium text-ink">{val || '—'}</dd></div>)}
              </dl>
              {missing.length > 0 && <Alert tone="warn" title="Module dependencies">{missing.map((m) => `${modLabel(m.module)} needs ${m.needs.map(modLabel).join(', ')}`).join(' · ')}</Alert>}
              <Alert tone="info">Creating the institution provisions roles, academic year, branches, modules, website pages, admissions pipeline, ledgers and the owner login, and records an audit entry.</Alert>
            </div>
          )}
          {serverErr && <Alert tone="bad" title="Could not create the institution">{serverErr}</Alert>}
        </div>
        {/* Buttons don't take focus on mouse-down: blur validation would otherwise remove error lines and move the button mid-click. */}
        <footer className="flex items-center justify-between gap-3 border-t border-line px-6 py-4" onMouseDown={(e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); }}>
          <Button variant="secondary" icon={<ArrowLeft />} onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</Button>
          {step < STEPS.length - 1 ? <Button type="submit" trailing={<ArrowRight />}>Continue</Button> : <Button type="submit" loading={isSubmitting} icon={<Rocket />} disabled={missing.length > 0}>Create institution</Button>}
        </footer>
      </section>
    </form>
  );
}

function BrandPreview({ name, primary, accent, tagline }: { name: string; primary: string; accent: string; tagline?: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_180px]">
      <div className="overflow-hidden rounded-xl border border-line shadow-sm" aria-label="Web console preview">
        <div className="flex h-9 items-center gap-2 border-b border-line bg-surface px-3"><span className="grid size-5 place-items-center rounded text-[10px] font-bold text-white" style={{ background: primary }}>{name[0]}</span><span className="text-xs font-semibold">{name}</span></div>
        <div className="grid grid-cols-[90px_1fr] bg-canvas">
          <div className="space-y-1.5 border-r border-line bg-surface p-2">{['Dashboard', 'Students', 'Attendance', 'Fees'].map((x, i) => <div key={x} className="rounded px-1.5 py-1 text-[10px]" style={i === 0 ? { background: `${primary}18`, color: primary } : {}}>{x}</div>)}</div>
          <div className="space-y-2 p-3"><div className="h-2.5 w-24 rounded bg-ink/80" /><div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 rounded-md border border-line bg-surface p-1.5"><div className="h-1.5 w-8 rounded bg-faint/50" /><div className="mt-1.5 h-2 w-10 rounded" style={{ background: i === 1 ? accent : primary }} /></div>)}</div><div className="inline-block rounded px-2 py-1 text-[10px] font-medium text-white" style={{ background: primary }}>Mark attendance</div></div>
        </div>
        <div className="px-4 py-5 text-center text-white" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}><p className="text-sm font-semibold">{name}</p><p className="text-[11px] opacity-90">{tagline || 'Admissions open'}</p><span className="mt-2 inline-block rounded-full bg-white px-2.5 py-1 text-[10px] font-medium" style={{ color: primary }}>Enquire now</span></div>
      </div>
      <div className="mx-auto w-[180px] overflow-hidden rounded-[22px] border-4 border-ink/80 shadow-md" aria-label="Mobile app preview">
        <div className="px-3 pb-3 pt-6 text-white" style={{ background: primary }}><p className="text-[10px] opacity-80">Good morning</p><p className="text-sm font-semibold">{name}</p></div>
        <div className="space-y-2 bg-canvas p-2.5">{['Attendance 96%', 'Fees due ₹4,500', 'Bus arriving 8:05'].map((x, i) => <div key={x} className="rounded-lg bg-surface p-2 text-[10px] shadow-xs"><span className="mr-1 inline-block size-1.5 rounded-full" style={{ background: i === 1 ? accent : primary }} />{x}</div>)}</div>
        <div className="flex justify-around border-t border-line bg-surface py-2">{[0, 1, 2, 3].map((i) => <span key={i} className="size-2 rounded-full" style={{ background: i === 0 ? primary : 'var(--color-line-strong)' }} />)}</div>
      </div>
      <p className="text-xs text-muted md:col-span-2"><AlertTriangle className="mr-1 inline size-3" />Check that white text stays readable on the primary colour.</p>
    </div>
  );
}
