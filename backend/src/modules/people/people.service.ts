import { Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { DbService, Tx } from '../../db/db.service';
import { student, guardian, studentGuardian, enrollment, section, schoolClass, staff, studentFee, attendanceRecord, studentTransport, department, designation } from '../../db/schema';
import { Ctx } from '../../kernel/context/request-context';
import { EventsService } from '../../kernel/events/events.service';
import { MembersService } from '../org/members.service';
import { nextNumber } from '../../common/numbering';
import { currentSession } from '../academics/session.util';
import { badRequest, notFound } from '../../common/errors';
import { phoneIN } from '@aadhyay/contracts';

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
    });
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

  /** Throws unless the current user may see this student (staff with people.student.view, or own child). */
  async assertCanSeeStudent(studentId: string) {
    const c = Ctx.get();
    if ([...(c.permissions ?? [])].some((p) => p === '*' || p.startsWith('people.') || p === 'people.student.view')) return;
    const kids = await this.myChildren();
    if (!kids.some((k) => k.id === studentId)) throw notFound('Student');
  }
}
