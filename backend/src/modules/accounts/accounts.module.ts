import { Body, Controller, Get, Injectable, Module, Param, Post, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { and, asc, between, eq, sql } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { incomeExpense, journalEntry, journalLine, ledgerAccount } from '../../db/schema';
import { Can, RequireModule } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { Ctx } from '../../kernel/context/request-context';
import { badRequest } from '../../common/errors';
import { nextNumber } from '../../common/numbering';
import { financialYear } from '../../common/money';
import { crudController } from '../../common/crud';

const ieInput = z.object({ kind: z.enum(['income', 'expense']), head: z.string().min(1), amountPaise: z.number().int().positive(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), mode: z.enum(['cash', 'upi', 'card', 'netbanking', 'cheque', 'dd', 'bank_transfer']).default('cash'), party: z.string().optional(), note: z.string().optional(), fileId: z.string().uuid().optional() });
const jeInput = z.object({ date: z.string(), narration: z.string().min(2), lines: z.array(z.object({ accountId: z.string().uuid(), debitPaise: z.number().int().nonnegative().default(0), creditPaise: z.number().int().nonnegative().default(0) })).min(2) });

/** Double-entry accounts (docs/03 accounts). Every fee receipt / payroll already posts here automatically. */
@Injectable()
export class AccountsService {
  constructor(private readonly db: DbService) {}
  private acc = async (tx: any, code: string) => (await tx.select().from(ledgerAccount).where(eq(ledgerAccount.code, code)))[0];

  async addIncomeExpense(b: z.infer<typeof ieInput>) {
    return this.db.t(async (tx) => {
      const voucherNo = await nextNumber(tx, `voucher:${b.kind}:${financialYear()}`, b.kind === 'income' ? `RV/${financialYear()}/` : `PV/${financialYear()}/`, 5);
      const [r] = await tx.insert(incomeExpense).values({ ...b, voucherNo, tenantId: Ctx.tenantId(), createdBy: Ctx.userId() }).returning();
      const cash = await this.acc(tx, b.mode === 'cash' ? '1000' : '1010');
      const other = await this.acc(tx, b.kind === 'income' ? '4100' : '5100');
      const [je] = await tx.insert(journalEntry).values({ tenantId: Ctx.tenantId(), date: b.date, narration: `${voucherNo} ${b.head}${b.party ? ' — ' + b.party : ''}`, refType: b.kind, refId: r!.id, createdBy: Ctx.userId() }).returning();
      await tx.insert(journalLine).values(b.kind === 'income'
        ? [{ tenantId: Ctx.tenantId(), entryId: je!.id, accountId: cash.id, debitPaise: b.amountPaise, creditPaise: 0 }, { tenantId: Ctx.tenantId(), entryId: je!.id, accountId: other.id, debitPaise: 0, creditPaise: b.amountPaise }]
        : [{ tenantId: Ctx.tenantId(), entryId: je!.id, accountId: other.id, debitPaise: b.amountPaise, creditPaise: 0 }, { tenantId: Ctx.tenantId(), entryId: je!.id, accountId: cash.id, debitPaise: 0, creditPaise: b.amountPaise }]);
      return r;
    });
  }
  async journal(b: z.infer<typeof jeInput>) {
    const dr = b.lines.reduce((s, l) => s + l.debitPaise, 0), cr = b.lines.reduce((s, l) => s + l.creditPaise, 0);
    if (dr !== cr || dr === 0) throw badRequest(`Journal must balance (Dr ₹${dr / 100} ≠ Cr ₹${cr / 100})`);
    return this.db.t(async (tx) => {
      const [je] = await tx.insert(journalEntry).values({ tenantId: Ctx.tenantId(), date: b.date, narration: b.narration, refType: 'manual', createdBy: Ctx.userId() }).returning();
      await tx.insert(journalLine).values(b.lines.map((l) => ({ ...l, tenantId: Ctx.tenantId(), entryId: je!.id })));
      return je;
    });
  }
  async trialBalance(from: string, to: string) {
    const r = await this.db.t((tx) => tx.execute(sql`select a.id, a.code, a.name, a.type, coalesce(sum(l.debit_paise),0)::bigint as dr, coalesce(sum(l.credit_paise),0)::bigint as cr
      from ledger_accounts a left join journal_lines l on l.account_id = a.id left join journal_entries e on e.id = l.entry_id and e.date between ${from} and ${to}
      where l.id is null or e.id is not null group by a.id order by a.code`));
    const rows = (r.rows as any[]).map((x) => ({ ...x, dr: Number(x.dr), cr: Number(x.cr), balance: Number(x.dr) - Number(x.cr) }));
    return { from, to, rows, totals: { dr: rows.reduce((s, x) => s + x.dr, 0), cr: rows.reduce((s, x) => s + x.cr, 0) } };
  }
  async ledger(accountId: string, from: string, to: string) {
    return this.db.t((tx) => tx.select({ date: journalEntry.date, narration: journalEntry.narration, dr: journalLine.debitPaise, cr: journalLine.creditPaise, refType: journalEntry.refType })
      .from(journalLine).innerJoin(journalEntry, eq(journalEntry.id, journalLine.entryId)).where(and(eq(journalLine.accountId, accountId), between(journalEntry.date, from, to))).orderBy(asc(journalEntry.date)));
  }
  /** Tally Prime XML import (vouchers). */
  async tallyXml(from: string, to: string) {
    const entries = await this.db.t((tx) => tx.select().from(journalEntry).where(between(journalEntry.date, from, to)).orderBy(asc(journalEntry.date)));
    const lines = entries.length ? await this.db.t((tx) => tx.select({ l: journalLine, name: ledgerAccount.name }).from(journalLine).innerJoin(ledgerAccount, eq(ledgerAccount.id, journalLine.accountId))) : [];
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const vouchers = entries.map((e) => {
      const ls = lines.filter((x) => x.l.entryId === e.id);
      const vtype = e.refType === 'receipt' || e.refType === 'income' ? 'Receipt' : e.refType === 'expense' || e.refType === 'payroll' ? 'Payment' : 'Journal';
      return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${vtype}" ACTION="Create"><DATE>${e.date.replace(/-/g, '')}</DATE><NARRATION>${esc(e.narration)}</NARRATION><VOUCHERTYPENAME>${vtype}</VOUCHERTYPENAME>${ls.map((x) =>
        `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(x.name)}</LEDGERNAME><ISDEEMEDPOSITIVE>${x.l.debitPaise > 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${x.l.debitPaise > 0 ? '-' : ''}${((x.l.debitPaise || x.l.creditPaise) / 100).toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`).join('')}</VOUCHER></TALLYMESSAGE>`;
    });
    return `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC><REQUESTDATA>${vouchers.join('')}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
  }
}

@RequireModule('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly svc: AccountsService) {}
  @Can('accounts.voucher.create') @Post('income-expense') ie(@Body(Z(ieInput)) b: any) { return this.svc.addIncomeExpense(b); }
  @Can('accounts.journal.create') @Post('journal') je(@Body(Z(jeInput)) b: any) { return this.svc.journal(b); }
  @Can('accounts.report.view') @Get('trial-balance') tb(@Query('from') f: string, @Query('to') t: string) { return this.svc.trialBalance(f ?? '2000-01-01', t ?? '2100-01-01'); }
  @Can('accounts.report.view') @Get('ledger/:accountId') ledger(@Param('accountId') id: string, @Query('from') f: string, @Query('to') t: string) { return this.svc.ledger(id, f ?? '2000-01-01', t ?? '2100-01-01'); }
  @Can('accounts.report.export') @Get('export/tally')
  async tally(@Query('from') f: string, @Query('to') t: string, @Res() res: FastifyReply) {
    res.header('Content-Type', 'application/xml').header('Content-Disposition', 'attachment; filename="aadhyay-tally.xml"').send(await this.svc.tallyXml(f ?? '2000-01-01', t ?? '2100-01-01'));
  }
}

export const LedgerAccountCrud = crudController({ path: 'accounts/ledger-accounts', module: 'accounts', perm: 'accounts.journal', table: ledgerAccount as any, create: z.object({ code: z.string(), name: z.string(), type: z.enum(['asset', 'liability', 'income', 'expense', 'equity']) }), sort: { column: ledgerAccount.code, dir: 'asc' } });
export const IncomeExpenseList = crudController({ path: 'accounts/vouchers', module: 'accounts', perm: 'accounts.voucher', table: incomeExpense as any, create: ieInput, readonly: true, filters: { kind: incomeExpense.kind }, search: [incomeExpense.head, incomeExpense.party] });

@Module({ controllers: [AccountsController, LedgerAccountCrud, IncomeExpenseList], providers: [AccountsService] })
export class AccountsModule {}
