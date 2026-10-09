import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { setup, newSchool, uniquePhone, type Api } from './helpers';

/** Control plane v2: onboarding wizard, lifecycle actions, price-book audit, dashboard, isolation from tenants. */
let api: Api;
let P: string;
beforeAll(async () => {
  api = await setup();
  const admin = await api.req('POST', '/control/auth/login', { body: { email: 'e2e-admin@aadhyay.com', password: 'E2e@password1' } });
  P = admin.body.accessToken;
});
afterAll(async () => { await api.close(); });

describe('control plane', () => {
  it('onboarding wizard provisions a ready institution with modules, branches, branding, domain and admins', async () => {
    const ownerPhone = uniquePhone(), principalPhone = uniquePhone();
    const host = `onb-${Date.now()}.example.in`;
    const r = await api.req('POST', '/control/onboarding', { token: P, body: {
      segment: 'school', institutionName: `Wizard Public School ${Date.now()}`, shortName: 'WPS', legalName: 'Wizard Education Trust', code: 'WPS01',
      city: 'Meerut', state: 'Uttar Pradesh', stateCode: '09', branches: [{ name: 'City Campus', code: 'CITY' }],
      planCode: 'professional', cycle: 'yearly', approxStudents: 400, modules: ['attendance', 'fees', 'transport', 'exams'],
      branding: { primaryColor: '#0F766E', accentColor: '#4F46E5' }, website: { enabled: true, template: 'modern-school' }, customDomain: host,
      owner: { name: 'Trust Chair', phone: ownerPhone }, principal: { name: 'Dr Principal', phone: principalPhone },
    } });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.domain.instructions.map((i: any) => i.type)).toEqual(['TXT', 'CNAME']);
    const t360 = await api.req('GET', `/control/tenants/${r.body.tenantId}`, { token: P });
    expect(t360.body.tenant.planCode).toBe('professional');
    expect(t360.body.counts.branches).toBe(2);
    expect(t360.body.domains.some((d: any) => d.host === host && !d.verifiedAt)).toBe(true);
    const mods = await api.req('GET', `/control/tenants/${r.body.tenantId}/modules`, { token: P });
    const on = mods.body.filter((m: any) => m.enabled).map((m: any) => m.key);
    expect(on).toEqual(expect.arrayContaining(['attendance', 'fees', 'transport', 'exams', 'people', 'org']));
    expect(on).not.toContain('hostel');
    // The principal signs in with the principal role; a module left out of the plan is refused.
    const principal = await api.login(principalPhone, 'Dr Principal', r.body.slug);
    const me = await api.req('GET', '/me', { token: principal.token });
    expect(me.body.roles.map((x: any) => x.key)).toEqual(['principal']);
    expect((await api.req('GET', '/hostel/hostels', { token: principal.token })).body.error.code).toBe('MODULE_DISABLED');
    const audit = await api.req('GET', `/control/audit?tenantId=${r.body.tenantId}`, { token: P });
    expect(audit.body.map((a: any) => a.action)).toContain('tenant.onboard');
  });

  it('lifecycle actions follow the state machine, need a reason and are audited', async () => {
    const s = await newSchool(api);
    expect((await api.req('POST', `/control/tenants/${s.tenantId}/status`, { token: P, body: { action: 'suspend', reason: 'no' } })).status).toBe(422);
    expect((await api.req('POST', `/control/tenants/${s.tenantId}/status`, { token: P, body: { action: 'activate', reason: 'trying to activate a trial' } })).status).toBe(409);
    expect((await api.req('POST', `/control/tenants/${s.tenantId}/status`, { token: P, body: { action: 'suspend', reason: 'Payment dispute escalated' } })).status).toBe(201);
    expect((await api.req('GET', '/people/students', { token: s.owner.token })).body.error.code).toBe('TENANT_SUSPENDED');
    expect((await api.req('POST', `/control/tenants/${s.tenantId}/status`, { token: P, body: { action: 'activate', reason: 'Dispute resolved, paid' } })).body.status).toBe('active');
    expect((await api.req('GET', '/people/students', { token: s.owner.token })).status).toBe(200);
    const audit = await api.req('GET', `/control/audit?tenantId=${s.tenantId}`, { token: P });
    const suspend = audit.body.find((a: any) => a.action === 'tenant.suspend');
    expect(suspend).toMatchObject({ before: { status: 'trial' }, after: { status: 'suspended' }, reason: 'Payment dispute escalated' });
  });

  it('price changes need a reason, keep old and new values, and reject inverted ranges', async () => {
    const book = await api.req('GET', '/control/price-book', { token: P });
    const item = book.body.items.find((i: any) => i.kind === 'addon') ?? book.body.items[0];
    expect((await api.req('PATCH', `/control/price-book/${item.code}`, { token: P, body: { listPaise: item.listPaise } })).status).toBe(422);
    expect((await api.req('PATCH', `/control/price-book/${item.code}`, { token: P, body: { listPaise: item.listPaise, minPaise: 500, maxPaise: 100, reason: 'Range test' } })).status).toBe(422);
    const ok = await api.req('PATCH', `/control/price-book/${item.code}`, { token: P, body: { listPaise: item.listPaise + 100, reason: 'Annual revision' } });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const [row] = (await api.db.admin.execute(sql`select before, after, reason from platform_audit_logs where action = 'price.update' and entity_id = ${item.code} order by at desc limit 1`)).rows as any[];
    expect(row).toMatchObject({ before: { listPaise: item.listPaise }, after: { listPaise: item.listPaise + 100 }, reason: 'Annual revision' });
    await api.req('PATCH', `/control/price-book/${item.code}`, { token: P, body: { listPaise: item.listPaise, reason: 'Revert test change' } });
  });

  it('dashboard returns analytics; tenant users cannot reach the control plane', async () => {
    const d = await api.req('GET', '/control/dashboard', { token: P });
    expect(d.status, JSON.stringify(d.body)).toBe(200);
    expect(d.body.monthly).toHaveLength(12);
    expect(d.body.kpis.total).toBeGreaterThan(0);
    expect(d.body.health.redis).toBe(true);
    const s = await newSchool(api);
    for (const url of ['/control/dashboard', '/control/audit', '/control/tenants-overview']) expect((await api.req('GET', url, { token: s.owner.token })).status, url).toBe(401);
    // The tenant runtime DB role can never read the platform audit trail.
    const denied = await api.db.app.execute(sql`select 1 from platform_audit_logs limit 1`).then(() => 'read', (e) => String(e.cause?.code ?? e.code));
    expect(denied).toBe('42501');
  });
});
