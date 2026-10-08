import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setup, newSchool, uniquePhone, type Api } from './helpers';

let api: Api;
beforeAll(async () => { api = await setup(); });
afterAll(async () => { await api.close(); });

describe('signup → owner → classes → admission → parent app', () => {
  it('full school onboarding flow with multi-child guardian', async () => {
    const s = await newSchool(api);
    const T = s.owner.token;
    const me = await api.req('GET', '/me', { token: T });
    expect(me.body.tenantId).toBe(s.tenantId);
    expect(me.body.permissions).toContain('*');

    const c5 = await api.req('POST', '/academics/classes/with-sections', { token: T, body: { name: 'Class 5', order: 5, sections: ['A', 'B'] } });
    expect(c5.status).toBe(201);
    const c8 = await api.req('POST', '/academics/classes/with-sections', { token: T, body: { name: 'Class 8', order: 8, sections: ['A'] } });
    const parentPhone = uniquePhone();
    const kid1 = await api.req('POST', '/people/students', { token: T, body: { name: 'Aarav Sharma', gender: 'male', sectionId: c5.body.sections[0].id, guardians: [{ name: 'Rahul Sharma', phone: parentPhone, relation: 'father', isPrimary: true }] } });
    expect(kid1.status).toBe(201);
    expect(kid1.body.admissionNo).toMatch(/^\d{8}$/);
    const kid2 = await api.req('POST', '/people/students', { token: T, body: { name: 'Anaya Sharma', gender: 'female', sectionId: c8.body.sections[0].id, guardians: [{ name: 'Rahul Sharma', phone: parentPhone, relation: 'father', isPrimary: true }] } });
    expect(kid2.body.siblings.map((x: any) => x.id)).toContain(kid1.body.id);

    const tree = await api.req('GET', '/academics/tree', { token: T });
    expect(tree.body.find((c: any) => c.name === 'Class 5').sections.find((x: any) => x.name === 'A').strength).toBe(1);

    // Parent logs in with OTP → sees both children only
    const parent = await api.login(parentPhone);
    const pme = await api.req('GET', '/me', { token: parent.token });
    expect(pme.body.kinds).toContain('guardian');
    const kids = await api.req('GET', '/people/my/children', { token: parent.token });
    expect(kids.body.map((k: any) => k.name).sort()).toEqual(['Aarav Sharma', 'Anaya Sharma']);
    const forbidden = await api.req('GET', '/people/students', { token: parent.token });
    expect(forbidden.status).toBe(403);
    const own = await api.req('GET', `/people/students/${kid1.body.id}`, { token: parent.token });
    expect(own.status).toBe(200);
  });

  it('tenant isolation: owner of school B cannot read school A data (RLS)', async () => {
    const a = await newSchool(api);
    const b = await newSchool(api);
    const c = await api.req('POST', '/academics/classes/with-sections', { token: a.owner.token, body: { name: 'Class 1', order: 1, sections: ['A'] } });
    const st = await api.req('POST', '/people/students', { token: a.owner.token, body: { name: 'Secret Kid', sectionId: c.body.sections[0].id, guardians: [] } });
    expect(st.status).toBe(201);
    const peek = await api.req('GET', `/people/students/${st.body.id}`, { token: b.owner.token });
    expect(peek.status).toBe(404);
    const list = await api.req('GET', '/people/students?q=Secret', { token: b.owner.token });
    expect(list.body.items.length).toBe(0);
    // Forged tenant header with B's token must fail
    const forged = await api.req('GET', '/people/students', { token: b.owner.token, headers: { 'x-tenant': a.slug } });
    expect([200, 403]).toContain(forged.status);
    if (forged.status === 200) expect(forged.body.items.find((x: any) => x.name === 'Secret Kid')).toBeUndefined();
  });

  it('custom role with limited permissions', async () => {
    const s = await newSchool(api);
    const r = await api.req('POST', '/org/roles', { token: s.owner.token, body: { key: 'gate_keeper', name: 'Gate keeper', permissions: ['front-office.visitor.*'] } });
    expect(r.status).toBe(201);
    const phone = uniquePhone();
    const m = await api.req('POST', '/org/members', { token: s.owner.token, body: { phone, name: 'Ramesh', kind: 'staff', roleKeys: ['gate_keeper'] } });
    expect(m.status).toBe(201);
    const g = await api.login(phone, 'Ramesh', s.slug);
    expect((await api.req('GET', '/people/students', { token: g.token })).status).toBe(403);
    const me = await api.req('GET', '/me', { token: g.token });
    expect(me.body.permissions).toEqual(['front-office.visitor.*']);
  });

  it('public institution picker and branding', async () => {
    const s = await newSchool(api, `Delhi Public School Meerut ${Date.now()}`);
    const r = await api.req('GET', '/public/tenants?q=Delhi Public');
    expect(r.body.items.some((x: any) => x.slug === s.slug)).toBe(true);
    const b = await api.req('GET', `/public/tenants/${s.slug}/branding`);
    expect(b.body.name).toContain('Delhi Public School');
  });
});
