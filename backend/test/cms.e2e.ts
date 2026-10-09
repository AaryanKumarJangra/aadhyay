import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setup, newSchool, uniquePhone, type Api } from './helpers';

/** CMS v2 (brief §42–52, §87): drafts never touch the live site; author → review → publisher; versions; media. */
let api: Api;
beforeAll(async () => { api = await setup(); });
afterAll(async () => { await api.close(); });

async function site() {
  const s = await newSchool(api, `CMS School ${Date.now()}`);
  const staff = async (roleKeys: string[]) => {
    const phone = uniquePhone();
    await api.req('POST', '/people/staff', { token: s.owner.token, body: { name: `Web ${roleKeys[0]}`, phone, roleKeys } });
    return (await api.login(phone)).token;
  };
  const pages = (await api.req('GET', '/cms/page-list', { token: s.owner.token })).body.items as any[];
  const about = pages.find((p) => p.slug === 'about');
  return { ...s, about, author: await staff(['web_author']), publisher: await staff(['web_publisher']) };
}
const live = async (slug: string, page: string) => (await api.req('GET', `/site/page?slug=${page}`, { headers: { 'x-tenant': slug } })).body;
const blocks = [
  { id: 'h1', type: 'hero', props: { heading: 'Draft headline', subheading: 'New session', ctaLabel: 'Enquire', ctaHref: '/admissions' }, style: { background: 'brand' } },
  { id: 'f1', type: 'faq', props: { title: 'FAQ', items: [{ q: 'Fees?', a: 'See fee plans.' }] } },
];

describe('cms workflow', () => {
  it('saving a draft never changes the live page; only a publisher can publish', async () => {
    const s = await site();
    const before = await live(s.slug, 'about');
    const saved = await api.req('PUT', `/cms/pages/${s.about.id}/draft`, { token: s.author, body: { title: 'About (draft)', blocks, seo: { title: 'About our school in Meerut' } } });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const after = await live(s.slug, 'about');
    expect(after.page.title).toBe(before.page.title);
    expect(JSON.stringify(after.page.blocks)).not.toContain('Draft headline');
    // Author: may not publish, may submit for review; the old direct-save path is closed too.
    expect((await api.req('POST', `/cms/pages/${s.about.id}/publish`, { token: s.author, body: {} })).body.error.details.denial).toBe('NO_PERMISSION');
    expect((await api.req('PUT', `/cms/pages/${s.about.id}`, { token: s.author, body: { title: 'Sneaky live edit' } })).status).toBe(403);
    expect((await api.req('POST', `/cms/pages/${s.about.id}/submit`, { token: s.author, body: { note: 'Updated FAQ' } })).status).toBe(201);
    const ed = await api.req('GET', `/cms/pages/${s.about.id}/editor`, { token: s.publisher });
    expect(ed.body).toMatchObject({ hasDraft: true, review: { status: 'in_review', note: 'Updated FAQ' }, working: { title: 'About (draft)' } });
    // Publisher sends it back, then publishes.
    expect((await api.req('POST', `/cms/pages/${s.about.id}/request-changes`, { token: s.publisher, body: { note: 'Add admission dates' } })).status).toBe(201);
    expect((await api.req('GET', `/cms/pages/${s.about.id}/editor`, { token: s.author })).body.review.status).toBe('changes_requested');
    const pub = await api.req('POST', `/cms/pages/${s.about.id}/publish`, { token: s.publisher, body: {} });
    expect(pub.status, JSON.stringify(pub.body)).toBe(201);
    const now = await live(s.slug, 'about');
    expect(now.page.title).toBe('About (draft)');
    expect(now.jsonLd['@type']).toBe('FAQPage');
    const ed2 = await api.req('GET', `/cms/pages/${s.about.id}/editor`, { token: s.publisher });
    expect(ed2.body).toMatchObject({ hasDraft: false, review: { status: 'none' } });
    expect(ed2.body.versions.length).toBeGreaterThanOrEqual(2);
  });

  it('restores an old version into the draft only, and schedules publishing', async () => {
    const s = await site();
    await api.req('PUT', `/cms/pages/${s.about.id}/draft`, { token: s.owner.token, body: { title: 'Version two', blocks, seo: {} } });
    await api.req('POST', `/cms/pages/${s.about.id}/publish`, { token: s.owner.token, body: {} });
    const ed = (await api.req('GET', `/cms/pages/${s.about.id}/editor`, { token: s.owner.token })).body;
    const old = ed.versions.find((v: any) => !v.live);
    expect((await api.req('POST', `/cms/pages/${s.about.id}/restore`, { token: s.owner.token, body: { version: old.version } })).status).toBe(201);
    expect((await live(s.slug, 'about')).page.title).toBe('Version two');
    expect((await api.req('GET', `/cms/pages/${s.about.id}/editor`, { token: s.owner.token })).body.working.title).not.toBe('Version two');
    const past = await api.req('POST', `/cms/pages/${s.about.id}/publish`, { token: s.owner.token, body: { publishAt: new Date(Date.now() - 3_600_000).toISOString() } });
    expect(past.status).toBe(400);
    const later = await api.req('POST', `/cms/pages/${s.about.id}/publish`, { token: s.owner.token, body: { publishAt: new Date(Date.now() + 86_400_000).toISOString() } });
    expect(later.body.status).toBe('scheduled');
    expect((await api.req('GET', `/site/page?slug=about`, { headers: { 'x-tenant': s.slug } })).status).toBe(404);
  });

  it('rejects unknown blocks and protects media that is in use', async () => {
    const s = await site();
    expect((await api.req('PUT', `/cms/pages/${s.about.id}/draft`, { token: s.owner.token, body: { title: 'x', blocks: [{ id: 'z', type: 'script-runner', props: {} }] } })).status).toBe(422);
    const up = await api.req('POST', '/files/upload-url', { token: s.owner.token, body: { purpose: 'website', mime: 'image/png', size: 2048, isPublic: true } });
    expect(up.status).toBe(201);
    const fid = up.body.fileId;
    expect((await api.req('PATCH', `/cms/media/${fid}`, { token: s.owner.token, body: { alt: 'Main building', name: 'campus.png' } })).body.meta).toMatchObject({ alt: 'Main building' });
    await api.req('PUT', `/cms/pages/${s.about.id}/draft`, { token: s.owner.token, body: { title: 'About', blocks: [{ id: 'i', type: 'image', props: { fileId: fid, alt: 'Main building' } }], seo: {} } });
    const lib = await api.req('GET', '/cms/media', { token: s.owner.token });
    expect(lib.body.find((m: any) => m.id === fid)).toMatchObject({ usedOn: 1, meta: { name: 'campus.png' } });
    const del = await api.req('DELETE', `/cms/media/${fid}`, { token: s.owner.token });
    expect(del.status).toBe(409);
    expect(del.body.error.message).toMatch(/used in 1 place/);
    await api.req('DELETE', `/cms/pages/${s.about.id}/draft`, { token: s.owner.token });
    expect((await api.req('DELETE', `/cms/media/${fid}`, { token: s.owner.token })).status).toBe(200);
    // Teachers have no website access at all.
    const tp = uniquePhone();
    await api.req('POST', '/people/staff', { token: s.owner.token, body: { name: 'Teacher', phone: tp, roleKeys: ['teacher'] } });
    expect((await api.req('GET', '/cms/media', { token: (await api.login(tp)).token })).status).toBe(403);
  });
});
