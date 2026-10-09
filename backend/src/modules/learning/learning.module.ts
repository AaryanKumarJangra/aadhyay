import { Body, Controller, Get, Injectable, Module, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { lesson, topic, questionBank, question, onlineTest, onlineTestAttempt, course, courseModule, content, contentProgress, liveSession, liveAttendance, enrollment } from '../../db/schema';
import { Can, RequireModule } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { Ctx } from '../../kernel/context/request-context';
import { badRequest, forbidden, notFound } from '../../common/errors';
import { crudController } from '../../common/crud';
import { gradeAttempt, percentiles } from './grading';
import { PeopleService } from '../people/people.service';
import { livekitToken } from '../../adapters/turn/turn';
import { currentSession } from '../academics/session.util';

@Injectable()
export class LearningService {
  constructor(private readonly db: DbService, private readonly people: PeopleService) {}

  async topicStatus(id: string, status: 'pending' | 'in_progress' | 'completed') {
    const [t] = await this.db.t((tx) => tx.update(topic).set({ status, completedOn: status === 'completed' ? new Date().toISOString().slice(0, 10) : null }).where(eq(topic.id, id)).returning());
    if (!t) throw notFound('Topic');
    return t;
  }
  async syllabus(classId: string, subjectId: string) {
    return this.db.t(async (tx) => {
      const ls = await tx.select().from(lesson).where(and(eq(lesson.classId, classId), eq(lesson.subjectId, subjectId))).orderBy(asc(lesson.order));
      const ts = ls.length ? await tx.select().from(topic).where(inArray(topic.lessonId, ls.map((l) => l.id))) : [];
      const total = ts.length, done = ts.filter((t) => t.status === 'completed').length;
      return { lessons: ls.map((l) => ({ ...l, topics: ts.filter((t) => t.lessonId === l.id) })), progressPct: total ? Math.round((done / total) * 100) : 0 };
    });
  }

  // ---- Online tests ----
  private async studentAudience(tx: any, audience: any, studentId: string) {
    const sess = await currentSession(tx);
    const [e] = await tx.select().from(enrollment).where(and(eq(enrollment.studentId, studentId), eq(enrollment.sessionId, sess.id)));
    return !audience?.sectionIds?.length || (e && audience.sectionIds.includes(e.sectionId));
  }
  /** Start (or resume) an attempt. Correct answers are never sent to the client. */
  async startAttempt(testId: string, studentId: string) {
    await this.people.assertCanSeeStudent(studentId, 'online-exams.test.view');
    return this.db.t(async (tx) => {
      const [t] = await tx.select().from(onlineTest).where(eq(onlineTest.id, testId));
      if (!t || !t.publishedAt) throw notFound('Test');
      const now = new Date();
      if (now < t.startsAt || now > t.endsAt) throw badRequest('Test is not open now');
      if (!(await this.studentAudience(tx, t.audience, studentId))) throw forbidden('Not assigned to this test');
      const [existing] = await tx.select().from(onlineTestAttempt).where(and(eq(onlineTestAttempt.testId, testId), eq(onlineTestAttempt.studentId, studentId)));
      if (existing?.submittedAt) throw badRequest('Already submitted');
      const [a] = existing ? [existing] : await tx.insert(onlineTestAttempt).values({ tenantId: Ctx.tenantId(), testId, studentId }).returning();
      const qs = await tx.select({ id: question.id, type: question.type, body: question.body, options: question.options, marks: question.marks, negative: question.negative }).from(question).where(inArray(question.id, t.questionIds));
      const order = t.shuffle ? seededShuffle(qs, a!.id) : qs;
      const endsAt = new Date(Math.min(a!.startedAt.getTime() + t.durationMin * 60_000, t.endsAt.getTime()));
      return { attemptId: a!.id, endsAt, questions: order, answers: a!.answers };
    });
  }
  async saveAnswers(attemptId: string, answers: Record<string, unknown>, submit: boolean, flags: Record<string, unknown> = {}) {
    return this.db.t(async (tx) => {
      const [a] = await tx.select().from(onlineTestAttempt).where(eq(onlineTestAttempt.id, attemptId));
      if (!a) throw notFound('Attempt');
      await this.people.assertCanSeeStudent(a.studentId, 'online-exams.test.view');
      if (a.submittedAt) throw badRequest('Already submitted');
      const [t] = await tx.select().from(onlineTest).where(eq(onlineTest.id, a.testId));
      const late = Date.now() > Math.min(a.startedAt.getTime() + t!.durationMin * 60_000 + 60_000, t!.endsAt.getTime() + 60_000);
      const merged = { ...(a.answers as object), ...answers };
      const mergedFlags = { ...(a.flags as any), ...flags, tabSwitches: ((a.flags as any)?.tabSwitches ?? 0) + Number((flags as any).tabSwitches ?? 0) };
      if (!submit && !late) {
        await tx.update(onlineTestAttempt).set({ answers: merged, flags: mergedFlags }).where(eq(onlineTestAttempt.id, attemptId));
        return { saved: true };
      }
      const qs = await tx.select().from(question).where(inArray(question.id, t!.questionIds));
      const g = gradeAttempt(qs as any, merged);
      await tx.update(onlineTestAttempt).set({ answers: merged, flags: { ...mergedFlags, detail: g.detail, autoSubmitted: late }, score: g.score, submittedAt: new Date() }).where(eq(onlineTestAttempt.id, attemptId));
      return { submitted: true, score: g.score, correct: g.correct, wrong: g.wrong, unattempted: g.unattempted };
    });
  }
  /** Rank + percentile for all submitted attempts. */
  async rankTest(testId: string) {
    return this.db.t(async (tx) => {
      const rows = await tx.select().from(onlineTestAttempt).where(and(eq(onlineTestAttempt.testId, testId), isNotNull(onlineTestAttempt.submittedAt))).orderBy(desc(onlineTestAttempt.score));
      const pcts = percentiles(rows.map((r) => r.score ?? 0));
      let last = Number.NaN, lastRank = 0;
      for (let i = 0; i < rows.length; i++) {
        const rk = rows[i]!.score === last ? lastRank : i + 1;
        last = rows[i]!.score ?? 0; lastRank = rk;
        await tx.update(onlineTestAttempt).set({ rank: rk, percentile: pcts[i] }).where(eq(onlineTestAttempt.id, rows[i]!.id));
      }
      return { ranked: rows.length };
    });
  }

  // ---- LMS ----
  async courseTree(courseId: string) {
    return this.db.t(async (tx) => {
      const [c] = await tx.select().from(course).where(eq(course.id, courseId));
      if (!c) throw notFound('Course');
      const mods = await tx.select().from(courseModule).where(eq(courseModule.courseId, courseId)).orderBy(asc(courseModule.order));
      const cs = mods.length ? await tx.select().from(content).where(inArray(content.moduleId, mods.map((m) => m.id))).orderBy(asc(content.order)) : [];
      const now = new Date();
      return { ...c, modules: mods.map((m) => ({ ...m, contents: cs.filter((x) => x.moduleId === m.id).map((x) => ({ ...x, locked: !!x.releaseAt && x.releaseAt > now, fileId: x.releaseAt && x.releaseAt > now ? null : x.fileId })) })) };
    });
  }
  async progress(contentId: string, studentId: string, pct: number) {
    await this.people.assertCanSeeStudent(studentId, 'online-exams.test.view');
    const [r] = await this.db.t((tx) => tx.insert(contentProgress).values({ tenantId: Ctx.tenantId(), contentId, studentId, progress: pct, completed: pct >= 95 })
      .onConflictDoUpdate({ target: [contentProgress.contentId, contentProgress.studentId], set: { progress: sql`greatest(${contentProgress.progress}, ${pct})`, completed: sql`${contentProgress.completed} or ${pct >= 95}` } }).returning());
    return r;
  }

  // ---- Live classes (LiveKit self-hosted or Zoom/Meet link) ----
  async joinLive(sessionId: string) {
    const c = Ctx.get();
    const [s] = await this.db.t((tx) => tx.select().from(liveSession).where(eq(liveSession.id, sessionId)));
    if (!s) throw notFound('Live class');
    await this.db.t((tx) => tx.insert(liveAttendance).values({ tenantId: Ctx.tenantId(), sessionId, userId: c.userId!, joinedAt: new Date() }));
    if (s.provider !== 'livekit') return { provider: s.provider, joinUrl: s.joinUrl };
    const isHost = c.personIds?.staff === s.hostStaffId || c.permissions?.has('*');
    return { provider: 'livekit', ...(await livekitToken(s.room ?? `live-${s.id}`, c.userId!, c.userId!, !!isHost)) };
  }
}

function seededShuffle<T>(arr: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

@RequireModule('lessonplan') @Controller('lessonplan')
export class LessonPlanController {
  constructor(private readonly svc: LearningService) {}
  @Can('lessonplan.topic.edit') @Put('topics/:id/status') status(@Param('id') id: string, @Body(Z(z.object({ status: z.enum(['pending', 'in_progress', 'completed']) }))) b: any) { return this.svc.topicStatus(id, b.status); }
  @Can('lessonplan.lesson.view') @Get('syllabus') syllabus(@Query('classId') c: string, @Query('subjectId') s: string) { return this.svc.syllabus(c, s); }
}
@RequireModule('online-exams') @Controller('online-tests')
export class OnlineTestController {
  constructor(private readonly svc: LearningService) {}
  @Post(':id/start') start(@Param('id') id: string, @Body(Z(z.object({ studentId: z.string().uuid() }))) b: any) { return this.svc.startAttempt(id, b.studentId); }
  @Post('attempts/:id') save(@Param('id') id: string, @Body(Z(z.object({ answers: z.record(z.string(), z.unknown()).default({}), submit: z.boolean().default(false), flags: z.record(z.string(), z.unknown()).default({}) }))) b: any) { return this.svc.saveAnswers(id, b.answers, b.submit, b.flags); }
  @Can('online-exams.test.edit') @Post(':id/rank') rank(@Param('id') id: string) { return this.svc.rankTest(id); }
}
@RequireModule('lms') @Controller('lms')
export class LmsController {
  constructor(private readonly svc: LearningService) {}
  @Get('courses/:id/tree') tree(@Param('id') id: string) { return this.svc.courseTree(id); }
  @Post('progress') progress(@Body(Z(z.object({ contentId: z.string().uuid(), studentId: z.string().uuid(), progress: z.number().min(0).max(100) }))) b: any) { return this.svc.progress(b.contentId, b.studentId, b.progress); }
}
@RequireModule('live-classes') @Controller('live')
export class LiveController {
  constructor(private readonly svc: LearningService) {}
  @Post(':id/join') join(@Param('id') id: string) { return this.svc.joinLive(id); }
}

const qBody = z.object({ bankId: z.string().uuid(), type: z.enum(['mcq', 'multi', 'numeric', 'matrix', 'assertion', 'subjective', 'truefalse']), body: z.object({ text: z.string(), imageFileId: z.string().uuid().optional() }), options: z.array(z.object({ id: z.string(), text: z.string() })).default([]), answer: z.any(), marks: z.number().positive().default(1), negative: z.number().nonnegative().default(0), difficulty: z.string().optional(), tags: z.array(z.string()).default([]) });
const cruds = [
  crudController({ path: 'lessonplan/lessons', module: 'lessonplan', perm: 'lessonplan.lesson', table: lesson as any, create: z.object({ classId: z.string().uuid(), subjectId: z.string().uuid(), name: z.string(), order: z.number().int().default(0) }), filters: { classId: lesson.classId, subjectId: lesson.subjectId } }),
  crudController({ path: 'lessonplan/topics', module: 'lessonplan', perm: 'lessonplan.topic', table: topic as any, create: z.object({ lessonId: z.string().uuid(), name: z.string(), sectionId: z.string().uuid().optional(), plannedOn: z.string().optional(), plan: z.record(z.string(), z.unknown()).default({}) }), filters: { lessonId: topic.lessonId } }),
  crudController({ path: 'online-tests/banks', module: 'online-exams', perm: 'online-exams.bank', table: questionBank as any, create: z.object({ name: z.string(), subjectId: z.string().uuid().optional() }) }),
  crudController({ path: 'online-tests/questions', module: 'online-exams', perm: 'online-exams.bank', table: question as any, create: qBody, filters: { bankId: question.bankId, type: question.type } }),
  crudController({ path: 'online-tests/tests', module: 'online-exams', perm: 'online-exams.test', table: onlineTest as any, create: z.object({ title: z.string(), audience: z.object({ sectionIds: z.array(z.string().uuid()).optional(), batchIds: z.array(z.string().uuid()).optional() }), questionIds: z.array(z.string().uuid()).min(1), durationMin: z.number().int().positive(), startsAt: z.coerce.date(), endsAt: z.coerce.date(), shuffle: z.boolean().default(true), publishedAt: z.coerce.date().optional() }) }),
  crudController({ path: 'online-tests/attempts', module: 'online-exams', perm: 'online-exams.test', table: onlineTestAttempt as any, create: z.object({}), readonly: true, filters: { testId: onlineTestAttempt.testId, studentId: onlineTestAttempt.studentId } }),
  crudController({ path: 'lms/courses', module: 'lms', perm: 'lms.course', table: course as any, create: z.object({ title: z.string(), slug: z.string().regex(/^[a-z0-9-]+$/), description: z.string().optional(), coverFileId: z.string().uuid().optional(), audience: z.record(z.string(), z.unknown()).default({}), pricePaise: z.number().int().nonnegative().default(0), isPublished: z.boolean().default(false) }), search: [course.title] }),
  crudController({ path: 'lms/modules', module: 'lms', perm: 'lms.course', table: courseModule as any, create: z.object({ courseId: z.string().uuid(), title: z.string(), order: z.number().int().default(0) }), filters: { courseId: courseModule.courseId } }),
  crudController({ path: 'lms/contents', module: 'lms', perm: 'lms.course', table: content as any, create: z.object({ moduleId: z.string().uuid(), kind: z.enum(['pdf', 'video', 'link', 'html', 'test']), title: z.string(), fileId: z.string().uuid().optional(), url: z.string().url().optional(), body: z.string().optional(), drm: z.boolean().default(false), releaseAt: z.coerce.date().optional(), order: z.number().int().default(0) }), filters: { moduleId: content.moduleId } }),
  crudController({ path: 'live/sessions', module: 'live-classes', perm: 'live-classes.session', table: liveSession as any, create: z.object({ title: z.string(), provider: z.enum(['livekit', 'zoom', 'meet']), joinUrl: z.string().url().optional(), audience: z.record(z.string(), z.unknown()).default({}), hostStaffId: z.string().uuid().optional(), startsAt: z.coerce.date(), durationMin: z.number().int().positive() }) }),
];

@Module({ controllers: [LessonPlanController, OnlineTestController, LmsController, LiveController, ...cruds], providers: [LearningService] })
export class LearningModule {}
