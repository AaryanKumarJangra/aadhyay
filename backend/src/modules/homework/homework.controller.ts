import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Can, RequireModule, Scoped } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { HomeworkService } from './homework.service';
import { PeopleService } from '../people/people.service';

const assign = z.object({ sectionId: z.string().uuid(), subjectId: z.string().uuid(), title: z.string().min(1), body: z.string().optional(), attachments: z.array(z.string().uuid()).default([]), dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), maxMarks: z.number().positive().optional() });

@RequireModule('homework')
@Controller('homework')
export class HomeworkController {
  constructor(private readonly svc: HomeworkService, private readonly people: PeopleService) {}

  @Can('homework.assignment.create') @Scoped() @Post()
  assign(@Body(Z(assign)) b: any) {
    return this.svc.assign(b);
  }
  @Can('homework.assignment.view', 'self.*') @Scoped() @Get('sections/:id')
  list(@Param('id') id: string, @Query('from') from?: string) {
    return this.svc.forSection(id, from);
  }
  @Can('self.*', 'homework.assignment.edit') @Scoped() @Post(':id/submit')
  async submit(@Param('id') id: string, @Body(Z(z.object({ studentId: z.string().uuid(), files: z.array(z.string().uuid()).max(10).default([]), text: z.string().max(5000).optional() }))) b: any) {
    await this.people.assertCanSeeStudent(b.studentId, 'homework.assignment.edit');
    return this.svc.submit(id, b.studentId, b);
  }
  @Can('homework.assignment.view') @Scoped() @Get(':id/submissions')
  submissions(@Param('id') id: string) {
    return this.svc.submissions(id);
  }
  @Can('homework.assignment.edit') @Scoped() @Patch('submissions/:id')
  evaluate(@Param('id') id: string, @Body(Z(z.object({ marks: z.number().nonnegative().optional(), feedback: z.string().optional(), status: z.enum(['evaluated', 'returned']).default('evaluated') }))) b: any) {
    return this.svc.evaluate(id, b);
  }
  @Can('homework.diary.create') @Scoped() @Post('diary')
  diary(@Body(Z(z.object({ sectionId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), body: z.string().min(1) }))) b: any) {
    return this.svc.postDiary(b);
  }
  @Can('homework.assignment.view', 'self.*') @Scoped() @Get('diary/:sectionId')
  getDiary(@Param('sectionId') id: string, @Query('date') date?: string) {
    return this.svc.diary(id, date);
  }
}
