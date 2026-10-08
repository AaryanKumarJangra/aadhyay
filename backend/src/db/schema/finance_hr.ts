import { pgTable, uuid, text, integer, bigint, boolean, doublePrecision, jsonb, timestamp, date, unique, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../common/ids';
import * as E from './enums';
import { student } from './people_academics';
export const feeHead = pgTable(
  'fee_heads',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    code: text('code'),
    isTransport: boolean('is_transport').default(false).notNull(),
    ledgerAccountId: uuid('ledger_account_id'),
  },
  (t) => [
    unique('fee_heads_tenant_id_name_key').on(t.tenantId, t.name),
  ],
);

export const feeStructure = pgTable(
  'fee_structures',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    classId: uuid('class_id'),
    category: text('category'),  // applies to category; null = all
    name: text('name').notNull(),
    lateFeeRule: jsonb('late_fee_rule').$type<any>().default({}).notNull(),  // {perDayPaise, maxPaise, graceDays}
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const feeStructureItem = pgTable(
  'fee_structure_items',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    structureId: uuid('structure_id').notNull().references(() => feeStructure.id, { onDelete: 'cascade' }),
    headId: uuid('head_id').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    installmentNo: integer('installment_no').default(1).notNull(),
    dueOn: date('due_on', { mode: 'string' }).notNull(),
  },
);

export const feeDiscount = pgTable(
  'fee_discounts',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),  // sibling | staff | scholarship | rte | custom
    percent: doublePrecision('percent'),
    amountPaise: bigint('amount_paise', { mode: 'number' }),
    requiresApproval: boolean('requires_approval').default(false).notNull(),
  },
);

export const studentFee = pgTable(
  'student_fees',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    studentId: uuid('student_id').notNull().references(() => student.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').notNull(),
    structureItemId: uuid('structure_item_id'),
    headId: uuid('head_id').notNull(),
    title: text('title').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    discountPaise: bigint('discount_paise', { mode: 'number' }).default(0).notNull(),
    lateFeePaise: bigint('late_fee_paise', { mode: 'number' }).default(0).notNull(),
    paidPaise: bigint('paid_paise', { mode: 'number' }).default(0).notNull(),
    status: E.feeStatusEnum('status').default('unpaid').notNull(),
    dueOn: date('due_on', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    index('student_fees_tenant_id_student_id_status_idx').on(t.tenantId, t.studentId, t.status),
    index('student_fees_tenant_id_due_on_status_idx').on(t.tenantId, t.dueOn, t.status),
  ],
);

export const receipt = pgTable(
  'receipts',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    number: text('number').notNull(),
    studentId: uuid('student_id').notNull(),
    totalPaise: bigint('total_paise', { mode: 'number' }).notNull(),
    mode: E.payModeEnum('mode').notNull(),
    reference: text('reference'),  // cheque no / UTR
    gatewayRef: text('gateway_ref'),  // raw
    collectedBy: text('collected_by'),
    collectedAt: timestamp('collected_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    cancelReason: text('cancel_reason'),
  },
  (t) => [
    unique('receipts_tenant_id_number_key').on(t.tenantId, t.number),
    index('receipts_tenant_id_student_id_idx').on(t.tenantId, t.studentId),
  ],
);

export const receiptLine = pgTable(
  'receipt_lines',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    receiptId: uuid('receipt_id').notNull().references(() => receipt.id, { onDelete: 'cascade' }),
    studentFeeId: uuid('student_fee_id').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    lateFeePaise: bigint('late_fee_paise', { mode: 'number' }).default(0).notNull(),
  },
);

export const paymentIntent = pgTable(
  'payment_intents',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    studentId: uuid('student_id').notNull(),
    feeIds: text('fee_ids').array().notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    gateway: text('gateway').notNull(),
    gatewayOrderId: text('gateway_order_id'),  // raw
    status: E.paymentStatusEnum('status').default('created').notNull(),
    receiptId: uuid('receipt_id'),
    payload: jsonb('payload').$type<any>().default({}).notNull(),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    index('payment_intents_gateway_order_id_idx').on(t.gatewayOrderId),
  ],
);

export const numberSeries = pgTable(
  'number_series',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    key: text('key').notNull(),  // receipt:FY2026-27 | voucher:...
    prefix: text('prefix').notNull(),
    next: integer('next').default(1).notNull(),
  },
  (t) => [
    unique('number_series_tenant_id_key_key').on(t.tenantId, t.key),
  ],
);

export const ledgerAccount = pgTable(
  'ledger_accounts',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),  // asset | liability | income | expense | equity
    isSystem: boolean('is_system').default(false).notNull(),
  },
  (t) => [
    unique('ledger_accounts_tenant_id_code_key').on(t.tenantId, t.code),
  ],
);

export const journalEntry = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    narration: text('narration').notNull(),
    refType: text('ref_type'),  // receipt | expense | income | payroll | manual
    refId: uuid('ref_id'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('journal_entries_tenant_id_date_idx').on(t.tenantId, t.date),
  ],
);

export const journalLine = pgTable(
  'journal_lines',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    entryId: uuid('entry_id').notNull().references(() => journalEntry.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull(),
    debitPaise: bigint('debit_paise', { mode: 'number' }).default(0).notNull(),
    creditPaise: bigint('credit_paise', { mode: 'number' }).default(0).notNull(),
  },
);

export const incomeExpense = pgTable(
  'income_expenses',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    kind: text('kind').notNull(),  // income | expense
    head: text('head').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    mode: E.payModeEnum('mode').default('cash').notNull(),
    voucherNo: text('voucher_no'),
    party: text('party'),
    note: text('note'),
    fileId: uuid('file_id'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('income_expenses_tenant_id_kind_date_idx').on(t.tenantId, t.kind, t.date),
  ],
);

export const leaveType = pgTable(
  'leave_types',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    daysPerYear: doublePrecision('days_per_year').notNull(),
    isPaid: boolean('is_paid').default(true).notNull(),
  },
  (t) => [
    unique('leave_types_tenant_id_name_key').on(t.tenantId, t.name),
  ],
);

export const leaveBalance = pgTable(
  'leave_balances',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    staffId: uuid('staff_id').notNull(),
    leaveTypeId: uuid('leave_type_id').notNull(),
    year: integer('year').notNull(),
    allotted: doublePrecision('allotted').notNull(),
    used: doublePrecision('used').default(0).notNull(),
  },
  (t) => [
    unique('leave_balances_staff_id_leave_type_id_year_key').on(t.staffId, t.leaveTypeId, t.year),
  ],
);

export const salaryStructure = pgTable(
  'salary_structures',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    staffId: uuid('staff_id').notNull().unique(),
    basicPaise: bigint('basic_paise', { mode: 'number' }).notNull(),
    components: jsonb('components').$type<any>().default([]).notNull(),  // [{code:"HRA", kind:"earning", type:"percent_basic", value:40}]
    pfEnabled: boolean('pf_enabled').default(true).notNull(),
    esiEnabled: boolean('esi_enabled').default(false).notNull(),
    ptState: text('pt_state'),
    tdsMonthlyPaise: bigint('tds_monthly_paise', { mode: 'number' }).default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
);

export const payrollRun = pgTable(
  'payroll_runs',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    month: text('month').notNull(),  // YYYY-MM
    status: text('status').default("draft").notNull(),  // draft | approved | paid
    totals: jsonb('totals').$type<any>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    unique('payroll_runs_tenant_id_month_key').on(t.tenantId, t.month),
  ],
);

export const payslip = pgTable(
  'payslips',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    runId: uuid('run_id').notNull().references(() => payrollRun.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id').notNull(),
    workingDays: doublePrecision('working_days').notNull(),
    paidDays: doublePrecision('paid_days').notNull(),
    grossPaise: bigint('gross_paise', { mode: 'number' }).notNull(),
    deductions: jsonb('deductions').$type<any>().notNull(),
    earnings: jsonb('earnings').$type<any>().notNull(),
    netPaise: bigint('net_paise', { mode: 'number' }).notNull(),
  },
  (t) => [
    unique('payslips_run_id_staff_id_key').on(t.runId, t.staffId),
  ],
);
