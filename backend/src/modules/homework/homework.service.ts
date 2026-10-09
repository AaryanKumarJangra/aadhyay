import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { homework, homeworkSubmission, diaryEntry, subject, staff, enrollment } from '../../db/schema';
import { Ctx } from '../../kernel/context/request-context';
import { EventsService } from '../../kernel/events/events.service';
import { assertSectionAccess, assertSectionRead } from '../academics/section-access';
import { notFound, badRequest } from '../../common/errors';
import { todayIn } from '../../common/dates';
import { currentSession } from '../academics/session.util';

@Injectable()
export class HomeworkService {
  constructor(private readonly db: DbService, private readonly events: EventsService) {}

  async assign(b: { sectionId: string; subjectId: string; title: string; body?: string; attachments: string[]; dueOn: string; maxMarks?: number }) {
    return this.db.t(async (tx) => {
      await assertSectionAccess(tx, b.sectionId, 'homework.assignment.create', { subjectId: b.subjectId });
      const [h] = await tx.insert(homework).values({ ...b, tenantId: Ctx.tenantId(), teacherId: Ctx.get().personIds?.staff, assignedOn: todayIn(Ctx.get().tenantTz) }).returning();
      await this.events.emit('homework.assigned', { homeworkId: h!.id, sectionId: b.sectionId, title: b.title, dueOn: b.dueOn });
      return h;
    });
  }

  async forSection(sectionId: string, from?: string) {
    return this.db.t(async (tx) => { await assertSectionRead(tx, sectionId, 'homework.assignment.view'); return tx.select({ id: homework.id, title: homework.title, body: homework.body, attachments: homework.attachments, assignedOn: homework.assignedOn, dueOn: homework.dueOn, maxMarks: homework.maxMarks, subject: subject.name, teacher: staff.name,
      submissions: sql<number>`(select count(*)::int from homework_submissions s where s.homework_id = ${homework.id})` })
      .from(homework).leftJoin(subject, eq(subject.id, homework.subjectId)).leftJoin(staff, eq(staff.id, homework.teacherId))
      .where(and(eq(homework.sectionId, sectionId), from ? gte(homework.dueOn, from) : undefined)).orderBy(desc(homework.dueOn)).limit(100); });
  }

  /** Section of a homework (for scope checks). */
  private async sectionOf(tx: any, homeworkId: string) {
    const [h] = await tx.select({ sectionId: homework.sectionId, subjectId: homework.subjectId }).from(homework).where(eq(homework.id, homeworkId));
    if (!h) throw notFound('Homework');
    return h as { sectionId: string; subjectId: string };
  }

  /** Student (or parent on behalf) submits photos/PDF. */
  async submit(homeworkId: string, studentId: string, b: { files: string[]; text?: string }) {
    return this.db.t(async (tx) => {
      const [h] = await tx.select().from(homework).where(eq(homework.id, homeworkId));
      if (!h) throw notFound('Homework');
      const sess = await currentSession(tx);
      const [enr] = await tx.select().from(enrollment).where(and(eq(enrollment.studentId, studentId), eq(enrollment.sessionId, sess.id), eq(enrollment.sectionId, h.sectionId)));
      if (!enr) throw badRequest('Student is not in this section');
      const [s] = await tx.insert(homeworkSubmission).values({ tenantId: Ctx.tenantId(), homeworkId, studentId, files: b.files, text: b.text })
        .onConflictDoUpdate({ target: [homeworkSubmission.homeworkId, homeworkSubmission.studentId], set: { files: b.files, text: b.text, submittedAt: new Date(), status: 'submitted' } }).returning();
      return s;
    });
  }

  async evaluate(submissionId: string, b: { marks?: number; feedback?: string; status: 'evaluated' | 'returned' }) {
    await this.db.t(async (tx) => {
      const [sub] = await tx.select({ homeworkId: homeworkSubmission.homeworkId }).from(homeworkSubmission).where(eq(homeworkSubmission.id, submissionId));
      if (!sub) throw notFound('Submission');
      const h = await this.sectionOf(tx, sub.homeworkId);
      await assertSectionAccess(tx, h.sectionId, 'homework.assignment.edit', { subjectId: h.subjectId });
    });
    const [s] = await this.db.t((tx) => tx.update(homeworkSubmission).set({ ...b, evaluatedAt: new Date() }).where(eq(homeworkSubmission.id, submissionId)).returning());
    if (!s) throw notFound('Submission');
    return s;
  }

  async submissions(homeworkId: string) {
    return this.db.t(async (tx) => {
      const h = await this.sectionOf(tx, homeworkId);
      await assertSectionAccess(tx, h.sectionId, 'homework.assignment.view', { subjectId: h.subjectId });
      return tx.select().from(homeworkSubmission).where(eq(homeworkSubmission.homeworkId, homeworkId));
    });
  }

  async postDiary(b: { sectionId: string; date: string; body: string }) {
    return this.db.t(async (tx) => {
      await assertSectionAccess(tx, b.sectionId, 'homework.diary.create');
      const [d] = await tx.insert(diaryEntry).values({ ...b, tenantId: Ctx.tenantId(), createdBy: Ctx.userId() }).returning();
      await this.events.emit('diary.posted', { diaryId: d!.id, sectionId: b.sectionId, date: b.date });
      return d;
    });
  }
  async diary(sectionId: string, date?: string) {
    return this.db.t(async (tx) => { await assertSectionRead(tx, sectionId, 'homework.assignment.view'); return tx.select().from(diaryEntry).where(and(eq(diaryEntry.sectionId, sectionId), date ? eq(diaryEntry.date, date) : undefined)).orderBy(desc(diaryEntry.date)).limit(60); });
  }
}
