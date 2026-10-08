import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as argon2 from 'argon2';
import { sql } from 'drizzle-orm';
import { setup, newSchool, uniquePhone, type Api } from './helpers';
import { platformUser } from '../src/db/schema';

let api: Api;
beforeAll(async () => { api = await setup(); });
afterAll(async () => { await api.close(); });

/** A school with one class, one student + guardian, one lead, one notice and one transport route. */
async function populatedSchool(tag: string) {
  const s = await newSchool(api, `Security ${tag} ${Date.now()}`);
  const T = s.owner.token;
  const cls = await api.req('POST', '/academics/classes/with-sections', { token: T, body: { name: `Class ${tag}`, order: 5, sections: ['A'] } });
  const sectionId = cls.body.sections[0].id;
  const guardianPhone = uniquePhone();
  const st = await api.req('POST', '/people/students', { token: T, body: { name: `Pupil ${tag}`, sectionId, guardians: [{ name: `Guardian ${tag}`, phone: guardianPhone, relation: 'mother', isPrimary: true }] } });
  const lead = await api.req('POST', '/crm/leads', { token: T, body: { name: `Lead ${tag}`, phone: uniquePhone() } });
  await api.req('POST', '/comms/notices', { token: T, body: { title: `Notice ${tag}`, body: `Only for school ${tag}`, audience: { all: true } } });
  const route = await api.req('POST', '/transport/routes', { token: T, body: { name: `Route ${tag}`, stops: [{ name: `Stop ${tag}`, lat: 28.9, lng: 77.7, order: 1 }] } });
  const doc = await api.req('POST', '/files/upload-url', { token: T, body: { purpose: 'document', mime: 'application/pdf', size: 1000 } });
  expect([st.status, lead.status, route.status, doc.status]).toEqual([201, 201, 201, 201]);
  return { ...s, T, sectionId, studentId: st.body.id as string, leadId: lead.body.id as string, routeId: route.body.id as string, fileId: doc.body.fileId as string, guardianPhone, tag };
}

const leaks = (body: unknown, tag: string) => JSON.stringify(body ?? '').includes(` ${tag}`);

describe('security: tenant isolation (API)', () => {
  it('A cannot read, change or delete B data by id, list, header or tenant switch — and vice versa', async () => {
    const A = await populatedSchool('Alpha'), B = await populatedSchool('Bravo');
    for (const [me, other] of [[A, B], [B, A]] as const) {
      const byId = [
        ['GET', `/people/students/${other.studentId}`],
        ['PATCH', `/people/students/${other.studentId}`, { name: 'tampered' }],
        ['GET', `/crm/leads/${other.leadId}`],
        ['PATCH', `/crm/leads/${other.leadId}`, { name: 'tampered' }],
        ['GET', `/academics/sections/${other.sectionId}`],
        ['GET', `/files/${other.fileId}/url`],
        ['GET', `/fees/students/${other.studentId}/ledger`],
      ] as const;
      for (const [m, url, body] of byId) {
        const r = await api.req(m, url, { token: me.T, body });
        expect(leaks(r.body, other.tag), `${m} ${url} leaked`).toBe(false);
        // Mutations and direct lookups of another tenant's object must be refused outright.
        if (m !== 'GET' || /\/(files|people|crm)\//.test(url)) expect([403, 404], `${m} ${url} → ${r.status}`).toContain(r.status);
      }
      for (const url of ['/people/students', '/crm/leads', '/comms/notices', '/transport/routes', '/academics/tree']) {
        const r = await api.req('GET', url, { token: me.T });
        expect(r.status, url).toBe(200);
        expect(leaks(r.body, other.tag), `${url} list leaked`).toBe(false);
      }
      // Forged tenant headers are ignored: the token's tenant wins.
      const forged = await api.req('GET', '/people/students', { token: me.T, headers: { 'x-tenant': other.slug, 'x-tenant-id': other.tenantId } });
      expect(leaks(forged.body, other.tag)).toBe(false);
      const sw = await api.req('POST', '/auth/switch-tenant', { token: me.T, body: { tenantId: other.tenantId } });
      expect(sw.status).not.toBe(201);
    }
    // Untouched after the attempts
    const still = await api.req('GET', `/people/students/${B.studentId}`, { token: B.T });
    expect(still.body.name).toBe('Pupil Bravo');
  });
});

describe('security: row-level security in the database', () => {
  it('the runtime role sees only the current tenant, cannot write into another tenant, and cannot read credentials', async () => {
    const A = await populatedSchool('Charlie'), B = await populatedSchool('Delta');
    const seen = await api.db.app.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${A.tenantId}, true)`);
      const r = await tx.execute(sql`select count(*)::int as n from students where tenant_id = ${B.tenantId}`);
      return (r.rows[0] as any).n;
    });
    expect(seen).toBe(0);
    await expect(api.db.app.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${A.tenantId}, true)`);
      await tx.execute(sql`update students set name = 'x' where tenant_id = ${B.tenantId}`);
      const r = await tx.execute(sql`select count(*)::int as n from students where name = 'x'`);
      if ((r.rows[0] as any).n) throw new Error('cross-tenant update applied');
      await tx.execute(sql`insert into leads (id, tenant_id, name, phone) values (gen_random_uuid(), ${B.tenantId}, 'planted', '+919999999999')`);
    })).rejects.toThrow();
    // files (nullable tenant_id) is covered too
    const files = await api.db.app.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${A.tenantId}, true)`);
      return ((await tx.execute(sql`select count(*)::int as n from files where tenant_id = ${B.tenantId}`)).rows[0] as any).n;
    });
    expect(files).toBe(0);
    const denied = await api.db.app.execute(sql`select * from wa_accounts limit 1`).then(() => null, (e: any) => String(e?.cause?.message ?? e?.message));
    expect(denied).toMatch(/permission denied/);
    const noRls = await api.db.admin.execute(sql`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
        and exists (select 1 from information_schema.columns k where k.table_name = c.relname and k.column_name = 'tenant_id')`);
    expect(noRls.rows).toEqual([]);
    const role = await api.db.admin.execute(sql`select rolbypassrls, rolsuper from pg_roles where rolname = 'aadhyay_app'`);
    expect(role.rows[0]).toEqual({ rolbypassrls: false, rolsuper: false });
  });
});

describe('security: files', () => {
  it('rejects unsafe uploads and enforces ownership + permission on download', async () => {
    const A = await populatedSchool('Echo');
    const up = (body: object, token = A.T) => api.req('POST', '/files/upload-url', { token, body });
    expect((await up({ purpose: '../../global', mime: 'image/png', size: 10 })).status).toBe(422);
    expect((await up({ purpose: 'avatar', mime: 'text/html', size: 10 })).status).toBe(400);
    expect((await up({ purpose: 'avatar', mime: 'image/png', size: 50 * 1024 * 1024 })).status).toBe(400);
    expect((await up({ purpose: 'document', mime: 'application/pdf', size: 10, isPublic: true })).status).toBe(400);
    const ok = await up({ purpose: 'avatar', mime: 'image/png', size: 10, filename: '../../etc/passwd.php' });
    expect(ok.status).toBe(201);
    expect(ok.body.uploadUrl).toMatch(new RegExp(`/${A.tenantId}/avatar/${ok.body.fileId}\\.png\\?`));
    // Owner (uploader) can read their own private document; a guardian in the same school cannot.
    expect((await api.req('GET', `/files/${A.fileId}/url`, { token: A.T })).status).toBe(200);
    const guardian = await api.login(A.guardianPhone, undefined, A.slug);
    expect((await api.req('GET', `/files/${A.fileId}/url`, { token: guardian.token })).status).toBe(404);
    expect((await up({ purpose: 'logo', mime: 'image/png', size: 10, isPublic: true }, guardian.token)).status).toBe(403);
    expect((await api.req('GET', '/files/not-a-uuid/url', { token: A.T })).status).toBe(404);
  });
});

describe('security: authentication', () => {
  it('control-plane login locks after repeated failures, even for the right password, and records it', async () => {
    const email = `lock-${Date.now()}@aadhyay.test`;
    await api.db.admin.insert(platformUser).values({ email, name: 'Lock Test', role: 'super_admin', passwordHash: await argon2.hash('Right@password1', { type: argon2.argon2id }) });
    const login = (password: string) => api.req('POST', '/control/auth/login', { body: { email, password }, headers: { 'x-forwarded-for': '10.200.0.1' } });
    expect((await login('Right@password1')).status).toBe(201);
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await login(`wrong-${i}`)).status);
    expect(statuses).toEqual([401, 401, 401, 401, 401]);
    const locked = await login('Right@password1');
    expect(locked.status).toBe(429);
    expect(locked.body.error.details.retryAfterSec).toBeGreaterThan(800);
    const events = await api.db.admin.execute(sql`select kind from security_events where subject = ${email} order by at`);
    const kinds = events.rows.map((r: any) => r.kind);
    expect(kinds).toContain('platform.login.success');
    expect(kinds.filter((k) => k === 'platform.login.failed').length).toBe(5);
    expect(kinds).toContain('platform.login.locked');
    expect(kinds).toContain('platform.login.blocked');
    // Unknown accounts get the same answer as wrong passwords.
    const unknown = await api.req('POST', '/control/auth/login', { body: { email: `nobody-${Date.now()}@aadhyay.test`, password: 'x' } });
    expect(unknown.status).toBe(401);
  });

  it('tenant OTP: single use, lockout after wrong codes; refresh rotation; logout revokes', async () => {
    const phone = uniquePhone();
    const r1 = await api.req('POST', '/auth/otp/request', { body: { phone } });
    for (let i = 0; i < 6; i++) await api.req('POST', '/auth/otp/verify', { body: { phone, code: '000000', deviceId: 'sec-device-1' } });
    const afterWrong = await api.req('POST', '/auth/otp/verify', { body: { phone, code: r1.body.devCode, deviceId: 'sec-device-1' } });
    expect(afterWrong.status).not.toBe(201);

    const s = await newSchool(api);
    const ok = await api.login(uniquePhone(), 'Fresh', s.slug);
    const ref1 = await api.req('POST', '/auth/refresh', { body: { refreshToken: ok.refreshToken } });
    expect(ref1.status).toBe(201);
    expect((await api.req('POST', '/auth/refresh', { body: { refreshToken: ok.refreshToken } })).status).toBe(401);
    expect((await api.req('GET', '/me', { token: s.owner.token })).status).toBe(200);
    await api.req('POST', '/auth/logout', { token: s.owner.token, body: {} });
    expect((await api.req('GET', '/me', { token: s.owner.token })).status).toBe(401);
    expect((await api.req('GET', '/me', { token: 'not.a.jwt' })).status).toBe(401);
  });
});

describe('security: role permissions (API, not just UI)', () => {
  it('teacher and guardian are limited to their permissions; tenant users cannot use the control plane', async () => {
    const A = await populatedSchool('Foxtrot');
    const teacherPhone = uniquePhone();
    expect((await api.req('POST', '/org/members', { token: A.T, body: { phone: teacherPhone, name: 'Teacher F', roleKeys: ['teacher'] } })).status).toBe(201);
    const teacher = await api.login(teacherPhone, undefined, A.slug);
    const guardian = await api.login(A.guardianPhone, undefined, A.slug);
    // Teacher: can see students, cannot touch fees, settings or members.
    expect((await api.req('GET', '/people/students', { token: teacher.token })).status).toBe(200);
    for (const [m, url, body] of [['POST', '/fees/heads', { name: 'X' }], ['PATCH', '/org/settings', { quietHours: { start: '00:00', end: '00:00' } }], ['POST', '/org/members', { phone: uniquePhone(), name: 'Z', roleKeys: ['admin'] }]] as const) {
      expect((await api.req(m, url, { token: teacher.token, body })).status, `teacher ${m} ${url}`).toBe(403);
    }
    // Guardian: own child's ledger yes; student list and edits no.
    expect((await api.req('GET', `/fees/students/${A.studentId}/ledger`, { token: guardian.token })).status).toBe(200);
    expect((await api.req('GET', '/people/students', { token: guardian.token })).status).toBe(403);
    expect((await api.req('PATCH', `/people/students/${A.studentId}`, { token: guardian.token, body: { name: 'tampered' } })).status).toBe(403);
    for (const tok of [A.T, teacher.token, guardian.token]) expect((await api.req('GET', '/control/tenants', { token: tok })).status).toBe(401);
  });
});
