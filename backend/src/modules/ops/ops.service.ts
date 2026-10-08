import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, isNull, lt, or, sql, inArray } from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { DbService } from '../../db/db.service';
import { book, bookCopy, bookIssue, inventoryItem, stockMove, hostelRoom, hostelAllocation, outpass, healthRecord, infirmaryVisit, studentWallet, canteenTxn, incident, certificateTemplate, issuedCertificate, alumni, student, staff, tenant, enrollment, schoolClass, section, guardian, studentGuardian } from '../../db/schema';
import { Ctx } from '../../kernel/context/request-context';
import { CommsService } from '../comms/comms.service';
import { badRequest, notFound, forbidden, AppError } from '../../common/errors';
import { todayIn, addDays, daysBetween } from '../../common/dates';
import { shortCode } from '../../common/ids';
import { env } from '../../config/env';
import { currentSession } from '../academics/session.util';

@Injectable()
export class OpsService {
  constructor(private readonly db: DbService, private readonly comms: CommsService) {}

  // ---------------- Library ----------------
  async addCopies(bookId: string, barcodes: string[]) {
    return this.db.t((tx) => tx.insert(bookCopy).values(barcodes.map((b) => ({ tenantId: Ctx.tenantId(), bookId, barcode: b }))).returning());
  }
  async issueBook(b: { barcode: string; memberType: 'student' | 'staff'; memberId: string; days?: number }) {
    return this.db.t(async (tx) => {
      const [c] = await tx.select().from(bookCopy).where(eq(bookCopy.barcode, b.barcode));
      if (!c) throw notFound('Copy');
      if (c.status !== 'available') throw badRequest(`Copy is ${c.status}`);
      const open = await tx.select({ n: sql<number>`count(*)::int` }).from(bookIssue).where(and(eq(bookIssue.memberId, b.memberId), isNull(bookIssue.returnedOn)));
      if ((open[0]?.n ?? 0) >= (b.memberType === 'staff' ? 10 : 3)) throw badRequest('Borrowing limit reached');
      const today = todayIn(Ctx.get().tenantTz);
      await tx.update(bookCopy).set({ status: 'issued' }).where(eq(bookCopy.id, c.id));
      const [i] = await tx.insert(bookIssue).values({ tenantId: Ctx.tenantId(), copyId: c.id, memberType: b.memberType, memberId: b.memberId, issuedOn: today, dueOn: addDays(today, b.days ?? 14) }).returning();
      return i;
    });
  }
  async returnBook(barcode: string, finePerDayPaise = 100) {
    return this.db.t(async (tx) => {
      const [c] = await tx.select().from(bookCopy).where(eq(bookCopy.barcode, barcode));
      if (!c) throw notFound('Copy');
      const [i] = await tx.select().from(bookIssue).where(and(eq(bookIssue.copyId, c.id), isNull(bookIssue.returnedOn)));
      if (!i) throw badRequest('Copy is not issued');
      const today = todayIn(Ctx.get().tenantTz);
      const late = Math.max(0, daysBetween(i.dueOn, today));
      const [r] = await tx.update(bookIssue).set({ returnedOn: today, finePaise: late * finePerDayPaise }).where(eq(bookIssue.id, i.id)).returning();
      await tx.update(bookCopy).set({ status: 'available' }).where(eq(bookCopy.id, c.id));
      return { ...r, lateDays: late };
    });
  }
  async opac(q: string) {
    return this.db.t((tx) => tx.select({ id: book.id, title: book.title, author: book.author, isbn: book.isbn, rack: book.rack, available: sql<number>`(select count(*)::int from book_copies c where c.book_id = ${book.id} and c.status = 'available')`, total: sql<number>`(select count(*)::int from book_copies c where c.book_id = ${book.id})` })
      .from(book).where(or(ilike(book.title, `%${q}%`), ilike(book.author, `%${q}%`), eq(book.isbn, q))).limit(50));
  }
  async overdueBooks() {
    return this.db.t((tx) => tx.select({ i: bookIssue, title: book.title, barcode: bookCopy.barcode }).from(bookIssue).innerJoin(bookCopy, eq(bookCopy.id, bookIssue.copyId)).innerJoin(book, eq(book.id, bookCopy.bookId))
      .where(and(isNull(bookIssue.returnedOn), lt(bookIssue.dueOn, todayIn(Ctx.get().tenantTz)))));
  }

  // ---------------- Inventory ----------------
  async moveStock(b: { itemId: string; kind: 'in' | 'out' | 'adjust'; qty: number; ratePaise?: number; supplierId?: string; issuedTo?: string; note?: string }) {
    return this.db.t(async (tx) => {
      const [it] = await tx.execute(sql`select * from inventory_items where id = ${b.itemId} for update`).then((r) => r.rows as any[]);
      if (!it) throw notFound('Item');
      const next = b.kind === 'in' ? it.stock + b.qty : b.kind === 'out' ? it.stock - b.qty : b.qty;
      if (next < 0) throw badRequest(`Only ${it.stock} ${it.unit} in stock`);
      await tx.update(inventoryItem).set({ stock: next }).where(eq(inventoryItem.id, b.itemId));
      const [m] = await tx.insert(stockMove).values({ ...b, ratePaise: b.ratePaise ?? 0, tenantId: Ctx.tenantId() }).returning();
      return { move: m, stock: next, lowStock: next <= it.reorder_level };
    });
  }
  async lowStock() {
    return this.db.t((tx) => tx.select().from(inventoryItem).where(sql`${inventoryItem.stock} <= ${inventoryItem.reorderLevel}`).orderBy(asc(inventoryItem.name)));
  }

  // ---------------- Hostel ----------------
  async allocate(b: { roomId: string; studentId: string; bedNo?: number; fromDate: string }) {
    return this.db.t(async (tx) => {
      const [room] = await tx.select().from(hostelRoom).where(eq(hostelRoom.id, b.roomId));
      if (!room) throw notFound('Room');
      const [occ] = await tx.select({ n: sql<number>`count(*)::int` }).from(hostelAllocation).where(and(eq(hostelAllocation.roomId, b.roomId), isNull(hostelAllocation.toDate)));
      if ((occ?.n ?? 0) >= room.beds) throw badRequest('Room is full');
      await tx.update(hostelAllocation).set({ toDate: b.fromDate }).where(and(eq(hostelAllocation.studentId, b.studentId), isNull(hostelAllocation.toDate)));
      const [a] = await tx.insert(hostelAllocation).values({ ...b, tenantId: Ctx.tenantId() }).returning();
      return a;
    });
  }
  async vacate(allocationId: string) {
    const [a] = await this.db.t((tx) => tx.update(hostelAllocation).set({ toDate: todayIn(Ctx.get().tenantTz) }).where(eq(hostelAllocation.id, allocationId)).returning());
    if (!a) throw notFound('Allocation');
    return a;
  }
  async requestOutpass(b: { studentId: string; reason: string; outAt: string; returnBy: string }) {
    const [o] = await this.db.t((tx) => tx.insert(outpass).values({ tenantId: Ctx.tenantId(), studentId: b.studentId, reason: b.reason, outAt: new Date(b.outAt), returnBy: new Date(b.returnBy) }).returning());
    const recipients = (await this.comms.perChild([b.studentId])).filter((r) => r.userId);
    await this.comms.notify({ eventKey: 'leave.requested', recipients, vars: {}, data: { outpassId: o!.id } });
    return o;
  }
  /** Parent approves their own child's outpass; warden approves for the hostel. */
  async decideOutpass(id: string, by: 'parent' | 'warden', status: 'approved' | 'rejected') {
    return this.db.t(async (tx) => {
      const [o] = await tx.select().from(outpass).where(eq(outpass.id, id));
      if (!o) throw notFound('Outpass');
      if (by === 'parent') {
        const gid = Ctx.get().personIds?.guardian;
        const [link] = gid ? await tx.select().from(studentGuardian).where(and(eq(studentGuardian.guardianId, gid), eq(studentGuardian.studentId, o.studentId))) : [];
        if (!link) throw forbidden('Only the student’s guardian can approve');
      }
      const [r] = await tx.update(outpass).set(by === 'parent' ? { parentApproval: status } : { wardenApproval: status }).where(eq(outpass.id, id)).returning();
      return r;
    });
  }
  async outpassReturned(id: string) {
    const [r] = await this.db.t((tx) => tx.update(outpass).set({ returnedAt: new Date() }).where(eq(outpass.id, id)).returning());
    return r;
  }

  // ---------------- Health ----------------
  async upsertHealth(studentId: string, b: any) {
    const [r] = await this.db.t((tx) => tx.insert(healthRecord).values({ ...b, studentId, tenantId: Ctx.tenantId() }).onConflictDoUpdate({ target: healthRecord.studentId, set: b }).returning());
    return r;
  }
  async infirmaryVisit(b: { studentId: string; complaint: string; treatment?: string; sentHome: boolean }) {
    const [v] = await this.db.t((tx) => tx.insert(infirmaryVisit).values({ ...b, tenantId: Ctx.tenantId() }).returning());
    const recipients = await this.comms.perChild([b.studentId]);
    await this.comms.notify({ eventKey: 'notice.published', recipients, vars: { title: 'Visited the school infirmary', body: `${b.complaint}${b.treatment ? ' — ' + b.treatment : ''}${b.sentHome ? '. Please pick up your child.' : '.'}` }, urgent: b.sentHome });
    return v;
  }

  // ---------------- Canteen wallet ----------------
  async canteen(b: { studentId: string; amountPaise: number; items?: unknown[] }) {
    return this.db.t(async (tx) => {
      await tx.insert(studentWallet).values({ tenantId: Ctx.tenantId(), studentId: b.studentId }).onConflictDoNothing();
      const [w] = await tx.execute(sql`select * from student_wallets where student_id = ${b.studentId} for update`).then((r) => r.rows as any[]);
      const bal = Number(w.balance_paise) + b.amountPaise;
      if (bal < 0) throw badRequest('Insufficient canteen balance');
      if (b.amountPaise < 0 && w.daily_limit_paise) {
        const [spent] = await tx.select({ s: sql<number>`coalesce(-sum(${canteenTxn.amountPaise}),0)::bigint` }).from(canteenTxn).where(and(eq(canteenTxn.studentId, b.studentId), sql`${canteenTxn.amountPaise} < 0`, sql`${canteenTxn.at}::date = current_date`));
        if (Number(spent?.s ?? 0) - b.amountPaise > Number(w.daily_limit_paise)) throw badRequest('Daily spending limit set by parent reached');
      }
      await tx.update(studentWallet).set({ balancePaise: bal }).where(eq(studentWallet.studentId, b.studentId));
      await tx.insert(canteenTxn).values({ tenantId: Ctx.tenantId(), studentId: b.studentId, amountPaise: b.amountPaise, items: b.items ?? [] });
      return { balancePaise: bal };
    });
  }
  async setDailyLimit(studentId: string, limitPaise: number | null) {
    await this.db.t(async (tx) => {
      await tx.insert(studentWallet).values({ tenantId: Ctx.tenantId(), studentId }).onConflictDoNothing();
      await tx.update(studentWallet).set({ dailyLimitPaise: limitPaise }).where(eq(studentWallet.studentId, studentId));
    });
    return { ok: true };
  }

  // ---------------- Behaviour ----------------
  async behaviourSummary(studentId: string) {
    return this.db.t((tx) => tx.select().from(incident).where(sql`${studentId} = any(${incident.studentIds})`).orderBy(desc(incident.at)));
  }

  // ---------------- Certificates & ID cards ----------------
  /** Merge student/staff data into a template, store with a verify code, return a PDF with a QR to the public verify page. */
  async issueCertificate(templateId: string, ownerType: 'student' | 'staff', ownerIds: string[], extra: Record<string, string> = {}) {
    const out: { id: string; verifyCode: string; ownerId: string }[] = [];
    await this.db.t(async (tx) => {
      const [tpl] = await tx.select().from(certificateTemplate).where(eq(certificateTemplate.id, templateId));
      if (!tpl) throw notFound('Template');
      const sess = await currentSession(tx);
      for (const id of ownerIds) {
        let data: Record<string, unknown>;
        if (ownerType === 'student') {
          const [s] = await tx.select({ s: student, cls: schoolClass.name, sec: section.name }).from(student).leftJoin(enrollment, and(eq(enrollment.studentId, student.id), eq(enrollment.sessionId, sess.id))).leftJoin(schoolClass, eq(schoolClass.id, enrollment.classId)).leftJoin(section, eq(section.id, enrollment.sectionId)).where(eq(student.id, id));
          if (!s) throw notFound('Student');
          const gs = await tx.select({ name: guardian.name, relation: studentGuardian.relation }).from(studentGuardian).innerJoin(guardian, eq(guardian.id, studentGuardian.guardianId)).where(eq(studentGuardian.studentId, id));
          data = { name: s.s.name, admissionNo: s.s.admissionNo, dob: s.s.dob, class: s.cls ? `${s.cls}-${s.sec}` : '', father: gs.find((g) => g.relation === 'father')?.name ?? '', mother: gs.find((g) => g.relation === 'mother')?.name ?? '', admittedOn: s.s.admittedOn, leftOn: s.s.leftOn, bloodGroup: s.s.bloodGroup, ...extra };
        } else {
          const [s] = await tx.select().from(staff).where(eq(staff.id, id));
          if (!s) throw notFound('Staff');
          data = { name: s.name, employeeCode: s.employeeCode, joiningDate: s.joiningDate, phone: s.phone, ...extra };
        }
        const verifyCode = shortCode(10);
        const [c] = await tx.insert(issuedCertificate).values({ tenantId: Ctx.tenantId(), templateId, ownerType, ownerId: id, verifyCode, data, issuedBy: Ctx.userId() }).returning();
        out.push({ id: c!.id, verifyCode, ownerId: id });
      }
    });
    return out;
  }
  async certificatePdf(ids: string[]): Promise<Buffer> {
    const [t] = await this.db.admin.select().from(tenant).where(eq(tenant.id, Ctx.tenantId()));
    const certs = await this.db.t((tx) => tx.select({ c: issuedCertificate, tpl: certificateTemplate }).from(issuedCertificate).innerJoin(certificateTemplate, eq(certificateTemplate.id, issuedCertificate.templateId)).where(inArray(issuedCertificate.id, ids)));
    if (!certs.length) throw notFound('Certificate');
    const isCard = certs[0]!.tpl.kind.startsWith('id_card');
    const doc = new PDFDocument({ size: isCard ? [243, 153] : 'A4', layout: isCard ? 'landscape' : 'portrait', margin: isCard ? 8 : 50, autoFirstPage: false });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));
    const host = `${t!.slug}.${env.APP_BASE_DOMAIN}`;
    for (const { c, tpl } of certs) {
      doc.addPage();
      const layout = tpl.layout as any;
      const data = c.data as Record<string, unknown>;
      const qr = await QRCode.toBuffer(`https://${host}/verify/${c.verifyCode}`, { margin: 0, width: isCard ? 60 : 90 });
      doc.font('Helvetica-Bold').fontSize(isCard ? 10 : 20).text(t!.name, { align: 'center' });
      if (layout?.title) doc.moveDown(isCard ? 0.2 : 1).fontSize(isCard ? 8 : 16).text(layout.title, { align: 'center' });
      doc.moveDown(isCard ? 0.3 : 1.5).font('Helvetica').fontSize(isCard ? 7 : 12);
      if (layout?.body) doc.text(String(layout.body).replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => String(data[k] ?? '')), { align: isCard ? 'left' : 'justify', lineGap: isCard ? 1 : 4 });
      for (const f of (layout?.fields ?? []) as { label: string; key: string }[]) doc.text(`${f.label}: ${data[f.key] ?? ''}`);
      doc.image(qr, doc.page.width - (isCard ? 70 : 140), doc.page.height - (isCard ? 70 : 160), { width: isCard ? 60 : 90 });
      doc.fontSize(isCard ? 5 : 8).fillColor('#555').text(`Verify: ${host}/verify/${c.verifyCode}`, doc.page.margins.left, doc.page.height - (isCard ? 14 : 60));
      doc.fillColor('#000');
    }
    doc.end();
    return done;
  }
  /** Public QR verification (anyone can check a certificate is genuine; minimal data shown). */
  async verify(code: string) {
    const [c] = await this.db.admin.select({ c: issuedCertificate, kind: certificateTemplate.kind, name: certificateTemplate.name, tenantName: tenant.name }).from(issuedCertificate)
      .innerJoin(certificateTemplate, eq(certificateTemplate.id, issuedCertificate.templateId)).innerJoin(tenant, eq(tenant.id, issuedCertificate.tenantId)).where(eq(issuedCertificate.verifyCode, code));
    if (!c) throw new AppError('NOT_FOUND', 'No certificate found for this code');
    const d = c.c.data as any;
    return { valid: !c.c.revokedAt, institution: c.tenantName, certificate: c.name, kind: c.kind, holder: d.name, admissionNo: d.admissionNo ?? d.employeeCode, issuedAt: c.c.issuedAt, revokedAt: c.c.revokedAt };
  }

  // ---------------- Alumni ----------------
  async convertToAlumni(studentIds: string[], batchYear: number) {
    return this.db.t(async (tx) => {
      const rows = await tx.select().from(student).where(inArray(student.id, studentIds));
      for (const s of rows) {
        await tx.update(student).set({ status: 'alumni', leftOn: todayIn(Ctx.get().tenantTz) }).where(eq(student.id, s.id));
        await tx.insert(alumni).values({ tenantId: Ctx.tenantId(), studentId: s.id, name: s.name, batchYear, phone: s.phone, email: s.email });
      }
      return { converted: rows.length };
    });
  }
}
