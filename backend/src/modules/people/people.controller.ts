import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { People } from '@aadhyay/contracts';
import { Can, RequireModule } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { PeopleService } from './people.service';
import { crudController } from '../../common/crud';
import { department, designation, document } from '../../db/schema';

@RequireModule('people')
@Controller('people')
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Can('people.student.view') @Get('students')
  list(@Query() q: any) {
    return this.people.listStudents({ ...q, limit: q.limit ? Number(q.limit) : undefined });
  }
  @Can('people.student.create') @Post('students')
  create(@Body(Z(People.studentInput)) b: any) {
    return this.people.createStudent(b);
  }
  @Can('people.student.create') @Post('students/import')
  import(@Body(Z(z.object({ rows: z.array(z.record(z.string(), z.any())).min(1).max(5000), dryRun: z.boolean().default(true) }))) b: any) {
    return this.people.importStudents(b.rows, b.dryRun);
  }
  @Get('students/:id')
  async get(@Param('id') id: string) {
    await this.people.assertCanSeeStudent(id);
    return this.people.getStudent(id);
  }
  @Can('people.student.edit') @Patch('students/:id')
  update(@Param('id') id: string, @Body(Z(People.studentUpdate)) b: any) {
    return this.people.updateStudent(id, b);
  }
  @Can('people.guardian.create', 'people.student.edit') @Post('students/:id/guardians')
  addGuardian(@Param('id') id: string, @Body(Z(People.guardianInput)) b: any) {
    return this.people.addGuardian(id, b);
  }

  @Can('people.staff.view') @Get('staff')
  staff(@Query() q: any) {
    return this.people.listStaff(q);
  }
  @Can('people.staff.create') @Post('staff')
  createStaff(@Body(Z(People.staffInput)) b: any) {
    return this.people.createStaff(b);
  }

  /** Parent/student app: my children (multi-child switcher). */
  @Get('my/children')
  myChildren() {
    return this.people.myChildren();
  }
}

export const DepartmentCrud = crudController({ path: 'people/departments', module: 'people', perm: 'people.staff', table: department as any, create: z.object({ name: z.string().min(1) }), sort: { column: department.name, dir: 'asc' } });
export const DesignationCrud = crudController({ path: 'people/designations', module: 'people', perm: 'people.staff', table: designation as any, create: z.object({ name: z.string().min(1) }), sort: { column: designation.name, dir: 'asc' } });
export const DocumentCrud = crudController({ path: 'people/documents', module: 'people', perm: 'people.student', table: document as any, create: z.object({ ownerType: z.enum(['student', 'staff']), ownerId: z.string().uuid(), kind: z.string(), fileId: z.string().uuid() }), filters: { ownerId: document.ownerId, ownerType: document.ownerType } });
