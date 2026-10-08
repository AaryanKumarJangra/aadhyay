import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setup, newSchool, uniquePhone, type Api } from './helpers';

let api: Api;
beforeAll(async () => { api = await setup(); });
afterAll(async () => { await api.close(); });

async function schoolWithKids() {
  const s = await newSchool(api);
  const T = s.owner.token;
  const cls = await api.req('POST', '/academics/classes/with-sections', { token: T, body: { name: 'Class 6', order: 6, sections: ['A'] } });
  const sectionId = cls.body.sections[0].id;
  const parentPhone = uniquePhone();
  const k1 = await api.req('POST', '/people/students', { token: T, body: { name: 'Ishaan Verma', sectionId, guardians: [{ name: 'Neha Verma', phone: parentPhone, relation: 'mother', isPrimary: true }] } });
  const k2 = await api.req('POST', '/people/students', { token: T, body: { name: 'Riya Gupta', sectionId, guardians: [{ name: 'Amit Gupta', phone: uniquePhone(), relation: 'father' }] } });
  return { ...s, T, classId: cls.body.id, sectionId, parentPhone, k1: k1.body, k2: k2.body };
}

describe('daily school loop', () => {
  it('attendance: exceptions-only marking → absent alert reaches parent inbox', async () => {
    const s = await schoolWithKids();
    const today = new Date().toISOString().slice(0, 10);
    const m = await api.req('POST', '/attendance/sections/mark', { token: s.T, body: { sectionId: s.sectionId, date: today, entries: [{ studentId: s.k1.id, status: 'absent' }], force: true } });
    expect(m.status).toBe(201);
    expect(m.body.summary).toEqual({ absent: 1, present: 1 });
    await api.drain();
    const parent = await api.login(s.parentPhone);
    const inbox = await api.req('GET', '/comms/inbox', { token: parent.token });
    const alert = inbox.body.find((n: any) => n.eventKey === 'attendance.absent');
    expect(alert).toBeTruthy();
    expect(alert.body).toContain('Ishaan Verma');
    expect(alert.studentId).toBe(s.k1.id);
    // re-marking the same status does not re-alert
    await api.req('POST', '/attendance/sections/mark', { token: s.T, body: { sectionId: s.sectionId, date: today, entries: [{ studentId: s.k1.id, status: 'absent' }], force: true } });
    await api.drain();
    const inbox2 = await api.req('GET', '/comms/inbox', { token: parent.token });
    expect(inbox2.body.filter((n: any) => n.eventKey === 'attendance.absent').length).toBe(1);
    const reg = await api.req('GET', `/attendance/sections/${s.sectionId}?date=${today}`, { token: s.T });
    expect(reg.body.students.find((x: any) => x.studentId === s.k1.id).status).toBe('absent');
  });

  it('fees: structure → assign → partial collection with oldest-first allocation → receipt + ledger + journal', async () => {
    const s = await schoolWithKids();
    const head = await api.req('POST', '/fees/heads', { token: s.T, body: { name: 'Tuition' } });
    const st = await api.req('POST', '/fees/structures', { token: s.T, body: { name: 'Class 6 2026-27', classId: s.classId, items: [
      { headId: head.body.id, amountPaise: 300000, installmentNo: 1, dueOn: '2026-04-10' },
      { headId: head.body.id, amountPaise: 300000, installmentNo: 2, dueOn: '2026-07-10' },
    ] } });
    expect(st.status).toBe(201);
    const as = await api.req('POST', '/fees/assign', { token: s.T, body: { structureId: st.body.id } });
    expect(as.body).toEqual({ assigned: 4, students: 2 });
    const again = await api.req('POST', '/fees/assign', { token: s.T, body: { structureId: st.body.id } });
    expect(again.body.assigned).toBe(0);
    const c = await api.req('POST', '/fees/collect', { token: s.T, body: { studentId: s.k1.id, mode: 'cash', amountPaise: 400000 } });
    expect(c.status).toBe(201);
    expect(c.body.number).toMatch(/^R\/\d{4}-\d{2}\/00001$/);
    expect(c.body.lines.map((l: any) => l.amountPaise)).toEqual([300000, 100000]);
    const led = await api.req('GET', `/fees/students/${s.k1.id}/ledger`, { token: s.T });
    expect(led.body.totals.outstandingPaise).toBe(200000);
    const over = await api.req('POST', '/fees/collect', { token: s.T, body: { studentId: s.k1.id, mode: 'cash', amountPaise: 900000 } });
    expect(over.status).toBe(400);
    const pdf = await api.app.inject({ method: 'GET', url: `/v1/fees/receipts/${c.body.id}/pdf?format=thermal`, headers: { authorization: `Bearer ${s.T}` } });
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
    // parent sees ledger, can't collect
    const parent = await api.login(s.parentPhone);
    expect((await api.req('GET', `/fees/students/${s.k1.id}/ledger`, { token: parent.token })).status).toBe(200);
    expect((await api.req('GET', `/fees/students/${s.k2.id}/ledger`, { token: parent.token })).status).toBe(404);
    expect((await api.req('POST', '/fees/collect', { token: parent.token, body: { studentId: s.k1.id, mode: 'cash', amountPaise: 100 } })).status).toBe(403);
    // online pay (log gateway in dev)
    const init = await api.req('POST', '/fees/online/init', { token: parent.token, body: { studentId: s.k1.id, studentFeeIds: led.body.lines.map((l: any) => l.id) } });
    expect(init.body.amountPaise).toBe(200000);
    const conf = await api.req('POST', '/fees/online/confirm', { token: parent.token, body: { orderId: init.body.orderId, paymentId: 'pay_test_1', signature: 'log' } });
    expect(conf.status).toBe(201);
    const led2 = await api.req('GET', `/fees/students/${s.k1.id}/ledger`, { token: s.T });
    expect(led2.body.totals.outstandingPaise).toBe(0);
    // cancel first receipt → outstanding back
    await api.req('POST', `/fees/receipts/${c.body.id}/cancel`, { token: s.T, body: { reason: 'Wrong student' } });
    const led3 = await api.req('GET', `/fees/students/${s.k1.id}/ledger`, { token: s.T });
    expect(led3.body.totals.outstandingPaise).toBe(400000);
    const dash = await api.req('GET', '/fees/dashboard?from=2020-01-01&to=2099-01-01', { token: s.T });
    expect(dash.body.collectedPaise).toBe(200000);
    const def = await api.req('GET', '/fees/defaulters', { token: s.T });
    expect(def.body.length).toBeGreaterThanOrEqual(1);
  });

  it('exams: schedule → marks → publish → ranks → report card (parent sees only published)', async () => {
    const s = await schoolWithKids();
    const math = await api.req('POST', '/academics/subjects', { token: s.T, body: { name: 'Mathematics' } });
    const sci = await api.req('POST', '/academics/subjects', { token: s.T, body: { name: 'Science' } });
    const g = await api.req('POST', '/exams/groups', { token: s.T, body: { name: 'Term 1' } });
    const e = await api.req('POST', '/exams/exams', { token: s.T, body: { groupId: g.body.id, name: 'Half Yearly' } });
    const s1 = await api.req('POST', '/exams/schedules', { token: s.T, body: { examId: e.body.id, classId: s.classId, subjectId: math.body.id, maxMarks: 100, passMarks: 33 } });
    const s2 = await api.req('POST', '/exams/schedules', { token: s.T, body: { examId: e.body.id, classId: s.classId, subjectId: sci.body.id, maxMarks: 100, passMarks: 33 } });
    await api.req('POST', '/exams/marks', { token: s.T, body: { scheduleId: s1.body.id, entries: [{ studentId: s.k1.id, marks: 95 }, { studentId: s.k2.id, marks: 60 }] } });
    await api.req('POST', '/exams/marks', { token: s.T, body: { scheduleId: s2.body.id, entries: [{ studentId: s.k1.id, marks: 89 }, { studentId: s.k2.id, marks: 20 }] } });
    const tooMany = await api.req('POST', '/exams/marks', { token: s.T, body: { scheduleId: s2.body.id, entries: [{ studentId: s.k1.id, marks: 101 }] } });
    expect(tooMany.status).toBe(400);
    const parent = await api.login(s.parentPhone);
    const before = await api.req('GET', `/exams/report-card/${s.k1.id}?groupId=${g.body.id}`, { token: parent.token });
    expect(before.body.exams.length).toBe(0);
    const pub = await api.req('POST', `/exams/${e.body.id}/publish`, { token: s.T, body: {} });
    expect(pub.status).toBe(201);
    const res = await api.req('GET', `/exams/${e.body.id}/sections/${s.sectionId}/results`, { token: s.T });
    expect(res.body[0]).toMatchObject({ name: 'Ishaan Verma', percentage: 92, grade: 'A1', rank: 1, isPass: true });
    expect(res.body[1]).toMatchObject({ rank: 2, isPass: false });
    const rc = await api.req('GET', `/exams/report-card/${s.k1.id}?groupId=${g.body.id}`, { token: parent.token });
    expect(rc.body.results[0].percentage).toBe(92);
    expect(rc.body.subjects.length).toBe(2);
    await api.drain();
    const inbox = await api.req('GET', '/comms/inbox', { token: parent.token });
    expect(inbox.body.some((n: any) => n.eventKey === 'exam.result_published' && n.body.includes('92'))).toBe(true);
  });

  it('notice goes once per parent, not per child', async () => {
    const s = await newSchool(api);
    const cls = await api.req('POST', '/academics/classes/with-sections', { token: s.owner.token, body: { name: 'Class 2', order: 2, sections: ['A'] } });
    const phone = uniquePhone();
    for (const n of ['Kid One', 'Kid Two']) await api.req('POST', '/people/students', { token: s.owner.token, body: { name: n, sectionId: cls.body.sections[0].id, guardians: [{ name: 'Same Parent', phone, relation: 'father' }] } });
    await api.req('POST', '/comms/notices', { token: s.owner.token, body: { title: 'Holiday tomorrow', body: 'School closed on account of heavy rain.', audience: { all: true }, urgent: true } });
    await api.drain();
    const p = await api.login(phone);
    const inbox = await api.req('GET', '/comms/inbox', { token: p.token });
    expect(inbox.body.filter((n: any) => n.eventKey === 'emergency.broadcast').length).toBe(1);
  });
});
