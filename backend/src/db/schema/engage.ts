import { pgTable, uuid, text, integer, bigint, boolean, doublePrecision, jsonb, timestamp, date, unique, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../common/ids';
import * as E from './enums';
export const pipeline = pgTable(
  'pipelines',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
  },
);

export const pipelineStage = pgTable(
  'pipeline_stages',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    pipelineId: uuid('pipeline_id').notNull().references(() => pipeline.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    order: integer('order').notNull(),
    isWon: boolean('is_won').default(false).notNull(),
    isLost: boolean('is_lost').default(false).notNull(),
  },
);

export const lead = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    forClass: text('for_class'),
    source: text('source').default("walk_in").notNull(),
    stageId: uuid('stage_id'),
    score: integer('score').default(0).notNull(),
    ownerId: uuid('owner_id'),  // user id
    utm: jsonb('utm').$type<any>().default({}).notNull(),
    custom: jsonb('custom').$type<any>().default({}).notNull(),
    studentId: uuid('student_id'),  // after conversion
    lostReason: text('lost_reason'),
    nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    unique('leads_tenant_id_phone_key').on(t.tenantId, t.phone),
    index('leads_tenant_id_stage_id_idx').on(t.tenantId, t.stageId),
  ],
);

export const leadActivity = pgTable(
  'lead_activities',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    leadId: uuid('lead_id').notNull().references(() => lead.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),  // note | call | whatsapp | email | stage_change | visit | task
    body: text('body'),
    data: jsonb('data').$type<any>().default({}).notNull(),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }),
    doneAt: timestamp('done_at', { withTimezone: true, mode: 'date' }),
    byUserId: uuid('by_user_id'),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const campaign = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    channel: E.channelEnum('channel').notNull(),
    audience: jsonb('audience').$type<any>().notNull(),
    templateRef: text('template_ref'),
    costPaise: bigint('cost_paise', { mode: 'number' }).default(0).notNull(),
    status: text('status').default("draft").notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const sitePage = pgTable(
  'site_pages',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    slug: text('slug').notNull(),  // "" for home
    locale: text('locale').default("en").notNull(),
    title: text('title').notNull(),
    blocks: jsonb('blocks').$type<any>().default([]).notNull(),
    seo: jsonb('seo').$type<any>().default({}).notNull(),  // {title, description, ogImage, noindex, faq:[]}
    status: E.contentStatusEnum('status').default('draft').notNull(),
    publishAt: timestamp('publish_at', { withTimezone: true, mode: 'date' }),
    version: integer('version').default(1).notNull(),
    history: jsonb('history').$type<any>().default([]).notNull(),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    unique('site_pages_tenant_id_slug_locale_key').on(t.tenantId, t.slug, t.locale),
  ],
);

export const siteMenu = pgTable(
  'site_menus',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    key: text('key').notNull(),  // header | footer
    items: jsonb('items').$type<any>().default([]).notNull(),
  },
  (t) => [
    unique('site_menus_tenant_id_key_key').on(t.tenantId, t.key),
  ],
);

export const sitePost = pgTable(
  'site_posts',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    kind: text('kind').default("news").notNull(),  // news | blog | event | gallery
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    excerpt: text('excerpt'),
    body: text('body'),
    coverFileId: uuid('cover_file_id'),
    images: text('images').array().notNull(),
    eventStart: timestamp('event_start', { withTimezone: true, mode: 'date' }),
    eventEnd: timestamp('event_end', { withTimezone: true, mode: 'date' }),
    seo: jsonb('seo').$type<any>().default({}).notNull(),
    status: E.contentStatusEnum('status').default('draft').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    unique('site_posts_tenant_id_kind_slug_key').on(t.tenantId, t.kind, t.slug),
  ],
);

export const siteRedirect = pgTable(
  'site_redirects',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    fromPath: text('from_path').notNull(),
    toPath: text('to_path').notNull(),
    code: integer('code').default(301).notNull(),
  },
  (t) => [
    unique('site_redirects_tenant_id_from_path_key').on(t.tenantId, t.fromPath),
  ],
);

export const siteForm = pgTable(
  'site_forms',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    key: text('key').notNull(),  // admission | contact | custom
    name: text('name').notNull(),
    fields: jsonb('fields').$type<any>().notNull(),
    toCrm: boolean('to_crm').default(true).notNull(),
  },
  (t) => [
    unique('site_forms_tenant_id_key_key').on(t.tenantId, t.key),
  ],
);

export const formSubmission = pgTable(
  'form_submissions',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    formId: uuid('form_id').notNull(),
    data: jsonb('data').$type<any>().notNull(),
    utm: jsonb('utm').$type<any>().default({}).notNull(),
    leadId: uuid('lead_id'),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const waAccount = pgTable(
  'wa_accounts',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id'),  // null = Aadhyay platform number
    wabaId: text('waba_id').notNull(),  // raw
    phoneNumberId: text('phone_number_id').notNull().unique(),  // raw
    displayPhone: text('display_phone').notNull(),
    verifiedName: text('verified_name'),
    tokenEnc: text('token_enc').notNull(),
    quality: text('quality'),
    status: text('status').default("connected").notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const waTemplate = pgTable(
  'wa_templates',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    accountId: uuid('account_id').notNull(),
    name: text('name').notNull(),
    language: text('language').default("en").notNull(),
    category: E.waCategoryEnum('category').notNull(),
    components: jsonb('components').$type<any>().notNull(),
    status: text('status').default("draft").notNull(),  // draft | pending | approved | rejected | paused
    metaId: text('meta_id'),  // raw
    rejectReason: text('reject_reason'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    unique('wa_templates_tenant_id_name_language_key').on(t.tenantId, t.name, t.language),
  ],
);

export const waFlow = pgTable(
  'wa_flows',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    accountId: uuid('account_id').notNull(),
    name: text('name').notNull(),
    categories: text('categories').array().notNull(),
    flowJson: jsonb('flow_json').$type<any>().notNull(),
    status: text('status').default("draft").notNull(),  // draft | published | deprecated
    metaId: text('meta_id'),  // raw
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
);

export const waConversation = pgTable(
  'wa_conversations',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    accountId: uuid('account_id').notNull(),
    contactPhone: text('contact_phone').notNull(),
    contactName: text('contact_name'),
    lastInboundAt: timestamp('last_inbound_at', { withTimezone: true, mode: 'date' }),
    assignedTo: text('assigned_to'),
    leadId: uuid('lead_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    unique('wa_conversations_account_id_contact_phone_key').on(t.accountId, t.contactPhone),
  ],
);

export const waMessage = pgTable(
  'wa_messages',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    conversationId: uuid('conversation_id').notNull().references(() => waConversation.id, { onDelete: 'cascade' }),
    direction: E.directionEnum('direction').notNull(),
    type: text('type').notNull(),  // template | text | image | document | interactive | flow
    body: jsonb('body').$type<any>().notNull(),
    metaMessageId: text('meta_message_id').unique(),  // raw
    status: E.deliveryStatusEnum('status').default('queued').notNull(),
    category: E.waCategoryEnum('category'),
    costPaise: bigint('cost_paise', { mode: 'number' }).default(0).notNull(),
    pricePaise: bigint('price_paise', { mode: 'number' }).default(0).notNull(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('wa_messages_tenant_id_created_at_idx').on(t.tenantId, t.createdAt),
  ],
);

export const messengerDevice = pgTable(
  'messenger_devices',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    userId: uuid('user_id').notNull(),
    deviceId: text('device_id').notNull(),  // raw — client generated
    registrationId: integer('registration_id').notNull(),
    identityKey: text('identity_key').notNull(),  // base64 X25519 public
    signingKey: text('signing_key').notNull(),  // base64 Ed25519 public
    signedPreKeyId: integer('signed_pre_key_id').notNull(),
    signedPreKey: text('signed_pre_key').notNull(),
    signedPreKeySig: text('signed_pre_key_sig').notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    unique('messenger_devices_user_id_device_id_key').on(t.userId, t.deviceId),
  ],
);

export const messengerPrekey = pgTable(
  'messenger_prekeys',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    deviceRef: uuid('device_ref').notNull().references(() => messengerDevice.id, { onDelete: 'cascade' }),
    keyId: integer('key_id').notNull(),
    publicKey: text('public_key').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    unique('messenger_prekeys_device_ref_key_id_key').on(t.deviceRef, t.keyId),
    index('messenger_prekeys_device_ref_used_at_idx').on(t.deviceRef, t.usedAt),
  ],
);

export const contactHash = pgTable(
  'contact_hashes',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    ownerUserId: uuid('owner_user_id').notNull(),
    phoneHash: text('phone_hash').notNull(),  // raw
    label: text('label'),  // encrypted on device — optional
  },
  (t) => [
    unique('contact_hashes_owner_user_id_phone_hash_key').on(t.ownerUserId, t.phoneHash),
  ],
);

export const conversation = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    kind: E.conversationKindEnum('kind').notNull(),
    tenantId: uuid('tenant_id'),  // institution context (not RLS)
    title: text('title'),
    avatarFileId: uuid('avatar_file_id'),
    context: jsonb('context').$type<any>().default({}).notNull(),  // {studentId, sectionId}
    settings: jsonb('settings').$type<any>().default({}).notNull(),  // {broadcastOnly, allowedHours, disappearingSec}
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    index('conversations_tenant_id_idx').on(t.tenantId),
  ],
);

export const conversationMember = pgTable(
  'conversation_members',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    conversationId: uuid('conversation_id').notNull().references(() => conversation.id, { onDelete: 'cascade' }),
    userId: uuid('user_id'),
    pendingPhoneHash: text('pending_phone_hash'),  // raw — invited but not registered
    role: text('role').default("member").notNull(),  // admin | member
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    leftAt: timestamp('left_at', { withTimezone: true, mode: 'date' }),
    mutedUntil: timestamp('muted_until', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    unique('conversation_members_conversation_id_user_id_key').on(t.conversationId, t.userId),
    index('conversation_members_user_id_idx').on(t.userId),
    index('conversation_members_pending_phone_hash_idx').on(t.pendingPhoneHash),
  ],
);

export const messengerEnvelope = pgTable(
  'messenger_envelopes',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    conversationId: uuid('conversation_id').notNull(),
    messageId: text('message_id').notNull(),  // raw — client generated id shared across device copies
    senderUserId: uuid('sender_user_id').notNull(),
    senderDeviceId: text('sender_device_id').notNull(),  // raw
    recipientUserId: uuid('recipient_user_id').notNull(),
    recipientDeviceId: text('recipient_device_id').notNull(),  // raw
    type: integer('type').notNull(),  // 1 = prekey whisper, 2 = whisper, 3 = sender-key msg, 4 = control
    ciphertext: text('ciphertext').notNull(),  // base64
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('messenger_envelopes_recipient_user_id_recipient_device_id_sent_at_idx').on(t.recipientUserId, t.recipientDeviceId, t.sentAt),
  ],
);

export const messageReceipt = pgTable(
  'message_receipts',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    messageId: text('message_id').notNull(),  // raw
    conversationId: uuid('conversation_id').notNull(),
    senderUserId: uuid('sender_user_id').notNull(),
    userId: uuid('user_id').notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
    seenAt: timestamp('seen_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    unique('message_receipts_message_id_user_id_key').on(t.messageId, t.userId),
  ],
);

export const pendingInvite = pgTable(
  'pending_invites',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    senderUserId: uuid('sender_user_id').notNull(),
    phoneHash: text('phone_hash').notNull(),  // raw
    conversationId: uuid('conversation_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    unique('pending_invites_sender_user_id_phone_hash_key').on(t.senderUserId, t.phoneHash),
    index('pending_invites_phone_hash_idx').on(t.phoneHash),
  ],
);

export const mediaBlob = pgTable(
  'media_blobs',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    key: text('key').notNull().unique(),
    size: integer('size').notNull(),
    uploadedBy: text('uploaded_by').notNull(),
    pendingDownloads: integer('pending_downloads').default(1).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const userBlock = pgTable(
  'user_blocks',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    userId: uuid('user_id').notNull(),
    blockedUserId: uuid('blocked_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    unique('user_blocks_user_id_blocked_user_id_key').on(t.userId, t.blockedUserId),
  ],
);

export const abuseReport = pgTable(
  'abuse_reports',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    reporterUserId: uuid('reporter_user_id').notNull(),
    reportedUserId: uuid('reported_user_id').notNull(),
    conversationId: uuid('conversation_id'),
    tenantId: uuid('tenant_id'),
    reason: text('reason').notNull(),
    evidence: jsonb('evidence').$type<any>().default([]).notNull(),  // decrypted messages supplied by reporter
    status: text('status').default("open").notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const call = pgTable(
  'calls',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    conversationId: uuid('conversation_id').notNull(),
    kind: text('kind').notNull(),  // voice | video
    startedBy: text('started_by').notNull(),
    sfuRoom: text('sfu_room'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    answeredAt: timestamp('answered_at', { withTimezone: true, mode: 'date' }),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
  },
);

export const aiRequest = pgTable(
  'ai_requests',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id'),
    feature: text('feature').notNull(),
    provider: text('provider').notNull(),
    tokensIn: integer('tokens_in').default(0).notNull(),
    tokensOut: integer('tokens_out').default(0).notNull(),
    costPaise: bigint('cost_paise', { mode: 'number' }).default(0).notNull(),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const dpdpRequest = pgTable(
  'dpdp_requests',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id'),
    kind: text('kind').notNull(),  // access | correct | erase | grievance | withdraw_consent
    details: text('details').notNull(),
    status: text('status').default("open").notNull(),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const batch = pgTable(
  'batches',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    code: text('code'),
    courseName: text('course_name'),
    centre: text('centre'),
    startsOn: date('starts_on', { mode: 'string' }),
    endsOn: date('ends_on', { mode: 'string' }),
    feePaise: bigint('fee_paise', { mode: 'number' }).default(0).notNull(),
    capacity: integer('capacity'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    unique('batches_tenant_id_name_key').on(t.tenantId, t.name),
  ],
);

export const batchStudent = pgTable(
  'batch_students',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    batchId: uuid('batch_id').notNull().references(() => batch.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull(),
    joinedOn: timestamp('joined_on', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    unique('batch_students_batch_id_student_id_key').on(t.batchId, t.studentId),
  ],
);

export const coupon = pgTable(
  'coupons',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    code: text('code').notNull(),
    percent: doublePrecision('percent'),
    amountPaise: bigint('amount_paise', { mode: 'number' }),
    maxUses: integer('max_uses'),
    used: integer('used').default(0).notNull(),
    validTill: timestamp('valid_till', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    unique('coupons_tenant_id_code_key').on(t.tenantId, t.code),
  ],
);

export const order = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    buyerUserId: uuid('buyer_user_id'),
    buyerPhone: text('buyer_phone').notNull(),
    buyerName: text('buyer_name').notNull(),
    courseId: uuid('course_id').notNull(),
    couponCode: text('coupon_code'),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    status: E.paymentStatusEnum('status').default('created').notNull(),
    gatewayRef: text('gateway_ref'),  // raw
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);

export const programme = pgTable(
  'programmes',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    code: text('code').notNull(),
    semesters: integer('semesters').notNull(),
    creditsRequired: integer('credits_required'),
  },
  (t) => [
    unique('programmes_tenant_id_code_key').on(t.tenantId, t.code),
  ],
);

export const creditResult = pgTable(
  'credit_results',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    studentId: uuid('student_id').notNull(),
    semester: integer('semester').notNull(),
    subjectId: uuid('subject_id').notNull(),
    credits: doublePrecision('credits').notNull(),
    gradePoint: doublePrecision('grade_point').notNull(),
    isBacklog: boolean('is_backlog').default(false).notNull(),
  },
  (t) => [
    unique('credit_results_student_id_semester_subject_id_key').on(t.studentId, t.semester, t.subjectId),
  ],
);

export const placementDrive = pgTable(
  'placement_drives',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    company: text('company').notNull(),
    role: text('role').notNull(),
    ctcPaise: bigint('ctc_paise', { mode: 'number' }),
    eligibility: jsonb('eligibility').$type<any>().default({}).notNull(),
    date: timestamp('date', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
);
