# 04 — Data Model & API Contract

> The executable truth is `backend/src/db/schema/*.ts` (Drizzle) and `backend/contracts/src`. This file explains the conventions and lists every table so humans and AI agents can navigate them. When adding a table, add a row here in the same commit.

---

## 1. Conventions

| Rule | Detail |
|------|--------|
| IDs | `uuid` (UUID v7, time-sortable), generated in app (`newId()`) |
| Tenant | `tenant_id uuid not null` on every tenant table + composite indexes starting with `tenant_id` + RLS policy `tenant_isolation` |
| Naming | Tables `snake_case` plural; Drizzle table vars camelCase singular (e.g. `studentFee` → `student_fees`) |
| Money | `bigint` **paise** (`amount_paise`). Never floats. GST stored separately (`tax_paise`) |
| Time | `timestamptz` UTC; dates as `date`; display in tenant TZ (default Asia/Kolkata) |
| Audit columns | `created_at`, `updated_at`, `created_by`, `updated_by` (nullable uuid) |
| Soft delete | `deleted_at` only where history matters (people, fees, exams); default queries exclude it |
| Custom fields | `custom jsonb default '{}'` on people tables, validated against `custom_field_defs` |
| Enums | Postgres enums via Prisma, mirrored in `@aadhyay/contracts` |
| Phones | E.164 (`+91XXXXXXXXXX`) stored in `phone`; `phone_hash` = HMAC-SHA256 for discovery |
| Big tables | Indexed by (tenant_id, date). Convert to monthly partitions at Stage C: `attendance_records`, `location_pings`, `audit_logs`, `outbox_events`, `message_deliveries` |

---

## 2. Tables by domain

### 2.1 Platform / control plane (global, no RLS; admin role only)
| Table | Key columns |
|-------|-------------|
| `tenants` | id, slug (unique), name, segment (school/college/institute/coaching/creator), status (trial/active/grace/suspended/archived/purged), plan_code, trial_ends_at, period_ends_at, timezone, locale, branding jsonb, settings jsonb, db_url (nullable, dedicated) |
| `tenant_domains` | id, tenant_id, host (unique), kind (subdomain/custom), verified_at, cf_hostname_id |
| `tenant_modules` | tenant_id, module_key, enabled, source (plan/addon/trial), limits jsonb |
| `plans` | code, name, segment, price_per_student_paise, min_monthly_paise, range_min/max, included_modules[] |
| `price_book_items` | code, kind (plan/addon/usage/setup), unit, list_paise, min_paise, max_paise, effective_from |
| `subscriptions` | tenant_id, plan_code, billing_cycle (quarterly/yearly), unit_price_paise, quantity, discount_pct, starts_at, ends_at, status |
| `subscription_items` | subscription_id, price_code, quantity, unit_price_paise |
| `invoices` | tenant_id, number (FY series AAD/2026-27/0001), kind (proforma/tax/credit_note), subtotal_paise, cgst/sgst/igst_paise, total_paise, status, due_at, pdf_file_id, place_of_supply |
| `invoice_lines` | invoice_id, description, sac, qty, unit_paise, amount_paise |
| `platform_payments` | tenant_id, invoice_id, gateway, gateway_ref, amount_paise, status |
| `wallets` / `wallet_txns` | tenant_id, balance_paise / kind (topup/debit/refund), amount_paise, ref, usage_record_id |
| `usage_records` | tenant_id, meter (wa_utility, wa_marketing, wa_auth, sms, ai_tokens, voice_min, storage_gb, students…), qty, cost_paise, price_paise, occurred_at |
| `feature_flags` | key, rule jsonb (tenants, segments, percentage) |
| `app_flavours` | tenant_id, slug, android_package, ios_bundle, sha256[], colors, assets jsonb, build_status |
| `platform_users` / `platform_roles` | control-plane staff (separate from tenant users) |
| `break_glass_requests` | tenant_id, requested_by, reason, approved_by_tenant_user, expires_at |
| `support_tickets` | tenant_id, subject, status, priority, sla_due_at |
| `company_expenses` | month, category, vendor, amount_paise, gst_paise — feeds the spend-ceiling gauge |

### 2.2 Identity (global users, tenant memberships)
| Table | Key columns |
|-------|-------------|
| `users` | id, phone (unique), phone_hash, email (unique, citext), name, password_hash, totp_secret_enc, locale, avatar_file_id |
| `sessions` | user_id, device_id, refresh_hash, ua, ip, expires_at, revoked_at |
| `memberships` | tenant_id, user_id, status, kind (staff/student/guardian/alumni), person_id (FK to staff/student/guardian) |
| `roles` | tenant_id, key, name, is_system, segment |
| `role_permissions` | role_id, permission (`module.resource.action`) |
| `role_assignments` | membership_id, role_id, scope_kind, scope_id, conditions jsonb, valid_from/to |
| `audit_logs` | tenant_id, actor_user_id, action, entity, entity_id, diff jsonb, ip, ua, prev_hash, hash, at |
| `consent_records` | tenant_id, user_id, purpose, granted, at, evidence |
| `outbox_events` | id, tenant_id, type, payload jsonb, status, attempts, available_at |
| `files` | tenant_id (nullable for messenger), key, mime, size, sha256, owner_user_id, purpose |

### 2.3 Organisation & people
`branches` (tenant_id, name, code, address, geo) · `academic_sessions` (name, starts_on, ends_on, is_current) · `students` (admission_no, roll_no, name, dob, gender, category, house, blood_group, apaar_id, rte, photo_file_id, status, custom) · `guardians` (name, phone, email, relation_default, user_id) · `student_guardians` (student_id, guardian_id, relation, is_primary, receives_notifications) · `staff` (employee_code, name, phone, email, department_id, designation_id, joining_date, user_id, status) · `departments` · `designations` · `custom_field_defs` (entity, key, label, type, options, required) · `documents` (owner_type, owner_id, kind, file_id)

### 2.4 Academics, timetable, calendar
`classes` (name, order, segment_label) · `sections` (class_id, name, class_teacher_id) · `subjects` (name, code, type) · `class_subjects` (class_id, subject_id, teacher_id) · `enrollments` (student_id, session_id, class_id, section_id, roll_no, status) · `periods` (name, starts_at, ends_at, order) · `timetable_slots` (section_id, weekday, period_id, subject_id, teacher_id, room) · `substitutions` · `calendar_events` (kind holiday/event/ptm/exam, title, starts_on, ends_on, applies_to jsonb)

### 2.5 Attendance
`attendance_records` (student_id or staff_id, date, period_id nullable, status present/absent/late/half_day/leave, mode manual/qr/rfid/face/bio/geo/live, device_id, marked_by, marked_at, source_ts) unique `(tenant_id, subject_type, subject_id, date, period_id)` · `attendance_devices` (kind, serial, api_key_hash, branch_id) · `leave_requests` (applicant, student_id, from, to, reason, status, approver)

### 2.6 Homework, lesson plan
`homework` (section_id, subject_id, title, body, due_on, attachments) · `homework_submissions` (homework_id, student_id, files, status, marks, feedback) · `diary_entries` · `lessons` · `topics` (lesson_id, status, completed_on)

### 2.7 Exams & assessments
`grade_scales` / `grade_bands` · `exam_groups` · `exams` (group_id, name, session_id, term) · `exam_schedules` (exam_id, class_id, subject_id, date, max_marks, pass_marks) · `mark_entries` (schedule_id, student_id, marks, grade, absent, remarks, entered_by) · `report_card_templates` (layout jsonb) · `results` (exam_id, student_id, total, percentage, grade, rank, published_at) · `question_banks` · `questions` (type, body jsonb, options jsonb, answer jsonb, marks, negative, tags) · `online_tests` · `online_test_attempts` (answers jsonb, score, rank, percentile, flags)

### 2.8 Fees & accounts
`fee_heads` · `fee_structures` (session_id, class_id, category, name) · `fee_structure_items` (structure_id, head_id, amount_paise, installment_no, due_on) · `student_fees` (student_id, structure_item_id, amount_paise, discount_paise, late_fee_paise, paid_paise, status, due_on) · `fee_discounts` (kind, amount/percent, approval) · `receipts` (number series per tenant/branch/FY, student_id, total_paise, mode cash/upi/card/netbanking/cheque/dd/bank, gateway_ref, collected_by, cancelled_at) · `receipt_lines` · `payment_intents` (gateway order id, status, webhook payload) · `ledger_accounts` · `journal_entries` / `journal_lines` (debit_paise, credit_paise; sum must balance) · `expenses` / `incomes` (head, amount, voucher, file)

### 2.9 HR & payroll
`staff_attendance` (in attendance_records) · `leave_types` · `leave_balances` · `staff_leaves` · `salary_structures` (components jsonb) · `payroll_runs` (month, status) · `payslips` (staff_id, gross, deductions jsonb, net)

### 2.10 Transport
`vehicles` (reg_no, capacity, gps_device_id, driver_staff_id, attendant_staff_id) · `routes` · `stops` (route_id, name, geo geography(Point), order, pickup_time, drop_time) · `student_transport` (student_id, direction pickup/drop, route_id, stop_id, vehicle_id, active) · `trips` (vehicle_id, route_id, direction, started_at, ended_at, status) · `location_pings` (trip_id, geo, speed, heading, at) · `trip_events` (trip_id, kind boarded/dropped/near_stop/arrived/sos/overspeed, student_id, stop_id, at) · `tracking_links` (trip_id, guardian_id, vehicle_id, student_ids[], token_hash, expires_at)

### 2.11 Other operations
Hostel: `hostels`, `rooms`, `beds`, `allocations`, `outpasses`, `hostel_logs` · Library: `books`, `book_copies`, `library_members`, `book_issues` · Inventory: `items`, `item_categories`, `stores`, `suppliers`, `stock_moves`, `purchase_orders`, `assets` · Health: `health_records`, `infirmary_visits` · Canteen: `student_wallets`, `canteen_txns` · Behaviour: `incidents`, `incident_students` · Certificates: `certificate_templates`, `issued_certificates` (verify_code unique) · Front office: `enquiries`, `visitors`, `call_logs`, `postal_records`, `complaints` · Alumni: `alumni`, `alumni_events`

### 2.12 CRM, CMS, comms
CRM: `leads` (name, phone, source, stage, score, owner_id, utm jsonb), `lead_activities`, `pipelines`, `pipeline_stages`, `campaigns` · CMS: `site_pages` (slug, title, blocks jsonb, seo jsonb, status, publish_at, locale), `site_menus`, `site_posts`, `site_media`, `site_redirects`, `site_forms`, `form_submissions` · Comms: `notification_templates` (event_key, channel, locale, body, wa_template_name), `comm_routing_rules` (event_key, channels jsonb), `notifications` (user_id inbox: title, body, data, read_at), `message_deliveries` (notification_id, channel, provider_ref, status, cost_paise), `notices` (title, body, audience jsonb, publish_at), `push_tokens` (user_id, device_id, token, platform)

### 2.13 WhatsApp Channel
`wa_accounts` (tenant_id nullable = Aadhyay number, waba_id, phone_number_id, display_phone, token_enc, quality, status) · `wa_templates` (name, language, category, components jsonb, status, meta_id) · `wa_flows` (name, flow_json, status, meta_id) · `wa_conversations` (contact phone, last_inbound_at, assigned_to) · `wa_messages` (direction, type, body jsonb, meta_message_id, status, category, cost_paise)

### 2.14 Messenger & calls (global; owner-scoped, not tenant RLS)
`messenger_devices` (user_id, device_id, identity_key, signed_prekey, signed_prekey_sig, registration_id, last_seen_at) · `messenger_prekeys` (device_id, key_id, public_key, used_at) · `contact_hashes` (owner_user_id, phone_hash) · `conversations` (kind direct/group/broadcast/institution, tenant_id nullable, title, avatar, settings jsonb) · `conversation_members` (conversation_id, user_id, role admin/member, joined_at, left_at, muted_until) · `messenger_envelopes` (id, conversation_id, sender_device_id, recipient_device_id, ciphertext bytea, type, sent_at) — deleted on ack · `message_receipts` (message_id, user_id, delivered_at, seen_at) · `pending_invites` (sender_user_id, phone_hash, created_at, fulfilled_at) · `media_blobs` (key, size, uploaded_by, pending_downloads, expires_at) · `blocks` · `reports` · `calls` (conversation_id, kind voice/video, started_by, started_at, ended_at, sfu_room)

### 2.15 LMS, AI, compliance, coaching, college
LMS: `courses`, `course_modules`, `contents` (kind pdf/video/link/html, file_id, release_at), `content_progress`, `live_sessions`, `live_attendance` · AI: `ai_requests` (feature, tokens_in/out, cost_paise) · Compliance: `dpdp_requests` (kind access/correct/erase/grievance, status, due_at) · Coaching: `batches`, `batch_students`, `test_series`, `coupons`, `storefront_products`, `orders` · College: `programmes`, `semesters`, `courses_credit`, `credit_results`, `placement_drives`, `placement_applications`

---

## 3. API conventions

| Rule | Detail |
|------|--------|
| Base | `https://api.aadhyay.com/v1` (dev: `http://localhost:4000/v1`) |
| Auth | `Authorization: Bearer <access JWT>`; tenant via token `tid` (+ optional `X-Tenant` slug for picker flows) |
| Formats | JSON; dates ISO-8601; money in paise (`amountPaise`); camelCase in JSON |
| List | `GET /v1/<module>/<resource>?cursor=&limit=50&q=&sort=` → `{ items, nextCursor }` |
| Create | `POST` with optional `Idempotency-Key` header |
| Update | `PATCH` (partial) |
| Errors | `{ error: { code, message, details? } }` with HTTP status. Codes: `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `TENANT_SUSPENDED`, `MODULE_DISABLED`, `RATE_LIMITED`, `WALLET_EMPTY`, `OTP_INVALID`, `OTP_EXPIRED` |
| Module guard | Calling a disabled module → `403 MODULE_DISABLED` |
| Suspended tenant | All tenant APIs → `402 TENANT_SUSPENDED` except billing, export and auth |
| Docs | OpenAPI at `/v1/docs` (non-production) |

### 3.1 Core endpoints (implemented first)
```
POST /v1/auth/otp/request            {phone}                      → {sent:true, channel}
POST /v1/auth/otp/verify             {phone, code, deviceId}      → {accessToken, refreshToken, user, memberships}
POST /v1/auth/password/login         {login, password, deviceId}
POST /v1/auth/refresh                {refreshToken}
POST /v1/auth/logout
GET  /v1/me                           → user + memberships + permissions for current tenant
POST /v1/me/switch-tenant            {tenantId}                   → new tokens
GET  /v1/public/tenants?q=           → institution picker (name, city, slug, logo)
GET  /v1/public/tenants/:slug/branding
POST /v1/public/signup               → self-serve trial tenant
GET  /v1/public/certificates/verify/:code
GET  /v1/public/track/:token         → live trip view (signed token)

/v1/org/*  /v1/people/*  /v1/academics/*  /v1/attendance/*  /v1/fees/*  /v1/exams/*  /v1/comms/*
/v1/transport/*  /v1/cms/*  /v1/crm/*  /v1/hr/*  /v1/library/* ... (one prefix per module key)
/v1/messenger/*  (devices, prekeys, contacts/discover, conversations, envelopes, media, invites)
/v1/whatsapp/*   (accounts, templates, flows, conversations, messages)  · POST /v1/webhooks/whatsapp
/v1/control/*    (control plane; platform users only)
```

### 3.2 Realtime (Socket.IO, namespace per concern)
| Namespace | Events (client → server) | Events (server → client) |
|-----------|--------------------------|--------------------------|
| `/messenger` | `envelope.send`, `envelope.ack`, `typing`, `receipt` | `envelope.new`, `receipt`, `typing`, `invite.fulfilled`, `prekeys.low` |
| `/calls` | `call.offer`, `call.answer`, `call.ice`, `call.end` | same + `call.ring` |
| `/transport` | `trip.ping` (driver), `trip.subscribe` (parent/admin) | `trip.position`, `trip.event` |
| `/live` | `subscribe` (dashboards) | `update` |

Auth on connect: `auth: { token }` (access JWT) or tracking token for `/transport` read-only.

---

## 4. Domain events (outbox `type`)
`tenant.created` · `tenant.status_changed` · `user.registered` · `student.admitted` · `student.updated` · `guardian.linked` · `attendance.marked` · `attendance.absent` · `leave.requested` · `leave.decided` · `homework.assigned` · `notice.published` · `exam.result_published` · `fee.assigned` · `fee.due_soon` · `fee.overdue` · `fee.paid` · `fee.refunded` · `trip.started` · `trip.position` (not outboxed; realtime only) · `trip.near_stop` · `trip.boarded` · `trip.dropped` · `trip.ended` · `transport.sos` · `lead.created` · `lead.stage_changed` · `cms.page_published` · `wa.message_status` · `wa.inbound` · `invoice.issued` · `invoice.paid` · `wallet.low` · `messenger.invite_fulfilled`

Payload shape: `{ id, type, tenantId, occurredAt, actorUserId, data: {...} }`. Zod schemas are in `@aadhyay/contracts/events`.
