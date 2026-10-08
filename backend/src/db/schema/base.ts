import { pgTable, uuid, text, integer, bigint, boolean, doublePrecision, jsonb, timestamp, date, unique, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../common/ids';
import * as E from './enums';
export const tenant = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    segment: E.segmentEnum('segment').default('school').notNull(),
    status: E.tenantStatusEnum('status').default('trial').notNull(),
    planCode: text('plan_code').default("enterprise").notNull(),
    city: text('city'),
    state: text('state'),
    stateCode: text('state_code'),  // GST state code e.g. 09 UP, 07 Delhi
    gstin: text('gstin'),
    billingEmail: text('billing_email'),
    billingPhone: text('billing_phone'),
    timezone: text('timezone').default("Asia/Kolkata").notNull(),
    locale: text('locale').default("en-IN").notNull(),
    branding: jsonb('branding').$type<any>().default({}).notNull(),
    settings: jsonb('settings').$type<any>().default({}).notNull(),
    dbUrl: text('db_url'),  // dedicated database for enterprise
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true, mode: 'date' }),
    periodEndsAt: timestamp('period_ends_at', { withTimezone: true, mode: 'date' }),
    graceEndsAt: timestamp('grace_ends_at', { withTimezone: true, mode: 'date' }),
    suspendedAt: timestamp('suspended_at', { withTimezone: true, mode: 'date' }),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    purgeAt: timestamp('purge_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
);

export const tenantDomain = pgTable(
  'tenant_domains',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
    host: text('host').notNull().unique(),
    kind: text('kind').default("subdomain").notNull(),  // subdomain | custom
    isPrimary: boolean('is_primary').default(false).notNull(),
    verifyToken: text('verify_token'),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' }),
    cfHostnameId: text('cf_hostname_id'),  // raw
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('tenant_domains_tenant_id_idx').on(t.tenantId),
  ],
);

export const tenantModule = pgTable(
  'tenant_modules',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
    moduleKey: text('module_key').notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    source: text('source').default("plan").notNull(),  // plan | addon | trial | manual
    limits: jsonb('limits').$type<any>().default({}).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    unique('tenant_modules_tenant_id_module_key_key').on(t.tenantId, t.moduleKey),
  ],
);

export const plan = pgTable(
  'plans',
  {
    code: text('code').primaryKey(),
    name: text('name').notNull(),
    segment: E.segmentEnum('segment'),
    pricePerUnitPaise: bigint('price_per_unit_paise', { mode: 'number' }).notNull(),  // per active student (or flat for coaching)
    pricingUnit: text('pricing_unit').default("student").notNull(),  // student | flat
    minMonthlyPaise: bigint('min_monthly_paise', { mode: 'number' }).notNull(),
    rangeMinPaise: bigint('range_min_paise', { mode: 'number' }).notNull(),
    rangeMaxPaise: bigint('range_max_paise', { mode: 'number' }).notNull(),
    learnerLimit: integer('learner_limit'),
    includedModules: text('included_modules').array().notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const priceBookItem = pgTable(
  'price_book_items',
  {
    code: text('code').primaryKey(),
    kind: text('kind').notNull(),  // plan | addon | usage | setup | domain | flavour | service
    name: text('name').notNull(),
    unit: text('unit').notNull(),  // per_student_month | per_month | one_time | per_message | per_minute | per_vehicle_month | per_year ...
    listPaise: bigint('list_paise', { mode: 'number' }).notNull(),
    minPaise: bigint('min_paise', { mode: 'number' }).notNull(),
    maxPaise: bigint('max_paise', { mode: 'number' }).notNull(),
    meta: jsonb('meta').$type<any>().default({}).notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    isActive: boolean('is_active').default(true).notNull(),
  },
);

export const subscription = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
    planCode: text('plan_code').notNull(),
    cycle: E.billingCycleEnum('cycle').default('yearly').notNull(),
    unitPricePaise: bigint('unit_price_paise', { mode: 'number' }).notNull(),
    quantity: integer('quantity').notNull(),  // active students at billing
    discountPct: doublePrecision('discount_pct').default(0).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }).notNull(),
    status: text('status').default("active").notNull(),  // active | ended | cancelled
    autoRenew: boolean('auto_renew').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('subscriptions_tenant_id_idx').on(t.tenantId),
  ],
);

export const subscriptionItem = pgTable(
  'subscription_items',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    subscriptionId: uuid('subscription_id').notNull().references(() => subscription.id, { onDelete: 'cascade' }),
    priceCode: text('price_code').notNull(),  // raw
    quantity: integer('quantity').default(1).notNull(),
    unitPricePaise: bigint('unit_price_paise', { mode: 'number' }).notNull(),
  },
);

export const invoice = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
    number: text('number').notNull().unique(),
    kind: E.invoiceKindEnum('kind').default('tax').notNull(),
    status: E.invoiceStatusEnum('status').default('issued').notNull(),
    placeOfSupply: text('place_of_supply').notNull(),  // state code
    subtotalPaise: bigint('subtotal_paise', { mode: 'number' }).notNull(),
    cgstPaise: bigint('cgst_paise', { mode: 'number' }).default(0).notNull(),
    sgstPaise: bigint('sgst_paise', { mode: 'number' }).default(0).notNull(),
    igstPaise: bigint('igst_paise', { mode: 'number' }).default(0).notNull(),
    totalPaise: bigint('total_paise', { mode: 'number' }).notNull(),
    paidPaise: bigint('paid_paise', { mode: 'number' }).default(0).notNull(),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }).notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    pdfFileId: uuid('pdf_file_id'),
    refInvoiceId: uuid('ref_invoice_id'),  // credit note reference
    meta: jsonb('meta').$type<any>().default({}).notNull(),
  },
  (t) => [
    index('invoices_tenant_id_issued_at_idx').on(t.tenantId, t.issuedAt),
  ],
);

export const invoiceLine = pgTable(
  'invoice_lines',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    invoiceId: uuid('invoice_id').notNull().references(() => invoice.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    sac: text('sac').default("998314").notNull(),
    qty: doublePrecision('qty').notNull(),
    unitPaise: bigint('unit_paise', { mode: 'number' }).notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    priceCode: text('price_code'),  // raw
  },
);

export const platformPayment = pgTable(
  'platform_payments',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    invoiceId: uuid('invoice_id').references(() => invoice.id),
    purpose: text('purpose').default("invoice").notNull(),  // invoice | wallet_topup
    gateway: text('gateway').notNull(),
    gatewayRef: text('gateway_ref'),  // raw
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    status: E.paymentStatusEnum('status').default('created').notNull(),
    payload: jsonb('payload').$type<any>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('platform_payments_tenant_id_idx').on(t.tenantId),
  ],
);

export const wallet = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull().unique().references(() => tenant.id, { onDelete: 'cascade' }),
    balancePaise: bigint('balance_paise', { mode: 'number' }).default(0).notNull(),
    lowAlertPaise: bigint('low_alert_paise', { mode: 'number' }).default(20000).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
);

export const walletTxn = pgTable(
  'wallet_txns',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    walletId: uuid('wallet_id').notNull().references(() => wallet.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull(),
    kind: E.walletTxnKindEnum('kind').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),  // positive = credit, negative = debit
    balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
    ref: text('ref'),
    usageRecordId: uuid('usage_record_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('wallet_txns_tenant_id_created_at_idx').on(t.tenantId, t.createdAt),
  ],
);

export const usageRecord = pgTable(
  'usage_records',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    meter: text('meter').notNull(),  // wa_utility | wa_marketing | wa_authentication | sms | ai_tokens | voice_min | storage_gb | students | buses ...
    qty: doublePrecision('qty').notNull(),
    costPaise: bigint('cost_paise', { mode: 'number' }).default(0).notNull(),  // our cost (incl. GST paid to vendor)
    pricePaise: bigint('price_paise', { mode: 'number' }).default(0).notNull(),  // charged to tenant (ex GST)
    ref: text('ref'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('usage_records_tenant_id_meter_occurred_at_idx').on(t.tenantId, t.meter, t.occurredAt),
  ],
);

export const featureFlag = pgTable(
  'feature_flags',
  {
    key: text('key').primaryKey(),
    rule: jsonb('rule').$type<any>().default({}).notNull(),  // {tenants:[], segments:[], percentage:0, enabled:false}
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
);

export const appFlavour = pgTable(
  'app_flavours',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull().unique(),
    slug: text('slug').notNull().unique(),
    appName: text('app_name').notNull(),
    androidPackage: text('android_package').notNull(),
    iosBundleId: uuid('ios_bundle_id'),
    sha256: text('sha256').array().notNull(),
    colors: jsonb('colors').$type<any>().default({}).notNull(),
    assets: jsonb('assets').$type<any>().default({}).notNull(),
    config: jsonb('config').$type<any>().default({}).notNull(),
    buildStatus: text('build_status').default("not_built").notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
);

export const platformUser = pgTable(
  'platform_users',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull(),  // super_admin | ops | finance | account_manager | support | sales
    totpSecret: text('totp_secret'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const breakGlassRequest = pgTable(
  'break_glass_requests',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    platformUserId: uuid('platform_user_id').notNull(),
    reason: text('reason').notNull(),
    status: E.approvalStatusEnum('status').default('pending').notNull(),
    approvedBy: text('approved_by'),  // tenant user id
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const supportTicket = pgTable(
  'support_tickets',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    openedBy: text('opened_by'),  // user id
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    status: text('status').default("open").notNull(),
    priority: text('priority').default("normal").notNull(),
    slaDueAt: timestamp('sla_due_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
);

export const companyExpense = pgTable(
  'company_expenses',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    month: text('month').notNull(),  // YYYY-MM
    category: text('category').notNull(),  // infra | tools | salary | marketing | compliance | other
    vendor: text('vendor').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    gstPaise: bigint('gst_paise', { mode: 'number' }).default(0).notNull(),
    recurring: boolean('recurring').default(false).notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('company_expenses_month_idx').on(t.month),
  ],
);

export const platformLead = pgTable(
  'platform_leads',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    institution: text('institution'),
    city: text('city'),
    students: integer('students'),
    source: text('source').default("website").notNull(),
    stage: text('stage').default("new").notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);
