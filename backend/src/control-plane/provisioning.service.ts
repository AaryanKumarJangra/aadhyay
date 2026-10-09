import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { PLAN_MODULES, ROLE_TEMPLATES, TEMPLATE_VERSION, DEFAULT_ROUTING, materialise, type ModuleKey } from '@aadhyay/contracts';
import { DbService } from '../db/db.service';
import { tenant, tenantDomain, tenantModule, wallet, walletTxn, role, membership, roleAssignment, academicSession, commRoutingRule, pipeline, pipelineStage, ledgerAccount, gradeScale, siteMenu, sitePage, siteForm, branch } from '../db/schema';
import { AuthService } from '../kernel/auth/auth.service';
import { EventsService } from '../kernel/events/events.service';
import { AccessService } from '../kernel/rbac/access.service';
import { conflict } from '../common/errors';
import { TRIAL_DAYS, TRIAL_WALLET_CREDIT_PAISE } from './price-book.seed';
import { env } from '../config/env';
import { DAY } from '../common/dates';

const SEGMENT_TERMS: Record<string, { class: string; section: string; student: string; guardian: string }> = {
  school: { class: 'Class', section: 'Section', student: 'Student', guardian: 'Parent' },
  college: { class: 'Programme', section: 'Semester', student: 'Student', guardian: 'Guardian' },
  institute: { class: 'Course', section: 'Batch', student: 'Learner', guardian: 'Guardian' },
  coaching: { class: 'Course', section: 'Batch', student: 'Learner', guardian: 'Parent' },
  creator: { class: 'Course', section: 'Cohort', student: 'Learner', guardian: 'Guardian' },
};

export function slugify(name: string) {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'institution';
}
function currentSessionName(d = new Date()) {
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return { name: `${y}-${String((y + 1) % 100).padStart(2, '0')}`, startsOn: `${y}-04-01`, endsOn: `${y + 1}-03-31` };
}

@Injectable()
export class ProvisioningService {
  constructor(private readonly db: DbService, private readonly auth: AuthService, private readonly events: EventsService, private readonly access: AccessService) {}

  async uniqueSlug(base: string) {
    let s = slugify(base);
    for (let i = 0; i < 50; i++) {
      const cand = i === 0 ? s : `${s}-${i + 1}`;
      const [hit] = await this.db.admin.select({ id: tenant.id }).from(tenant).where(eq(tenant.slug, cand)).limit(1);
      if (!hit) return cand;
    }
    return `${s}-${Date.now().toString(36)}`;
  }

  /**
   * Self-serve trial (docs/03 §7): 90-day trial with all Enterprise modules, starter wallet credit,
   * subdomain website, owner login, default roles/session/routing/pipeline/ledger/website.
   */
  async createTenant(input: {
    institutionName: string; segment: 'school' | 'college' | 'institute' | 'coaching' | 'creator'; slug?: string; city: string; state: string; stateCode: string;
    ownerName: string; ownerPhone: string; ownerEmail?: string; approxStudents?: number;
  }) {
    const slug = input.slug ? slugify(input.slug) : await this.uniqueSlug(input.institutionName);
    const [exists] = await this.db.admin.select({ id: tenant.id }).from(tenant).where(eq(tenant.slug, slug)).limit(1);
    if (exists) throw conflict('That web address is taken. Try another.');
    const owner = await this.auth.ensureUser(input.ownerPhone, input.ownerName);
    const planCode = input.segment === 'coaching' ? 'coaching_pro' : input.segment === 'creator' ? 'creator_starter' : 'enterprise';
    const modules = new Set<ModuleKey>([...(PLAN_MODULES[planCode] ?? []), ...(input.segment === 'college' ? (['college'] as ModuleKey[]) : []), 'hostel', 'health', 'canteen']);

    const t = await this.db.admin.transaction(async (tx) => {
      const [t] = await tx.insert(tenant).values({
        slug, name: input.institutionName, segment: input.segment, status: 'trial', planCode, city: input.city, state: input.state, stateCode: input.stateCode,
        billingEmail: input.ownerEmail, billingPhone: input.ownerPhone, trialEndsAt: new Date(Date.now() + TRIAL_DAYS * DAY), periodEndsAt: new Date(Date.now() + TRIAL_DAYS * DAY),
        branding: { primaryColor: '#1E40AF', accentColor: '#F59E0B', terms: SEGMENT_TERMS[input.segment] },
        settings: { approxStudents: input.approxStudents ?? null, quietHours: { start: '21:00', end: '07:00' }, parentChatHours: { start: '07:00', end: '20:00' } },
      }).returning();
      const tid = t!.id;
      await tx.execute(sql`select set_config('app.tenant_id', ${tid}, true)`);
      await tx.insert(tenantDomain).values({ tenantId: tid, host: `${slug}.${env.APP_BASE_DOMAIN}`, kind: 'subdomain', isPrimary: true, verifiedAt: new Date() });
      await tx.insert(tenantModule).values([...modules].map((m) => ({ tenantId: tid, moduleKey: m, enabled: true, source: 'trial' })));
      const [w] = await tx.insert(wallet).values({ tenantId: tid, balancePaise: TRIAL_WALLET_CREDIT_PAISE }).returning();
      await tx.insert(walletTxn).values({ walletId: w!.id, tenantId: tid, kind: 'credit', amountPaise: TRIAL_WALLET_CREDIT_PAISE, balanceAfter: TRIAL_WALLET_CREDIT_PAISE, ref: 'Trial starter credit' });
      const roles = await tx.insert(role).values(Object.entries(ROLE_TEMPLATES).map(([key, r]) => ({ tenantId: tid, key, name: r.name, description: r.description, ...materialise(r), isSystem: true, templateVersion: TEMPLATE_VERSION }))).returning();
      const [m] = await tx.insert(membership).values({ tenantId: tid, userId: owner.id, kind: 'staff' }).returning();
      await tx.insert(roleAssignment).values({ tenantId: tid, membershipId: m!.id, roleId: roles.find((r) => r.key === 'owner')!.id });
      const s = currentSessionName();
      await tx.insert(academicSession).values({ tenantId: tid, ...s, isCurrent: true });
      await tx.insert(branch).values({ tenantId: tid, name: input.institutionName, code: 'MAIN', city: input.city, isMain: true });
      await tx.insert(commRoutingRule).values(Object.entries(DEFAULT_ROUTING).map(([eventKey, channels]) => ({ tenantId: tid, eventKey, channels })));
      const [p] = await tx.insert(pipeline).values({ tenantId: tid, name: 'Admissions' }).returning();
      await tx.insert(pipelineStage).values(['New', 'Contacted', 'Visit scheduled', 'Visited', 'Application', 'Admitted', 'Lost'].map((name, i) => ({ tenantId: tid, pipelineId: p!.id, name, order: i, isWon: name === 'Admitted', isLost: name === 'Lost' })));
      await tx.insert(ledgerAccount).values([
        { code: '1000', name: 'Cash', type: 'asset' }, { code: '1010', name: 'Bank', type: 'asset' }, { code: '1020', name: 'Payment gateway clearing', type: 'asset' },
        { code: '1100', name: 'Fees receivable', type: 'asset' }, { code: '4000', name: 'Fee income', type: 'income' }, { code: '4010', name: 'Late fee income', type: 'income' },
        { code: '4100', name: 'Other income', type: 'income' }, { code: '5000', name: 'Salaries', type: 'expense' }, { code: '5100', name: 'General expenses', type: 'expense' },
        { code: '2000', name: 'Payables', type: 'liability' }, { code: '4900', name: 'Discounts & concessions', type: 'expense' },
      ].map((a) => ({ ...a, tenantId: tid, isSystem: true })));
      await tx.insert(gradeScale).values({ tenantId: tid, name: 'CBSE 9-point', bands: [
        { grade: 'A1', min: 91, max: 100, point: 10 }, { grade: 'A2', min: 81, max: 90.99, point: 9 }, { grade: 'B1', min: 71, max: 80.99, point: 8 },
        { grade: 'B2', min: 61, max: 70.99, point: 7 }, { grade: 'C1', min: 51, max: 60.99, point: 6 }, { grade: 'C2', min: 41, max: 50.99, point: 5 },
        { grade: 'D', min: 33, max: 40.99, point: 4 }, { grade: 'E', min: 0, max: 32.99, point: 0, remark: 'Needs improvement' },
      ] });
      await tx.insert(siteMenu).values([
        { tenantId: tid, key: 'header', items: [{ label: 'Home', href: '/' }, { label: 'About', href: '/about' }, { label: 'Admissions', href: '/admissions' }, { label: 'News', href: '/news' }, { label: 'Contact', href: '/contact' }] },
        { tenantId: tid, key: 'footer', items: [{ label: 'Privacy', href: '/privacy' }, { label: 'Fee payment', href: '/pay' }] },
      ]);
      await tx.insert(siteForm).values({ tenantId: tid, key: 'admission', name: 'Admission enquiry', toCrm: true, fields: [
        { key: 'name', label: "Student's name", type: 'text', required: true }, { key: 'phone', label: 'Parent mobile', type: 'phone', required: true },
        { key: 'forClass', label: 'Class', type: 'text' }, { key: 'message', label: 'Message', type: 'textarea' },
      ] });
      await tx.insert(sitePage).values(defaultPages(tid, input.institutionName, input.city, input.segment));
      return t!;
    });
    await this.access.bust(t.id);
    await this.events.emit('tenant.created', { tenantId: t.id, slug, segment: input.segment, ownerUserId: owner.id }, { tenantId: t.id });
    return { tenant: t, ownerUserId: owner.id, websiteUrl: `https://${slug}.${env.APP_BASE_DOMAIN}` };
  }
}

function defaultPages(tenantId: string, name: string, city: string, segment: string) {
  const b = (type: string, props: Record<string, unknown>) => ({ id: Math.random().toString(36).slice(2, 10), type, props });
  const isSchool = segment === 'school';
  return [
    { tenantId, slug: '', title: name, status: 'published' as const, publishAt: new Date(), seo: { title: `${name} — ${city}`, description: `${name}, ${city}. Admissions open. Academics, facilities, transport, fees and contact details.` },
      blocks: [
        b('hero', { heading: name, subheading: isSchool ? `Nurturing curious minds in ${city}` : `Learn with the best in ${city}`, cta: { label: 'Admission enquiry', href: '/admissions' } }),
        b('stats', { items: [{ label: 'Students', value: '—' }, { label: 'Teachers', value: '—' }, { label: 'Years', value: '—' }] }),
        b('notices', { limit: 5 }), b('events', { limit: 3 }), b('faq', { items: [{ q: 'When do admissions open?', a: 'Please fill the enquiry form and our team will call you.' }] }),
        b('contact', {}), b('map', {}),
      ] },
    { tenantId, slug: 'about', title: 'About us', status: 'published' as const, publishAt: new Date(), seo: {}, blocks: [b('text', { html: `<p>Welcome to ${name}.</p>` })] },
    { tenantId, slug: 'admissions', title: 'Admissions', status: 'published' as const, publishAt: new Date(), seo: { title: `Admissions — ${name}` }, blocks: [b('text', { html: '<p>Fill the form and we will get back to you.</p>' }), b('form', { formKey: 'admission' })] },
    { tenantId, slug: 'contact', title: 'Contact', status: 'published' as const, publishAt: new Date(), seo: {}, blocks: [b('contact', {}), b('map', {})] },
  ];
}
