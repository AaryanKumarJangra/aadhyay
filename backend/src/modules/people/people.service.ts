import { Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { DbService, Tx } from '../../db/db.service';
import { student, guardian, studentGuardian, enrollment, section, schoolClass, staff, studentFee, attendanceRecord, studentTransport, department, designation } from '../../db/schema';
import { Ctx } from '../../kernel/context/request-context';
import { EventsService } from '../../kernel/events/events.service';
import { MembersService } from '../org/members.service';
import { nextNumber } from '../../common/numbering';
import { ZERO_UUID } from '../../common/ids';
import { currentSession } from '../academics/session.util';
import { badRequest, notFound } from '../../common/errors';
import { phoneIN, type PermissionKey } from '@aadhyay/contracts';
import { Authz } from '../../kernel/authz/authz';
import { studentRef } from '../../kernel/authz/refs';

type GuardianIn = { name: string; phone: string; email?: string; relation: string; occupation?: string; isPrimary: boolean; receivesNotifications: boolean };

@Injectable()
export class PeopleService {
  constructor(private readonly db: DbService, private readonly events: EventsService, private readonly members: MembersService) {}

  /** Admission: student + guardians (deduped by phone → siblings linked automatically) + enrolment + logins. */
  async createStudent(input: any) {
    const created = await this.db.t(async (tx) => {
      const year = new Date().getFullYear();
      const admissionNo = input.admissionNo ?? (await nextNumber(tx, `admission:${year}`, `${year}`, 4));
      const { guardians, sectionId, rollNo, custom, ...fields } = input;
      const [s] = await tx.insert(student).values({ ...fields, admissionNo, custom: custom ?? {}, tenantId: Ctx.tenantId(), qrCode: `AAD-${admissionNo}`, admittedOn: input.admittedOn ?? new Date().toISOString().slice(0, 10) }).returning();
      const linked = await this.upsertGuardians(tx, s!.id, guardians ?? []);
      if (sectionId) await this.enroll(tx, s!.id, sectionId, rollNo);
      await this.events.emit('student.admitted', { studentId: s!.id, name: s!.name, sectionId: sectionId ?? null });
      return { student: s!, guardians: linked };
    });
    for (const g of created.guardians) await this.members.link({ phone: g.phone, name: g.name, kind: 'guardian', personId: g.id });
    if (created.student.phone) {
      const p = phoneIN.safeParse(created.student.phone);
      if (p.success) await this.members.link({ phone: p.data, name: created.student.name, kind: 'student', personId: created.student.id });
    }
    return this.getStudent(created.student.id);
  }

  async upsertGuardians(tx: Tx, studentId: string, guardians: GuardianIn[]) {
    const out: (typeof guardian.$inferSelect)[] = [];
    for (const g of guardians) {
      const [row] = await tx.insert(guardian).values({ tenantId: Ctx.tenantId(), name: g.name, phone: g.phone, email: g.email, occupation: g.occupation })
        .onConflictDoUpdate({ target: [guardian.tenantId, guardian.phone], set: { name: g.name, email: g.email ?? sql`${guardian.email}`, occupation: g.occupation ?? sql`${guardian.occupation}` } }).returning();
      await tx.insert(studentGuardian).values({ tenantId: Ctx.tenantId(), studentId, guardianId: row!.id, relation: g.relation, isPrimary: g.isPrimary, receivesNotifications: g.receivesNotifications })
        .onConflictDoUpdate({ target: [studentGuardian.studentId, studentGuardian.guardianId], set: { relation: g.relation, isPrimary: g.isPrimary, receivesNotifications: g.receivesNotifications } });
      out.push(row!);
    }
    if (out.length) await this.events.emit('guardian.linked', { studentId, guardianIds: out.map((g) => g.id) });
    return out;
  }

  async enroll(tx: Tx, studentId: string, sectionId: string, rollNo?: string, sessionId?: string) {
    const [sec] = await tx.select().from(section).where(eq(section.id, sectionId));
    if (!sec) throw badRequest('Section not found');
    const sid = sessionId ?? (await currentSession(tx)).id;
    const [e] = await tx.insert(enrollment).values({ tenantId: Ctx.tenantId(), studentId, sessionId: sid, classId: sec.classId, sectionId, rollNo })
      .onConflictDoUpdate({ target: [enrollment.tenantId, enrollment.studentId, enrollment.sessionId], set: { classId: sec.classId, sectionId, rollNo, status: 'active' } }).returning();
    return e!;
  }

  async listStudents(q: { q?: string; sectionId?: string; classId?: string; status?: string; cursor?: string; limit?: number }) {
    const limit = Math.min(q.limit ?? 50, 500);
    return this.db.t(async (tx) => {
      const sess = await currentSession(tx);
      const rows = await tx
        .select({ id: student.id, admissionNo: student.admissionNo, name: student.name, gender: student.gender, dob: student.dob, status: student.status, photoFileId: student.photoFileId, phone: student.phone, rollNo: enrollment.rollNo, sectionId: enrollment.sectionId, classId: enrollment.classId, sectionName: section.name, className: schoolClass.name })
        .from(student)
        .leftJoin(enrollment, and(eq(enrollment.studentId, student.id), eq(enrollment.sessionId, sess.id)))
        .leftJoin(section, eq(section.id, enrollment.sectionId))
        .leftJoin(schoolClass, eq(schoolClass.id, enrollment.classId))
        .where(and(
          isNull(student.deletedAt),
          Authz.where('people.student.view', { section: enrollment.sectionId, student: student.id }),
          q.status ? eq(student.status, q.status as any) : eq(student.status, 'active'),
          q.sectionId ? eq(enrollment.sectionId, q.sectionId) : undefined,
          q.classId ? eq(enrollment.classId, q.classId) : undefined,
          q.q ? or(ilike(student.name, `%${q.q}%`), ilike(student.admissionNo, `%${q.q}%`)) : undefined,
          q.cursor ? lt(student.id, q.cursor) : undefined,
        ))
        .orderBy(q.sectionId ? sql`${enrollment.rollNo} nulls last, ${student.name}` : desc(student.id))
        .limit(limit + 1);
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      return { items, nextCursor: hasMore && !q.sectionId ? items[items.length - 1]!.id : null };
    });
  }

  /** Student 360: profile, guardians (siblings), enrolment, fee summary, attendance %, transport. */
  async getStudent(id: string) {
    return this.db.t(async (tx) => {
      const [s] = await tx.select().from(student).where(eq(student.id, id));
      if (!s) throw notFound('Student');
      const gs = await tx.select({ id: guardian.id, name: guardian.name, phone: guardian.phone, email: guardian.email, relation: studentGuardian.relation, isPrimary: studentGuardian.isPrimary, receivesNotifications: studentGuardian.receivesNotifications, userId: guardian.userId })
        .from(studentGuardian).innerJoin(guardian, eq(guardian.id, studentGuardian.guardianId)).where(eq(studentGuardian.studentId, id));
      const siblings = gs.length
        ? await tx.selectDistinct({ id: student.id, name: student.name, admissionNo: student.admissionNo }).from(studentGuardian).innerJoin(student, eq(student.id, studentGuardian.studentId))
            .where(and(inArray(studentGuardian.guardianId, gs.map((g) => g.id)), sql`${student.id} <> ${id}`))
        : [];
      const enr = await tx.select({ id: enrollment.id, sessionId: enrollment.sessionId, classId: enrollment.classId, sectionId: enrollment.sectionId, rollNo: enrollment.rollNo, className: schoolClass.name, sectionName: section.name, status: enrollment.status })
        .from(enrollment).leftJoin(section, eq(section.id, enrollment.sectionId)).leftJoin(schoolClass, eq(schoolClass.id, enrollment.classId)).where(eq(enrollment.studentId, id)).orderBy(desc(enrollment.createdAt));
      const [fees] = await tx.select({
        totalPaise: sql<number>`coalesce(sum(${studentFee.amountPaise} - ${studentFee.discountPaise}),0)::bigint`,
        paidPaise: sql<number>`coalesce(sum(${studentFee.paidPaise}),0)::bigint`,
        overduePaise: sql<number>`coalesce(sum(case when ${studentFee.dueOn} < current_date and ${studentFee.status} in ('unpaid','partial') then ${studentFee.amountPaise} - ${studentFee.discountPaise} - ${studentFee.paidPaise} else 0 end),0)::bigint`,
      }).from(studentFee).where(and(eq(studentFee.studentId, id), sql`${studentFee.status} <> 'cancelled'`));
      const [att] = await tx.select({ total: sql<number>`count(*)::int`, present: sql<number>`count(*) filter (where ${attendanceRecord.status} in ('present','late','half_day'))::int` })
        .from(attendanceRecord).where(and(eq(attendanceRecord.subjectType, 'student'), eq(attendanceRecord.subjectId, id), sql`${attendanceRecord.date} > current_date - 365`));
      const transport = await tx.select().from(studentTransport).where(and(eq(studentTransport.studentId, id), eq(studentTransport.isActive, true)));
      return {
        ...s, guardians: gs, siblings, enrollments: enr, current: enr[0] ?? null,
        fees: { totalPaise: Number(fees?.totalPaise ?? 0), paidPaise: Number(fees?.paidPaise ?? 0), duePaise: Number(fees?.totalPaise ?? 0) - Number(fees?.paidPaise ?? 0), overduePaise: Number(fees?.overduePaise ?? 0) },
        attendance: { days: att?.total ?? 0, present: att?.present ?? 0, pct: att?.total ? Math.round((att.present / att.total) * 1000) / 10 : null },
        transport,
      };
    }).then((s) => this.redact(s));
  }

  /**
   * Field-level visibility: sensitive identity fields, phone numbers and fee totals each need their own permission
   * (a family always sees its own child's record in full).
   */
  private async redact<S extends Record<string, any>>(s: S): Promise<S> {
    const ref = await this.db.t((tx) => studentRef(tx, s.id));
    const own = Authz.decide('self.*', ref).allowed;
    const may = (k: PermissionKey) => own || Authz.decide(k, ref).allowed;
    const out: Record<string, any> = { ...s, visibility: { sensitive: may('people.sensitive.view'), contact: may('people.contact.view'), fees: may('fees.payment.view') } };
    if (!out.visibility.sensitive) for (const f of ['religion', 'category', 'apaarId', 'address', 'rte', 'qrCode', 'rfidUid', 'custom', 'leftReason']) out[f] = null;
    if (!out.visibility.contact) {
      out.phone = null; out.email = null;
      out.guardians = (s.guardians ?? []).map((g: any) => ({ ...g, phone: null, email: null }));
    }
    if (!out.visibility.fees) out.fees = null;
    return out as S;
  }

  async updateStudent(id: string, input: any) {
    const [s] = await this.db.t((tx) => tx.update(student).set({ ...input, leftOn: input.status === 'left' ? new Date().toISOString().slice(0, 10) : undefined }).where(eq(student.id, id)).returning());
    if (!s) throw notFound('Student');
    await this.events.emit('student.updated', { studentId: id, fields: Object.keys(input) });
    return s;
  }

  async addGuardian(studentId: string, g: GuardianIn) {
    const rows = await this.db.t((tx) => this.upsertGuardians(tx, studentId, [g]));
    await this.members.link({ phone: g.phone, name: g.name, kind: 'guardian', personId: rows[0]!.id });
    return rows[0];
  }

  /**
   * Bulk import (Excel/CSV rows parsed on the client). dryRun=true validates and returns per-row errors
   * without writing (the "preview" step of the import wizard).
   */
  async importStudents(rows: any[], dryRun: boolean) {
    const errors: { row: number; message: string }[] = [];
    const sections = await this.db.t((tx) => tx.select({ id: section.id, name: section.name, className: schoolClass.name }).from(section).innerJoin(schoolClass, eq(schoolClass.id, section.classId)));
    const prepared = rows.map((r, i) => {
      const sec = r.className ? sections.find((s) => s.className.toLowerCase() === String(r.className).toLowerCase() && s.name.toLowerCase() === String(r.sectionName ?? 'A').toLowerCase()) : undefined;
      if (r.className && !sec) errors.push({ row: i + 1, message: `Class/section ${r.className}-${r.sectionName ?? 'A'} not found` });
      const guardians: GuardianIn[] = [...(r.guardians ?? [])];
      for (const [nameKey, phoneKey, relation] of [['fatherName', 'fatherPhone', 'father'], ['motherName', 'motherPhone', 'mother']] as const) {
        if (r[phoneKey]) {
          const p = phoneIN.safeParse(String(r[phoneKey]));
          if (!p.success) errors.push({ row: i + 1, message: `Invalid ${relation} phone` });
          else guardians.push({ name: r[nameKey] ?? relation, phone: p.data, relation, isPrimary: relation === 'father', receivesNotifications: true });
        }
      }
      if (!r.name) errors.push({ row: i + 1, message: 'Name is required' });
      const { className, sectionName, fatherName, fatherPhone, motherName, motherPhone, ...rest } = r;
      return { ...rest, guardians, sectionId: sec?.id };
    });
    if (dryRun || errors.length) return { ok: errors.length === 0, total: rows.length, errors, imported: 0 };
    let imported = 0;
    for (const p of prepared) {
      await this.createStudent(p);
      imported++;
    }
    return { ok: true, total: rows.length, errors, imported };
  }

  // ---------------- Staff ----------------
  async createStaff(input: any) {
    const { roleKeys, createLogin, ...fields } = input;
    const s = await this.db.t(async (tx) => {
      const employeeCode = fields.employeeCode ?? (await nextNumber(tx, 'employee', 'EMP', 4));
      const [s] = await tx.insert(staff).values({ ...fields, employeeCode, tenantId: Ctx.tenantId() }).returning();
      return s!;
    });
    if (createLogin) {
      const { userId } = await this.members.link({ phone: s.phone, name: s.name, kind: 'staff', personId: s.id, roleKeys: roleKeys?.length ? roleKeys : ['teacher'] });
      await this.db.t((tx) => tx.update(staff).set({ userId }).where(eq(staff.id, s.id)));
    }
    return s;
  }

  async listStaff(q: { q?: string; departmentId?: string; status?: string }) {
    return this.db.t((tx) =>
      tx.select({ id: staff.id, employeeCode: staff.employeeCode, name: staff.name, phone: staff.phone, email: staff.email, status: staff.status, departmentId: staff.departmentId, designationId: staff.designationId, department: department.name, designation: designation.name, userId: staff.userId, joiningDate: staff.joiningDate })
        .from(staff).leftJoin(department, eq(department.id, staff.departmentId)).leftJoin(designation, eq(designation.id, staff.designationId))
        .where(and(isNull(staff.deletedAt), eq(staff.status, (q.status as any) ?? 'active'), q.departmentId ? eq(staff.departmentId, q.departmentId) : undefined, q.q ? or(ilike(staff.name, `%${q.q}%`), ilike(staff.employeeCode, `%${q.q}%`), ilike(staff.phone, `%${q.q}%`)) : undefined))
        .orderBy(staff.name),
    );
  }

  /** Children visible to the logged-in guardian (multi-child switcher). */
  async myChildren() {
    const c = Ctx.get();
    const gid = c.personIds?.guardian;
    const sid = c.personIds?.student;
    return this.db.t(async (tx) => {
      const sess = await currentSession(tx);
      const ids = gid ? (await tx.select({ id: studentGuardian.studentId }).from(studentGuardian).where(eq(studentGuardian.guardianId, gid))).map((r) => r.id) : [];
      if (sid) ids.push(sid);
      if (!ids.length) return [];
      return tx.select({ id: student.id, name: student.name, admissionNo: student.admissionNo, photoFileId: student.photoFileId, sectionId: enrollment.sectionId, classId: enrollment.classId, className: schoolClass.name, sectionName: section.name, rollNo: enrollment.rollNo })
        .from(student).leftJoin(enrollment, and(eq(enrollment.studentId, student.id), eq(enrollment.sessionId, sess.id))).leftJoin(section, eq(section.id, enrollment.sectionId)).leftJoin(schoolClass, eq(schoolClass.id, enrollment.classId))
        .where(and(inArray(student.id, ids), isNull(student.deletedAt)));
    });
  }

  /**
   * Throws a structured 403 unless the user may act on this student under `key` (staff, within scope) or the student is
   * their own / their child (family portal).
   */
  async assertCanSeeStudent(studentId: string, key: PermissionKey = 'people.student.view') {
    const ref = await this.db.t((tx) => studentRef(tx, studentId));
    return Authz.assertAny([key, 'self.*'], ref);
  }

  /**
   * Student 360 timeline: one chronological feed across modules. Each source is included only when the viewer may see
   * it for this student (staff permission in scope, or own child).
   */
  async timeline(studentId: string, limit = 60) {
    const ref = await this.db.t((tx) => studentRef(tx, studentId));
    const own = Authz.decide('self.*', ref).allowed;
    const may = (k: PermissionKey) => own || Authz.decide(k, ref).allowed;
    return this.db.t(async (tx) => {
      const q = (x: ReturnType<typeof sql>) => tx.execute(x).then((r) => r.rows as { at: string; kind: string; title: string; detail: string | null; tone: string }[]);
      const parts: Promise<any[]>[] = [
        q(sql`select coalesce(admitted_on::timestamptz, created_at) as at, 'admission' as kind, 'Admitted' as title, 'Admission no. ' || admission_no as detail, 'info' as tone from students where id = ${studentId}`),
      ];
      if (may('attendance.student.view')) parts.push(q(sql`select (date::timestamp + interval '9 hours') as at, 'attendance' as kind,
        case status when 'absent' then 'Absent' when 'late' then 'Late' when 'leave' then 'On leave' else 'Half day' end as title, remarks as detail,
        case status when 'absent' then 'bad' when 'leave' then 'info' else 'warn' end as tone
        from attendance_records where subject_type = 'student' and subject_id = ${studentId} and period_id = ${ZERO_UUID}::uuid and status in ('absent','late','leave','half_day') order by date desc limit 30`));
      if (may('fees.payment.view')) parts.push(q(sql`select collected_at as at, 'fees' as kind, 'Fee paid · ₹' || to_char(total_paise / 100.0, 'FM99,99,99,990') as title, number || ' · ' || mode::text as detail, 'ok' as tone
        from receipts where student_id = ${studentId} and cancelled_at is null order by collected_at desc limit 20`));
      if (may('exams.result.view')) parts.push(q(sql`select r.published_at as at, 'exam' as kind, x.name || ' result' as title, r.percentage || '% · Grade ' || coalesce(r.grade, '—') || coalesce(' · Rank ' || r.rank, '') as detail, case when r.is_pass then 'ok' else 'bad' end as tone
        from results r join exams x on x.id = r.exam_id where r.student_id = ${studentId} and r.published_at is not null order by r.published_at desc limit 10`));
      if (may('behaviour.incident.view')) parts.push(q(sql`select at, 'behaviour' as kind, title, description as detail, case when points < 0 then 'bad' else 'ok' end as tone
        from incidents where ${studentId} = any(student_ids) order by at desc limit 20`));
      if (may('attendance.leave.view') || own) parts.push(q(sql`select created_at as at, 'leave' as kind, 'Leave ' || status::text || ' · ' || to_char(from_date, 'DD Mon') || ' – ' || to_char(to_date, 'DD Mon') as title, reason as detail, 'info' as tone
        from leave_requests where subject_type = 'student' and subject_id = ${studentId} order by created_at desc limit 10`));
      const all = (await Promise.all(parts)).flat().filter((e) => e.at);
      return all.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, limit);
    });
  }
}
