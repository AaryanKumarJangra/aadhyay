import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../common/ids';

/**
 * Security-relevant events that happen outside a tenant transaction (failed logins, lockouts, control-plane
 * sign-ins). Tenant business changes stay in the hash-chained `audit_logs`. tenant_id is nullable: platform
 * events have none, and RLS (tenant_or_global) still applies to the runtime role.
 */
export const securityEvent = pgTable(
  'security_events',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id'),
    kind: text('kind').notNull(), // e.g. platform.login.failed, platform.login.locked, platform.login.success
    subject: text('subject').notNull(), // login identifier (email/phone), never a secret
    actorId: uuid('actor_id'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    meta: jsonb('meta').$type<Record<string, unknown>>().default({}).notNull(),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [index('security_events_subject_at_idx').on(t.subject, t.at), index('security_events_kind_at_idx').on(t.kind, t.at)],
);
