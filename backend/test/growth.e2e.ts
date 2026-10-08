import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setup, newSchool, uniquePhone, type Api } from './helpers';

let api: Api;
beforeAll(async () => { api = await setup(); });
afterAll(async () => { await api.close(); });

describe('website → admission enquiry → CRM → student', () => {
  it('public site renders seeded pages with SEO; form creates deduped lead; convert to student', async () => {
    const s = await newSchool(api);
    const H = { 'x-tenant': s.slug };
    const site = await api.req('GET', '/site', { headers: H });
    expect(site.body.tenant.slug).toBe(s.slug);
    expect(site.body.jsonLd['@type']).toBe('School');
    expect(site.body.menus.header.length).toBeGreaterThan(2);
    const home = await api.req('GET', '/site/page?slug=', { headers: H });
    expect(home.body.page.seo.title).toContain('Meerut');
    expect(home.body.jsonLd['@type']).toBe('FAQPage');
    expect((await api.req('GET', '/site/page?slug=nope', { headers: H })).status).toBe(404);
    expect((await api.req('GET', '/site')).status).toBe(400); // no tenant → error
    const phone = uniquePhone();
    const sub = await api.req('POST', '/site/forms/submit', { headers: H, body: { formKey: 'admission', data: { name: 'Vihaan Jain', phone, forClass: 'Class 1', message: 'Need bus' }, utm: { utm_source: 'google', utm_campaign: 'admissions-2027' } } });
    expect(sub.status).toBe(201);
    const again = await api.req('POST', '/site/forms/submit', { headers: H, body: { formKey: 'admission', data: { name: 'Vihaan Jain', phone }, utm: {} } });
    expect(again.status).toBe(201);
    const leads = await api.req('GET', '/crm/leads', { token: s.owner.token });
    expect(leads.body.filter((l: any) => l.phone === phone).length).toBe(1);
    const lead = leads.body.find((l: any) => l.phone === phone);
    expect(lead.utm.utm_campaign).toBe('admissions-2027');
    const tl = await api.req('GET', `/crm/leads/${lead.id}`, { token: s.owner.token });
    expect(tl.body.activities.some((a: any) => a.body?.includes('Repeat enquiry'))).toBe(true);
    const cls = await api.req('POST', '/academics/classes/with-sections', { token: s.owner.token, body: { name: 'Class 1', order: 1, sections: ['A'] } });
    const conv = await api.req('POST', `/crm/leads/${lead.id}/convert`, { token: s.owner.token, body: { sectionId: cls.body.sections[0].id } });
    expect(conv.status).toBe(201);
    expect(conv.body.name).toBe('Vihaan Jain');
    expect(conv.body.guardians[0].phone).toBe(phone);
    const rep = await api.req('GET', '/crm/reports/sources', { token: s.owner.token });
    expect(rep.body.find((r: any) => r.source === 'ads').admitted).toBe(1);
    // CMS edit with version history + rollback
    const pages = await api.req('GET', '/cms/page-list', { token: s.owner.token });
    const about = pages.body.items.find((p: any) => p.slug === 'about');
    const up = await api.req('PUT', `/cms/pages/${about.id}`, { token: s.owner.token, body: { title: 'About Our School', status: 'published' } });
    expect(up.body.version).toBe(2);
    const rb = await api.req('POST', `/cms/pages/${about.id}/rollback`, { token: s.owner.token, body: { version: 1 } });
    expect(rb.body.title).toBe('About us');
    const domain = await api.req('POST', '/cms/domains', { token: s.owner.token, body: { host: `www.school-${Date.now()}.in` } });
    expect(domain.body.instructions[0].type).toBe('TXT');
    const sm = await api.req('GET', '/site/sitemap', { headers: H });
    expect(sm.body.pages.length).toBeGreaterThanOrEqual(4);
  });
});
