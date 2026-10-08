import { Body, Controller, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { batch, batchStudent, coupon, order, course, creditResult, programme, placementDrive, branch, student } from '../../db/schema';
import { Can, RequireModule, PublicTenant } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { Ctx } from '../../kernel/context/request-context';
import { badRequest, notFound } from '../../common/errors';
import { crudController } from '../../common/crud';
import { FeesService } from '../fees/fees.service';
import { PaymentsAdapter } from '../../adapters/payments/payments.adapter';
import { PeopleService } from '../people/people.service';
import { sgpa } from '../exams/grading';
import { phoneIN } from '@aadhyay/contracts';

/** Coaching / creator storefront (0% platform commission — money goes to the institution's gateway). */
@Injectable()
export class PacksService {
  constructor(private readonly db: DbService, private readonly fees: FeesService, private readonly payments: PaymentsAdapter, private readonly people: PeopleService) {}

  async addToBatch(batchId: string, studentIds: string[]) {
    await this.db.t((tx) => tx.insert(batchStudent).values(studentIds.map((s) => ({ tenantId: Ctx.tenantId(), batchId, studentId: s }))).onConflictDoNothing());
    return { added: studentIds.length };
  }
  async storefront() {
    return this.db.t((tx) => tx.select({ id: course.id, title: course.title, slug: course.slug, description: course.description, pricePaise: course.pricePaise, coverFileId: course.coverFileId }).from(course).where(eq(course.isPublished, true)));
  }
  async checkout(b: { courseId: string; buyerName: string; buyerPhone: string; couponCode?: string }) {
    return this.db.t(async (tx) => {
      const [c] = await tx.select().from(course).where(and(eq(course.id, b.courseId), eq(course.isPublished, true)));
      if (!c) throw notFound('Course');
      let amount = c.pricePaise;
      if (b.couponCode) {
        const [cp] = await tx.select().from(coupon).where(eq(coupon.code, b.couponCode.toUpperCase()));
        if (!cp || (cp.validTill && cp.validTill < new Date()) || (cp.maxUses && cp.used >= cp.maxUses)) throw badRequest('Invalid or expired coupon');
        amount = Math.max(0, amount - (cp.percent ? Math.round((amount * cp.percent) / 100) : cp.amountPaise ?? 0));
      }
      const creds = await this.fees.gatewayCreds();
      const o = await this.payments.createOrder(creds, Math.max(amount, 100), `course-${c.slug}`.slice(0, 40), { courseId: c.id });
      const [ord] = await tx.insert(order).values({ tenantId: Ctx.tenantId(), buyerPhone: b.buyerPhone, buyerName: b.buyerName, courseId: c.id, couponCode: b.couponCode?.toUpperCase(), amountPaise: amount, gatewayRef: o.id }).returning();
      return { orderId: ord!.id, gatewayOrderId: o.id, keyId: o.keyId, amountPaise: amount };
    });
  }
  /** Payment confirmed → learner account + course access (student record + login). */
  async confirmOrder(gatewayOrderId: string, paymentId: string, signature: string) {
    const creds = await this.fees.gatewayCreds();
    if (!this.payments.verifyCheckout(creds, gatewayOrderId, paymentId, signature)) throw badRequest('Invalid payment signature');
    const [o] = await this.db.t((tx) => tx.select().from(order).where(eq(order.gatewayRef, gatewayOrderId)));
    if (!o) throw notFound('Order');
    if (o.status === 'succeeded') return { ok: true };
    const st = await this.people.createStudent({ name: o.buyerName, phone: o.buyerPhone, guardians: [] });
    await this.db.t(async (tx) => {
      await tx.update(order).set({ status: 'succeeded' }).where(eq(order.id, o.id));
      if (o.couponCode) await tx.update(coupon).set({ used: sql`${coupon.used} + 1` }).where(eq(coupon.code, o.couponCode));
      await tx.update(course).set({ audience: sql`jsonb_set(coalesce(${course.audience}, '{}'::jsonb), '{studentIds}', coalesce(${course.audience}->'studentIds', '[]'::jsonb) || ${JSON.stringify([st.id])}::jsonb)` }).where(eq(course.id, o.courseId));
    });
    return { ok: true, studentId: st.id };
  }

  // ---- College ----
  async cgpa(studentId: string) {
    const rows = await this.db.t((tx) => tx.select().from(creditResult).where(eq(creditResult.studentId, studentId)));
    const sems = [...new Set(rows.map((r) => r.semester))].sort((a, b) => a - b);
    return { semesters: sems.map((s) => ({ semester: s, sgpa: sgpa(rows.filter((r) => r.semester === s)), credits: rows.filter((r) => r.semester === s).reduce((a, r) => a + r.credits, 0), backlogs: rows.filter((r) => r.semester === s && r.isBacklog).length })), cgpa: sgpa(rows) };
  }

  // ---- Multi-branch group view ----
  async groupDashboard() {
    const r = await this.db.t((tx) => tx.execute(sql`select b.id, b.name, b.code,
      (select count(*)::int from students s where s.branch_id = b.id and s.status = 'active') as students,
      (select count(*)::int from staff s where s.branch_id = b.id and s.status = 'active') as staff,
      (select coalesce(sum(r.total_paise),0)::bigint from receipts r join students s on s.id = r.student_id where s.branch_id = b.id and r.cancelled_at is null and date_trunc('month', r.collected_at) = date_trunc('month', now())) as collected_month
      from branches b order by b.name`));
    return (r.rows as any[]).map((x) => ({ ...x, collectedMonthPaise: Number(x.collected_month) }));
  }
}

@RequireModule('coaching') @Controller('coaching')
export class CoachingController {
  constructor(private readonly svc: PacksService) {}
  @Can('coaching.batch.edit') @Post('batches/:id/students') add(@Param('id') id: string, @Body(Z(z.object({ studentIds: z.array(z.string().uuid()).min(1) }))) b: any) { return this.svc.addToBatch(id, b.studentIds); }
}
@Controller('store')
export class StoreController {
  constructor(private readonly svc: PacksService) {}
  @PublicTenant() @Get('courses') courses() { return this.svc.storefront(); }
  @PublicTenant() @Post('checkout') checkout(@Body(Z(z.object({ courseId: z.string().uuid(), buyerName: z.string().min(2), buyerPhone: phoneIN, couponCode: z.string().optional() }))) b: any) { return this.svc.checkout(b); }
  @PublicTenant() @Post('confirm') confirm(@Body(Z(z.object({ orderId: z.string(), paymentId: z.string(), signature: z.string() }))) b: any) { return this.svc.confirmOrder(b.orderId, b.paymentId, b.signature); }
}
@RequireModule('college') @Controller('college')
export class CollegeController {
  constructor(private readonly svc: PacksService) {}
  @Get('students/:id/cgpa') cgpa(@Param('id') id: string) { return this.svc.cgpa(id); }
}
@RequireModule('multibranch') @Controller('multibranch')
export class MultiBranchController {
  constructor(private readonly svc: PacksService) {}
  @Can('multibranch.dashboard.view', 'reports.dashboard.view') @Get('dashboard') dash() { return this.svc.groupDashboard(); }
}

const cruds = [
  crudController({ path: 'coaching/batches', module: 'coaching', perm: 'coaching.batch', table: batch as any, create: z.object({ name: z.string(), code: z.string().optional(), courseName: z.string().optional(), centre: z.string().optional(), startsOn: z.string().optional(), endsOn: z.string().optional(), feePaise: z.number().int().nonnegative().default(0), capacity: z.number().int().optional() }), search: [batch.name] }),
  crudController({ path: 'coaching/coupons', module: 'coaching', perm: 'coaching.coupon', table: coupon as any, create: z.object({ code: z.string().regex(/^[A-Z0-9]{3,20}$/), percent: z.number().min(1).max(100).optional(), amountPaise: z.number().int().positive().optional(), maxUses: z.number().int().positive().optional(), validTill: z.coerce.date().optional() }) }),
  crudController({ path: 'coaching/orders', module: 'coaching', perm: 'coaching.order', table: order as any, create: z.object({}), readonly: true, filters: { courseId: order.courseId, status: order.status } }),
  crudController({ path: 'college/programmes', module: 'college', perm: 'college.programme', table: programme as any, create: z.object({ name: z.string(), code: z.string(), semesters: z.number().int().min(1).max(12), creditsRequired: z.number().int().optional() }) }),
  crudController({ path: 'college/credit-results', module: 'college', perm: 'college.result', table: creditResult as any, create: z.object({ studentId: z.string().uuid(), semester: z.number().int(), subjectId: z.string().uuid(), credits: z.number().positive(), gradePoint: z.number().min(0).max(10), isBacklog: z.boolean().default(false) }), filters: { studentId: creditResult.studentId, semester: creditResult.semester } }),
  crudController({ path: 'college/placements', module: 'college', perm: 'college.placement', table: placementDrive as any, create: z.object({ company: z.string(), role: z.string(), ctcPaise: z.number().int().optional(), eligibility: z.record(z.string(), z.unknown()).default({}), date: z.coerce.date().optional() }) }),
];

@Module({ controllers: [CoachingController, StoreController, CollegeController, MultiBranchController, ...cruds], providers: [PacksService] })
export class PacksModule {}
