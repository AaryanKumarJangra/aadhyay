import { Module } from '@nestjs/common';
import { ExamsController, GradeScaleCrud, ExamGroupCrud, ExamCrud, ScheduleCrud } from './exams.controller';
import { ExamsService } from './exams.service';

@Module({ controllers: [ExamsController, GradeScaleCrud, ExamGroupCrud, ExamCrud, ScheduleCrud], providers: [ExamsService], exports: [ExamsService] })
export class ExamsModule {}
