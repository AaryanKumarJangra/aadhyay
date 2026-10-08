import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setup, newSchool, uniquePhone, type Api } from './helpers';

let api: Api;
beforeAll(async () => { api = await setup(); });
afterAll(async () => { await api.close(); });

describe('control plane & money (docs/01)', () => {
  it('trial school converts: quote (early discount) → tax invoice with CGST/SGST → payment → active plan modules; finance 80:20 report', async () => {
    const s = await newSchool(api);
    const sum0 = await api.req('GET', '/billing/summary', { token: s.owner.token });
    expect(sum0.body.status).toBe('trial');
    expect(sum0.body.wallet.balancePaise).toBe(10000);
    const q = await api.req('POST', '/billing/quote', { token: s.owner.token, body: { planCode: 'professional', students: 800 } });
    expect(q.body.lines.find((l: any) => l.code.startsWith('setup')).description).toContain('early-conversion');
    expect(q.body.subtotalPaise).toBe(8_000_000 + 1_000_000);
    const co = await api.req('POST', '/billing/checkout', { token: s.owner.token, body: { planCode: 'professional', students: 800 } });
    expect(co.body.invoice.number).toMatch(/^AAD\/\d{4}-\d{2}\/\d{5}$/);
    expect(co.body.invoice.cgstPaise + co.body.invoice.sgstPaise).toBe(co.body.invoice.totalPaise - co.body.invoice.subtotalPaise);
    const pay = await api.req('POST', '/billing/payments/confirm', { token: s.owner.token, body: { orderId: co.body.payment.orderId, paymentId: 'pay_x', signature: 'log' } });
    expect(pay.status).toBe(201);
    const sum1 = await api.req('GET', '/billing/summary', { token: s.owner.token });
    expect(sum1.body.status).toBe('active');
    expect(sum1.body.planCode).toBe('professional');
    const prof = await api.req('GET', '/org/profile', { token: s.owner.token });
    expect(prof.body.modules).toContain('transport');
    expect(prof.body.modules).not.toContain('hostel'); // enterprise-only, trial access removed
    expect((await api.req('GET', '/hostel/hostels', { token: s.owner.token })).body.error.code).toBe('MODULE_DISABLED');
    // Renewal quote: no setup fee second time
    const q2 = await api.req('POST', '/billing/quote', { token: s.owner.token, body: { planCode: 'professional', students: 800 } });
    expect(q2.body.lines.some((l: any) => l.code.startsWith('setup'))).toBe(false);
    // Platform finance
    const admin = await api.req('POST', '/control/auth/login', { body: { email: 'e2e-admin@aadhyay.com', password: 'E2e@password1' } });
    expect(admin.status).toBe(201);
    const P = admin.body.accessToken;
    const month = new Date().toISOString().slice(0, 7);
    const rep = await api.req('GET', `/control/finance/report?month=${month}`, { token: P });
    expect(rep.body.collections.netPaise).toBeGreaterThan(0);
    expect(rep.body.split.reinvestPaise + rep.body.split.foundersPaise).toBe(Math.max(0, rep.body.netProfitPaise));
    // Spend ceiling blocks a recurring expense far above 60% of trailing collections
    const big = await api.req('POST', '/control/expenses', { token: P, body: { month, category: 'infra', vendor: 'BigCloud', amountPaise: 999_999_999, recurring: true } });
    expect(big.status).toBe(403);
    expect(big.body.error.message).toContain('60% rule');
    const parentPhone = uniquePhone();
    await api.req('POST', '/people/students', { token: s.owner.token, body: { name: 'Private Child', guardians: [{ name: 'Private Parent', phone: parentPhone, relation: 'mother' }] } });
    const t360 = await api.req('GET', `/control/tenants/${s.tenantId}`, { token: P });
    expect(t360.body.counts.students).toBe(1);
    const dump = JSON.stringify(t360.body);
    expect(dump).not.toContain('Private Child'); // control plane never sees institution personal data
    expect(dump).not.toContain(parentPhone.slice(3));
    // Tenant token cannot use control plane
    expect((await api.req('GET', '/control/tenants', { token: s.owner.token })).status).toBe(401);
  });

  it('lifecycle: expired trial → grace → suspended blocks staff, admin can still pay/export', async () => {
    const s = await newSchool(api);
    await api.db.admin.execute(`update tenants set period_ends_at = now() - interval '1 day' where id = '${s.tenantId}'` as any);
    const admin = await api.req('POST', '/control/auth/login', { body: { email: 'e2e-admin@aadhyay.com', password: 'E2e@password1' } });
    await api.req('POST', '/control/lifecycle/run', { token: admin.body.accessToken });
    expect((await api.req('GET', '/billing/summary', { token: s.owner.token })).body.status).toBe('grace');
    await api.db.admin.execute(`update tenants set grace_ends_at = now() - interval '1 minute' where id = '${s.tenantId}'` as any);
    await api.req('POST', '/control/lifecycle/run', { token: admin.body.accessToken });
    const blocked = await api.req('GET', '/people/students', { token: s.owner.token });
    expect(blocked.status).toBe(402);
    expect(blocked.body.error.details.canPay).toBe(true);
    expect((await api.req('GET', '/billing/summary', { token: s.owner.token })).body.status).toBe('suspended');
    await api.drain();
    const inbox = await api.req('GET', '/comms/inbox', { token: s.owner.token });
    expect(inbox.status).toBe(402); // inbox is tenant data → blocked; renewal notices go by email/WhatsApp
  });
});

describe('operations', () => {
  it('payroll with LOP, library issue/return with fine, certificate QR verify, online test auto-grade + rank', async () => {
    const s = await newSchool(api);
    const T = s.owner.token;
    const st = await api.req('POST', '/people/staff', { token: T, body: { name: 'Sunita Rawat', phone: uniquePhone(), roleKeys: ['teacher'] } });
    await api.req('PUT', `/payroll/salary/${st.body.id}`, { token: T, body: { basicPaise: 2_500_000, components: [{ code: 'HRA', kind: 'earning', type: 'percent_basic', value: 40 }], pfEnabled: true } });
    await api.req('POST', '/attendance/staff/mark', { token: T, body: { date: '2026-09-15', entries: [{ staffId: st.body.id, status: 'absent' }] } });
    const run = await api.req('POST', '/payroll/runs', { token: T, body: { month: '2026-09' } });
    expect(run.body.totals.staff).toBe(1);
    const slips = await api.req('GET', `/payroll/runs/${run.body.id}/payslips`, { token: T });
    expect(slips.body[0].p.paidDays).toBe(run.body.totals.workingDays - 1);
    expect(slips.body[0].p.deductions.PF).toBe(Math.round(Math.min(slips.body[0].p.earnings.BASIC, 1_500_000) * 0.12));
    expect((await api.req('POST', `/payroll/runs/${run.body.id}/approve`, { token: T })).status).toBe(201);
    const tb = await api.req('GET', '/accounts/trial-balance', { token: T });
    expect(tb.body.totals.dr).toBe(tb.body.totals.cr);
    // Library
    const cls = await api.req('POST', '/academics/classes/with-sections', { token: T, body: { name: 'Class 9', order: 9, sections: ['A'] } });
    const kid = await api.req('POST', '/people/students', { token: T, body: { name: 'Kavya Mishra', sectionId: cls.body.sections[0].id, guardians: [] } });
    const bk = await api.req('POST', '/library/books', { token: T, body: { title: 'Godan', author: 'Premchand' } });
    await api.req('POST', `/library/books/${bk.body.id}/copies`, { token: T, body: { barcodes: ['LIB-0001'] } });
    expect((await api.req('POST', '/library/issue', { token: T, body: { barcode: 'LIB-0001', memberType: 'student', memberId: kid.body.id } })).status).toBe(201);
    expect((await api.req('POST', '/library/issue', { token: T, body: { barcode: 'LIB-0001', memberType: 'student', memberId: kid.body.id } })).status).toBe(400);
    expect((await api.req('GET', '/library/opac?q=Godan', { token: T })).body[0].available).toBe(0);
    expect((await api.req('POST', '/library/return', { token: T, body: { barcode: 'LIB-0001' } })).body.lateDays).toBe(0);
    // Certificate + public verify
    const tpl = await api.req('POST', '/certificates/templates', { token: T, body: { kind: 'bonafide', name: 'Bonafide', layout: { title: 'Bonafide Certificate', body: 'This is to certify that {{name}} (Adm. {{admissionNo}}) is a bonafide student of class {{class}}.' } } });
    const iss = await api.req('POST', '/certificates/issue', { token: T, body: { templateId: tpl.body.id, ownerType: 'student', ownerIds: [kid.body.id] } });
    const pdf = await api.app.inject({ method: 'POST', url: '/v1/certificates/pdf', headers: { authorization: `Bearer ${T}`, 'content-type': 'application/json' }, payload: JSON.stringify({ ids: [iss.body[0].id] }) });
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
    const v = await api.req('GET', `/public/certificates/verify/${iss.body[0].verifyCode}`);
    expect(v.body).toMatchObject({ valid: true, holder: 'Kavya Mishra', certificate: 'Bonafide' });
    // Online test
    const bank = await api.req('POST', '/online-tests/banks', { token: T, body: { name: 'Physics' } });
    const q1 = await api.req('POST', '/online-tests/questions', { token: T, body: { bankId: bank.body.id, type: 'mcq', body: { text: 'g = ?' }, options: [{ id: 'A', text: '9.8' }, { id: 'B', text: '8.9' }], answer: 'A', marks: 4, negative: 1 } });
    const q2 = await api.req('POST', '/online-tests/questions', { token: T, body: { bankId: bank.body.id, type: 'numeric', body: { text: '2+2' }, answer: { value: 4 }, marks: 4 } });
    const test = await api.req('POST', '/online-tests/tests', { token: T, body: { title: 'Unit test', audience: {}, questionIds: [q1.body.id, q2.body.id], durationMin: 30, startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), publishedAt: new Date().toISOString() } });
    const at = await api.req('POST', `/online-tests/${test.body.id}/start`, { token: T, body: { studentId: kid.body.id } });
    expect(at.body.questions[0].answer).toBeUndefined(); // answers never leak
    const sub = await api.req('POST', `/online-tests/attempts/${at.body.attemptId}`, { token: T, body: { answers: { [q1.body.id]: 'A', [q2.body.id]: '4' }, submit: true } });
    expect(sub.body).toMatchObject({ submitted: true, score: 8, correct: 2 });
    expect((await api.req('POST', `/online-tests/${test.body.id}/rank`, { token: T })).body.ranked).toBe(1);
    // Dashboard + CSV export
    const dash = await api.req('GET', '/reports/dashboard', { token: T });
    expect(dash.body.students).toBe(1);
    const csv = await api.app.inject({ method: 'GET', url: '/v1/reports/export?dataset=students', headers: { authorization: `Bearer ${T}` } });
    expect(csv.body).toContain('Kavya Mishra');
  });
});
