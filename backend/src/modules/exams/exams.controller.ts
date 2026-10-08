import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Exams } from '@aadhyay/contracts';
import { Can, RequireModule } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { ExamsService } from './exams.service';
import { PeopleService } from '../people/people.service';
import { crudController } from '../../common/crud';
import { gradeScale, exam, examSchedule, examGroup } from '../../db/schema';
import { hasPermission } from '@aadhyay/contracts';
import { Ctx } from '../../kernel/context/request-context';

@RequireModule('exams')
@Controller('exams')
export class ExamsController {
  constructor(private readonly svc: ExamsService, private readonly people: PeopleService) {}

  @Can('exams.exam.create') @Post('groups')
  group(@Body(Z(Exams.examGroupInput)) b: any) {
    return this.svc.createGroup(b);
  }
  @Can('exams.exam.view', 'exams.marks.view') @Get('detail/:id')
  detail(@Param('id') id: string) {
    return this.svc.examDetail(id);
  }
  @Can('exams.marks.view', 'exams.marks.create') @Get('marks/:scheduleId')
  grid(@Param('scheduleId') id: string, @Query('sectionId') sectionId: string) {
    return this.svc.marksGrid(id, sectionId);
  }
  @Can('exams.marks.create', 'exams.marks.edit') @Post('marks')
  marks(@Body(Z(Exams.marksInput)) b: any) {
    return this.svc.enterMarks(b);
  }
  @Can('exams.result.manage', 'exams.exam.edit') @Post(':id/compute')
  compute(@Param('id') id: string) {
    return this.svc.compute(id);
  }
  @Can('exams.result.publish', 'exams.exam.approve') @Post(':id/publish')
  publish(@Param('id') id: string, @Body() b: { notify?: boolean }) {
    return this.svc.publish(id, b?.notify !== false);
  }
  @Can('exams.result.publish', 'exams.exam.approve') @Post(':id/unpublish')
  unpublish(@Param('id') id: string) {
    return this.svc.unpublish(id);
  }
  @Can('exams.exam.view') @Get(':id/sections/:sectionId/results')
  results(@Param('id') id: string, @Param('sectionId') sid: string) {
    return this.svc.sectionResults(id, sid);
  }
  /** Parents/students see only published results. */
  @Get('report-card/:studentId')
  async reportCard(@Param('studentId') sid: string, @Query('groupId') groupId: string) {
    await this.people.assertCanSeeStudent(sid);
    const staffView = hasPermission(Ctx.get().permissions ?? [], 'exams.exam.view');
    return this.svc.reportCard(sid, groupId, !staffView);
  }
}

export const GradeScaleCrud = crudController({ path: 'exams/grade-scales', module: 'exams', perm: 'exams.exam', table: gradeScale as any, create: Exams.gradeScaleInput });
export const ExamGroupCrud = crudController({ path: 'exams/groups-list', module: 'exams', perm: 'exams.exam', table: examGroup as any, create: Exams.examGroupInput, readonly: true });
export const ExamCrud = crudController({ path: 'exams/exams', module: 'exams', perm: 'exams.exam', table: exam as any, create: Exams.examInput, filters: { groupId: exam.groupId } });
export const ScheduleCrud = crudController({ path: 'exams/schedules', module: 'exams', perm: 'exams.exam', table: examSchedule as any, create: Exams.scheduleInput, filters: { examId: examSchedule.examId, classId: examSchedule.classId } });
