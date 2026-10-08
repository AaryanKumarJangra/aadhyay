import { pgTable, uuid, text, integer, bigint, boolean, doublePrecision, jsonb, timestamp, date, unique, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../common/ids';
import * as E from './enums';
export const user = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    phone: text('phone').unique(),
    phoneHash: text('phone_hash').unique(),  // raw — HMAC for contact discovery
    email: text('email').unique(),
    name: text('name').notNull(),
    passwordHash: text('password_hash'),
    totpSecret: text('totp_secret'),  // encrypted
    totpEnabled: boolean('totp_enabled').default(false).notNull(),
    locale: text('locale').default("en-IN").notNull(),
    avatarFileId: uuid('avatar_file_id'),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true, mode: 'date' }),
    isDisabled: boolean('is_disabled').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
);

export const session = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    deviceId: text('device_id').notNull(),  // raw — client generated
    deviceName: text('device_name'),
    platform: text('platform'),  // android | ios | web
    refreshHash: text('refresh_hash').notNull().unique(),  // raw
    familyId: uuid('family_id').notNull(),  // rotation family for reuse detection
    tenantId: uuid('tenant_id'),  // last selected tenant (not RLS — nullable)
    ip: text('ip'),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
  ],
);

export const membership = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    kind: E.membershipKindEnum('kind').notNull(),
    personId: uuid('person_id'),  // student/staff/guardian id
    status: text('status').default("active").notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    unique('memberships_tenant_id_user_id_kind_key').on(t.tenantId, t.userId, t.kind),
    index('memberships_user_id_idx').on(t.userId),
  ],
);

export const role = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isSystem: boolean('is_system').default(false).notNull(),
    permissions: text('permissions').array().notNull(),  // module.resource.action, supports wildcards like fees.* or *
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    unique('roles_tenant_id_key_key').on(t.tenantId, t.key),
  ],
);

export const roleAssignment = pgTable(
  'role_assignments',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    membershipId: uuid('membership_id').notNull().references(() => membership.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id').notNull().references(() => role.id, { onDelete: 'cascade' }),
    scopeKind: E.scopeKindEnum('scope_kind').default('tenant').notNull(),
    scopeId: uuid('scope_id'),
    conditions: jsonb('conditions').$type<any>().default({}).notNull(),  // {maxAmountPaise, timeWindow, makerChecker}
    validFrom: timestamp('valid_from', { withTimezone: true, mode: 'date' }),
    validTo: timestamp('valid_to', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('role_assignments_tenant_id_membership_id_idx').on(t.tenantId, t.membershipId),
  ],
);

export const auditLog = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    actorUserId: uuid('actor_user_id'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),  // raw
    diff: jsonb('diff').$type<any>().default({}).notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    prevHash: text('prev_hash'),
    hash: text('hash').notNull(),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('audit_logs_tenant_id_at_idx').on(t.tenantId, t.at),
    index('audit_logs_tenant_id_entity_entity_id_idx').on(t.tenantId, t.entity, t.entityId),
  ],
);

export const consentRecord = pgTable(
  'consent_records',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id'),
    subjectId: uuid('subject_id'),  // student/guardian id
    purpose: text('purpose').notNull(),  // photos_public | marketing | biometric | ai_features ...
    granted: boolean('granted').notNull(),
    evidence: jsonb('evidence').$type<any>().default({}).notNull(),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('consent_records_tenant_id_subject_id_idx').on(t.tenantId, t.subjectId),
  ],
);

export const outboxEvent = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id'),  // null for platform events
    type: text('type').notNull(),
    payload: jsonb('payload').$type<any>().notNull(),
    actorUserId: uuid('actor_user_id'),
    status: E.outboxStatusEnum('status').default('pending').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    lastError: text('last_error'),
    availableAt: timestamp('available_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    index('outbox_events_status_available_at_idx').on(t.status, t.availableAt),
  ],
);

export const file = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id'),  // null = messenger/global
    key: text('key').notNull().unique(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256'),
    ownerUserId: uuid('owner_user_id'),
    purpose: text('purpose').notNull(),  // student_photo | document | receipt | cms_media | homework | messenger_media ...
    isPublic: boolean('is_public').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('files_tenant_id_purpose_idx').on(t.tenantId, t.purpose),
  ],
);

export const pushToken = pgTable(
  'push_tokens',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    userId: uuid('user_id').notNull(),
    deviceId: text('device_id').notNull(),  // raw
    token: text('token').notNull().unique(),
    platform: text('platform').notNull(),  // android | ios | web
    appId: text('app_id').default("aadhyay").notNull(),  // flavour slug
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    index('push_tokens_user_id_idx').on(t.userId),
  ],
);

export const notification = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    studentId: uuid('student_id'),  // child context for multi-child families
    eventKey: text('event_key').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    data: jsonb('data').$type<any>().default({}).notNull(),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('notifications_tenant_id_user_id_created_at_idx').on(t.tenantId, t.userId, t.createdAt),
  ],
);

export const messageDelivery = pgTable(
  'message_deliveries',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    notificationId: uuid('notification_id'),
    userId: uuid('user_id'),
    toAddress: text('to_address'),  // phone/email for non-users (leads)
    channel: E.channelEnum('channel').notNull(),
    status: E.deliveryStatusEnum('status').default('queued').notNull(),
    providerRef: text('provider_ref'),  // raw
    error: text('error'),
    costPaise: bigint('cost_paise', { mode: 'number' }).default(0).notNull(),
    pricePaise: bigint('price_paise', { mode: 'number' }).default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    index('message_deliveries_tenant_id_created_at_idx').on(t.tenantId, t.createdAt),
    index('message_deliveries_provider_ref_idx').on(t.providerRef),
  ],
);

export const notificationTemplate = pgTable(
  'notification_templates',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    eventKey: text('event_key').notNull(),
    channel: E.channelEnum('channel').notNull(),
    locale: text('locale').default("en").notNull(),
    title: text('title'),
    body: text('body').notNull(),
    waTemplateName: text('wa_template_name'),
    isActive: boolean('is_active').default(true).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    unique('notification_templates_tenant_id_event_key_channel_locale_key').on(t.tenantId, t.eventKey, t.channel, t.locale),
  ],
);

export const commRoutingRule = pgTable(
  'comm_routing_rules',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    eventKey: text('event_key').notNull(),
    channels: jsonb('channels').$type<any>().notNull(),  // {push:true, whatsapp:"always"|"fallback"|"never", sms:"never"|"fallback", email:false, fallbackInactiveDays:7}
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    unique('comm_routing_rules_tenant_id_event_key_key').on(t.tenantId, t.eventKey),
  ],
);

export const notice = pgTable(
  'notices',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    audience: jsonb('audience').$type<any>().notNull(),  // {all:true} | {classIds:[], sectionIds:[], roles:[], staff:true, guardians:true}
    attachments: text('attachments').array().notNull(),
    status: E.contentStatusEnum('status').default('published').notNull(),
    publishAt: timestamp('publish_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('notices_tenant_id_publish_at_idx').on(t.tenantId, t.publishAt),
  ],
);
