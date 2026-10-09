import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
import { Attendance } from '@aadhyay/contracts';
import { Can, RequireModule, DeviceAuth, Scoped } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { AttendanceService } from './attendance.service';
import { PeopleService } from '../people/people.service';
import { DbService } from '../../db/db.service';
import { attendanceDevice } from '../../db/schema';
import { Ctx } from '../../kernel/context/request-context';
import { todayIn } from '../../common/dates';
import { Authz } from '../../kernel/authz/authz';

@RequireModule('attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly svc: AttendanceService, private readonly people: PeopleService, private readonly db: DbService) {}

  @Can('attendance.student.create', 'attendance.student.edit') @Scoped() @Post('sections/mark')
  mark(@Body(Z(Attendance.markSectionAttendance.extend({ force: z.boolean().default(false) }))) b: any) {
    return this.svc.markSection(b, b.force);
  }
  @Can('attendance.student.view', 'attendance.student.create') @Scoped() @Get('sections')
  sections(@Query('date') date?: string) {
    return this.svc.mySections(date ?? todayIn(Ctx.get().tenantTz));
  }
  @Can('attendance.student.view') @Scoped() @Get('sections/:id')
  register(@Param('id') id: string, @Query('date') date?: string, @Query('periodId') periodId?: string) {
    return this.svc.register(id, date ?? todayIn(Ctx.get().tenantTz), periodId);
  }
  @Can('attendance.student.view') @Scoped() @Get('sections/:id/monthly')
  monthly(@Param('id') id: string, @Query('month') month: string) {
    return this.svc.monthly(id, month ?? todayIn(Ctx.get().tenantTz).slice(0, 7));
  }
  @Get('students/:id')
  async history(@Param('id') id: string, @Query('from') from: string, @Query('to') to: string) {
    await this.people.assertCanSeeStudent(id, 'attendance.student.view');
    const today = todayIn(Ctx.get().tenantTz);
    return this.svc.studentHistory(id, from ?? `${today.slice(0, 7)}-01`, to ?? today);
  }
  @Can('attendance.staff.create') @Post('staff/mark')
  staff(@Body(Z(Attendance.markStaffAttendance)) b: any) {
    return this.svc.markStaff(b);
  }

  /** Device endpoint: header X-Device-Key. */
  @DeviceAuth() @Post('device/punch')
  punch(@Body(Z(Attendance.devicePunch)) b: any, @Req() req: any) {
    return this.svc.devicePunch(req.device, b.punches);
  }

  @Can('attendance.device.manage') @Post('devices')
  async addDevice(@Body(Z(z.object({ kind: z.enum(['qr_scanner', 'rfid', 'face', 'biometric', 'gate_app']), name: z.string(), serial: z.string(), branchId: z.string().uuid().optional() }))) b: any) {
    const key = `dev_${randomBytes(24).toString('base64url')}`;
    const [d] = await this.db.t((tx) => tx.insert(attendanceDevice).values({ ...b, tenantId: Ctx.tenantId(), apiKeyHash: createHash('sha256').update(key).digest('hex') }).returning());
    return { ...d, apiKey: key, note: 'Store this key on the device now; it is not shown again.' };
  }

  @Can('attendance.device.manage') @Get('devices')
  devices() {
    return this.db.t((tx) => tx.select({ id: attendanceDevice.id, kind: attendanceDevice.kind, name: attendanceDevice.name, serial: attendanceDevice.serial, isActive: attendanceDevice.isActive, lastSeenAt: attendanceDevice.lastSeenAt }).from(attendanceDevice));
  }

  @Can('attendance.leave.create', 'self.*') @Scoped() @Post('leave')
  async applyLeave(@Body(Z(Attendance.leaveRequestInput)) b: any) {
    if (b.studentId) await this.people.assertCanSeeStudent(b.studentId, 'attendance.leave.create');
    else Authz.assert('attendance.leave.create', { staffId: b.staffId ?? Ctx.get().personIds?.staff ?? null });
    return this.svc.applyLeave(b);
  }
  @Can('attendance.leave.approve') @Scoped() @Post('leave/:id/decide')
  decide(@Param('id') id: string, @Body(Z(Attendance.leaveDecision)) b: any) {
    return this.svc.decideLeave(id, b.status);
  }
  @Can('attendance.leave.view', 'attendance.leave.approve') @Scoped() @Get('leave')
  leaves(@Query('status') status?: string) {
    return this.svc.leaves(status);
  }
}

