import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, sql, sum } from 'drizzle-orm';
import { DbService, Tx } from '../../db/db.service';
import { feeHead, feeStructure, feeStructureItem, studentFee, receipt, receiptLine, paymentIntent, ledgerAccount, journalEntry, journalLine, enrollment, student, schoolClass, section, tenant } from '../../db/schema';
import { Ctx } from '../../kernel/context/request-context';
import { EventsService } from '../../kernel/events/events.service';
import { currentSession } from '../academics/session.util';
import { nextNumber } from '../../common/numbering';
import { financialYear } from '../../common/money';
import { badRequest, notFound, AppError } from '../../common/errors';
import { todayIn, addDays } from '../../common/dates';
import { lateFee, allocate, type FeeLine, type LateRule } from './fee-math';
import { PaymentsAdapter, GatewayCreds } from '../../adapters/payments/payments.adapter';
import { decrypt, encrypt } from '../../common/crypto';

type Mode = 'cash' | 'upi' | 'card' | 'netbanking' | 'cheque' | 'dd' | 'bank_transfer' | 'online';

@Injectable()
export class FeesService {
  constructor(private readonly db: DbService, private readonly events: EventsService, private readonly payments: PaymentsAdapter) {}

  async createStructure(b: { sessionId?: string; classId?: string; category?: string; name: string; lateFeeRule: LateRule; items: { headId: string; amountPaise: number; installmentNo: number; dueOn: string }[] }) {
    return this.db.t(async (tx) => {
      const sid = b.sessionId ?? (await currentSession(tx)).id;
      const [s] = await tx.insert(feeStructure).values({ tenantId: Ctx.tenantId(), sessionId: sid, classId: b.classId, category: b.category, name: b.name, lateFeeRule: b.lateFeeRule }).returning();
      const items = await tx.insert(feeStructureItem).values(b.items.map((i) => ({ ...i, tenantId: Ctx.tenantId(), structureId: s!.id }))).returning();
      return { ...s!, items };
    });
  }

  async structures() {
    return this.db.t(async (tx) => {
      const ss = await tx.select().from(feeStructure).orderBy(desc(feeStructure.createdAt));
      const items = ss.length ? await tx.select({ id: feeStructureItem.id, structureId: feeStructureItem.structureId, headId: feeStructureItem.headId, head: feeHead.name, amountPaise: feeStructureItem.amountPaise, installmentNo: feeStructureItem.installmentNo, dueOn: feeStructureItem.dueOn })
        .from(feeStructureItem).leftJoin(feeHead, eq(feeHead.id, feeStructureItem.headId)).where(inArray(feeStructureItem.structureId, ss.map((s) => s.id))) : [];
      return ss.map((s) => ({ ...s, items: items.filter((i) => i.structureId === s.id), totalPaise: items.filter((i) => i.structureId === s.id).reduce((a, i) => a + i.amountPaise, 0) }));
    });
  }

  /** Assign a structure to students (default: everyone in its class & category this session). Idempotent per item. */
  async assign(structureId: string, studentIds?: string[]) {
    return this.db.t(async (tx) => {
      const [s] = await tx.select().from(feeStructure).where(eq(feeStructure.id, structureId));
      if (!s) throw notFound('Fee structure');
      const items = await tx.select({ i: feeStructureItem, head: feeHead.name }).from(feeStructureItem).innerJoin(feeHead, eq(feeHead.id, feeStructureItem.headId)).where(eq(feeStructureItem.structureId, structureId));
      let ids = studentIds;
      if (!ids) {
        const rows = await tx.select({ id: student.id }).from(enrollment).innerJoin(student, eq(student.id, enrollment.studentId))
          .where(and(eq(enrollment.sessionId, s.sessionId), eq(enrollment.status, 'active'), s.classId ? eq(enrollment.classId, s.classId) : undefined, s.category ? eq(student.category, s.category) : undefined));
        ids = rows.map((r) => r.id);
      }
      if (!ids.length) return { assigned: 0, students: 0 };
      const existing = await tx.select({ sid: studentFee.studentId, item: studentFee.structureItemId }).from(studentFee).where(and(inArray(studentFee.studentId, ids), inArray(studentFee.structureItemId, items.map((x) => x.i.id))));
      const have = new Set(existing.map((e) => `${e.sid}|${e.item}`));
      const rows = ids.flatMap((sid) => items.filter((x) => !have.has(`${sid}|${x.i.id}`)).map((x) => ({
        tenantId: Ctx.tenantId(), studentId: sid, sessionId: s.sessionId, structureItemId: x.i.id, headId: x.i.headId,
        title: `${x.head}${items.length > 1 && x.i.installmentNo ? ` — Installment ${x.i.installmentNo}` : ''}`, amountPaise: x.i.amountPaise, dueOn: x.i.dueOn,
      })));
      if (rows.length) await tx.insert(studentFee).values(rows);
      await this.events.emit('fee.assigned', { structureId, students: ids.length, lines: rows.length });
      return { assigned: rows.length, students: ids.length };
    });
  }

  /** One-off fee (e.g. exam fee, transport) for specific students. */
  async addAdhoc(b: { studentIds: string[]; headId: string; title: string; amountPaise: number; dueOn: string }) {
    return this.db.t(async (tx) => {
      const sess = await currentSession(tx);
      await tx.insert(studentFee).values(b.studentIds.map((sid) => ({ tenantId: Ctx.tenantId(), studentId: sid, sessionId: sess.id, headId: b.headId, title: b.title, amountPaise: b.amountPaise, dueOn: b.dueOn })));
      return { added: b.studentIds.length };
    });
  }

  private async lateRules(tx: Tx) {
    const rows = await tx.select({ itemId: feeStructureItem.id, rule: feeStructure.lateFeeRule }).from(feeStructureItem).innerJoin(feeStructure, eq(feeStructure.id, feeStructureItem.structureId));
    return new Map(rows.map((r) => [r.itemId, r.rule as LateRule]));
  }

  /** Student fee ledger with live late fees and outstanding. */
  async ledger(studentId: string, on = todayIn(Ctx.maybe()?.tenantTz)) {
    return this.db.t(async (tx) => {
      const rules = await this.lateRules(tx);
      const fees = await tx.select().from(studentFee).where(and(eq(studentFee.studentId, studentId), ne(studentFee.status, 'cancelled'))).orderBy(asc(studentFee.dueOn));
      const lines = fees.map((f) => {
        const lateDue = f.status === 'paid' ? f.lateFeePaise : lateFee(f.dueOn, on, f.structureItemId ? rules.get(f.structureItemId) : undefined);
        const due = f.amountPaise - f.discountPaise - f.paidPaise + Math.max(0, lateDue - f.lateFeePaise);
        return { ...f, lateDuePaise: Math.max(lateDue, f.lateFeePaise), outstandingPaise: f.status === 'waived' ? 0 : Math.max(0, due), overdue: f.dueOn < on && due > 0 };
      });
      const receipts = await tx.select().from(receipt).where(eq(receipt.studentId, studentId)).orderBy(desc(receipt.collectedAt));
      return {
        lines, receipts,
        totals: {
          feePaise: lines.reduce((s, l) => s + l.amountPaise, 0), discountPaise: lines.reduce((s, l) => s + l.discountPaise, 0), paidPaise: lines.reduce((s, l) => s + l.paidPaise + l.lateFeePaise, 0),
          outstandingPaise: lines.reduce((s, l) => s + l.outstandingPaise, 0), overduePaise: lines.filter((l) => l.overdue).reduce((s, l) => s + l.outstandingPaise, 0),
        },
      };
    });
  }

  async applyDiscount(b: { studentFeeIds: string[]; percent?: number; amountPaise?: number; reason: string }) {
    if (!b.percent && !b.amountPaise) throw badRequest('percent or amountPaise required');
    return this.db.t(async (tx) => {
      const fees = await tx.select().from(studentFee).where(inArray(studentFee.id, b.studentFeeIds));
      for (const f of fees) {
        const d = b.percent ? Math.round((f.amountPaise * b.percent) / 100) : Math.min(b.amountPaise!, f.amountPaise);
        if (d + f.paidPaise > f.amountPaise) throw badRequest(`Discount exceeds unpaid amount on ${f.title}`);
        await tx.update(studentFee).set({ discountPaise: d, status: d + f.paidPaise >= f.amountPaise ? 'paid' : f.status }).where(eq(studentFee.id, f.id));
      }
      return { updated: fees.length, reason: b.reason };
    });
  }

  private async account(tx: Tx, code: string) {
    const [a] = await tx.select().from(ledgerAccount).where(eq(ledgerAccount.code, code));
    if (!a) throw new AppError('INTERNAL', `Ledger account ${code} missing`);
    return a;
  }

  /** Collect a payment (counter or online). Allocates, issues a receipt, posts a balanced journal entry. */
  async collect(b: { studentId: string; mode: Mode; reference?: string; allocations?: { studentFeeId: string; amountPaise: number }[]; amountPaise: number; collectedAt?: string; waiveLateFee?: boolean }, gatewayRef?: string) {
    if (b.amountPaise <= 0) throw badRequest('Amount must be positive');
    const created = await this.db.t(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'fees:' + b.studentId}))`);
      const on = (b.collectedAt ?? new Date().toISOString()).slice(0, 10);
      const rules = await this.lateRules(tx);
      const fees = await tx.select().from(studentFee).where(and(eq(studentFee.studentId, b.studentId), inArray(studentFee.status, ['unpaid', 'partial'])));
      const lines: FeeLine[] = fees.map((f) => ({ id: f.id, amountPaise: f.amountPaise, discountPaise: f.discountPaise, paidPaise: f.paidPaise, lateFeePaise: f.lateFeePaise, dueOn: f.dueOn, lateDuePaise: b.waiveLateFee ? 0 : lateFee(f.dueOn, on, f.structureItemId ? rules.get(f.structureItemId) : undefined) }));
      let alloc: { studentFeeId: string; principalPaise: number; lateFeePaise: number }[];
      if (b.allocations?.length) {
        const sumA = b.allocations.reduce((s, a) => s + a.amountPaise, 0);
        if (sumA !== b.amountPaise) throw badRequest('Allocations must add up to the amount');
        alloc = [];
        for (const a of b.allocations) {
          const l = lines.find((x) => x.id === a.studentFeeId);
          if (!l) throw badRequest('Fee line not payable');
          const r = allocate(a.amountPaise, [l]);
          if (r.remainderPaise > 0) throw badRequest('Allocation exceeds the amount due on a fee line');
          alloc.push(...r.allocations);
        }
      } else {
        const r = allocate(b.amountPaise, lines);
        if (r.remainderPaise > 0) throw badRequest(`Amount exceeds total due by ₹${r.remainderPaise / 100}`);
        alloc = r.allocations;
      }
      const number = await nextNumber(tx, `receipt:${financialYear()}`, `R/${financialYear()}/`, 5);
      const [rc] = await tx.insert(receipt).values({ tenantId: Ctx.tenantId(), number, studentId: b.studentId, totalPaise: b.amountPaise, mode: b.mode, reference: b.reference, gatewayRef, collectedBy: Ctx.userId(), collectedAt: b.collectedAt ? new Date(b.collectedAt) : new Date() }).returning();
      for (const a of alloc) {
        const f = fees.find((x) => x.id === a.studentFeeId)!;
        const paid = f.paidPaise + a.principalPaise;
        await tx.update(studentFee).set({ paidPaise: paid, lateFeePaise: f.lateFeePaise + a.lateFeePaise, status: paid + f.discountPaise >= f.amountPaise ? 'paid' : 'partial' }).where(eq(studentFee.id, f.id));
        await tx.insert(receiptLine).values({ tenantId: Ctx.tenantId(), receiptId: rc!.id, studentFeeId: f.id, amountPaise: a.principalPaise, lateFeePaise: a.lateFeePaise });
      }
      // Double entry: Dr Cash/Bank/Gateway, Cr Fee income (+ Late fee income)
      const debitCode = b.mode === 'cash' ? '1000' : b.mode === 'online' ? '1020' : '1010';
      const principal = alloc.reduce((s, a) => s + a.principalPaise, 0);
      const late = alloc.reduce((s, a) => s + a.lateFeePaise, 0);
      const [je] = await tx.insert(journalEntry).values({ tenantId: Ctx.tenantId(), date: on, narration: `Fee receipt ${number}`, refType: 'receipt', refId: rc!.id, createdBy: Ctx.userId() }).returning();
      const jl = [{ accountId: (await this.account(tx, debitCode)).id, debitPaise: b.amountPaise, creditPaise: 0 }, { accountId: (await this.account(tx, '4000')).id, debitPaise: 0, creditPaise: principal }];
      if (late) jl.push({ accountId: (await this.account(tx, '4010')).id, debitPaise: 0, creditPaise: late });
      await tx.insert(journalLine).values(jl.map((l) => ({ ...l, tenantId: Ctx.tenantId(), entryId: je!.id })));
      await this.events.emit('fee.paid', { studentId: b.studentId, receiptId: rc!.id, number, amountPaise: b.amountPaise, mode: b.mode });
      return rc!;
    });
    return this.receiptDetail(created.id);
  }

  async receiptDetail(id: string) {
    return this.db.t(async (tx) => {
      const [r] = await tx.select().from(receipt).where(eq(receipt.id, id));
      if (!r) throw notFound('Receipt');
      const lines = await tx.select({ title: studentFee.title, amountPaise: receiptLine.amountPaise, lateFeePaise: receiptLine.lateFeePaise, dueOn: studentFee.dueOn }).from(receiptLine).innerJoin(studentFee, eq(studentFee.id, receiptLine.studentFeeId)).where(eq(receiptLine.receiptId, id));
      const [s] = await tx.select({ name: student.name, admissionNo: student.admissionNo }).from(student).where(eq(student.id, r.studentId));
      return { ...r, lines, student: s };
    });
  }

  async cancelReceipt(id: string, reason: string) {
    return this.db.t(async (tx) => {
      const [r] = await tx.select().from(receipt).where(and(eq(receipt.id, id), isNull(receipt.cancelledAt)));
      if (!r) throw notFound('Active receipt');
      const lines = await tx.select().from(receiptLine).where(eq(receiptLine.receiptId, id));
      for (const l of lines) {
        const [f] = await tx.select().from(studentFee).where(eq(studentFee.id, l.studentFeeId));
        const paid = f!.paidPaise - l.amountPaise;
        await tx.update(studentFee).set({ paidPaise: paid, lateFeePaise: f!.lateFeePaise - l.lateFeePaise, status: paid <= 0 ? 'unpaid' : 'partial' }).where(eq(studentFee.id, f!.id));
      }
      await tx.update(receipt).set({ cancelledAt: new Date(), cancelReason: reason }).where(eq(receipt.id, id));
      const [orig] = await tx.select().from(journalEntry).where(and(eq(journalEntry.refType, 'receipt'), eq(journalEntry.refId, id)));
      if (orig) {
        const ol = await tx.select().from(journalLine).where(eq(journalLine.entryId, orig.id));
        const [je] = await tx.insert(journalEntry).values({ tenantId: Ctx.tenantId(), date: todayIn(Ctx.get().tenantTz), narration: `Reversal of ${r.number}: ${reason}`, refType: 'receipt_cancel', refId: id, createdBy: Ctx.userId() }).returning();
        await tx.insert(journalLine).values(ol.map((l) => ({ tenantId: Ctx.tenantId(), entryId: je!.id, accountId: l.accountId, debitPaise: l.creditPaise, creditPaise: l.debitPaise })));
      }
      await this.events.emit('fee.refunded', { receiptId: id, studentId: r.studentId, amountPaise: r.totalPaise, reason });
      return { ok: true };
    });
  }

  /** Defaulters: outstanding & overdue by class/section. */
  async defaulters(q: { classId?: string; sectionId?: string; minOverduePaise?: number }) {
    return this.db.t(async (tx) => {
      const sess = await currentSession(tx);
      const rows = await tx.execute(sql`
        select s.id as student_id, s.name, s.admission_no, c.name as class_name, sec.name as section_name, e.section_id,
          sum(f.amount_paise - f.discount_paise - f.paid_paise)::bigint as outstanding,
          sum(case when f.due_on < current_date then f.amount_paise - f.discount_paise - f.paid_paise else 0 end)::bigint as overdue,
          min(f.due_on) filter (where f.due_on < current_date) as oldest_due
        from student_fees f join students s on s.id = f.student_id
        left join enrollments e on e.student_id = s.id and e.session_id = ${sess.id}
        left join classes c on c.id = e.class_id left join sections sec on sec.id = e.section_id
        where f.status in ('unpaid','partial') ${q.classId ? sql`and e.class_id = ${q.classId}` : sql``} ${q.sectionId ? sql`and e.section_id = ${q.sectionId}` : sql``}
        group by s.id, s.name, s.admission_no, c.name, sec.name, e.section_id
        having sum(case when f.due_on < current_date then f.amount_paise - f.discount_paise - f.paid_paise else 0 end) > ${q.minOverduePaise ?? 0}
        order by overdue desc limit 1000`);
      return (rows.rows as any[]).map((r) => ({ studentId: r.student_id, name: r.name, admissionNo: r.admission_no, className: r.class_name, sectionName: r.section_name, sectionId: r.section_id, outstandingPaise: Number(r.outstanding), overduePaise: Number(r.overdue), oldestDue: r.oldest_due }));
    });
  }

  async dashboard(from: string, to: string) {
    return this.db.t(async (tx) => {
      const byMode = await tx.select({ mode: receipt.mode, total: sql<number>`sum(${receipt.totalPaise})::bigint`, n: sql<number>`count(*)::int` }).from(receipt)
        .where(and(isNull(receipt.cancelledAt), sql`${receipt.collectedAt}::date between ${from} and ${to}`)).groupBy(receipt.mode);
      const byDay = await tx.select({ day: sql<string>`${receipt.collectedAt}::date::text`, total: sql<number>`sum(${receipt.totalPaise})::bigint` }).from(receipt)
        .where(and(isNull(receipt.cancelledAt), sql`${receipt.collectedAt}::date between ${from} and ${to}`)).groupBy(sql`1`).orderBy(sql`1`);
      const [due] = await tx.select({ outstanding: sql<number>`coalesce(sum(${studentFee.amountPaise} - ${studentFee.discountPaise} - ${studentFee.paidPaise}),0)::bigint`, overdue: sql<number>`coalesce(sum(case when ${studentFee.dueOn} < current_date then ${studentFee.amountPaise} - ${studentFee.discountPaise} - ${studentFee.paidPaise} else 0 end),0)::bigint` })
        .from(studentFee).where(inArray(studentFee.status, ['unpaid', 'partial']));
      const total = byMode.reduce((s, r) => s + Number(r.total), 0);
      const online = byMode.filter((r) => r.mode === 'online' || r.mode === 'upi').reduce((s, r) => s + Number(r.total), 0);
      return { from, to, collectedPaise: total, onlinePct: total ? Math.round((online / total) * 100) : 0, byMode: byMode.map((r) => ({ ...r, total: Number(r.total) })), byDay: byDay.map((r) => ({ ...r, total: Number(r.total) })), outstandingPaise: Number(due?.outstanding ?? 0), overduePaise: Number(due?.overdue ?? 0) };
    });
  }

  // ---------------- Online payments (institution's own gateway account) ----------------
  async setGateway(b: { keyId: string; keySecret: string; webhookSecret?: string }) {
    await this.db.admin.update(tenant).set({ settings: sql`${tenant.settings} || ${JSON.stringify({ payments: { provider: 'razorpay', keyId: b.keyId, keySecretEnc: encrypt(b.keySecret), webhookSecretEnc: b.webhookSecret ? encrypt(b.webhookSecret) : null } })}::jsonb` }).where(eq(tenant.id, Ctx.tenantId()));
    return { ok: true, keyId: b.keyId };
  }
  async gatewayCreds(tenantId = Ctx.tenantId()): Promise<GatewayCreds> {
    const [t] = await this.db.admin.select({ settings: tenant.settings }).from(tenant).where(eq(tenant.id, tenantId));
    const p = (t?.settings as any)?.payments;
    if (!p?.keyId) return { keyId: 'rzp_log', keySecret: 'log' }; // dev / not configured → log gateway
    return { keyId: p.keyId, keySecret: decrypt(p.keySecretEnc), webhookSecret: p.webhookSecretEnc ? decrypt(p.webhookSecretEnc) : undefined };
  }

  async onlineInit(studentId: string, studentFeeIds: string[]) {
    const l = await this.ledger(studentId);
    const chosen = l.lines.filter((x) => studentFeeIds.includes(x.id) && x.outstandingPaise > 0);
    if (!chosen.length) throw badRequest('Nothing due on the selected fees');
    const amount = chosen.reduce((s, x) => s + x.outstandingPaise, 0);
    const creds = await this.gatewayCreds();
    const order = await this.payments.createOrder(creds, amount, `fee-${studentId.slice(0, 8)}`, { tenantId: Ctx.tenantId(), studentId });
    const [pi] = await this.db.t((tx) => tx.insert(paymentIntent).values({ tenantId: Ctx.tenantId(), studentId, feeIds: chosen.map((c) => c.id), amountPaise: amount, gateway: 'razorpay', gatewayOrderId: order.id, status: 'created', createdBy: Ctx.userId() }).returning());
    return { intentId: pi!.id, orderId: order.id, keyId: order.keyId, amountPaise: amount, currency: 'INR' };
  }

  /** Checkout callback or webhook → receipt (idempotent on order id). */
  async onlineConfirm(orderId: string, paymentId: string, signature: string | null, fromWebhook = false) {
    const [pi] = await this.db.t((tx) => tx.select().from(paymentIntent).where(eq(paymentIntent.gatewayOrderId, orderId)));
    if (!pi) throw notFound('Payment');
    if (pi.status === 'succeeded') return this.receiptDetail(pi.receiptId!);
    const creds = await this.gatewayCreds();
    if (!fromWebhook && !this.payments.verifyCheckout(creds, orderId, paymentId, signature ?? '')) throw new AppError('FORBIDDEN', 'Invalid payment signature');
    const l = await this.ledger(pi.studentId);
    const allocations = l.lines.filter((x) => pi.feeIds.includes(x.id) && x.outstandingPaise > 0).map((x) => ({ studentFeeId: x.id, amountPaise: x.outstandingPaise }));
    const total = allocations.reduce((s, a) => s + a.amountPaise, 0);
    const r = await this.collect({ studentId: pi.studentId, mode: 'online', reference: paymentId, allocations: total === pi.amountPaise ? allocations : undefined, amountPaise: Math.min(total, pi.amountPaise) }, paymentId);
    await this.db.t((tx) => tx.update(paymentIntent).set({ status: 'succeeded', receiptId: r.id, payload: { paymentId } }).where(eq(paymentIntent.id, pi.id)));
    return r;
  }

  /** Daily reminder job: fee.due_soon (T-3) and fee.overdue (every 7 days after due). */
  async reminders(on: string) {
    return this.db.t(async (tx) => {
      const soon = await tx.selectDistinct({ studentId: studentFee.studentId }).from(studentFee).where(and(inArray(studentFee.status, ['unpaid', 'partial']), eq(studentFee.dueOn, addDays(on, 3))));
      for (const s of soon) await this.events.emit('fee.due_soon', { studentId: s.studentId, dueOn: addDays(on, 3) });
      const overdue = await tx.execute(sql`select student_id, sum(amount_paise - discount_paise - paid_paise)::bigint as due, min(due_on) as oldest from student_fees
        where status in ('unpaid','partial') and due_on < ${on} group by student_id having mod((${on}::date - min(due_on)), 7) = 1`);
      for (const r of overdue.rows as any[]) await this.events.emit('fee.overdue', { studentId: r.student_id, duePaise: Number(r.due), oldestDue: r.oldest });
      return { dueSoon: soon.length, overdue: overdue.rows.length };
    });
  }
}
