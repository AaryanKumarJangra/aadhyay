/**
 * pnpm db:seed:demo — three realistic demo institutions for local development and demos.
 *
 *   demo-school    K-12 school   (250 students, 120 guardians, 25 teachers, 15 staff, …)
 *   demo-college   college       (departments, programmes, semesters, credits/CGPA, placements, hostel, library)
 *   demo-coaching  coaching      (batches, LMS courses, online tests, leads, coupons)
 *
 * Everything is created through the real HTTP API (in-process), so demo data passes the same validation,
 * permissions and business rules as production data. Deterministic (seeded PRNG) and idempotent: a tenant that
 * already exists is left untouched; demo logins are (re)applied every run. Refuses to run in production.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import * as argon2 from 'argon2';
import { eq, inArray } from 'drizzle-orm';
import { loadEnv } from '../config/load-env';

loadEnv();
if (process.env.NODE_ENV === 'production') {
  console.error('seed-demo refuses to run with NODE_ENV=production');
  process.exit(1);
}

import { createApp } from '../bootstrap';
import { DbService } from '../db/db.service';
import { EventsService } from '../kernel/events/events.service';
import { AuthService } from '../kernel/auth/auth.service';
import { tenant, user, platformUser } from '../db/schema';
import { rng, childName, adultName, surname, demoPhone, schoolDays, isoDay, addDays, type Rng } from './demo-data';

/** Local-only password for every demo account. Documented in docs/DEVELOPMENT.md. Never used in production. */
export const DEMO_PASSWORD = 'Demo@12345';
const DOMAIN = 'demo.aadhyay.local';

type Res = { status: number; body: any };
class Api {
  token = '';
  constructor(private readonly app: NestFastifyApplication) {}
  async req(method: string, url: string, body?: unknown, opts: { token?: string | null; headers?: Record<string, string> } = {}): Promise<Res> {
    const token = opts.token === null ? undefined : opts.token ?? this.token;
    const res = await this.app.inject({
      method: method as any, url: `/v1${url}`,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(opts.headers ?? {}) },
      payload: body === undefined ? undefined : JSON.stringify(body),
    });
    let parsed: any = res.body;
    try { parsed = JSON.parse(res.body); } catch { /* non-JSON (pdf etc.) */ }
    return { status: res.statusCode, body: parsed };
  }
  /** Request that must succeed; otherwise throws with the API's error details. */
  async must(method: string, url: string, body?: unknown, opts?: Parameters<Api['req']>[3]) {
    const r = await this.req(method, url, body, opts);
    if (r.status >= 300) throw new Error(`${method} ${url} → ${r.status} ${JSON.stringify(r.body).slice(0, 600)}`);
    return r.body;
  }
  post = (url: string, body?: unknown) => this.must('POST', url, body ?? {});
}

interface Ctx { app: NestFastifyApplication; api: Api; db: DbService; auth: AuthService; r: Rng; logins: Array<{ tenant: string; role: string; email: string; phone: string; name: string }> }

const step = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  const t0 = Date.now();
  const out = await fn();
  console.log(`    ✔ ${label} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  return out;
};

/** Create the tenant through public signup and act as its owner (token issued directly; no OTP needed). */
async function provision(c: Ctx, t: { slug: string; name: string; segment: 'school' | 'college' | 'coaching'; city: string; idx: 1 | 2 | 3; ownerName: string }) {
  const ownerPhone = demoPhone(t.idx, 0, 1);
  const s = await c.api.must('POST', '/public/signup', { institutionName: t.name, segment: t.segment, slug: t.slug, city: t.city, state: 'Uttar Pradesh', stateCode: '09', ownerName: t.ownerName, ownerPhone }, { token: null, headers: { 'x-forwarded-for': `127.0.${t.idx}.1` } });
  const [owner] = await c.db.admin.select().from(user).where(eq(user.phone, ownerPhone));
  const issued = await c.auth.issue(owner!.id, { deviceId: `demo-seed-${t.slug}`, deviceName: 'demo seed' }, t.slug);
  c.api.token = issued.accessToken;
  await c.api.must('PATCH', '/org/settings', { quietHours: { start: '00:00', end: '00:00' } });
  c.logins.push({ tenant: t.slug, role: 'Owner / Director', email: `owner@${t.segment}.${DOMAIN}`, phone: ownerPhone, name: t.ownerName });
  return { tenantId: s.tenantId as string, ownerPhone };
}

async function staffMember(c: Ctx, idx: 1 | 2 | 3, seq: number, roleKeys: string[], extra: Record<string, unknown> = {}) {
  const p = adultName(c.r);
  const phone = demoPhone(idx, 1, seq);
  const s = await c.api.post('/people/staff', { name: p.name, gender: p.gender, phone, roleKeys, joiningDate: '2024-04-01', ...extra });
  return { id: s.id as string, name: p.name, phone };
}

async function classWithSections(c: Ctx, name: string, order: number, sections: string[]) {
  const cls = await c.api.post('/academics/classes/with-sections', { name, order, sections });
  return { id: cls.id as string, name, sections: (cls.sections as any[]).map((s) => ({ id: s.id as string, name: s.name as string })) };
}

async function markAttendance(c: Ctx, sections: Array<{ id: string; students: string[] }>, days: number, absentRate: number) {
  for (const date of schoolDays(new Date(), days)) {
    for (const sec of sections) {
      const entries = sec.students.filter(() => c.r.chance(absentRate)).map((studentId) => ({ studentId, status: c.r.chance(0.2) ? 'late' : 'absent' }));
      await c.api.post('/attendance/sections/mark', { sectionId: sec.id, date, entries, force: true });
    }
  }
}

/** `teacherFor(sectionIdx, subjectIdx)` spreads teaching load so one teacher is not needed in two rooms at once. */
async function timetable(c: Ctx, sections: string[], subjects: Array<{ id: string; teacherId: string }>, periods: number, teacherFor?: (sectionIdx: number, subjectIdx: number) => string) {
  const ps: string[] = [];
  const start = [8, 0];
  for (let i = 0; i < periods; i++) {
    const m = start[0]! * 60 + start[1]! + i * 45 + (i >= 4 ? 30 : 0); // 30-min recess after period 4
    const hh = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
    ps.push((await c.api.post('/timetable/periods', { name: `Period ${i + 1}`, startsAt: hh(m), endsAt: hh(m + 40), order: i + 1 })).id);
  }
  for (const [si, sectionId] of sections.entries()) {
    for (let day = 1; day <= 6; day++) {
      for (const [pi, periodId] of ps.entries()) {
        const k = (si + day + pi) % subjects.length;
        const sub = subjects[k]!;
        const r = await c.api.req('POST', '/timetable/slots', { sectionId, weekday: day, periodId, subjectId: sub.id, teacherId: teacherFor ? teacherFor(si, k) : sub.teacherId, room: `R-${101 + si}` });
        // A teacher already busy in that period is a legitimate clash; leave the slot to the next subject.
        if (r.status >= 300 && r.status !== 409) throw new Error(`timetable slot → ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
      }
    }
  }
}

async function exams(c: Ctx, classes: Array<{ id: string; students: string[] }>, subjects: string[], name: string) {
  const g = await c.api.post('/exams/groups', { name: 'Term 1' });
  const e = await c.api.post('/exams/exams', { groupId: g.id, name });
  for (const cls of classes) {
    for (const subjectId of subjects) {
      const sch = await c.api.post('/exams/schedules', { examId: e.id, classId: cls.id, subjectId, maxMarks: 100, passMarks: 33, date: isoDay(addDays(new Date(), -20)) });
      const entries = cls.students.map((studentId) => ({ studentId, marks: Math.max(18, Math.min(100, Math.round(62 + (c.r.next() + c.r.next() + c.r.next() - 1.5) * 38))) }));
      if (entries.length) await c.api.post('/exams/marks', { scheduleId: sch.id, entries });
    }
  }
  await c.api.post(`/exams/${e.id}/compute`);
  await c.api.post(`/exams/${e.id}/publish`);
  return e.id as string;
}

async function fees(c: Ctx, classes: Array<{ id: string; name: string; order: number; students: string[] }>, payRate: number) {
  const tuition = await c.api.post('/fees/heads', { name: 'Tuition Fee' });
  const annual = await c.api.post('/fees/heads', { name: 'Annual Charges' });
  const year = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const quarters = [`${year}-04-10`, `${year}-07-10`, `${year}-10-10`, `${year + 1}-01-10`];
  let collected = 0;
  for (const cls of classes) {
    const q = 300000 + cls.order * 25000; // ₹3,000 + ₹250 per grade, per quarter
    const st = await c.api.post('/fees/structures', { name: `${cls.name} ${year}-${String(year + 1).slice(2)}`, classId: cls.id, items: [
      { headId: annual.id, amountPaise: 500000, installmentNo: 1, dueOn: quarters[0] },
      ...quarters.map((dueOn, i) => ({ headId: tuition.id, amountPaise: q, installmentNo: i + 1, dueOn })),
    ] });
    await c.api.post('/fees/assign', { structureId: st.id });
    for (const studentId of cls.students) {
      if (!c.r.chance(payRate)) continue;
      const amountPaise = c.r.chance(0.75) ? 500000 + q * 2 : 500000 + Math.round(q / 2); // most paid two quarters, some part of one
      await c.api.post('/fees/collect', { studentId, mode: c.r.pick(['cash', 'upi', 'upi', 'cheque', 'card']), amountPaise });
      collected++;
    }
  }
  return collected;
}

async function cmsContent(c: Ctx, kind: string) {
  const news = [
    ['annual-results', `Board results: 100% pass for the third year`, 'Our students scored their best ever results this year, with 42 distinctions.'],
    ['science-exhibition', 'Inter-school science exhibition winners', 'Our Class 9 team won first prize for a low-cost water purifier.'],
    ['admissions-open', 'Admissions open for the new session', 'Registrations are open. Visit the campus or apply online.'],
  ];
  for (const [slug, title, body] of news) await c.api.post('/cms/posts', { kind: 'news', slug, title, excerpt: body, body: `<p>${body}</p>`, status: 'published' });
  const events = [['annual-day', 'Annual Day Celebration', 30], ['sports-meet', 'Annual Sports Meet', 45], ['parent-orientation', 'Parent Orientation Programme', 12]] as const;
  for (const [slug, title, inDays] of events) {
    const start = addDays(new Date(), inDays);
    await c.api.post('/cms/posts', { kind: 'event', slug, title, excerpt: `${title} — all parents are invited.`, eventStart: start.toISOString(), eventEnd: addDays(start, 0).toISOString(), status: 'published' });
  }
  await c.api.post('/cms/posts', { kind: 'gallery', slug: 'campus-life', title: 'Campus life', excerpt: `Moments from our ${kind}.`, status: 'published' });
}

async function calendar(c: Ctx) {
  const y = new Date().getFullYear();
  for (const [kind, title, on] of [['holiday', 'Diwali Break', `${y}-11-08`], ['holiday', 'Republic Day', `${y + 1}-01-26`], ['ptm', 'Parent-Teacher Meeting', isoDay(addDays(new Date(), 10))], ['event', 'Annual Day', isoDay(addDays(new Date(), 30))], ['exam', 'Half-Yearly Examinations', isoDay(addDays(new Date(), 40))]] as const) {
    await c.api.post('/calendar/events', { kind, title, startsOn: on, endsOn: on });
  }
}

async function notices(c: Ctx, items: Array<[string, string]>) {
  for (const [title, body] of items) await c.api.post('/comms/notices', { title, body, audience: { all: true } });
}

async function leads(c: Ctx, count: number, idx: 1 | 2 | 3, forWhat: string[]) {
  for (let i = 0; i < count; i++) {
    const p = adultName(c.r);
    await c.api.post('/crm/leads', { name: p.name, phone: demoPhone(idx, 2, 900000 + i), forClass: c.r.pick(forWhat), source: c.r.pick(['website', 'walk_in', 'referral', 'google', 'facebook', 'whatsapp']), note: c.r.pick(['Wants transport', 'Asked about fee concession', 'Sibling already studying', 'Visiting next week', '']) || undefined });
  }
}

/** Books with two physical copies each; returns the copy barcodes (PREFIX-0001, …) in order. */
async function library(c: Ctx, titles: Array<[string, string, string]>, prefix = 'LIB') {
  const barcodes: string[] = [];
  for (const [i, [title, author, category]] of titles.entries()) {
    const b = await c.api.post('/library/books', { title, author, category, rack: `R${1 + (i % 6)}`, isbn: `97881${String(1000000 + i * 37).slice(0, 7)}` });
    const codes = [1, 2].map((k) => `${prefix}-${String(i * 2 + k).padStart(4, '0')}`);
    await c.api.post(`/library/books/${b.id}/copies`, { barcodes: codes });
    barcodes.push(...codes);
  }
  return barcodes;
}

// --------------------------------------------------------------------------------------------- K-12 school
async function seedSchool(c: Ctx) {
  const T = { slug: 'demo-school', name: 'Aadhyay Demo Public School', segment: 'school' as const, city: 'Meerut', idx: 1 as const, ownerName: 'Ramesh Chandra Agarwal' };
  await step('tenant + owner', () => provision(c, T));

  const roles: Array<[string, string, string]> = [['principal', 'Principal', 'principal'], ['accountant', 'Accountant', 'accountant'], ['transport_manager', 'Transport Manager', 'transport'], ['librarian', 'Librarian', 'librarian'], ['front_office', 'Front Office', 'frontoffice'], ['hr_manager', 'HR Manager', 'hr']];
  const named: Record<string, { id: string; phone: string; name: string }> = {};
  let seq = 1;
  await step('15 non-teaching staff', async () => {
    for (const [key, label, mail] of roles) { const s = await staffMember(c, 1, seq++, [key]); named[key] = s; c.logins.push({ tenant: T.slug, role: label, email: `${mail}@school.${DOMAIN}`, phone: s.phone, name: s.name }); }
    for (let i = 0; i < 3; i++) { const d = await staffMember(c, 1, seq++, ['driver']); named[`driver${i}`] = d; if (i === 0) c.logins.push({ tenant: T.slug, role: 'Driver', email: `driver@school.${DOMAIN}`, phone: d.phone, name: d.name }); }
    for (let i = 0; i < 6; i++) await staffMember(c, 1, seq++, i < 2 ? ['store_keeper'] : ['front_office']);
  });
  const teachers: Array<{ id: string; phone: string; name: string }> = [];
  await step('25 teachers', async () => { for (let i = 0; i < 25; i++) teachers.push(await staffMember(c, 1, 100 + i, ['teacher'])); });
  c.logins.push({ tenant: T.slug, role: 'Teacher', email: `teacher@school.${DOMAIN}`, phone: teachers[0]!.phone, name: teachers[0]!.name });

  const subjectNames = ['English', 'Hindi', 'Mathematics', 'Science', 'Social Studies', 'Computer Science', 'Sanskrit'];
  const subjects = await step('7 subjects', async () => Promise.all(subjectNames.map(async (name, i) => ({ id: (await c.api.post('/academics/subjects', { name, code: name.slice(0, 3).toUpperCase() })).id as string, teacherId: teachers[i]!.id }))));

  const classes: Array<{ id: string; name: string; order: number; sections: Array<{ id: string; name: string }>; students: string[] }> = [];
  await step('12 classes, 14 sections', async () => {
    for (let g = 1; g <= 12; g++) classes.push({ ...(await classWithSections(c, `Class ${g}`, g, g === 9 || g === 10 ? ['A', 'B'] : ['A'])), order: g, students: [] });
  });
  const sections = classes.flatMap((cl) => cl.sections.map((s) => ({ ...s, classIdx: classes.indexOf(cl), students: [] as string[] })));
  // One teacher per (section, subject); the timetable uses the same mapping, so assignments and slots agree.
  const teacherFor = (si: number, k: number) => teachers[(si * subjects.length + k) % teachers.length]!.id;
  await step('subject teachers per section', async () => {
    for (const [si, sec] of sections.entries()) for (const [k, sub] of subjects.entries()) {
      if (classes[sec.classIdx]!.order > 5 || k < 5) await c.api.post('/academics/class-subjects', { classId: classes[sec.classIdx]!.id, sectionId: sec.id, subjectId: sub.id, teacherId: teacherFor(si, k) });
    }
  });

  // 120 families → 250 children: 10 families with three children, 110 with two.
  const families: Array<{ phone: string; guardian: string; kids: Array<{ id: string; name: string; sectionIdx: number }> }> = [];
  await step('250 students, 120 guardians', async () => {
    let kid = 0;
    for (let f = 0; f < 120; f++) {
      const sn = surname(c.r);
      const g = adultName(c.r, sn);
      const fam = { phone: demoPhone(1, 2, f + 1), guardian: g.name, kids: [] as Array<{ id: string; name: string; sectionIdx: number }> };
      const n = f < 10 ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const ch = childName(c.r, sn);
        const sectionIdx = (f * 3 + k * 5) % sections.length;
        const sec = sections[sectionIdx]!;
        const grade = classes[sec.classIdx]!.order;
        const dobYear = new Date().getFullYear() - 5 - grade;
        const studentPhone = grade >= 8 && k === 0 ? demoPhone(1, 3, ++kid) : undefined;
        const st = await c.api.post('/people/students', {
          name: ch.name, gender: ch.gender, dob: `${dobYear}-${String(c.r.int(1, 12)).padStart(2, '0')}-${String(c.r.int(1, 28)).padStart(2, '0')}`,
          sectionId: sec.id, phone: studentPhone, category: c.r.pick(['General', 'General', 'OBC', 'SC', 'EWS']), house: c.r.pick(['Red', 'Blue', 'Green', 'Yellow']),
          address: `${c.r.int(1, 400)}, ${c.r.pick(['Shastri Nagar', 'Pallavpuram', 'Ganga Nagar', 'Saket', 'Jagriti Vihar', 'Modipuram'])}, Meerut`,
          guardians: [{ name: g.name, phone: fam.phone, relation: g.gender === 'male' ? 'father' : 'mother', isPrimary: true }],
        });
        sec.students.push(st.id); classes[sec.classIdx]!.students.push(st.id);
        fam.kids.push({ id: st.id, name: ch.name, sectionIdx });
        if (f === 0 && k === 0 && studentPhone) c.logins.push({ tenant: T.slug, role: 'Student', email: `student@school.${DOMAIN}`, phone: studentPhone, name: ch.name });
      }
      families.push(fam);
    }
  });
  c.logins.push({ tenant: T.slug, role: 'Parent', email: `parent@school.${DOMAIN}`, phone: families[0]!.phone, name: families[0]!.guardian });
  if (!c.logins.some((l) => l.tenant === T.slug && l.role === 'Student')) {
    // The first family's eldest may be below Class 8 (no own login); fall back to the first student with a phone.
    const [s] = await c.db.admin.select().from(user).where(eq(user.phone, demoPhone(1, 3, 1)));
    if (s) c.logins.push({ tenant: T.slug, role: 'Student', email: `student@school.${DOMAIN}`, phone: s.phone!, name: s.name });
  }

  await step('timetable (6 periods × 6 days × 14 sections)', () => timetable(c, sections.map((s) => s.id), subjects, 6, teacherFor));
  await step('attendance, last 10 school days', () => markAttendance(c, sections, 10, 0.05));
  await step('homework', async () => {
    for (const sec of sections) for (let i = 0; i < 3; i++) {
      const sub = subjects[(i * 2 + sec.classIdx) % 5]!;
      await c.api.post('/homework', { sectionId: sec.id, subjectId: sub.id, title: c.r.pick(['Chapter exercise', 'Worksheet', 'Revision questions', 'Project work', 'Reading assignment']) + ` ${i + 1}`, body: 'Complete in your notebook and bring it to class.', dueOn: isoDay(addDays(new Date(), i * 2 - 1)) });
    }
  });
  await step('exams: Half Yearly, marks for 5 subjects, published', () => exams(c, classes, subjects.slice(0, 5).map((s) => s.id), 'Half Yearly'));
  const paid = await step('fees: structures, assignment, collections', () => fees(c, classes, 0.7));
  console.log(`      ${paid} fee receipts`);

  await step('transport: 3 buses, routes, stops, 46 riders', async () => {
    const stopsByRoute = [
      [['Shastri Nagar', 28.9845, 77.7064], ['Begum Bridge', 28.9785, 77.7028], ['Abu Lane', 28.9732, 77.6984], ['School Gate', 28.9701, 77.6902]],
      [['Pallavpuram Phase 2', 29.0412, 77.7051], ['Modipuram', 29.0701, 77.7108], ['Kanker Khera', 29.0190, 77.6810], ['School Gate', 28.9701, 77.6902]],
      [['Ganga Nagar', 28.9988, 77.6577], ['Jagriti Vihar', 28.9930, 77.6642], ['Saket', 28.9852, 77.6812], ['School Gate', 28.9701, 77.6902]],
    ] as const;
    for (let b = 0; b < 3; b++) {
      const v = await c.api.post('/transport/vehicles', { regNo: `UP15AT${4401 + b}`, name: `Bus ${b + 1}`, capacity: 40, driverStaffId: named[`driver${b}`]!.id });
      const rt = await c.api.post('/transport/routes', { name: `Route ${b + 1} — ${stopsByRoute[b]![0]![0]}`, vehicleId: v.id, stops: stopsByRoute[b]!.map(([name, lat, lng], i) => ({ name, lat, lng, order: i + 1, pickupTime: `07:${String(5 + i * 8).padStart(2, '0')}`, feePaise: 150000 })) });
      // Families ride together: siblings share a bus (one tracking link per family per bus).
      for (const fam of families.slice(b * 7, b * 7 + 7)) {
        for (const kid of fam.kids) await c.api.post('/transport/assign', { studentId: kid.id, direction: 'pickup', routeId: rt.id, stopId: rt.stops[c.r.int(0, 2)].id, vehicleId: v.id });
      }
    }
  });
  await step('CRM: 15 admission leads', () => leads(c, 15, 1, classes.map((cl) => cl.name)));
  await step('calendar, notices, website news/events/gallery', async () => {
    await calendar(c);
    await notices(c, [['Winter uniform from 1 November', 'Students should wear the winter uniform from 1 November. Blazers are available at the school store.'], ['PTM on Saturday', 'Parent-teacher meetings will be held on Saturday from 9 am to 12 noon.'], ['Half-yearly results published', 'Report cards are now available in the app.'], ['Bus timings revised', 'Morning pickup will be 10 minutes earlier from Monday because of road work at Begum Bridge.']]);
    await cmsContent(c, 'school');
  });
  await step('library: 30 books, 60 copies, 8 issues', async () => {
    const codes = await library(c, [['Godan', 'Premchand', 'Hindi Literature'], ['Malgudi Days', 'R. K. Narayan', 'Fiction'], ['Wings of Fire', 'A. P. J. Abdul Kalam', 'Biography'], ['The Discovery of India', 'Jawaharlal Nehru', 'History'], ['Panchatantra', 'Vishnu Sharma', 'Children'], ['NCERT Mathematics 10', 'NCERT', 'Textbook'], ['NCERT Science 10', 'NCERT', 'Textbook'], ['Gitanjali', 'Rabindranath Tagore', 'Poetry'], ['The Story of My Experiments with Truth', 'M. K. Gandhi', 'Biography'], ['Ignited Minds', 'A. P. J. Abdul Kalam', 'Non-fiction'],
      ['Rashmirathi', 'Ramdhari Singh Dinkar', 'Hindi Poetry'], ['The Room on the Roof', 'Ruskin Bond', 'Fiction'], ['Train to Pakistan', 'Khushwant Singh', 'Fiction'], ['India After Gandhi', 'Ramachandra Guha', 'History'], ['Concepts of Physics Vol 1', 'H. C. Verma', 'Reference'], ['Concepts of Physics Vol 2', 'H. C. Verma', 'Reference'], ['Word Power Made Easy', 'Norman Lewis', 'Reference'], ['Swami and Friends', 'R. K. Narayan', 'Fiction'], ['Nirmala', 'Premchand', 'Hindi Literature'], ['Tenali Raman Stories', 'Various', 'Children'],
      ['Atlas of India', 'Oxford', 'Reference'], ['Lucent General Knowledge', 'Lucent', 'Reference'], ['The Blue Umbrella', 'Ruskin Bond', 'Children'], ['Akbar Birbal Stories', 'Various', 'Children'], ['Basic Computer Science', 'Sumita Arora', 'Textbook'], ['Python for Class 11', 'Sumita Arora', 'Textbook'], ['Madhushala', 'Harivansh Rai Bachchan', 'Hindi Poetry'], ['Freedom at Midnight', 'Collins & Lapierre', 'History'], ['The Guide', 'R. K. Narayan', 'Fiction'], ['Kabir ke Dohe', 'Kabir', 'Hindi Poetry']]);
    for (let i = 0; i < 8; i++) await c.api.post('/library/issue', { barcode: codes[i * 2]!, memberType: 'student', memberId: families[i]!.kids[0]!.id, days: 14 });
  });
}

// --------------------------------------------------------------------------------------------- College
async function seedCollege(c: Ctx) {
  const T = { slug: 'demo-college', name: 'Aadhyay Demo Institute of Technology', segment: 'college' as const, city: 'Ghaziabad', idx: 2 as const, ownerName: 'Dr. Suresh Kumar Tyagi' };
  await step('tenant + owner', () => provision(c, T));
  const depts = await step('4 departments', async () => {
    const out: Record<string, string> = {};
    for (const d of ['Computer Science & Engineering', 'Electronics & Communication', 'Mechanical Engineering', 'Management Studies']) out[d] = (await c.api.post('/people/departments', { name: d })).id;
    return out;
  });
  const deptIds = Object.values(depts);
  let seq = 1;
  const admin = await staffMember(c, 2, seq++, ['admin']);
  c.logins.push({ tenant: T.slug, role: 'College Admin', email: `admin@college.${DOMAIN}`, phone: admin.phone, name: admin.name });
  const acct = await staffMember(c, 2, seq++, ['accountant']);
  c.logins.push({ tenant: T.slug, role: 'Accountant', email: `accountant@college.${DOMAIN}`, phone: acct.phone, name: acct.name });
  const warden = await staffMember(c, 2, seq++, ['warden']);
  await staffMember(c, 2, seq++, ['librarian']);
  const faculty: Array<{ id: string; phone: string; name: string }> = [];
  await step('16 faculty', async () => { for (let i = 0; i < 16; i++) faculty.push(await staffMember(c, 2, 100 + i, ['teacher'], { departmentId: deptIds[i % deptIds.length] })); });
  c.logins.push({ tenant: T.slug, role: 'Faculty', email: `faculty@college.${DOMAIN}`, phone: faculty[0]!.phone, name: faculty[0]!.name });

  await step('programmes', async () => {
    for (const p of [{ name: 'B.Tech Computer Science & Engineering', code: 'BTCSE', semesters: 8, creditsRequired: 160 }, { name: 'B.Tech Electronics & Communication', code: 'BTECE', semesters: 8, creditsRequired: 160 }, { name: 'Master of Business Administration', code: 'MBA', semesters: 4, creditsRequired: 96 }]) await c.api.post('/college/programmes', p);
  });
  const subjectDefs = [['Data Structures', 'CS201'], ['Discrete Mathematics', 'MA201'], ['Digital Electronics', 'EC201'], ['Object Oriented Programming', 'CS203'], ['Signals & Systems', 'EC203'], ['Principles of Management', 'MB101'], ['Managerial Economics', 'MB103'], ['Engineering Mathematics III', 'MA203']] as const;
  const subjects = await step('8 courses (subjects)', async () => Promise.all(subjectDefs.map(async ([name, code], i) => ({ id: (await c.api.post('/academics/subjects', { name, code })).id as string, teacherId: faculty[i % faculty.length]!.id }))));
  const cohorts = [['B.Tech CSE — Semester 3', 3, [0, 1, 3, 7]], ['B.Tech CSE — Semester 5', 5, [0, 3, 1, 7]], ['B.Tech ECE — Semester 3', 3, [2, 4, 1, 7]], ['MBA — Semester 1', 1, [5, 6]]] as const;
  const classes: Array<{ id: string; name: string; order: number; sem: number; subj: number[]; sections: Array<{ id: string; name: string }>; students: string[] }> = [];
  await step('4 semester cohorts', async () => {
    for (const [i, [name, sem, subj]] of cohorts.entries()) {
      const cl = await classWithSections(c, name, 20 + i, ['A']);
      classes.push({ ...cl, order: 20 + i, sem, subj: [...subj], students: [] });
      for (const si of subj) await c.api.post('/academics/class-subjects', { classId: cl.id, subjectId: subjects[si]!.id, teacherId: subjects[si]!.teacherId });
    }
  });
  await step('120 students with guardians and logins', async () => {
    for (let i = 0; i < 120; i++) {
      const sn = surname(c.r);
      const ch = childName(c.r, sn);
      const g = adultName(c.r, sn);
      const cl = classes[i % classes.length]!;
      const phone = demoPhone(2, 3, i + 1);
      const st = await c.api.post('/people/students', { name: ch.name, gender: ch.gender, dob: `${new Date().getFullYear() - 19 - (cl.sem > 4 ? 1 : 0)}-0${c.r.int(1, 9)}-1${c.r.int(0, 8)}`, sectionId: cl.sections[0]!.id, phone, category: c.r.pick(['General', 'OBC', 'SC', 'EWS']), guardians: [{ name: g.name, phone: demoPhone(2, 2, i + 1), relation: g.gender === 'male' ? 'father' : 'mother', isPrimary: true }] });
      cl.students.push(st.id);
      if (i === 0) c.logins.push({ tenant: T.slug, role: 'Student', email: `student@college.${DOMAIN}`, phone, name: ch.name });
    }
  });
  await step('credit results for completed semesters (SGPA/CGPA)', async () => {
    for (const cl of classes.filter((x) => x.sem > 1)) {
      for (const studentId of cl.students) {
        for (let sem = 1; sem < cl.sem; sem++) {
          for (const si of cl.subj) {
            const gp = Math.max(4, Math.min(10, Math.round((7.2 + (c.r.next() - 0.5) * 5) * 2) / 2));
            await c.api.post('/college/credit-results', { studentId, semester: sem, subjectId: subjects[si]!.id, credits: si === 7 ? 3 : 4, gradePoint: gp, isBacklog: gp < 5 });
          }
        }
      }
    }
  });
  await step('timetable', () => timetable(c, classes.map((x) => x.sections[0]!.id), subjects, 5));
  await step('attendance, last 10 days', () => markAttendance(c, classes.map((x) => ({ id: x.sections[0]!.id, students: x.students })), 10, 0.12));
  await step('mid-semester exams, published', async () => {
    const g = await c.api.post('/exams/groups', { name: 'Mid Semester' });
    const e = await c.api.post('/exams/exams', { groupId: g.id, name: 'Mid Semester Examination' });
    for (const cl of classes) for (const si of cl.subj) {
      const sch = await c.api.post('/exams/schedules', { examId: e.id, classId: cl.id, subjectId: subjects[si]!.id, maxMarks: 50, passMarks: 20 });
      await c.api.post('/exams/marks', { scheduleId: sch.id, entries: cl.students.map((studentId) => ({ studentId, marks: Math.max(12, Math.min(50, Math.round(32 + (c.r.next() - 0.5) * 30))) })) });
    }
    await c.api.post(`/exams/${e.id}/compute`);
    await c.api.post(`/exams/${e.id}/publish`);
  });
  await step('semester fees', async () => {
    const head = await c.api.post('/fees/heads', { name: 'Semester Tuition' });
    const y = new Date().getFullYear();
    for (const cl of classes) {
      const amt = cl.name.startsWith('MBA') ? 6500000 : 5500000;
      const st = await c.api.post('/fees/structures', { name: `${cl.name} fees`, classId: cl.id, items: [{ headId: head.id, amountPaise: amt, installmentNo: 1, dueOn: `${y}-08-01` }] });
      await c.api.post('/fees/assign', { structureId: st.id });
      for (const studentId of cl.students) if (c.r.chance(0.8)) await c.api.post('/fees/collect', { studentId, mode: c.r.pick(['upi', 'card', 'cheque']), amountPaise: c.r.chance(0.85) ? amt : Math.round(amt / 2) });
    }
  });
  await step('placements, hostel, library, notices, website', async () => {
    for (const [company, role, lpa] of [['Infosys', 'Systems Engineer', 4.5], ['TCS Digital', 'Developer', 7], ['HCLTech', 'Graduate Engineer Trainee', 4.25], ['Paytm', 'Software Engineer', 12]] as const) {
      await c.api.post('/college/placements', { company, role, ctcPaise: Math.round(lpa * 100000 * 100), eligibility: { minCgpa: 6.5, programmes: ['BTCSE', 'BTECE'] }, date: addDays(new Date(), c.r.int(7, 60)).toISOString() });
    }
    for (const [name, kind] of [['Aryabhata Boys Hostel', 'boys'], ['Gargi Girls Hostel', 'girls']] as const) {
      const h = await c.api.post('/hostel/hostels', { name, kind, wardenStaffId: warden.id });
      for (let r = 1; r <= 10; r++) await c.api.post('/hostel/rooms', { hostelId: h.id, number: `${kind === 'boys' ? 'B' : 'G'}-${100 + r}`, roomType: r <= 6 ? 'triple' : 'double', beds: r <= 6 ? 3 : 2, feePaise: r <= 6 ? 4500000 : 6000000 });
    }
    await library(c, [['Introduction to Algorithms', 'Cormen, Leiserson, Rivest, Stein', 'Computer Science'], ['Operating System Concepts', 'Silberschatz', 'Computer Science'], ['Digital Design', 'M. Morris Mano', 'Electronics'], ['Signals and Systems', 'Oppenheim', 'Electronics'], ['Engineering Mathematics', 'B. S. Grewal', 'Mathematics'], ['Principles of Marketing', 'Philip Kotler', 'Management'], ['Database System Concepts', 'Korth', 'Computer Science'], ['Computer Networks', 'Andrew Tanenbaum', 'Computer Science']]);
    await notices(c, [['Mid-semester results published', 'Results are available on the portal and app.'], ['Campus placement drive: Infosys', 'Eligible final-year students should register by Friday.'], ['Hostel fee due', 'Hostel fee for the semester is due by the 10th.']]);
    await calendar(c);
    await cmsContent(c, 'campus');
  });
  await step('CRM: 20 admission enquiries', () => leads(c, 20, 2, ['B.Tech CSE', 'B.Tech ECE', 'MBA']));
}

// --------------------------------------------------------------------------------------------- Coaching
async function seedCoaching(c: Ctx) {
  const T = { slug: 'demo-coaching', name: 'Aadhyay Demo Academy', segment: 'coaching' as const, city: 'Noida', idx: 3 as const, ownerName: 'Vikram Malhotra' };
  await step('tenant + owner', () => provision(c, T));
  let seq = 1;
  const admin = await staffMember(c, 3, seq++, ['admin']);
  c.logins.push({ tenant: T.slug, role: 'Coaching Admin', email: `admin@coaching.${DOMAIN}`, phone: admin.phone, name: admin.name });
  const counsellor = await staffMember(c, 3, seq++, ['front_office']);
  c.logins.push({ tenant: T.slug, role: 'Counsellor', email: `counsellor@coaching.${DOMAIN}`, phone: counsellor.phone, name: counsellor.name });
  const instructors: Array<{ id: string; phone: string; name: string }> = [];
  await step('6 instructors', async () => { for (let i = 0; i < 6; i++) instructors.push(await staffMember(c, 3, 100 + i, ['teacher'])); });
  c.logins.push({ tenant: T.slug, role: 'Instructor', email: `instructor@coaching.${DOMAIN}`, phone: instructors[0]!.phone, name: instructors[0]!.name });

  const batches = await step('4 batches', async () => {
    const out: string[] = [];
    const y = new Date().getFullYear();
    for (const [name, code, course, fee] of [['JEE 2027 — Morning', 'JEE27M', 'JEE Main + Advanced', 14000000], ['JEE 2027 — Evening', 'JEE27E', 'JEE Main + Advanced', 14000000], ['NEET 2027', 'NEET27', 'NEET UG', 12500000], ['Foundation Class 9-10', 'FND10', 'Foundation', 6000000]] as const) {
      out.push((await c.api.post('/coaching/batches', { name, code, courseName: course, centre: 'Sector 62, Noida', startsOn: `${y}-04-15`, endsOn: `${y + 1}-03-31`, feePaise: fee, capacity: 60 })).id);
    }
    return out;
  });
  const learners: string[] = [];
  await step('80 learners in batches', async () => {
    const cohort = await classWithSections(c, 'Learners', 1, ['A']);
    for (let i = 0; i < 80; i++) {
      const sn = surname(c.r);
      const ch = childName(c.r, sn);
      const g = adultName(c.r, sn);
      const phone = demoPhone(3, 3, i + 1);
      const st = await c.api.post('/people/students', { name: ch.name, gender: ch.gender, sectionId: cohort.sections[0]!.id, phone, guardians: [{ name: g.name, phone: demoPhone(3, 2, i + 1), relation: g.gender === 'male' ? 'father' : 'mother', isPrimary: true }] });
      learners.push(st.id);
      if (i === 0) c.logins.push({ tenant: T.slug, role: 'Learner', email: `learner@coaching.${DOMAIN}`, phone, name: ch.name });
    }
    for (const [b, id] of batches.entries()) await c.api.post(`/coaching/batches/${id}/students`, { studentIds: learners.slice(b * 20, b * 20 + 20) });
  });
  await step('3 LMS courses with modules and lessons', async () => {
    for (const [title, slug, price, mods] of [['Physics for JEE: Mechanics', 'jee-physics-mechanics', 499900, ['Kinematics', 'Laws of Motion', 'Work, Energy & Power']], ['NEET Biology: Human Physiology', 'neet-biology-physiology', 399900, ['Digestion', 'Circulation', 'Neural Control']], ['Foundation Mathematics', 'foundation-maths', 0, ['Number Systems', 'Polynomials', 'Linear Equations']]] as const) {
      const course = await c.api.post('/lms/courses', { title, slug, description: `${title} — recorded lessons, notes and practice tests.`, pricePaise: price, isPublished: true });
      for (const [mi, m] of mods.entries()) {
        const mod = await c.api.post('/lms/modules', { courseId: course.id, title: m, order: mi + 1 });
        await c.api.post('/lms/contents', { moduleId: mod.id, kind: 'html', title: `${m}: concepts`, body: `<h2>${m}</h2><p>Key ideas, solved examples and common mistakes.</p>`, order: 1 });
        await c.api.post('/lms/contents', { moduleId: mod.id, kind: 'link', title: `${m}: lecture video`, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', order: 2 });
      }
    }
  });
  await step('question bank + scheduled online test', async () => {
    const bank = await c.api.post('/online-tests/banks', { name: 'JEE Physics' });
    const qs: string[] = [];
    const items: Array<[string, Array<[string, string]>, string]> = [
      ['A body starts from rest with acceleration 2 m/s². Distance in 5 s?', [['A', '25 m'], ['B', '10 m'], ['C', '50 m'], ['D', '20 m']], 'A'],
      ['SI unit of impulse is', [['A', 'N'], ['B', 'N·s'], ['C', 'J'], ['D', 'W']], 'B'],
      ['Work done by a centripetal force over one revolution is', [['A', 'positive'], ['B', 'negative'], ['C', 'zero'], ['D', 'depends on speed']], 'C'],
      ['Dimension of power is', [['A', 'ML²T⁻³'], ['B', 'MLT⁻²'], ['C', 'ML²T⁻²'], ['D', 'MLT⁻³']], 'A'],
    ];
    for (const [text, options, answer] of items) qs.push((await c.api.post('/online-tests/questions', { bankId: bank.id, type: 'mcq', body: { text }, options: options.map(([id, t]) => ({ id, text: t })), answer, marks: 4, negative: 1 })).id);
    qs.push((await c.api.post('/online-tests/questions', { bankId: bank.id, type: 'numeric', body: { text: 'A ball is dropped from 20 m (g = 10 m/s²). Time to reach the ground in seconds?' }, answer: { value: 2 }, marks: 4 })).id);
    const start = addDays(new Date(), 2);
    await c.api.post('/online-tests/tests', { title: 'Weekly Test — Mechanics', audience: { batchIds: batches.slice(0, 2) }, questionIds: qs, durationMin: 30, startsAt: start.toISOString(), endsAt: addDays(start, 1).toISOString(), publishedAt: new Date().toISOString() });
  });
  await step('coupons, leads, notices, website', async () => {
    await c.api.post('/coaching/coupons', { code: 'EARLY20', percent: 20, maxUses: 100 });
    await leads(c, 25, 3, ['JEE 2027', 'NEET 2027', 'Foundation']);
    await notices(c, [['Weekly test on Sunday', 'Mechanics weekly test opens Sunday 10 am in the app.'], ['Doubt-clearing sessions', 'Extra doubt sessions every Wednesday 5–7 pm.']]);
    await cmsContent(c, 'academy');
  });
}

async function applyLogins(c: Ctx) {
  const hash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  for (const l of c.logins) {
    // Email is unique per user; clear it from anyone else first so re-runs stay consistent.
    await c.db.admin.update(user).set({ email: null }).where(eq(user.email, l.email));
    await c.db.admin.update(user).set({ email: l.email, passwordHash: hash, name: l.name }).where(eq(user.phone, l.phone));
  }
  const email = `platform@${DOMAIN}`;
  const [p] = await c.db.admin.select().from(platformUser).where(eq(platformUser.email, email));
  if (p) await c.db.admin.update(platformUser).set({ passwordHash: hash, isActive: true }).where(eq(platformUser.id, p.id));
  else await c.db.admin.insert(platformUser).values({ email, name: 'Demo Platform Admin', role: 'super_admin', passwordHash: hash });
}

/** Recover the logins of tenants seeded on a previous run (from their deterministic phones). */
async function knownLogins(c: Ctx, slug: string, idx: 1 | 2 | 3) {
  const segment = slug.replace('demo-', '');
  const rows = await c.db.admin.select({ phone: user.phone, email: user.email, name: user.name }).from(user).where(inArray(user.phone, [demoPhone(idx, 0, 1)]));
  for (const r of rows) c.logins.push({ tenant: slug, role: 'Owner / Director', email: r.email ?? `owner@${segment}.${DOMAIN}`, phone: r.phone!, name: r.name });
  const rest = await c.db.admin.select({ phone: user.phone, email: user.email, name: user.name }).from(user);
  for (const r of rest) if (r.email?.endsWith(`@${segment}.${DOMAIN}`) && !r.email.startsWith('owner@')) c.logins.push({ tenant: slug, role: r.email.split('@')[0]!, email: r.email, phone: r.phone!, name: r.name });
}

async function main() {
  const t0 = Date.now();
  const app = await createApp({ logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const c: Ctx = { app, api: new Api(app), db: app.get(DbService), auth: app.get(AuthService), r: rng(20261008), logins: [] };
  const plan = [['demo-school', 1, seedSchool], ['demo-college', 2, seedCollege], ['demo-coaching', 3, seedCoaching]] as const;
  try {
    for (const [slug, idx, fn] of plan) {
      c.r = rng(1000 + idx); // independent stream per tenant, so tenants are reproducible on their own
      const [exists] = await c.db.admin.select({ id: tenant.id }).from(tenant).where(eq(tenant.slug, slug));
      if (exists) { console.log(`• ${slug}: already present — skipped`); await knownLogins(c, slug, idx); continue; }
      console.log(`• ${slug}`);
      await fn(c);
    }
    await step('demo logins', () => applyLogins(c));
    await step('process queued events (alerts, inbox, search)', () => app.get(EventsService).drainAll(200));
  } finally {
    await app.close();
  }
  console.log(`\nDemo data ready in ${((Date.now() - t0) / 1000).toFixed(0)}s. Password for every demo account: ${DEMO_PASSWORD}  (local only)\n`);
  console.log('Control plane  http://localhost:3000/control/login   platform@demo.aadhyay.local');
  const seen = new Set<string>();
  for (const l of c.logins) {
    if (seen.has(l.email)) continue;
    seen.add(l.email);
    console.log(`${l.tenant.padEnd(14)} ${l.role.padEnd(18)} ${l.email.padEnd(40)} ${l.phone}  ${l.name}`);
  }
  console.log('\nTenant console: http://localhost:3000/app/login  (password login with the email, or OTP with the phone)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
