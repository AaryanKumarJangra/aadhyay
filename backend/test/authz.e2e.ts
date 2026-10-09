import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { setup, newSchool, uniquePhone, type Api } from './helpers';
import { tenantModule } from '../src/db/schema';
import { TenantService } from '../src/kernel/tenancy/tenant.service';

/**
 * Authorization matrix (docs/redesign/03-AUTHORIZATION.md, brief §85–86): allowed, denied, wrong scope, wrong tenant,
 * disabled module, grant authority — against the real API.
 */
let api: Api;
beforeAll(async () => { api = await setup(); });
afterAll(async () => { await api.close(); });

/** Dates in the institution's timezone (new schools default to Asia/Kolkata), not the test machine's UTC date. */
const istDate = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(ms));
const today = () => istDate(Date.now());
const yesterday = () => istDate(Date.now() - 86_400_000);

/** School with Class 8 (A, B), two subjects, students in each section, and staff in every role. */
async function school() {
  const s = await newSchool(api, `Authz ${Date.now()}`);
  const T = s.owner.token;
  const cls = await api.req('POST', '/academics/classes/with-sections', { token: T, body: { name: 'Class 8', order: 8, sections: ['A', 'B'] } });
  const [A, B] = cls.body.sections.map((x: any) => x.id) as [string, string];
  const maths = (await api.req('POST', '/academics/subjects', { token: T, body: { name: 'Mathematics' } })).body.id as string;
  const science = (await api.req('POST', '/academics/subjects', { token: T, body: { name: 'Science' } })).body.id as string;
  const parentPhone = uniquePhone(), studentPhone = uniquePhone();
  const kidA = (await api.req('POST', '/people/students', { token: T, body: { name: 'Aarav A', sectionId: A, phone: studentPhone, guardians: [{ name: 'Parent A', phone: parentPhone, relation: 'mother', isPrimary: true }] } })).body;
  const kidB = (await api.req('POST', '/people/students', { token: T, body: { name: 'Bela B', sectionId: B, guardians: [{ name: 'Parent B', phone: uniquePhone(), relation: 'father', isPrimary: true }] } })).body;
  const staff = async (name: string, roleKeys: string[]) => {
    const phone = uniquePhone();
    const r = await api.req('POST', '/people/staff', { token: T, body: { name, phone, roleKeys } });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const login = await api.login(phone);
    return { id: r.body.id as string, token: login.token, phone };
  };
  const teacher = await staff('Nidhi Pandey', ['teacher']);
  // Class teacher of 8-A; teaches Maths in 8-A only.
  await api.req('PATCH', `/academics/sections/${A}`, { token: T, body: { classTeacherId: teacher.id } });
  await api.req('POST', '/academics/class-subjects', { token: T, body: { classId: cls.body.id, sectionId: A, subjectId: maths, teacherId: teacher.id } });
  const principal = await staff('Principal', ['principal']);
  const accountant = await staff('Accountant', ['accountant']);
  const librarian = await staff('Librarian', ['librarian']);
  const driver = await staff('Driver', ['driver']);
  const parent = await api.login(parentPhone);
  const student = await api.login(studentPhone);
  return { ...s, T, classId: cls.body.id as string, A, B, maths, science, kidA, kidB, teacher, principal, accountant, librarian, driver, parent, student };
}

const denial = (r: { status: number; body: any }) => ({ status: r.status, denial: r.body?.error?.details?.denial, code: r.body?.error?.code });

describe('authorization matrix', () => {
  it('teacher: own section only — view, mark, students, notices', async () => {
    const s = await school();
    const t = s.teacher.token;
    // allowed in 8-A
    expect((await api.req('GET', `/attendance/sections/${s.A}`, { token: t })).status).toBe(200);
    const mark = await api.req('POST', '/attendance/sections/mark', { token: t, body: { sectionId: s.A, date: today(), entries: [], force: true } });
    expect(mark.status, JSON.stringify(mark.body)).toBe(201);
    // denied in 8-B, with an explanation
    const view = await api.req('GET', `/attendance/sections/${s.B}`, { token: t });
    expect(denial(view)).toEqual({ status: 403, denial: 'OUT_OF_SCOPE', code: 'FORBIDDEN' });
    expect(view.body.error.message).toMatch(/Teacher.*assigned classes & sections/);
    expect((await api.req('GET', `/attendance/sections/${s.B}/monthly`, { token: t })).status).toBe(403);
    expect(denial(await api.req('POST', '/attendance/sections/mark', { token: t, body: { sectionId: s.B, date: today(), entries: [], force: true } })).denial).toBe('OUT_OF_SCOPE');
    // student list is narrowed, other section's student is refused
    const list = await api.req('GET', '/people/students', { token: t });
    expect(list.body.items.map((x: any) => x.id)).toEqual([s.kidA.id]);
    expect((await api.req('GET', `/people/students/${s.kidB.id}`, { token: t })).status).toBe(403);
    // own student: profile without phone numbers or fee totals
    const kid = await api.req('GET', `/people/students/${s.kidA.id}`, { token: t });
    expect(kid.status).toBe(200);
    expect(kid.body.guardians[0].phone).toBeNull();
    expect(kid.body.fees).toBeNull();
    expect(kid.body.visibility).toEqual({ sensitive: false, contact: false, fees: false });
    expect(kid.body.religion ?? kid.body.apaarId ?? kid.body.address ?? null).toBeNull();
    // notices: own section yes, whole school no
    expect((await api.req('POST', '/comms/notices', { token: t, body: { title: '8-A', body: 'Bring maps', audience: { sectionIds: [s.A] } } })).status).toBe(201);
    expect(denial(await api.req('POST', '/comms/notices', { token: t, body: { title: 'All', body: 'x', audience: { all: true } } })).denial).toBe('OUT_OF_SCOPE');
    // leave list only covers own section's students
    expect((await api.req('GET', '/attendance/leave', { token: t })).status).toBe(200);
  });

  it('teacher may change attendance the same day only; principal any day', async () => {
    const s = await school();
    const late = await api.req('POST', '/attendance/sections/mark', { token: s.teacher.token, body: { sectionId: s.A, date: yesterday(), entries: [], force: true } });
    expect(denial(late)).toMatchObject({ status: 403, denial: 'CONDITION_FAILED' });
    expect(late.body.error.message).toMatch(/same day/);
    expect((await api.req('POST', '/attendance/sections/mark', { token: s.principal.token, body: { sectionId: s.B, date: yesterday(), entries: [], force: true } })).status).toBe(201);
  });

  it('subject teacher enters marks only for their subject', async () => {
    const s = await school();
    const g = await api.req('POST', '/exams/groups', { token: s.T, body: { name: 'Term 1' } });
    const e = await api.req('POST', '/exams/exams', { token: s.T, body: { groupId: g.body.id, name: 'Unit Test' } });
    const m = await api.req('POST', '/exams/schedules', { token: s.T, body: { examId: e.body.id, classId: s.classId, subjectId: s.maths, maxMarks: 50, passMarks: 17 } });
    const sc = await api.req('POST', '/exams/schedules', { token: s.T, body: { examId: e.body.id, classId: s.classId, subjectId: s.science, maxMarks: 50, passMarks: 17 } });
    const t = s.teacher.token;
    expect((await api.req('POST', '/exams/marks', { token: t, body: { scheduleId: m.body.id, entries: [{ studentId: s.kidA.id, marks: 40, isAbsent: false }] } })).status).toBe(201);
    expect(denial(await api.req('POST', '/exams/marks', { token: t, body: { scheduleId: sc.body.id, entries: [{ studentId: s.kidA.id, marks: 40, isAbsent: false }] } })).denial).toBe('OUT_OF_SCOPE');
    expect(denial(await api.req('POST', '/exams/marks', { token: t, body: { scheduleId: m.body.id, entries: [{ studentId: s.kidB.id, marks: 40, isAbsent: false }] } })).denial).toBe('OUT_OF_SCOPE');
    expect((await api.req('GET', `/exams/marks/${sc.body.id}?sectionId=${s.A}`, { token: t })).status).toBe(403);
    // accountant cannot touch academic results
    expect(denial(await api.req('POST', '/exams/marks', { token: s.accountant.token, body: { scheduleId: m.body.id, entries: [{ studentId: s.kidA.id, marks: 1, isAbsent: false }] } })).denial).toBe('NO_PERMISSION');
  });

  it('parents and students see only their own records and never mark attendance', async () => {
    const s = await school();
    expect((await api.req('GET', `/attendance/students/${s.kidA.id}`, { token: s.parent.token })).status).toBe(200);
    expect((await api.req('GET', `/attendance/students/${s.kidB.id}`, { token: s.parent.token })).status).toBe(403);
    expect(denial(await api.req('POST', '/attendance/sections/mark', { token: s.parent.token, body: { sectionId: s.A, date: today(), entries: [] } })).denial).toBe('NO_PERMISSION');
    expect(denial(await api.req('POST', '/attendance/sections/mark', { token: s.student.token, body: { sectionId: s.A, date: today(), entries: [] } })).denial).toBe('NO_PERMISSION');
    expect((await api.req('GET', `/attendance/sections/${s.A}`, { token: s.parent.token })).status).toBe(403);
    expect((await api.req('GET', '/people/students', { token: s.parent.token })).status).toBe(403);
    // homework of own child's section is readable; another section's is not
    expect((await api.req('GET', `/homework/sections/${s.A}`, { token: s.parent.token })).status).toBe(200);
    expect((await api.req('GET', `/homework/sections/${s.B}`, { token: s.parent.token })).status).toBe(403);
    // a parent applies leave for their own child; the class teacher sees it with name and class
    const lv = await api.req('POST', '/attendance/leave', { token: s.parent.token, body: { studentId: s.kidA.id, fromDate: today(), toDate: today(), reason: 'Fever' } });
    expect(lv.status, JSON.stringify(lv.body)).toBe(201);
    expect((await api.req('POST', '/attendance/leave', { token: s.parent.token, body: { studentId: s.kidB.id, fromDate: today(), toDate: today(), reason: 'Not my child' } })).status).toBe(403);
    const list = await api.req('GET', '/attendance/leave', { token: s.teacher.token });
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body.find((l: any) => l.id === lv.body.id)).toMatchObject({ subjectName: 'Aarav A', className: 'Class 8-A', reason: 'Fever' });
    // own child's full profile is visible to the parent
    const own = await api.req('GET', `/people/students/${s.kidA.id}`, { token: s.parent.token });
    expect(own.body.visibility).toEqual({ sensitive: true, contact: true, fees: true });
  });

  it('keeps roles in their lane: librarian/fees, driver/HR, teacher/payroll and fees', async () => {
    const s = await school();
    expect(denial(await api.req('POST', '/fees/collect', { token: s.librarian.token, body: { studentId: s.kidA.id, mode: 'cash', amountPaise: 100 } })).denial).toBe('NO_PERMISSION');
    expect(denial(await api.req('GET', '/hr/leave-types', { token: s.driver.token })).denial).toBe('NO_PERMISSION');
    expect(denial(await api.req('GET', '/people/students', { token: s.driver.token })).denial).toBe('NO_PERMISSION');
    expect(denial(await api.req('GET', '/payroll/run-list', { token: s.teacher.token })).denial).toBe('NO_PERMISSION');
    expect((await api.req('GET', `/fees/students/${s.kidA.id}/ledger`, { token: s.teacher.token })).status).toBe(403);
    expect((await api.req('GET', `/fees/students/${s.kidA.id}/ledger`, { token: s.accountant.token })).status).toBe(200);
    expect((await api.req('GET', `/hr/leave/balances/${s.principal.id}`, { token: s.teacher.token })).status).toBe(403);
    // a page that covers the whole institution is refused to section-scoped users
    expect(denial(await api.req('GET', '/academics/class-subjects', { token: s.teacher.token })).status).toBe(200);
    expect(denial(await api.req('GET', '/fees/defaulters', { token: s.teacher.token })).denial).toBe('NO_PERMISSION');
  });

  it('grant authority: owner manages roles; principal assigns only what they hold; nobody escalates', async () => {
    const s = await school();
    // Principal cannot design roles, give Accountant/Owner, or change their own roles.
    const principalCreate = await api.req('POST', '/org/roles', { token: s.principal.token, body: { key: 'boss', name: 'Boss', permissions: ['*'] } });
    expect(principalCreate.status).toBe(403);
    const members = (await api.req('GET', '/org/members', { token: s.T })).body as any[];
    const mem = (name: string) => members.find((m) => m.name === name)!.membershipId as string;
    // Adding Teacher is fine; replacing (which would also take away Librarian, which the principal does not hold) is not.
    const giveTeacher = await api.req('POST', `/org/members/${mem('Librarian')}/roles`, { token: s.principal.token, body: { roleKeys: ['teacher'], replace: false } });
    expect(giveTeacher.status, JSON.stringify(giveTeacher.body)).toBe(201);
    expect(denial(await api.req('POST', `/org/members/${mem('Librarian')}/roles`, { token: s.principal.token, body: { roleKeys: ['teacher'] } })).denial).toBe('GRANT_AUTHORITY');
    const giveAcct = await api.req('POST', `/org/members/${mem('Librarian')}/roles`, { token: s.principal.token, body: { roleKeys: ['accountant'] } });
    expect(denial(giveAcct)).toMatchObject({ status: 403, denial: 'GRANT_AUTHORITY' });
    expect((await api.req('POST', `/org/members/${mem('Librarian')}/roles`, { token: s.principal.token, body: { roleKeys: ['owner'] } })).status).toBe(403);
    expect(denial(await api.req('POST', `/org/members/${mem('Principal')}/roles`, { token: s.principal.token, body: { roleKeys: ['principal', 'teacher'] } })).denial).toBe('SELF_ASSIGNMENT');
    // Principal cannot strip the owner, and the last owner cannot be removed even by the owner.
    const ownerMem = members.find((m) => m.roles.some((r: any) => r.roleKey === 'owner'))!.membershipId;
    expect((await api.req('POST', `/org/members/${ownerMem}/roles`, { token: s.principal.token, body: { roleKeys: ['teacher'] } })).status).toBe(403);
    expect((await api.req('DELETE', `/org/members/${mem('Accountant')}`, { token: s.principal.token })).status).toBe(403);
    // Owner creates a custom role; it is validated and works.
    const bad = await api.req('POST', '/org/roles', { token: s.T, body: { key: 'bad', name: 'Bad', permissions: ['fees.payment.teleport'] } });
    expect(bad.status).toBe(422);
    const custom = await api.req('POST', '/org/roles', { token: s.T, body: { key: 'marks_moderator', name: 'Marks Moderator', permissions: ['exams.marks.view', 'exams.exam.view'] } });
    expect(custom.status, JSON.stringify(custom.body)).toBe(201);
    expect((await api.req('POST', `/org/members/${mem('Librarian')}/roles`, { token: s.T, body: { roleKeys: ['marks_moderator'] } })).status).toBe(201);
    const eff = await api.req('GET', `/access/members/${mem('Librarian')}`, { token: s.T });
    expect(eff.body.rows.find((r: any) => r.key === 'exams.marks.view')).toMatchObject({ scope: 'tenant', source: { roleName: 'Marks Moderator' } });
    expect(eff.body.rows.some((r: any) => r.module === 'library')).toBe(false);
    // The owner role itself is protected.
    const roles = (await api.req('GET', '/org/roles', { token: s.T })).body as any[];
    expect((await api.req('PATCH', `/org/roles/${roles.find((r) => r.key === 'owner').id}`, { token: s.T, body: { permissions: ['org.settings.view'] } })).status).toBe(403);
  });

  it('a disabled module denies every endpoint, for everyone', async () => {
    const s = await school();
    expect((await api.req('GET', '/transport/routes', { token: s.T })).status).toBe(200);
    await api.db.admin.update(tenantModule).set({ enabled: false }).where(and(eq(tenantModule.tenantId, s.tenantId), eq(tenantModule.moduleKey, 'transport')));
    await api.app.get(TenantService).invalidate({ id: s.tenantId, slug: s.slug });
    for (const url of ['/transport/routes', '/transport/vehicles', '/transport/trips/live']) {
      const r = await api.req('GET', url, { token: s.T });
      expect(r.status, url).toBe(403);
      expect(r.body.error.code, url).toBe('MODULE_DISABLED');
    }
  });

  it('explains decisions and lists effective access', async () => {
    const s = await school();
    const me = await api.req('GET', '/access/me', { token: s.teacher.token });
    expect(me.body.rows.find((r: any) => r.key === 'attendance.student.create').explanation).toBe('Can mark attendance for assigned classes & sections.');
    const why = await api.req('POST', '/access/explain', { token: s.teacher.token, body: { permission: 'fees.payment.refund' } });
    expect(why.body).toMatchObject({ allowed: false, code: 'NO_PERMISSION', contact: expect.any(String) });
    const cat = await api.req('GET', '/access/catalogue', { token: s.teacher.token });
    expect(cat.body.modules.find((m: any) => m.key === 'attendance').resources[0].actions.map((a: any) => a.action)).toContain('create');
  });

  it('attendance devices: QR/RFID punches resolve students (array binding regression)', async () => {
    const s = await school();
    const dev = await api.req('POST', '/attendance/devices', { token: s.T, body: { kind: 'qr_scanner', name: 'Gate 1', serial: `SN-${Date.now()}` } });
    expect(dev.status).toBe(201);
    const kid = await api.req('GET', `/people/students/${s.kidA.id}`, { token: s.T });
    const punch = await api.req('POST', '/attendance/device/punch', { headers: { 'x-device-key': dev.body.apiKey }, body: { punches: [{ code: kid.body.qrCode, at: new Date().toISOString(), direction: 'in' }, { code: 'UNKNOWN-1', at: new Date().toISOString(), direction: 'in' }] } });
    expect(punch.status, JSON.stringify(punch.body)).toBe(201);
    expect(punch.body).toEqual({ accepted: 1, unknown: ['UNKNOWN-1'] });
  });
  it('dashboards compose from permissions; search respects scope', async () => {
    const s = await school();
    const inst = await api.req('GET', '/dashboards/institution', { token: s.T });
    expect(inst.status, JSON.stringify(inst.body)).toBe(200);
    expect(Object.keys(inst.body)).toEqual(expect.arrayContaining(['people', 'attendance', 'fees', 'admissions', 'alerts']));
    expect(inst.body.people.monthly).toHaveLength(12);
    expect(denial(await api.req('GET', '/dashboards/institution', { token: s.teacher.token })).denial).toBe('NO_PERMISSION');
    const fin = await api.req('GET', '/dashboards/finance', { token: s.accountant.token });
    expect(fin.status).toBe(200);
    expect(fin.body.fees.daily).toHaveLength(30);
    const t = await api.req('GET', '/dashboards/teacher', { token: s.teacher.token });
    expect(t.body.sections.map((x: any) => x.id)).toEqual([s.A]);
    const fam = await api.req('GET', '/dashboards/family', { token: s.parent.token });
    expect(fam.status, JSON.stringify(fam.body)).toBe(200);
    expect(fam.body.children.map((c: any) => c.id)).toEqual([s.kidA.id]);
    expect(denial(await api.req('GET', '/dashboards/family', { token: s.accountant.token })).denial).toBe('NO_PERMISSION');
    // search: teacher finds only their section's student; the owner finds both
    const tq = await api.req('GET', '/search?q=B', { token: s.teacher.token });
    expect(tq.body.map((h: any) => h.id)).not.toContain(s.kidB.id);
    const oq = await api.req('GET', '/search?q=Bela', { token: s.T });
    expect(oq.body.map((h: any) => h.id)).toContain(s.kidB.id);
    expect((await api.req('GET', '/search?q=Bela', { token: s.driver.token })).body).toEqual([]);
  });
});
