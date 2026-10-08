import { Module } from '@nestjs/common';
import { AcademicsController, TimetableController, CalendarController, ClassCrud, SectionCrud, SubjectCrud, ClassSubjectCrud, PeriodCrud, SubstitutionCrud, CalendarCrud } from './academics.controller';
import { AcademicsService } from './academics.service';

@Module({
  controllers: [AcademicsController, TimetableController, CalendarController, ClassCrud, SectionCrud, SubjectCrud, ClassSubjectCrud, PeriodCrud, SubstitutionCrud, CalendarCrud],
  providers: [AcademicsService],
  exports: [AcademicsService],
})
export class AcademicsModule {}
