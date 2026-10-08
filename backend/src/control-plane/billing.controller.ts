import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Billing } from '@aadhyay/contracts';
import { DbService } from '../db/db.service';
import { invoice, invoiceLine, tenant, subscription } from '../db/schema';
import { AllowSuspended, Can, Public } from '../kernel/auth/decorators';
import { Z } from '../common/zod.pipe';
import { BillingService } from './billing.service';
import { Ctx } from '../kernel/context/request-context';
import { PaymentsAdapter } from '../adapters/payments/payments.adapter';
import { AppError } from '../common/errors';

/** Institution-side Usage & Billing page (docs/03 §8, master plan §15.1). Works while suspended. */
@Controller('billing')
export class BillingController {
  constructor(private readonly db: DbService, private readonly billing: BillingService, private readonly payments: PaymentsAdapter) {}

  @AllowSuspended() @Can('org.billing.view', 'org.*') @Get('summary')
  async summary() {
    const tid = Ctx.tenantId();
    const [t] = await this.db.admin.select().from(tenant).where(eq(tenant.id, tid));
    const [sub] = await this.db.admin.select().from(subscription).where(eq(subscription.tenantId, tid)).orderBy(desc(subscription.createdAt)).limit(1);
    const invoices = await this.db.admin.select().from(invoice).where(eq(invoice.tenantId, tid)).orderBy(desc(invoice.issuedAt)).limit(24);
    const students = await this.billing.activeStudents(tid);
    return {
      status: t!.status, planCode: t!.planCode, trialEndsAt: t!.trialEndsAt, periodEndsAt: t!.periodEndsAt, graceEndsAt: t!.graceEndsAt, suspendedAt: t!.suspendedAt, purgeAt: t!.purgeAt,
      activeStudents: students, subscription: sub ?? null, invoices, wallet: await this.billing.walletSummary(tid),
    };
  }

  @AllowSuspended() @Can('org.billing.view', 'org.*') @Post('quote')
  quote(@Body(Z(Billing.tenantQuoteInput)) b: any) {
    return this.billing.tenantQuote(Ctx.tenantId(), b);
  }

  /** Accept a quote → tax invoice → payment order. */
  @AllowSuspended() @Can('org.billing.manage', 'org.*') @Post('checkout')
  async checkout(@Body(Z(Billing.tenantQuoteInput)) b: any) {
    const tid = Ctx.tenantId();
    const q = await this.billing.tenantQuote(tid, b);
    const inv = await this.billing.createInvoice(tid, q, 'tax');
    return { invoice: inv, payment: await this.billing.payInvoice(tid, inv.id) };
  }

  @AllowSuspended() @Can('org.billing.view', 'org.*') @Get('invoices/:id')
  async invoiceDetail(@Param('id') id: string) {
    const [inv] = await this.db.admin.select().from(invoice).where(eq(invoice.id, id));
    if (!inv || inv.tenantId !== Ctx.tenantId()) throw new AppError('NOT_FOUND', 'Invoice not found');
    return { ...inv, lines: await this.db.admin.select().from(invoiceLine).where(eq(invoiceLine.invoiceId, id)) };
  }

  @AllowSuspended() @Can('org.billing.manage', 'org.*') @Post('invoices/:id/pay')
  pay(@Param('id') id: string) {
    return this.billing.payInvoice(Ctx.tenantId(), id);
  }

  @AllowSuspended() @Can('org.billing.manage', 'org.*') @Post('wallet/topup')
  topup(@Body(Z(Billing.walletTopup)) b: { amountPaise: number }) {
    return this.billing.topupOrder(Ctx.tenantId(), b.amountPaise);
  }

  /** Razorpay Checkout success handler (client posts the three values). */
  @AllowSuspended() @Post('payments/confirm')
  confirm(@Body(Z(z.object({ orderId: z.string(), paymentId: z.string(), signature: z.string() }))) b: any) {
    return this.billing.confirmPayment(b.orderId, b.paymentId, b.signature);
  }
}

/** Razorpay webhook for Aadhyay's own account (subscriptions & wallet). */
@Controller('webhooks/razorpay-platform')
export class PlatformPaymentWebhook {
  constructor(private readonly billing: BillingService, private readonly payments: PaymentsAdapter) {}
  @Public() @Post()
  async hook(@Req() req: FastifyRequest & { rawBody?: Buffer }) {
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body);
    if (!this.payments.verifyWebhook(this.payments.platformCreds(), raw, req.headers['x-razorpay-signature'] as string)) throw new AppError('FORBIDDEN', 'Bad signature');
    const body = req.body as any;
    if (body?.event === 'payment.captured' || body?.event === 'order.paid') {
      const p = body.payload?.payment?.entity;
      if (p?.order_id) await this.billing.confirmPayment(p.order_id, p.id, null, true);
    }
    return { ok: true };
  }
}
