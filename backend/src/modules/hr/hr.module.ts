import { Body, Controller, Get, Module, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { Can, RequireModule } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { HrService } from './hr.service';
import { crudController } from '../../common/crud';
import { leaveType, payrollRun } from '../../db/schema';
import { Ctx } from '../../kernel/context/request-context';

const salary = z.object({
  basicPaise: z.number().int().nonnegative(),
  components: z.array(z.object({ code: z.string().regex(/^[A-Z_]{2,12}$/), kind: z.enum(['earning', 'deduction']), type: z.enum(['fixed', 'percent_basic']), value: z.number().nonnegative() })).default([]),
  pfEnabled: z.boolean().default(true), esiEnabled: z.boolean().default(false), ptState: z.string().length(2).optional(), tdsMonthlyPaise: z.number().int().nonnegative().default(0),
});

@RequireModule('hr')
@Controller('hr')
export class HrController {
  constructor(private readonly svc: HrService) {}
  @Can('hr.leave.manage') @Post('leave/allot') allot(@Body(Z(z.object({ year: z.number().int() }))) b: any) { return this.svc.allotYear(b.year); }
  @Get('leave/balances/:staffId') balances(@Param('staffId') id: string, @Query('year') y?: string) { return this.svc.balances(id === 'me' ? Ctx.get().personIds?.staff ?? '' : id, Number(y ?? new Date().getFullYear())); }
  @Can('hr.leave.approve', 'attendance.leave.approve') @Post('leave/:id/consume') consume(@Param('id') id: string) { return this.svc.consumeLeave(id); }
}

@RequireModule('payroll')
@Controller('payroll')
export class PayrollController {
  constructor(private readonly svc: HrService) {}
  @Can('payroll.salary.edit') @Put('salary/:staffId') setSalary(@Param('staffId') id: string, @Body(Z(salary)) b: any) { return this.svc.setSalary(id, b); }
  @Can('payroll.run.create') @Post('runs') run(@Body(Z(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))) b: any) { return this.svc.run(b.month); }
  @Can('payroll.run.view') @Get('runs/:id/payslips') slips(@Param('id') id: string) { return this.svc.slips(id); }
  @Can('payroll.run.approve') @Post('runs/:id/approve') approve(@Param('id') id: string) { return this.svc.approve(id); }
  @Can('payroll.run.export') @Get('runs/:id/bank-file')
  async bank(@Param('id') id: string, @Res() res: FastifyReply) {
    res.header('Content-Type', 'text/csv').header('Content-Disposition', 'attachment; filename="salary-transfer.csv"').send(await this.svc.bankFile(id));
  }
}

export const LeaveTypeCrud = crudController({ path: 'hr/leave-types', module: 'hr', perm: 'hr.leave', table: leaveType as any, create: z.object({ name: z.string(), daysPerYear: z.number().nonnegative(), isPaid: z.boolean().default(true) }) });
export const PayrollRunCrud = crudController({ path: 'payroll/run-list', module: 'payroll', perm: 'payroll.run', table: payrollRun as any, create: z.object({}), readonly: true });

@Module({ controllers: [HrController, PayrollController, LeaveTypeCrud, PayrollRunCrud], providers: [HrService], exports: [HrService] })
export class HrModule {}
