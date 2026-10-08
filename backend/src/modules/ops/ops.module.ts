import { Body, Controller, Get, Module, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { Can, RequireModule, Public } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { OpsService } from './ops.service';
import { PeopleService } from '../people/people.service';
import { crudController } from '../../common/crud';
import { book, bookIssue, inventoryItem, supplier, stockMove, hostel, hostelRoom, hostelAllocation, outpass, infirmaryVisit, incident, certificateTemplate, issuedCertificate, alumni } from '../../db/schema';

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

@RequireModule('library') @Controller('library')
export class LibraryController {
  constructor(private readonly svc: OpsService) {}
  @Can('library.book.create') @Post('books/:id/copies') copies(@Param('id') id: string, @Body(Z(z.object({ barcodes: z.array(z.string().min(1)).min(1).max(500) }))) b: any) { return this.svc.addCopies(id, b.barcodes); }
  @Can('library.issue.create') @Post('issue') issue(@Body(Z(z.object({ barcode: z.string(), memberType: z.enum(['student', 'staff']), memberId: z.string().uuid(), days: z.number().int().min(1).max(90).optional() }))) b: any) { return this.svc.issueBook(b); }
  @Can('library.issue.create') @Post('return') ret(@Body(Z(z.object({ barcode: z.string(), finePerDayPaise: z.number().int().nonnegative().default(100) }))) b: any) { return this.svc.returnBook(b.barcode, b.finePerDayPaise); }
  @Get('opac') opac(@Query('q') q = '') { return this.svc.opac(q); }
  @Can('library.issue.view') @Get('overdue') overdue() { return this.svc.overdueBooks(); }
}

@RequireModule('inventory') @Controller('inventory')
export class InventoryController {
  constructor(private readonly svc: OpsService) {}
  @Can('inventory.stock.create') @Post('moves') move(@Body(Z(z.object({ itemId: z.string().uuid(), kind: z.enum(['in', 'out', 'adjust']), qty: z.number().nonnegative(), ratePaise: z.number().int().nonnegative().optional(), supplierId: z.string().uuid().optional(), issuedTo: z.string().optional(), note: z.string().optional() }))) b: any) { return this.svc.moveStock(b); }
  @Can('inventory.item.view') @Get('low-stock') low() { return this.svc.lowStock(); }
}

@RequireModule('hostel') @Controller('hostel')
export class HostelController {
  constructor(private readonly svc: OpsService, private readonly people: PeopleService) {}
  @Can('hostel.allocation.create') @Post('allocate') allocate(@Body(Z(z.object({ roomId: z.string().uuid(), studentId: z.string().uuid(), bedNo: z.number().int().optional(), fromDate: iso }))) b: any) { return this.svc.allocate(b); }
  @Can('hostel.allocation.edit') @Post('allocations/:id/vacate') vacate(@Param('id') id: string) { return this.svc.vacate(id); }
  @Post('outpass') async outpass(@Body(Z(z.object({ studentId: z.string().uuid(), reason: z.string().min(3), outAt: z.string().datetime(), returnBy: z.string().datetime() }))) b: any) { await this.people.assertCanSeeStudent(b.studentId); return this.svc.requestOutpass(b); }
  @Post('outpass/:id/parent') parent(@Param('id') id: string, @Body(Z(z.object({ status: z.enum(['approved', 'rejected']) }))) b: any) { return this.svc.decideOutpass(id, 'parent', b.status); }
  @Can('hostel.outpass.approve') @Post('outpass/:id/warden') warden(@Param('id') id: string, @Body(Z(z.object({ status: z.enum(['approved', 'rejected']) }))) b: any) { return this.svc.decideOutpass(id, 'warden', b.status); }
  @Can('hostel.outpass.edit') @Post('outpass/:id/returned') returned(@Param('id') id: string) { return this.svc.outpassReturned(id); }
}

@RequireModule('health') @Controller('health-records')
export class HealthController {
  constructor(private readonly svc: OpsService) {}
  @Can('health.record.edit') @Put(':studentId') upsert(@Param('studentId') id: string, @Body(Z(z.object({ heightCm: z.number().optional(), weightKg: z.number().optional(), allergies: z.string().optional(), conditions: z.string().optional(), vaccinations: z.array(z.record(z.string(), z.unknown())).optional() }))) b: any) { return this.svc.upsertHealth(id, b); }
  @Can('health.visit.create') @Post('visits') visit(@Body(Z(z.object({ studentId: z.string().uuid(), complaint: z.string(), treatment: z.string().optional(), sentHome: z.boolean().default(false) }))) b: any) { return this.svc.infirmaryVisit(b); }
}

@RequireModule('canteen') @Controller('canteen')
export class CanteenController {
  constructor(private readonly svc: OpsService, private readonly people: PeopleService) {}
  @Can('canteen.pos.create') @Post('txn') txn(@Body(Z(z.object({ studentId: z.string().uuid(), amountPaise: z.number().int(), items: z.array(z.record(z.string(), z.unknown())).optional() }))) b: any) { return this.svc.canteen(b); }
  @Post('limit') async limit(@Body(Z(z.object({ studentId: z.string().uuid(), dailyLimitPaise: z.number().int().positive().nullable() }))) b: any) { await this.people.assertCanSeeStudent(b.studentId); return this.svc.setDailyLimit(b.studentId, b.dailyLimitPaise); }
}

@RequireModule('behaviour') @Controller('behaviour')
export class BehaviourController {
  constructor(private readonly svc: OpsService, private readonly people: PeopleService) {}
  @Get('students/:id') async summary(@Param('id') id: string) { await this.people.assertCanSeeStudent(id); return this.svc.behaviourSummary(id); }
}

@RequireModule('certificates') @Controller('certificates')
export class CertificatesController {
  constructor(private readonly svc: OpsService) {}
  @Can('certificates.certificate.create') @Post('issue') issue(@Body(Z(z.object({ templateId: z.string().uuid(), ownerType: z.enum(['student', 'staff']), ownerIds: z.array(z.string().uuid()).min(1).max(1000), extra: z.record(z.string(), z.string()).default({}) }))) b: any) { return this.svc.issueCertificate(b.templateId, b.ownerType, b.ownerIds, b.extra); }
  @Can('certificates.certificate.print', 'certificates.certificate.create') @Post('pdf')
  async pdf(@Body(Z(z.object({ ids: z.array(z.string().uuid()).min(1).max(1000) }))) b: any, @Res() res: FastifyReply) {
    res.header('Content-Type', 'application/pdf').send(await this.svc.certificatePdf(b.ids));
  }
}
@Controller('public/certificates')
export class CertificateVerifyController {
  constructor(private readonly svc: OpsService) {}
  @Public() @Get('verify/:code') verify(@Param('code') code: string) { return this.svc.verify(code); }
}

@RequireModule('alumni') @Controller('alumni-actions')
export class AlumniController {
  constructor(private readonly svc: OpsService) {}
  @Can('alumni.alumni.create') @Post('convert') convert(@Body(Z(z.object({ studentIds: z.array(z.string().uuid()).min(1), batchYear: z.number().int() }))) b: any) { return this.svc.convertToAlumni(b.studentIds, b.batchYear); }
}

const cruds = [
  crudController({ path: 'library/books', module: 'library', perm: 'library.book', table: book as any, create: z.object({ isbn: z.string().optional(), title: z.string(), author: z.string().optional(), publisher: z.string().optional(), category: z.string().optional(), rack: z.string().optional() }), search: [book.title, book.author, book.isbn] }),
  crudController({ path: 'library/issues', module: 'library', perm: 'library.issue', table: bookIssue as any, create: z.object({}), readonly: true, filters: { memberId: bookIssue.memberId } }),
  crudController({ path: 'inventory/items', module: 'inventory', perm: 'inventory.item', table: inventoryItem as any, create: z.object({ name: z.string(), category: z.string().optional(), unit: z.string().default('pcs'), sku: z.string().optional(), reorderLevel: z.number().nonnegative().default(0), isAsset: z.boolean().default(false) }), search: [inventoryItem.name, inventoryItem.sku] }),
  crudController({ path: 'inventory/suppliers', module: 'inventory', perm: 'inventory.item', table: supplier as any, create: z.object({ name: z.string(), phone: z.string().optional(), gstin: z.string().optional(), address: z.string().optional() }), search: [supplier.name] }),
  crudController({ path: 'inventory/moves', module: 'inventory', perm: 'inventory.stock', table: stockMove as any, create: z.object({}), readonly: true, filters: { itemId: stockMove.itemId } }),
  crudController({ path: 'hostel/hostels', module: 'hostel', perm: 'hostel.hostel', table: hostel as any, create: z.object({ name: z.string(), kind: z.enum(['boys', 'girls', 'mixed']).default('boys'), wardenStaffId: z.string().uuid().optional() }) }),
  crudController({ path: 'hostel/rooms', module: 'hostel', perm: 'hostel.hostel', table: hostelRoom as any, create: z.object({ hostelId: z.string().uuid(), number: z.string(), roomType: z.string().default('standard'), beds: z.number().int().positive(), feePaise: z.number().int().nonnegative().default(0) }), filters: { hostelId: hostelRoom.hostelId } }),
  crudController({ path: 'hostel/allocations', module: 'hostel', perm: 'hostel.allocation', table: hostelAllocation as any, create: z.object({}), readonly: true, filters: { roomId: hostelAllocation.roomId, studentId: hostelAllocation.studentId } }),
  crudController({ path: 'hostel/outpasses', module: 'hostel', perm: 'hostel.outpass', table: outpass as any, create: z.object({}), readonly: true, filters: { studentId: outpass.studentId } }),
  crudController({ path: 'health-records/visits', module: 'health', perm: 'health.visit', table: infirmaryVisit as any, create: z.object({}), readonly: true, filters: { studentId: infirmaryVisit.studentId } }),
  crudController({ path: 'behaviour/incidents', module: 'behaviour', perm: 'behaviour.incident', table: incident as any, create: z.object({ title: z.string(), points: z.number().int().default(0), description: z.string().optional(), studentIds: z.array(z.string().uuid()).min(1) }), beforeWrite: (d, m) => (m === 'create' ? { ...d, reportedBy: undefined } : d) }),
  crudController({ path: 'certificates/templates', module: 'certificates', perm: 'certificates.template', table: certificateTemplate as any, create: z.object({ kind: z.enum(['tc', 'character', 'bonafide', 'custom', 'id_card_student', 'id_card_staff']), name: z.string(), layout: z.object({ title: z.string().optional(), body: z.string().optional(), fields: z.array(z.object({ label: z.string(), key: z.string() })).optional(), background: z.string().optional() }) }) }),
  crudController({ path: 'certificates/issued', module: 'certificates', perm: 'certificates.certificate', table: issuedCertificate as any, create: z.object({}), readonly: true, filters: { ownerId: issuedCertificate.ownerId, templateId: issuedCertificate.templateId } }),
  crudController({ path: 'alumni/records', module: 'alumni', perm: 'alumni.alumni', table: alumni as any, create: z.object({ name: z.string(), batchYear: z.number().int(), phone: z.string().optional(), email: z.string().email().optional(), occupation: z.string().optional(), city: z.string().optional() }), search: [alumni.name, alumni.city], filters: { batchYear: alumni.batchYear } }),
];

@Module({ controllers: [LibraryController, InventoryController, HostelController, HealthController, CanteenController, BehaviourController, CertificatesController, CertificateVerifyController, AlumniController, ...cruds], providers: [OpsService], exports: [OpsService] })
export class OpsModule {}
