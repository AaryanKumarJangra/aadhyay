import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { Academics } from '@aadhyay/contracts';
import { Can, RequireModule, Public } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { AcademicsService } from './academics.service';
import { PeopleService } from '../people/people.service';
import { DbService } from '../../db/db.service';
import { crudController } from '../../common/crud';
import { schoolClass, section, subject, classSubject, period, calendarEvent, substitution, timetableSlot } from '../../db/schema';
import { Ctx } from '../../kernel/context/request-context';

@RequireModule('academics')
@Controller('academics')
export class AcademicsController {
  constructor(private readonly svc: AcademicsService, private readonly people: PeopleService, private readonly db: DbService) {}

  @Can('academics.class.view') @Get('tree')
  tree() {
    return this.svc.tree();
  }
  @Can('academics.class.create') @Post('classes/with-sections')
  createClass(@Body(Z(Academics.classInput)) b: any) {
    return this.svc.createClass(b);
  }
  @Can('academics.enrollment.create') @Post('enroll')
  enroll(@Body(Z(Academics.enrollInput)) b: any) {
    return this.db.t((tx) => this.people.enroll(tx, b.studentId, b.sectionId, b.rollNo, b.sessionId));
  }
  @Can('academics.enrollment.edit') @Post('sections/:id/auto-roll')
  autoRoll(@Param('id') id: string) {
    return this.svc.autoRoll(id);
  }
  @Can('academics.promotion.manage') @Post('promote')
  promote(@Body(Z(Academics.promoteInput)) b: any) {
    return this.svc.promote(b);
  }
}

@RequireModule('timetable')
@Controller('timetable')
export class TimetableController {
  constructor(private readonly svc: AcademicsService) {}
  @Can('timetable.slot.view', 'self.*') @Get('sections/:id')
  section(@Param('id') id: string) {
    return this.svc.sectionTimetable(id);
  }
  @Can('timetable.slot.view') @Get('teachers/:id')
  teacher(@Param('id') id: string) {
    return this.svc.teacherTimetable(id);
  }
  @Get('my')
  my() {
    const sid = Ctx.get().personIds?.staff;
    return sid ? this.svc.teacherTimetable(sid) : [];
  }
  @Can('timetable.slot.edit') @Post('slots')
  set(@Body(Z(Academics.timetableSlotInput)) b: any) {
    return this.svc.setSlot(b);
  }
  @Can('timetable.slot.edit') @Post('generate')
  generate(@Body(Z(z.object({ sectionIds: z.array(z.string().uuid()).min(1), requirements: z.record(z.string(), z.array(z.object({ subjectId: z.string().uuid(), teacherId: z.string().uuid().optional(), periodsPerWeek: z.number().int().min(1).max(12) }))), days: z.number().int().min(5).max(7).default(6) }))) b: any) {
    return this.svc.generate(b.sectionIds, b.requirements, b.days);
  }
}

@RequireModule('calendar')
@Controller('calendar')
export class CalendarController {
  constructor(private readonly svc: AcademicsService) {}
  /** Public iCal feed per institution host: /v1/calendar/ical */
  @Public() @Get('ical')
  async ical(@Res() res: FastifyReply) {
    const body = await this.svc.ical(Ctx.get().tenantSlug ?? 'Aadhyay');
    res.header('Content-Type', 'text/calendar; charset=utf-8').send(body);
  }
}

export const ClassCrud = crudController({ path: 'academics/classes', module: 'academics', perm: 'academics.class', table: schoolClass as any, create: z.object({ name: z.string().min(1), order: z.number().int().default(0) }), sort: { column: schoolClass.order, dir: 'asc' } });
export const SectionCrud = crudController({ path: 'academics/sections', module: 'academics', perm: 'academics.class', table: section as any, create: Academics.sectionInput, filters: { classId: section.classId }, sort: { column: section.name, dir: 'asc' } });
export const SubjectCrud = crudController({ path: 'academics/subjects', module: 'academics', perm: 'academics.subject', table: subject as any, create: Academics.subjectInput, search: [subject.name], sort: { column: subject.name, dir: 'asc' } });
export const ClassSubjectCrud = crudController({ path: 'academics/class-subjects', module: 'academics', perm: 'academics.subject', table: classSubject as any, create: Academics.classSubjectInput, filters: { classId: classSubject.classId, sectionId: classSubject.sectionId, teacherId: classSubject.teacherId } });
export const PeriodCrud = crudController({ path: 'timetable/periods', module: 'timetable', perm: 'timetable.slot', table: period as any, create: Academics.periodInput, sort: { column: period.order, dir: 'asc' } });
export const SubstitutionCrud = crudController({ path: 'timetable/substitutions', module: 'timetable', perm: 'timetable.slot', table: substitution as any, create: z.object({ date: z.string(), slotId: z.string().uuid(), absentTeacherId: z.string().uuid(), substituteTeacherId: z.string().uuid() }), filters: { date: substitution.date } });
export const CalendarCrud = crudController({ path: 'calendar/events', module: 'calendar', perm: 'calendar.event', table: calendarEvent as any, create: Academics.calendarEventInput, filters: { kind: calendarEvent.kind }, sort: { column: calendarEvent.startsOn, dir: 'asc' } });
