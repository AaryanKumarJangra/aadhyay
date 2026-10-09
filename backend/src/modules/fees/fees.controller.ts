import { Body, Controller, Get, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { Fees } from '@aadhyay/contracts';
import { Can, RequireModule, Public } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { FeesService } from './fees.service';
import { PeopleService } from '../people/people.service';
import { crudController } from '../../common/crud';
import { feeHead, feeDiscount, tenant } from '../../db/schema';
import { DbService } from '../../db/db.service';
import { Ctx } from '../../kernel/context/request-context';
import { todayIn } from '../../common/dates';
import { receiptPdf } from '../../common/pdf/receipt-pdf';
import { PaymentsAdapter } from '../../adapters/payments/payments.adapter';
import { TenantService } from '../../kernel/tenancy/tenant.service';
import { AppError } from '../../common/errors';

@RequireModule('fees')
@Controller('fees')
export class FeesController {
  constructor(private readonly svc: FeesService, private readonly people: PeopleService, private readonly db: DbService) {}

  @Can('fees.structure.view') @Get('structures')
  structures() {
    return this.svc.structures();
  }
  @Can('fees.structure.create') @Post('structures')
  createStructure(@Body(Z(Fees.feeStructureInput)) b: any) {
    return this.svc.createStructure(b);
  }
  @Can('fees.structure.edit') @Post('assign')
  assign(@Body(Z(Fees.assignStructure)) b: any) {
    return this.svc.assign(b.structureId, b.studentIds);
  }
  @Can('fees.structure.edit') @Post('adhoc')
  adhoc(@Body(Z(z.object({ studentIds: z.array(z.string().uuid()).min(1), headId: z.string().uuid(), title: z.string(), amountPaise: z.number().int().positive(), dueOn: z.string() }))) b: any) {
    return this.svc.addAdhoc(b);
  }
  @Get('students/:id/ledger')
  async ledger(@Param('id') id: string) {
    await this.people.assertCanSeeStudent(id, 'fees.payment.view');
    return this.svc.ledger(id);
  }
  @Can('fees.discount.create', 'fees.discount.approve') @Post('discounts/apply')
  discount(@Body(Z(Fees.discountApply)) b: any) {
    return this.svc.applyDiscount(b);
  }
  @Can('fees.payment.create') @Post('collect')
  collect(@Body(Z(Fees.collectFee)) b: any) {
    return this.svc.collect(b);
  }
  @Get('receipts/:id')
  async receipt(@Param('id') id: string) {
    const r = await this.svc.receiptDetail(id);
    await this.people.assertCanSeeStudent(r.studentId, 'fees.payment.view');
    return r;
  }
  @Get('receipts/:id/pdf')
  async receiptPdf(@Param('id') id: string, @Query('format') format: 'a4' | 'thermal' = 'a4', @Res() res: FastifyReply) {
    const r = await this.svc.receiptDetail(id);
    await this.people.assertCanSeeStudent(r.studentId, 'fees.payment.view');
    const [t] = await this.db.admin.select().from(tenant).where(eq(tenant.id, Ctx.tenantId()));
    const b = (t!.branding ?? {}) as any;
    const pdf = await receiptPdf({ institution: { name: t!.name, address: b.address, phone: b.phone, affiliation: b.affiliation }, number: r.number, date: r.collectedAt, mode: r.mode, reference: r.reference, student: { name: r.student!.name, admissionNo: r.student!.admissionNo }, lines: r.lines, totalPaise: r.totalPaise, cancelled: !!r.cancelledAt }, format);
    res.header('Content-Type', 'application/pdf').header('Content-Disposition', `inline; filename="${r.number.replace(/\//g, '-')}.pdf"`).send(pdf);
  }
  @Can('fees.payment.delete', 'fees.payment.approve') @Post('receipts/:id/cancel')
  cancel(@Param('id') id: string, @Body(Z(Fees.cancelReceipt)) b: any) {
    return this.svc.cancelReceipt(id, b.reason);
  }
  @Can('fees.report.view', 'fees.payment.view') @Get('defaulters')
  defaulters(@Query() q: any) {
    return this.svc.defaulters({ ...q, minOverduePaise: q.minOverduePaise ? Number(q.minOverduePaise) : 0 });
  }
  @Can('fees.report.view', 'fees.payment.view') @Get('dashboard')
  dashboard(@Query('from') from?: string, @Query('to') to?: string) {
    const today = todayIn(Ctx.get().tenantTz);
    return this.svc.dashboard(from ?? `${today.slice(0, 7)}-01`, to ?? today);
  }

  /** Institution's own Razorpay keys (money settles to their bank, never to Aadhyay). */
  @Can('fees.settings.manage') @Put('gateway')
  gateway(@Body(Z(z.object({ keyId: z.string().startsWith('rzp_'), keySecret: z.string().min(10), webhookSecret: z.string().optional() }))) b: any) {
    return this.svc.setGateway(b);
  }
  /** Parent app "Pay now". */
  @Post('online/init')
  async onlineInit(@Body(Z(Fees.onlinePayInit)) b: any) {
    await this.people.assertCanSeeStudent(b.studentId, 'fees.payment.create');
    return this.svc.onlineInit(b.studentId, b.studentFeeIds);
  }
  @Post('online/confirm')
  onlineConfirm(@Body(Z(z.object({ orderId: z.string(), paymentId: z.string(), signature: z.string() }))) b: any) {
    return this.svc.onlineConfirm(b.orderId, b.paymentId, b.signature);
  }
}

/** Per-institution Razorpay webhook: /v1/webhooks/razorpay/:slug */
@Controller('webhooks/razorpay')
export class FeesWebhookController {
  constructor(private readonly svc: FeesService, private readonly payments: PaymentsAdapter, private readonly tenants: TenantService) {}
  @Public() @Post(':slug')
  async hook(@Param('slug') slug: string, @Req() req: FastifyRequest & { rawBody?: Buffer }) {
    const t = await this.tenants.byIdOrSlug(slug);
    if (!t) throw new AppError('NOT_FOUND', 'Unknown institution');
    return Ctx.asTenant(t.id, async () => {
      const creds = await this.svc.gatewayCreds(t.id);
      const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body);
      if (!this.payments.verifyWebhook(creds, raw, req.headers['x-razorpay-signature'] as string)) throw new AppError('FORBIDDEN', 'Bad signature');
      const body = req.body as any;
      const p = body?.payload?.payment?.entity;
      if ((body?.event === 'payment.captured' || body?.event === 'order.paid') && p?.order_id) await this.svc.onlineConfirm(p.order_id, p.id, null, true);
      return { ok: true };
    }, { tenantTz: t.timezone });
  }
}

export const FeeHeadCrud = crudController({ path: 'fees/heads', module: 'fees', perm: 'fees.structure', table: feeHead as any, create: Fees.feeHeadInput, sort: { column: feeHead.name, dir: 'asc' } });
export const FeeDiscountCrud = crudController({ path: 'fees/discount-types', module: 'fees', perm: 'fees.discount', table: feeDiscount as any, create: z.object({ name: z.string(), kind: z.enum(['sibling', 'staff', 'scholarship', 'rte', 'custom']), percent: z.number().min(0).max(100).optional(), amountPaise: z.number().int().optional(), requiresApproval: z.boolean().default(false) }) });
