import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { exam, examGroup, examSchedule, markEntry, result, gradeScale, enrollment, student, subject, section, schoolClass, attendanceRecord } from '../../db/schema';
import { Ctx } from '../../kernel/context/request-context';
import { EventsService } from '../../kernel/events/events.service';
import { currentSession } from '../academics/session.util';
import { Authz } from '../../kernel/authz/authz';
import { badRequest, notFound } from '../../common/errors';
import { gradeFor, rank, type Band } from './grading';
import { ZERO_UUID } from '../../common/ids';

@Injectable()
export class ExamsService {
  constructor(private readonly db: DbService, private readonly events: EventsService) {}

  async createGroup(b: { name: string; sessionId?: string; kind: string }) {
    return this.db.t(async (tx) => {
      const sid = b.sessionId ?? (await currentSession(tx)).id;
      const [g] = await tx.insert(examGroup).values({ tenantId: Ctx.tenantId(), sessionId: sid, name: b.name, kind: b.kind }).returning();
      return g;
    });
  }

  async examDetail(id: string) {
    return this.db.t(async (tx) => {
      const [e] = await tx.select().from(exam).where(eq(exam.id, id));
      if (!e) throw notFound('Exam');
      const schedules = await tx.select({ id: examSchedule.id, classId: examSchedule.classId, className: schoolClass.name, subjectId: examSchedule.subjectId, subject: subject.name, date: examSchedule.date, startTime: examSchedule.startTime, endTime: examSchedule.endTime, maxMarks: examSchedule.maxMarks, passMarks: examSchedule.passMarks, room: examSchedule.room,
        entered: sql<number>`(select count(*)::int from mark_entries m where m.schedule_id = ${examSchedule.id})` })
        .from(examSchedule).leftJoin(subject, eq(subject.id, examSchedule.subjectId)).leftJoin(schoolClass, eq(schoolClass.id, examSchedule.classId)).where(eq(examSchedule.examId, id)).orderBy(asc(examSchedule.date));
      return { ...e, schedules };
    });
  }

  /** Marks grid for a schedule + section (teacher enters offline, syncs). */
  async marksGrid(scheduleId: string, sectionId: string) {
    return this.db.t(async (tx) => {
      const [s] = await tx.select().from(examSchedule).where(eq(examSchedule.id, scheduleId));
      if (!s) throw notFound('Schedule');
      Authz.assertAny(['exams.marks.view', 'exams.marks.create'], { sectionId, subjectId: s.subjectId });
      const sess = await currentSession(tx);
      const rows = await tx.select({ studentId: student.id, name: student.name, rollNo: enrollment.rollNo, marks: markEntry.marks, isAbsent: markEntry.isAbsent, remarks: markEntry.remarks })
        .from(enrollment).innerJoin(student, eq(student.id, enrollment.studentId))
        .leftJoin(markEntry, and(eq(markEntry.scheduleId, scheduleId), eq(markEntry.studentId, student.id)))
        .where(and(eq(enrollment.sectionId, sectionId), eq(enrollment.sessionId, sess.id), eq(enrollment.status, 'active'))).orderBy(sql`${enrollment.rollNo}::int nulls last`, asc(student.name));
      return { schedule: s, students: rows };
    });
  }

  async enterMarks(b: { scheduleId: string; entries: { studentId: string; marks: number | null; isAbsent: boolean; remarks?: string }[] }) {
    return this.db.t(async (tx) => {
      const [s] = await tx.select().from(examSchedule).where(eq(examSchedule.id, b.scheduleId));
      if (!s) throw notFound('Schedule');
      const [e] = await tx.select().from(exam).where(eq(exam.id, s.examId));
      if (e?.publishedAt) throw badRequest('Results already published. Unpublish to edit marks.');
      for (const x of b.entries) if (x.marks !== null && x.marks > s.maxMarks) throw badRequest(`Marks cannot exceed ${s.maxMarks}`);
      const sess = await currentSession(tx);
      const secs = await tx.selectDistinct({ sectionId: enrollment.sectionId }).from(enrollment).where(and(inArray(enrollment.studentId, b.entries.map((x) => x.studentId)), eq(enrollment.sessionId, sess.id)));
      for (const sc of secs) Authz.assertAny(['exams.marks.create', 'exams.marks.edit'], { sectionId: sc.sectionId, subjectId: s.subjectId });
      for (const x of b.entries) {
        await tx.insert(markEntry).values({ tenantId: Ctx.tenantId(), scheduleId: b.scheduleId, studentId: x.studentId, marks: x.isAbsent ? null : x.marks, isAbsent: x.isAbsent, remarks: x.remarks, enteredBy: Ctx.userId() })
          .onConflictDoUpdate({ target: [markEntry.scheduleId, markEntry.studentId], set: { marks: x.isAbsent ? null : x.marks, isAbsent: x.isAbsent, remarks: x.remarks, enteredBy: Ctx.userId() } });
      }
      return { saved: b.entries.length };
    });
  }

  /** Compute totals, %, grade, pass/fail and section rank for every student who sat the exam. */
  async compute(examId: string) {
    return this.db.t(async (tx) => {
      const [e] = await tx.select().from(exam).where(eq(exam.id, examId));
      if (!e) throw notFound('Exam');
      const [scale] = e.gradeScaleId ? await tx.select().from(gradeScale).where(eq(gradeScale.id, e.gradeScaleId)) : await tx.select().from(gradeScale).limit(1);
      const bands = (scale?.bands ?? []) as Band[];
      const sess = await currentSession(tx);
      const marks = await tx.select({ studentId: markEntry.studentId, marks: markEntry.marks, isAbsent: markEntry.isAbsent, maxMarks: examSchedule.maxMarks, passMarks: examSchedule.passMarks, sectionId: enrollment.sectionId })
        .from(markEntry).innerJoin(examSchedule, eq(examSchedule.id, markEntry.scheduleId))
        .innerJoin(enrollment, and(eq(enrollment.studentId, markEntry.studentId), eq(enrollment.sessionId, sess.id)))
        .where(eq(examSchedule.examId, examId));
      const by = new Map<string, { studentId: string; sectionId: string; total: number; max: number; pass: boolean }>();
      for (const m of marks) {
        const r = by.get(m.studentId) ?? { studentId: m.studentId, sectionId: m.sectionId, total: 0, max: 0, pass: true };
        r.total += m.marks ?? 0;
        r.max += m.maxMarks;
        if (m.isAbsent || (m.marks ?? 0) < m.passMarks) r.pass = false;
        by.set(m.studentId, r);
      }
      const rows = [...by.values()].map((r) => ({ ...r, percentage: r.max ? Math.round((r.total / r.max) * 10000) / 100 : 0 }));
      const bySection = new Map<string, typeof rows>();
      for (const r of rows) bySection.set(r.sectionId, [...(bySection.get(r.sectionId) ?? []), r]);
      let n = 0;
      for (const [, list] of bySection) {
        for (const r of rank(list)) {
          const g = gradeFor(r.percentage, bands);
          await tx.insert(result).values({ tenantId: Ctx.tenantId(), examId, studentId: r.studentId, sectionId: r.sectionId, totalMarks: r.total, maxMarks: r.max, percentage: r.percentage, grade: g?.grade, rank: r.rank, isPass: r.pass, remarks: g?.remark })
            .onConflictDoUpdate({ target: [result.examId, result.studentId], set: { totalMarks: r.total, maxMarks: r.max, percentage: r.percentage, grade: g?.grade ?? null, rank: r.rank, isPass: r.pass, sectionId: r.sectionId } });
          n++;
        }
      }
      return { computed: n };
    });
  }

  async publish(examId: string, notify: boolean) {
    await this.compute(examId);
    return this.db.t(async (tx) => {
      const now = new Date();
      await tx.update(exam).set({ publishedAt: now }).where(eq(exam.id, examId));
      await tx.update(result).set({ publishedAt: now }).where(eq(result.examId, examId));
      const [e] = await tx.select().from(exam).where(eq(exam.id, examId));
      if (notify) {
        const rs = await tx.select({ studentId: result.studentId, percentage: result.percentage, grade: result.grade }).from(result).where(eq(result.examId, examId));
        for (const r of rs) await this.events.emit('exam.result_published', { examId, examName: e!.name, studentId: r.studentId, percentage: r.percentage, grade: r.grade });
      }
      return { ok: true, publishedAt: now };
    });
  }

  async unpublish(examId: string) {
    await this.db.t(async (tx) => {
      await tx.update(exam).set({ publishedAt: null }).where(eq(exam.id, examId));
      await tx.update(result).set({ publishedAt: null }).where(eq(result.examId, examId));
    });
    return { ok: true };
  }

  async sectionResults(examId: string, sectionId: string) {
    Authz.assert('exams.result.view', { sectionId });
    return this.db.t((tx) => tx.select({ studentId: student.id, name: student.name, admissionNo: student.admissionNo, total: result.totalMarks, max: result.maxMarks, percentage: result.percentage, grade: result.grade, rank: result.rank, isPass: result.isPass, publishedAt: result.publishedAt })
      .from(result).innerJoin(student, eq(student.id, result.studentId)).where(and(eq(result.examId, examId), eq(result.sectionId, sectionId))).orderBy(asc(result.rank)));
  }

  /** Report card data for one student across an exam group (all published exams), with attendance %. */
  async reportCard(studentId: string, groupId: string, publishedOnly: boolean) {
    return this.db.t(async (tx) => {
      const [s] = await tx.select().from(student).where(eq(student.id, studentId));
      if (!s) throw notFound('Student');
      const [g] = await tx.select().from(examGroup).where(eq(examGroup.id, groupId));
      if (!g) throw notFound('Exam group');
      const exams = await tx.select().from(exam).where(and(eq(exam.groupId, groupId), publishedOnly ? sql`${exam.publishedAt} is not null` : undefined)).orderBy(asc(exam.createdAt));
      const subjectsMarks = exams.length ? await tx.select({ examId: examSchedule.examId, subject: subject.name, subjectId: subject.id, maxMarks: examSchedule.maxMarks, marks: markEntry.marks, isAbsent: markEntry.isAbsent })
        .from(examSchedule).innerJoin(subject, eq(subject.id, examSchedule.subjectId))
        .leftJoin(markEntry, and(eq(markEntry.scheduleId, examSchedule.id), eq(markEntry.studentId, studentId)))
        .where(inArray(examSchedule.examId, exams.map((e) => e.id))) : [];
      const results = exams.length ? await tx.select().from(result).where(and(eq(result.studentId, studentId), inArray(result.examId, exams.map((e) => e.id)))) : [];
      const sess = await currentSession(tx);
      const [enr] = await tx.select({ className: schoolClass.name, sectionName: section.name, rollNo: enrollment.rollNo }).from(enrollment).leftJoin(section, eq(section.id, enrollment.sectionId)).leftJoin(schoolClass, eq(schoolClass.id, enrollment.classId)).where(and(eq(enrollment.studentId, studentId), eq(enrollment.sessionId, sess.id)));
      const [att] = await tx.select({ total: sql<number>`count(*) filter (where ${attendanceRecord.status} <> 'holiday')::int`, present: sql<number>`count(*) filter (where ${attendanceRecord.status} in ('present','late','half_day'))::int` })
        .from(attendanceRecord).where(and(eq(attendanceRecord.subjectType, 'student'), eq(attendanceRecord.subjectId, studentId), eq(attendanceRecord.periodId, ZERO_UUID), sql`${attendanceRecord.date} between ${sess.startsOn} and ${sess.endsOn}`));
      const subjects = [...new Map(subjectsMarks.map((m) => [m.subjectId, m.subject])).entries()].map(([id, name]) => ({
        subjectId: id, subject: name,
        exams: Object.fromEntries(exams.map((e) => { const m = subjectsMarks.find((x) => x.examId === e.id && x.subjectId === id); return [e.id, m ? { marks: m.marks, max: m.maxMarks, absent: m.isAbsent } : null]; })),
      }));
      return {
        student: { id: s.id, name: s.name, admissionNo: s.admissionNo, dob: s.dob, ...enr }, group: g, exams: exams.map((e) => ({ id: e.id, name: e.name, term: e.term })), subjects,
        results: results.map((r) => ({ examId: r.examId, total: r.totalMarks, max: r.maxMarks, percentage: r.percentage, grade: r.grade, rank: r.rank, isPass: r.isPass })),
        attendance: { working: att?.total ?? 0, present: att?.present ?? 0 },
      };
    });
  }

  async studentResults(studentId: string, publishedOnly: boolean) {
    return this.db.t((tx) => tx.execute(sql`select r.exam_id as "examId", x.name as exam, g.name as "group", g.id as "groupId", r.total_marks as total, r.max_marks as max, r.percentage, r.grade, r.rank, r.is_pass as "isPass", r.published_at as "publishedAt"
      from results r join exams x on x.id = r.exam_id left join exam_groups g on g.id = x.group_id
      where r.student_id = ${studentId} ${publishedOnly ? sql`and r.published_at is not null` : sql``} order by x.created_at desc`).then((r) => r.rows));
  }
}
