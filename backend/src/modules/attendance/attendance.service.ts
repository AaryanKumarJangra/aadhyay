import { Injectable } from '@nestjs/common';
import { and, asc, between, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { attendanceRecord, enrollment, student, staff, leaveRequest, calendarEvent, section } from '../../db/schema';
import { Ctx } from '../../kernel/context/request-context';
import { EventsService } from '../../kernel/events/events.service';
import { currentSession } from '../academics/session.util';
import { assertSectionAccess } from '../academics/section-access';
import { Authz } from '../../kernel/authz/authz';
import { studentRef, currentSectionOf } from '../../kernel/authz/refs';
import { ZERO_UUID } from '../../common/ids';
import { badRequest, notFound, forbidden } from '../../common/errors';
import { todayIn, addDays } from '../../common/dates';

type Status = 'present' | 'absent' | 'late' | 'half_day' | 'leave' | 'holiday';

@Injectable()
export class AttendanceService {
  constructor(private readonly db: DbService, private readonly events: EventsService) {}

  async isHoliday(date: string) {
    const [h] = await this.db.t((tx) => tx.select({ id: calendarEvent.id, title: calendarEvent.title }).from(calendarEvent)
      .where(and(inArray(calendarEvent.kind, ['holiday', 'vacation']), lte(calendarEvent.startsOn, date), gte(calendarEvent.endsOn, date))).limit(1));
    return h ?? null;
  }

  /** Teacher marks a class: only exceptions are sent; everyone else gets defaultStatus ("all present" by default). */
  async markSection(b: { sectionId: string; date: string; periodId?: string; defaultStatus: Status; entries: { studentId: string; status: Status; remarks?: string }[]; sourceTs?: string }, force = false) {
    if (b.date > todayIn(Ctx.get().tenantTz)) throw badRequest('Cannot mark attendance for a future date');
    const hol = await this.isHoliday(b.date);
    if (hol && !force) throw badRequest(`${b.date} is a holiday (${hol.title}). Pass force=true to mark anyway.`);
    const today = todayIn(Ctx.get().tenantTz);
    const result = await this.db.t(async (tx) => {
      const [already] = await tx.select({ id: attendanceRecord.id }).from(attendanceRecord)
        .where(and(eq(attendanceRecord.subjectType, 'student'), eq(attendanceRecord.sectionId, b.sectionId), eq(attendanceRecord.date, b.date), eq(attendanceRecord.periodId, b.periodId ?? ZERO_UUID))).limit(1);
      // A fresh register for today is "marking"; changing marks or back-dating is "editing" (teachers: same day only).
      if (already || b.date !== today) await assertSectionAccess(tx, b.sectionId, 'attendance.student.edit', { date: b.date, today });
      else await assertSectionAccess(tx, b.sectionId, 'attendance.student.create');
      const sess = await currentSession(tx);
      const roster = await tx.select({ studentId: enrollment.studentId }).from(enrollment).where(and(eq(enrollment.sectionId, b.sectionId), eq(enrollment.sessionId, sess.id), eq(enrollment.status, 'active')));
      const approvedLeave = await tx.select({ subjectId: leaveRequest.subjectId }).from(leaveRequest)
        .where(and(eq(leaveRequest.subjectType, 'student'), eq(leaveRequest.status, 'approved'), lte(leaveRequest.fromDate, b.date), gte(leaveRequest.toDate, b.date)));
      const onLeave = new Set(approvedLeave.map((l) => l.subjectId));
      const ex = new Map(b.entries.map((e) => [e.studentId, e]));
      const rosterIds = new Set(roster.map((r) => r.studentId));
      for (const e of b.entries) if (!rosterIds.has(e.studentId)) throw badRequest('Student not in this section');
      const periodId = b.periodId ?? ZERO_UUID;
      const prev = await tx.select({ subjectId: attendanceRecord.subjectId, status: attendanceRecord.status }).from(attendanceRecord)
        .where(and(eq(attendanceRecord.subjectType, 'student'), eq(attendanceRecord.date, b.date), eq(attendanceRecord.periodId, periodId), inArray(attendanceRecord.subjectId, [...rosterIds])));
      const prevMap = new Map(prev.map((p) => [p.subjectId, p.status]));
      const rows = roster.map((r) => {
        const e = ex.get(r.studentId);
        const status: Status = e?.status ?? (onLeave.has(r.studentId) ? 'leave' : b.defaultStatus);
        return { tenantId: Ctx.tenantId(), subjectType: 'student' as const, subjectId: r.studentId, sectionId: b.sectionId, date: b.date, periodId, status, mode: 'manual' as const, markedBy: Ctx.userId(), remarks: e?.remarks, sourceTs: b.sourceTs ? new Date(b.sourceTs) : null };
      });
      if (rows.length) {
        await tx.insert(attendanceRecord).values(rows).onConflictDoUpdate({
          target: [attendanceRecord.tenantId, attendanceRecord.subjectType, attendanceRecord.subjectId, attendanceRecord.date, attendanceRecord.periodId],
          set: { status: sql`excluded.status`, remarks: sql`excluded.remarks`, markedBy: sql`excluded.marked_by`, mode: sql`case when ${attendanceRecord.mode} = 'manual' then excluded.mode else ${attendanceRecord.mode} end` },
        });
      }
      // Notify only on change to absent/late (re-marking doesn't spam parents). Day-wise only.
      if (periodId === ZERO_UUID) {
        for (const r of rows) {
          if ((r.status === 'absent' || r.status === 'late') && prevMap.get(r.subjectId) !== r.status) {
            await this.events.emit(r.status === 'absent' ? 'attendance.absent' : 'attendance.late', { studentId: r.subjectId, sectionId: b.sectionId, date: b.date });
          }
        }
      }
      const summary = rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {} as Record<string, number>);
      await this.events.emit('attendance.marked', { sectionId: b.sectionId, date: b.date, summary });
      return { total: rows.length, summary };
    });
    return result;
  }

  async register(sectionId: string, date: string, periodId?: string) {
    return this.db.t(async (tx) => {
      await assertSectionAccess(tx, sectionId, 'attendance.student.view');
      const sess = await currentSession(tx);
      const rows = await tx.select({ studentId: student.id, name: student.name, admissionNo: student.admissionNo, rollNo: enrollment.rollNo, photoFileId: student.photoFileId, status: attendanceRecord.status, mode: attendanceRecord.mode, inAt: attendanceRecord.inAt, remarks: attendanceRecord.remarks })
        .from(enrollment).innerJoin(student, eq(student.id, enrollment.studentId))
        .leftJoin(attendanceRecord, and(eq(attendanceRecord.subjectType, 'student'), eq(attendanceRecord.subjectId, student.id), eq(attendanceRecord.date, date), eq(attendanceRecord.periodId, periodId ?? ZERO_UUID)))
        .where(and(eq(enrollment.sectionId, sectionId), eq(enrollment.sessionId, sess.id), eq(enrollment.status, 'active')))
        .orderBy(sql`${enrollment.rollNo}::int nulls last`, asc(student.name));
      return { date, sectionId, marked: rows.some((r) => r.status), holiday: await this.isHoliday(date), students: rows };
    });
  }

  /** Month matrix for a section: per student per day status + %. */
  async monthly(sectionId: string, month: string) {
    const from = `${month}-01`;
    const to = addDays(addDays(from, 32).slice(0, 8) + '01', -1);
    return this.db.t(async (tx) => {
      await assertSectionAccess(tx, sectionId, 'attendance.student.view');
      const sess = await currentSession(tx);
      const studs = await tx.select({ id: student.id, name: student.name, rollNo: enrollment.rollNo }).from(enrollment).innerJoin(student, eq(student.id, enrollment.studentId)).where(and(eq(enrollment.sectionId, sectionId), eq(enrollment.sessionId, sess.id)));
      const recs = await tx.select({ subjectId: attendanceRecord.subjectId, date: attendanceRecord.date, status: attendanceRecord.status }).from(attendanceRecord)
        .where(and(eq(attendanceRecord.subjectType, 'student'), eq(attendanceRecord.periodId, ZERO_UUID), between(attendanceRecord.date, from, to), inArray(attendanceRecord.subjectId, studs.map((s) => s.id).concat(ZERO_UUID))));
      return studs.map((s) => {
        const mine = recs.filter((r) => r.subjectId === s.id);
        const working = mine.filter((r) => r.status !== 'holiday').length;
        const present = mine.filter((r) => ['present', 'late', 'half_day'].includes(r.status)).length;
        return { ...s, days: Object.fromEntries(mine.map((r) => [r.date, r.status])), working, present, pct: working ? Math.round((present / working) * 1000) / 10 : null };
      });
    });
  }

  async studentHistory(studentId: string, from: string, to: string) {
    return this.db.t((tx) => tx.select({ date: attendanceRecord.date, status: attendanceRecord.status, mode: attendanceRecord.mode, inAt: attendanceRecord.inAt, outAt: attendanceRecord.outAt })
      .from(attendanceRecord).where(and(eq(attendanceRecord.subjectType, 'student'), eq(attendanceRecord.subjectId, studentId), eq(attendanceRecord.periodId, ZERO_UUID), between(attendanceRecord.date, from, to))).orderBy(asc(attendanceRecord.date)));
  }

  async markStaff(b: { date: string; entries: { staffId: string; status: Status; inAt?: string; outAt?: string }[] }) {
    return this.db.t(async (tx) => {
      const rows = b.entries.map((e) => ({ tenantId: Ctx.tenantId(), subjectType: 'staff' as const, subjectId: e.staffId, date: b.date, status: e.status, mode: 'manual' as const, markedBy: Ctx.userId(), inAt: e.inAt ? new Date(e.inAt) : null, outAt: e.outAt ? new Date(e.outAt) : null }));
      if (rows.length) await tx.insert(attendanceRecord).values(rows).onConflictDoUpdate({ target: [attendanceRecord.tenantId, attendanceRecord.subjectType, attendanceRecord.subjectId, attendanceRecord.date, attendanceRecord.periodId], set: { status: sql`excluded.status`, inAt: sql`excluded.in_at`, outAt: sql`excluded.out_at` } });
      return { total: rows.length };
    });
  }

  /**
   * Device ingestion (QR scanner, RFID reader, face terminal, gate app). Offline queues send device timestamps;
   * duplicate taps are merged (first IN wins, last OUT wins). Arrival sends a free in-app "reached school" alert.
   */
  async devicePunch(device: { id: string; kind: string }, punches: { code: string; at: string; direction: 'in' | 'out' }[]) {
    const tz = Ctx.get().tenantTz ?? 'Asia/Kolkata';
    const mode = device.kind === 'rfid' ? 'rfid' : device.kind === 'face' ? 'face' : device.kind === 'biometric' ? 'biometric' : 'qr';
    return this.db.t(async (tx) => {
      const codes = [...new Set(punches.map((p) => p.code))];
      const studs = await tx.select({ id: student.id, qr: student.qrCode, rfid: student.rfidUid }).from(student).where(sql`${student.qrCode} = any(${sql.param(codes)}::text[]) or ${student.rfidUid} = any(${sql.param(codes)}::text[])`);
      const staffs = await tx.select({ id: staff.id, rfid: staff.rfidUid }).from(staff).where(sql`${staff.rfidUid} = any(${sql.param(codes)}::text[])`);
      const sess = await currentSession(tx);
      let accepted = 0;
      const unknown: string[] = [];
      for (const p of punches) {
        const s = studs.find((x) => x.qr === p.code || x.rfid === p.code);
        const st = s ? null : staffs.find((x) => x.rfid === p.code);
        if (!s && !st) { unknown.push(p.code); continue; }
        const at = new Date(p.at);
        const date = todayIn(tz, at);
        const subjectType = s ? 'student' as const : 'staff' as const;
        const subjectId = (s ?? st)!.id;
        const [enr] = s ? await tx.select({ sectionId: enrollment.sectionId }).from(enrollment).where(and(eq(enrollment.studentId, s.id), eq(enrollment.sessionId, sess.id))).limit(1) : [undefined];
        const [existing] = await tx.select().from(attendanceRecord).where(and(eq(attendanceRecord.subjectType, subjectType), eq(attendanceRecord.subjectId, subjectId), eq(attendanceRecord.date, date), eq(attendanceRecord.periodId, ZERO_UUID))).limit(1);
        if (p.direction === 'in') {
          if (existing?.inAt) { accepted++; continue; } // duplicate tap
          if (existing) await tx.update(attendanceRecord).set({ inAt: at, status: existing.status === 'absent' ? 'late' : existing.status, mode, deviceId: device.id, sourceTs: at }).where(eq(attendanceRecord.id, existing.id));
          else await tx.insert(attendanceRecord).values({ tenantId: Ctx.tenantId(), subjectType, subjectId, sectionId: enr?.sectionId, date, status: 'present', mode, deviceId: device.id, inAt: at, sourceTs: at });
          if (s) await this.events.emit('attendance.marked', { studentId: s.id, date, arrival: true, at: at.toISOString(), mode });
        } else {
          if (existing) await tx.update(attendanceRecord).set({ outAt: at }).where(eq(attendanceRecord.id, existing.id));
        }
        accepted++;
      }
      return { accepted, unknown };
    });
  }

  /** Cut-off job: students with no entry by the cut-off are marked absent and parents alerted (devices mode). */
  async autoAbsent(date: string) {
    return this.db.t(async (tx) => {
      const sess = await currentSession(tx);
      if (await this.isHoliday(date)) return { marked: 0 };
      const missing = await tx.execute(sql`select e.student_id, e.section_id from enrollments e where e.session_id = ${sess.id} and e.status = 'active'
        and not exists (select 1 from attendance_records a where a.subject_type = 'student' and a.subject_id = e.student_id and a.date = ${date} and a.period_id = ${ZERO_UUID}::uuid)`);
      for (const r of missing.rows as any[]) {
        await tx.insert(attendanceRecord).values({ tenantId: Ctx.tenantId(), subjectType: 'student', subjectId: r.student_id, sectionId: r.section_id, date, status: 'absent', mode: 'manual', remarks: 'Auto: no entry by cut-off' }).onConflictDoNothing();
        await this.events.emit('attendance.absent', { studentId: r.student_id, sectionId: r.section_id, date, auto: true });
      }
      return { marked: missing.rows.length };
    });
  }

  /** Sections the user may view or mark, with today's register status (attendance home). */
  async mySections(date: string) {
    const view = Authz.filter('attendance.student.view');
    const mark = Authz.filter('attendance.student.create');
    const ids = (f: typeof view) => (f.kind === 'all' ? null : f.kind === 'some' ? [...new Set([...f.sectionIds, ...f.subjectSections.map((x) => x.sectionId)])] : []);
    const viewIds = ids(view), markIds = ids(mark);
    if (viewIds !== null && !viewIds.length && markIds !== null && !markIds.length) return [];
    const scope = viewIds === null || markIds === null ? sql`` : sql`and s.id = any(${sql.param([...new Set([...viewIds, ...markIds])])}::uuid[])`;
    const rows = await this.db.t((tx) => tx.execute(sql`
      select s.id, c.name as class_name, s.name as section_name, c."order",
        (select count(*) from enrollments e join academic_sessions ss on ss.id = e.session_id and ss.is_current where e.section_id = s.id and e.status = 'active')::int as strength,
        (select count(*) from attendance_records a where a.section_id = s.id and a.subject_type = 'student' and a.period_id = ${ZERO_UUID}::uuid and a.date = ${date})::int as marked,
        (select count(*) from attendance_records a where a.section_id = s.id and a.subject_type = 'student' and a.period_id = ${ZERO_UUID}::uuid and a.date = ${date} and a.status in ('present','late','half_day'))::int as present,
        (select count(*) from attendance_records a where a.section_id = s.id and a.subject_type = 'student' and a.period_id = ${ZERO_UUID}::uuid and a.date = ${date} and a.status = 'absent')::int as absent
      from sections s join classes c on c.id = s.class_id where true ${scope} order by c."order", s.name`));
    return (rows.rows as any[]).map((r) => ({
      id: r.id, name: `${r.class_name}-${r.section_name}`, strength: r.strength, marked: r.marked > 0, present: r.present, absent: r.absent,
      canMark: markIds === null || markIds.includes(r.id),
    }));
  }

  // ---------------- Leave ----------------
  async applyLeave(b: { studentId?: string; staffId?: string; fromDate: string; toDate: string; reason: string; leaveTypeId?: string }) {
    const c = Ctx.get();
    if (b.toDate < b.fromDate) throw badRequest('toDate before fromDate');
    const subjectType = b.studentId ? 'student' : 'staff';
    const subjectId = b.studentId ?? b.staffId ?? c.personIds?.staff;
    if (!subjectId) throw badRequest('studentId or staffId required');
    const [r] = await this.db.t((tx) => tx.insert(leaveRequest).values({ tenantId: Ctx.tenantId(), subjectType, subjectId, appliedBy: c.userId!, fromDate: b.fromDate, toDate: b.toDate, reason: b.reason, leaveTypeId: b.leaveTypeId }).returning());
    await this.events.emit('leave.requested', { leaveId: r!.id, subjectType, subjectId });
    return r;
  }

  async decideLeave(id: string, status: 'approved' | 'rejected') {
    return this.db.t(async (tx) => {
      const [cur] = await tx.select().from(leaveRequest).where(eq(leaveRequest.id, id));
      if (!cur) throw notFound('Pending leave');
      Authz.assert('attendance.leave.approve', cur.subjectType === 'student' ? await studentRef(tx, cur.subjectId) : { staffId: cur.subjectId });
      const [r] = await tx.update(leaveRequest).set({ status, decidedBy: Ctx.userId(), decidedAt: new Date() }).where(and(eq(leaveRequest.id, id), eq(leaveRequest.status, 'pending'))).returning();
      if (!r) throw notFound('Pending leave');
      if (status === 'approved') {
        for (let d = r.fromDate; d <= r.toDate; d = addDays(d, 1)) {
          await tx.insert(attendanceRecord).values({ tenantId: Ctx.tenantId(), subjectType: r.subjectType, subjectId: r.subjectId, date: d, status: 'leave', mode: 'manual', remarks: 'Approved leave' })
            .onConflictDoUpdate({ target: [attendanceRecord.tenantId, attendanceRecord.subjectType, attendanceRecord.subjectId, attendanceRecord.date, attendanceRecord.periodId], set: { status: 'leave' } });
        }
      }
      await this.events.emit('leave.decided', { leaveId: r.id, status, subjectType: r.subjectType, subjectId: r.subjectId, appliedBy: r.appliedBy, studentId: r.subjectType === 'student' ? r.subjectId : null });
      return r;
    });
  }

  /** Leave requests the user may see: institution-wide, students of covered sections, and their own applications. */
  async leaves(status?: string) {
    const c = Ctx.get();
    const view = Authz.where('attendance.leave.view', { section: sql`case when ${leaveRequest.subjectType} = 'student' then ${currentSectionOf(leaveRequest.subjectId)} end`, student: leaveRequest.subjectId });
    const approve = Authz.where('attendance.leave.approve', { section: sql`case when ${leaveRequest.subjectType} = 'student' then ${currentSectionOf(leaveRequest.subjectId)} end` });
    const scope = view === undefined || approve === undefined ? undefined : or(view, approve, eq(leaveRequest.appliedBy, c.userId!));
    return this.db.t((tx) => tx.select({
      id: leaveRequest.id, subjectType: leaveRequest.subjectType, subjectId: leaveRequest.subjectId, fromDate: leaveRequest.fromDate, toDate: leaveRequest.toDate,
      reason: leaveRequest.reason, status: leaveRequest.status, decidedAt: leaveRequest.decidedAt, createdAt: leaveRequest.createdAt,
      subjectName: sql<string>`coalesce((select name from students where id = ${leaveRequest.subjectId}), (select name from staff where id = ${leaveRequest.subjectId}))`,
      className: sql<string | null>`case when ${leaveRequest.subjectType} = 'student' then (select c.name || '-' || se.name from sections se join classes c on c.id = se.class_id where se.id = ${currentSectionOf(leaveRequest.subjectId)}) end`,
      appliedByName: sql<string | null>`(select name from users where id::text = ${leaveRequest.appliedBy}::text)`,
    }).from(leaveRequest).where(and(status ? eq(leaveRequest.status, status as any) : undefined, scope)).orderBy(sql`${leaveRequest.id} desc`).limit(200));
  }
}
