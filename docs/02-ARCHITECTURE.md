# 02 — Architecture & Technical Blueprint

> Designed for a **20–30 year life**: every external dependency sits behind an adapter, every module is switchable per tenant, every change is an event, and all data is exportable. Frameworks will change; the boundaries will not.

---

## 1. Stack (final)

| Layer | Choice | Why |
|-------|--------|-----|
| Language | TypeScript (strict) everywhere | One language across web, API, workers and mobile; shared types |
| Backend | **NestJS 12 on Fastify 5 adapter** | Strong module boundaries + DI for a big modular monolith; Fastify ≈2× Express throughput |
| ORM / DB | **Drizzle ORM** + **PostgreSQL 16** (+ PostGIS, pg_trgm, citext) — see ADR-8 | Pure TypeScript (no binary engine), SQL-level control for RLS, fast |
| Cache / queues | Redis 7 (Valkey-compatible) + **BullMQ** | Jobs, rate limits, live GPS, socket fan-out |
| Realtime | Socket.IO (Redis adapter) | Messenger delivery, call signalling, live bus, dashboards |
| Calls | WebRTC; **coturn** (TURN/STUN) for 1:1; **LiveKit** (self-hosted SFU, Apache-2.0) for group calls and live classes | Free, open source, E2EE capable |
| E2EE | Signal-style X3DH + Double Ratchet built on **@noble/curves, @noble/hashes, @noble/ciphers** (MIT, audited) — *not* libsignal (AGPL) | Proprietary-licence safe, works in RN + web |
| Web | **Next.js 16 (App Router, RSC)** + Tailwind CSS 4 + Radix-based UI kit | SSR/ISR for SEO websites, fast admin |
| Mobile | **React Native via Expo SDK** (prebuild / dev client, EAS Build) | Native app with white-label flavours from one codebase |
| Validation | **Zod** in `@aadhyay/contracts` shared by backend, web and mobile | One source of truth for API shapes |
| Auth | Own module: phone/email OTP, password (argon2id), JWT access (15 min) + rotating refresh tokens, TOTP 2FA, device sessions | No per-user auth fees |
| Files | S3-compatible adapter (Cloudflare R2 / E2E Object Storage / MinIO locally) | Portable |
| Email | Adapter: Resend → Amazon SES | Free tier first |
| Push | FCM (Android/web) + APNs via FCM | Free |
| WhatsApp | **Meta WhatsApp Cloud API (official) only** | Compliant; no unofficial libraries |
| Payments | Adapter: Razorpay (default), Cashfree, PhonePe PG; money goes straight to the institution's merchant account | Aadhyay never holds fee money (RBI PA rules) |
| Maps | MapLibre + OpenStreetMap tiles; Ola Maps / Google for geocoding & routing via adapter | Free first |
| Edge | Cloudflare (DNS, CDN, WAF, SSL, Cloudflare for SaaS custom hostnames) | Free tier; custom domains with auto SSL |
| Monorepo | **pnpm workspaces + Turborepo** | Shared packages, cached builds |
| Tests | Vitest (unit), Supertest + real Postgres (API e2e), Playwright (web e2e) | |
| CI/CD | GitHub Actions → Docker images → server | Free tier |
| Observability | pino JSON logs, OpenTelemetry, Sentry (free), Uptime Kuma | |

---

## 2. System diagram

```
                     ┌──────────────── Cloudflare (DNS · CDN · WAF · SSL · custom hostnames) ────────────────┐
                     │                                                                                       │
  aadhyay.com (marketing)   app.aadhyay.com (console)   <slug>.aadhyay.com / customdomain.in (tenant sites)   api.aadhyay.com   rt.aadhyay.com
                     │                         │                         │                                       │              │
                     └────────── frontend/web (Next.js, host-based routing) ──────────┘                        │              │
                                                                                                              │              │
   Mobile app (common "Aadhyay" + white-label flavours) ───────────────── HTTPS /v1 ──────────────────────────┤              │
                                                         └──────────── WebSocket (Socket.IO) ───────────────────────────────────┤
                                                                                                              ▼              ▼
                                                          ┌────────────── backend (NestJS modular monolith) ──────────────┐
                                                          │  main.api.ts  (REST /v1, webhooks)                            │
                                                          │  main.realtime.ts (Socket.IO: messenger, calls, GPS, live)    │
                                                          │  main.worker.ts (BullMQ: comms, billing, reports, imports)    │
                                                          │  kernel/ (tenancy · auth · rbac · audit · events · files)     │
                                                          │  modules/ (sis, attendance, fees, ... messenger, whatsapp)    │
                                                          │  adapters/ (whatsapp-cloud, sms, email, push, pay, storage…)  │
                                                          └───────┬──────────────┬─────────────┬───────────────┬──────────┘
                                                                  ▼              ▼             ▼               ▼
                                                           PostgreSQL 16    Redis 7      Object storage    coturn + LiveKit
                                                           (RLS, PostGIS)   (BullMQ)     (R2 / E2E / MinIO) (calls)
```

Three processes from **one codebase** (`backend/`), scaled independently: `api`, `realtime`, `worker`. Extract a module into its own service only when its scaling profile differs (likely first: realtime/GPS, messenger media, WhatsApp dispatcher).

---

## 3. Repository layout (root = `frontend/`, `backend/`, `docs/`)

```
aadhyay/
├── package.json                 # root scripts (turbo), engines
├── pnpm-workspace.yaml          # backend, backend/contracts, frontend/*, frontend/packages/*
├── turbo.json
├── docker-compose.yml           # local dev: postgres+postgis, redis, minio, mailpit, coturn, livekit
├── .github/workflows/ci.yml
├── .env.example
│
├── docs/                        # THE specification (6 files) — see README.md
│
├── backend/
│   ├── package.json             # @aadhyay/backend
│   ├── nest-cli.json · tsconfig*.json · vitest.config.ts · Dockerfile
│   ├── drizzle.config.ts        # drizzle-kit (generate SQL migrations from src/db/schema)
│   ├── contracts/               # @aadhyay/contracts — zod schemas, DTO types, permission keys, event names, enums
│   │   └── src/{index.ts, permissions.ts, events.ts, <module>.ts}
│   ├── src/
│   │   ├── main.api.ts · main.realtime.ts · main.worker.ts
│   │   ├── app.module.ts
│   │   ├── config/              # typed env config (zod)
│   │   ├── common/              # filters, interceptors, pipes, decorators, utils (money, dates, ids)
│   │   ├── db/
│   │   │   ├── schema/*.ts      # all tables (see 04-DATA-AND-API.md) — one file per domain
│   │   │   ├── migrations/      # 0000_init.sql (generated) + 0001_rls.sql (aadhyay_apply_rls())
│   │   │   └── db.service.ts    # app (RLS) + admin pools; t() = tenant transaction
│   │   ├── scripts/             # migrate.ts, seed.ts, seed-data.ts
│   │   ├── worker/scheduler.ts  # cron-like jobs (lifecycle 06:00, fee reminders 07:30, auto-absent, media cleanup)
│   │   ├── kernel/
│   │   │   ├── prisma/          # PrismaService + tenant-scoped client (SET LOCAL app.tenant_id)
│   │   │   ├── tenancy/         # resolve tenant from host / header / token; TenantContext (AsyncLocalStorage)
│   │   │   ├── auth/            # OTP, password, JWT, refresh, TOTP, sessions, guards
│   │   │   ├── rbac/            # roles, permissions (module.resource.action), scopes, conditions, @Can()
│   │   │   ├── audit/           # audit log interceptor + service
│   │   │   ├── events/          # outbox writer + dispatcher (BullMQ) + subscriber registry
│   │   │   ├── files/           # upload signing, metadata, virus-scan hook
│   │   │   ├── features/        # per-tenant module enablement + feature flags
│   │   │   └── i18n/
│   │   ├── control-plane/       # tenants, plans, price book, subscriptions, invoices, wallet, usage, lifecycle
│   │   ├── modules/
│   │   │   └── <module>/        # STANDARD FILE SET:
│   │   │       ├── <module>.module.ts
│   │   │       ├── <module>.controller.ts     # REST /v1/<module>/...
│   │   │       ├── <module>.service.ts        # business logic (only place with rules)
│   │   │       ├── <module>.events.ts         # events emitted / consumed
│   │   │       ├── <module>.permissions.ts    # permission keys
│   │   │       └── <module>.service.spec.ts   # unit tests
│   │   │   (modules: org, people, academics, timetable, calendar, attendance, homework, lessonplan, exams,
│   │   │    online-exams, lms, live-classes, fees, accounts, hr, payroll, behaviour, certificates, front-office,
│   │   │    crm, transport, hostel, library, inventory, health, canteen, alumni, cms, reports, comms,
│   │   │    messenger, calls, whatsapp, ai, compliance, coaching, college, notifications)
│   │   ├── adapters/
│   │   │   ├── whatsapp/        # WhatsAppPort + meta-cloud.adapter.ts (+ fake for tests)
│   │   │   ├── sms/ email/ push/ payments/ storage/ maps/ llm/ voice/ video/
│   │   └── realtime/            # realtime.server.ts — Socket.IO /messenger /calls /transport + Redis fan-out, live
│   └── test/                    # e2e tests (real Postgres)
│
└── frontend/
    ├── web/                     # @aadhyay/web — Next.js
    │   ├── src/middleware.ts    # host-based routing: marketing | console | control | tenant site
    │   ├── src/app/
    │   │   ├── (marketing)/     # aadhyay.com — landing, pricing, blog, free tools (SEO)
    │   │   ├── (console)/       # app.aadhyay.com — institution admin/staff/parent/student web app
    │   │   ├── (control)/       # control.aadhyay.com — company control plane
    │   │   ├── site/[tenant]/   # tenant public websites (rewritten from host)
    │   │   ├── track/[token]/   # public live bus tracking link
    │   │   └── api/             # thin BFF routes only (revalidate, og images)
    │   ├── src/components/ src/lib/ src/styles/
    ├── mobile/                  # @aadhyay/mobile — Expo React Native
    │   ├── app.config.ts        # reads FLAVOUR → name, package, icons, colours, tenant lock
    │   ├── eas.json
    │   ├── flavours/
    │   │   ├── aadhyay/         # common app (tenant picker)
    │   │   └── <tenant-slug>/   # flavour.json + icon.png + splash.png + adaptive-icon.png (+ google-services.json)
    │   ├── scripts/new-flavour.ts
    │   └── src/ (app/ screens/ features/ lib/crypto/ lib/api/ components/)
    └── packages/
        ├── e2ee/                # @aadhyay/e2ee — X3DH + Double Ratchet + Sender Keys (web + mobile + tests)
        ├── ui/                  # shared design tokens (colours, spacing, typography)
        └── api-client/          # typed fetch client built on @aadhyay/contracts
```

---

## 4. Multi-tenancy

- **Model:** shared database, shared schema. Every tenant-owned table has `tenant_id uuid not null`.
- **Double enforcement:**
  1. Application: `TenantContext` (AsyncLocalStorage) holds `tenantId`; the tenant-scoped Prisma client wraps every request in a transaction that runs `SELECT set_config('app.tenant_id', $1, true)`.
  2. Database: RLS policy on every tenant table: `USING (tenant_id = current_setting('app.tenant_id')::uuid)` + `WITH CHECK` same. App connects as role `aadhyay_app` (no `BYPASSRLS`). Migrations and control-plane jobs use `aadhyay_admin`.
- **Tenant resolution order:** (1) hostname → `tenant_domains` lookup (cached in Redis); (2) `X-Tenant` header (mobile common app after institution pick); (3) `tid` claim in JWT. All three must agree when more than one is present.
- **Global (non-tenant) data:** users (a person can be a parent in two schools), messenger (anyone can chat), control plane tables.
- **Enterprise isolation:** a tenant row may point to a dedicated database URL (same schema/migrations). `PrismaService.forTenant()` picks the right pool.
- **Noisy neighbours:** per-tenant rate limits (Redis token bucket), BullMQ group concurrency per tenant, heavy reports on read replica (Stage C+).

---

## 5. Identity, auth and access control

- **User** = a global person (phone and/or email, unique). **Membership** = user × tenant × roles (+ scope). One login, role switcher across institutions.
- **Login:** phone OTP (WhatsApp authentication template on Aadhyay's number → SMS fallback) or email OTP or password. OTP: 6 digits, 5 min TTL, max 5 attempts, hashed in Redis.
- **Tokens:** access JWT (EdDSA/HS512, 15 min) with `sub`, `tid`, `mid`, `roles`, `perms_ver`; refresh token (opaque 256-bit, stored hashed, rotation with reuse detection, 60 days). Each device = a session; user can revoke.
- **2FA:** TOTP mandatory for owner/admin/accountant roles (configurable).
- **Permissions:** `module.resource.action` (actions: view, create, edit, delete, approve, export, print). Role templates per segment. Assignment carries **scope** (`tenant | branch | class | section | own`) and optional **conditions** (amount limit, time window, maker-checker). Guard: `@Can('fees.payment.refund')` + scope filter in service.
- **Audit:** every mutating request writes `audit_logs` (actor, action, entity, before/after JSON diff, ip, ua), hash-chained per tenant (tamper-evident).

---

## 6. Events, jobs and integrations

- **Outbox pattern:** services write domain events (`attendance.marked`, `fee.paid`, `student.admitted`, `trip.started` …) into `outbox_events` **in the same transaction** as the data change. Worker polls (`FOR UPDATE SKIP LOCKED`), publishes to subscribers (BullMQ queues), marks done. At-least-once; consumers are idempotent by `event_id`.
- **Subscribers:** comms (notifications), analytics, audit, webhooks (tenant-configured), AI.
- **Public API:** REST `/v1`, OpenAPI generated, API keys + OAuth2 client credentials, idempotency keys on POST, cursor pagination.
- **Versioning:** `/v1` stays stable; breaking changes → `/v2` side by side for ≥ 12 months.

---

## 7. Communication engine (channel router)

```
module emits event ─► comms.subscriber ─► resolve recipients (per student! see §7.2)
                                         ─► routing policy (tenant settings, event type, recipient app activity, wallet)
                                         ─► channel plan: [push+inbox] → [whatsapp] → [sms] (fallbacks with timeouts)
                                         ─► render template (language: hi/en) ─► adapter.send() ─► delivery status webhook
                                         ─► usage meter + wallet debit (paid channels only)
```

- **Inbox:** every notification is also stored in the user's in-app notification inbox (free, permanent record).
- **Policy** per event type is data (`comm_routing_rules`), defaults from `03-PRODUCT-SPEC.md §Comms routing`.
- **Fallback rules:** WhatsApp is used only if the tenant has the WhatsApp Channel, the wallet has balance, and the rule says `whatsapp` or `fallback` + the recipient hasn't been app-active within N days (default 7). SMS is used only for OTP and SOS.
- **Quiet hours:** 21:00–07:00 IST for non-urgent messages (queued).

### 7.1 WhatsApp Channel (official Cloud API)
- **Onboarding:** Meta Embedded Signup inside the console → the tenant's own WABA + phone number; we store `waba_id`, `phone_number_id` and a system-user token (encrypted, AES-256-GCM with KMS key from env).
- **Aadhyay's own number** (`tenant_id = null` config) for OTP, renewal notices and platform sales.
- **Template studio:** create/edit templates (category, language, header/body/footer, buttons, variables) in our UI → submit via Graph API → status sync via webhook.
- **Flow builder:** visual builder producing WhatsApp **Flow JSON** (screens, forms) → publish via Graph API; responses land as webhook events into CRM/fees/etc.
- **Inbox:** two-way conversations, assignment to staff, 24-hour window indicator, quick replies.
- **Webhook:** `POST /v1/webhooks/whatsapp` with `X-Hub-Signature-256` verification; statuses → `message_deliveries`; inbound → inbox + CRM lead capture.
- **Billing:** each sent template message is metered with its Meta category; wallet debit = (Meta rate + platform fee) × 1.18.

### 7.2 Recipient resolution (multi-child)
`resolveRecipients(event)`:
1. Per-student events → for each `student` → guardians with `receives_notifications=true` → one message **per (guardian, student)**, labelled with the child's name.
2. Tenant-wide notices → **distinct guardians** (dedupe by user).
3. Transport `trip.started` → group the guardian's children on this trip by `vehicle_id`: **one tracking link per (guardian, vehicle, trip)** containing all of that guardian's children on that vehicle (and their stops).

---

## 8. Aadhyay Messenger (free, unlimited, E2EE)

### 8.1 Identity and contacts
- Anyone can sign up with a phone number (OTP) — no institution needed. Institution members are the same `users`.
- **Contact discovery:** the client sends contact numbers over TLS; the server HMAC-hashes them with a secret pepper, returns matches, and stores only the hashes (ADR-9). Manual add by number is also supported.
- **Messaging non-registered numbers:** the chat is created as `pending`. The message stays **encrypted in the sender's device outbox** (never on the server as plaintext); the server stores only a `pending_invites` row (sender, recipient phone hash). The sender gets an invite to share (system share sheet → free; optional SMS invite from the sender's own phone). When that number registers, the server notifies the sender's devices, which fetch the new prekey bundle, encrypt and deliver. The recipient then sees the messages and read receipts work normally.

### 8.2 Encryption protocol
- **Per device keys:** identity key (Ed25519/X25519), signed prekey (rotated weekly), 100 one-time prekeys. Server stores only public keys.
- **Session setup:** X3DH. **Messages:** Double Ratchet (AES-256-GCM via @noble/ciphers, HKDF-SHA256). **Multi-device:** sender encrypts once per recipient device (+ own other devices).
- **Groups:** Sender Keys (one chain key per sender per group, distributed over pairwise sessions); rekey on member removal.
- **Media:** encrypted on device with a random AES-256 key; ciphertext uploaded to object storage; key + hash travel inside the E2EE message. Server deletes the blob after all recipient devices ack download, or after 30 days.
- **Safety numbers:** users can verify each other with a QR / 60-digit code; key change shows a notice.
- **Server sees:** sender/recipient device ids, timestamps, sizes (needed for delivery). **Never** content.
- **Institution chats** (parent–teacher, class groups) are also E2EE. Moderation is report-based (the reporter's client attaches the decrypted messages). Teachers' phone numbers are never shown to parents. Institution admins set rules (allowed hours, who can start chats, broadcast-only groups).
- **Backups:** optional client-side encrypted backup (passphrase-derived key, Argon2id) to the user's Google Drive / iCloud.

### 8.3 Delivery
- Socket.IO room per device. Server queues encrypted envelopes in `messenger_envelopes` until the device acks, then deletes them. Offline devices get an FCM/APNs data push ("you have messages"). The content is never in the push.
- States: sent (server ack) → delivered (device ack) → seen (read receipt, encrypted control message; users can disable).

### 8.4 Calls
- **1:1 voice/video:** WebRTC, signalling over Socket.IO; DTLS-SRTP is end-to-end by default. ICE: public STUN + **coturn** with time-limited HMAC credentials (TURN REST API).
- **Group calls (≥3) & live classes:** **LiveKit** SFU self-hosted, with LiveKit E2EE (insertable streams, key distributed via the messenger session).
- Call history stored as E2EE messages.

---

## 9. Transport and live tracking
- Driver app → `trip.start` → location batches every 5–10 s (adaptive) over Socket.IO (HTTP batch fallback for poor networks; offline queue).
- Latest position in Redis `bus:{tripId}`; history in `location_pings` (PostGIS `geography(Point)`), monthly partitions, summarised after 90 days.
- Geofences for stops: `ST_DWithin` → `bus.near_stop`, `bus.arrived_stop` events → parent alerts (in-app).
- **Public tracking link:** `https://<site-host>/track/<token>` where the token is a signed JWT `{tid, tripId, vehicleId, guardianId, studentIds, exp=trip end}`. It shows only that bus, those children's stops and ETA. Revoked when the trip ends.
- SOS → `transport.sos` → push + WhatsApp + SMS to transport manager, principal and parents on that bus.

---

## 10. Websites, SEO and domains
- **Host routing (middleware):** `aadhyay.com` → marketing; `app.` → console; `control.` → control plane; `<slug>.aadhyay.com` or any verified custom domain → tenant site (`/site/[tenant]/…` rewrite).
- **Rendering:** RSC + ISR (revalidate on CMS publish via tag revalidation); edge caching through Cloudflare. Target LCP < 1.5 s on 4G and JS < 70 KB on public pages.
- **SEO automation:** per-page metadata, canonical URLs, `sitemap.xml` and `robots.txt` per host, **JSON-LD** (`EducationalOrganization`/`School`/`CollegeOrUniversity`, `Course`, `Event`, `FAQPage`, `BreadcrumbList`, `LocalBusiness`), Open Graph images generated per page, hreflang (`en-IN`, `hi-IN`), clean slugs, 301 redirect manager, image optimisation (AVIF/WebP, responsive sizes), font self-hosting.
- **Marketing site SEO:** location pages (`/school-erp/meerut`, `/school-erp/ghaziabad` …), comparison pages, free tools, Hindi versions.
- **Custom domains:** Cloudflare for SaaS custom hostnames (auto SSL). Verification: TXT record → status in console. Managed domains are registered in the institution's name.

---

## 11. Mobile app: common app + white-label flavours
- **One codebase** `frontend/mobile`. `app.config.ts` loads `flavours/$FLAVOUR/flavour.json`:
  ```json
  { "slug": "dps-meerut", "name": "DPS Meerut", "tenantSlug": "dps-meerut",
    "android": { "package": "com.aadhyay.dpsmeerut", "sha256": ["AB:CD:..."], "versionCode": 1 },
    "ios": { "bundleIdentifier": "com.aadhyay.dpsmeerut" },
    "colors": { "primary": "#1E40AF", "accent": "#F59E0B" },
    "apiBaseUrl": "https://api.aadhyay.com", "websiteHost": "dpsmeerut.aadhyay.com",
    "certificateTemplates": ["tc", "character", "bonafide"], "deepLinkHost": "dpsmeerut.aadhyay.com" }
  ```
- **Common flavour `aadhyay`:** `tenantSlug: null` → institution picker (search by name/city/code, or scan the institution QR). The tenant's logo and colours are then loaded at runtime from `/v1/public/tenants/:slug/branding`.
- **Locked flavour:** the tenant is fixed; branding is bundled (works offline on first launch).
- **Signing:** each flavour has its own Android upload keystore (EAS credentials). Its **SHA-256** is stored in `flavour.json` and in the tenant's `app_flavours` row → served at `/.well-known/assetlinks.json` (Android App Links) and used for Firebase registration. iOS: `apple-app-site-association` per tenant host.
- **Build:** `FLAVOUR=dps-meerut eas build -p android --profile production`. The control plane stores flavour configs and can generate `flavour.json` + assets (`pnpm --filter @aadhyay/mobile flavour:new`).
- **Roles in one app:** parent/student, teacher, driver, admin-lite. Navigation is built from the membership's permissions.
- **Offline-first:** attendance marking, driver trips and messenger outbox queue locally (SQLite) and sync.

---

## 12. Security
| Area | Controls |
|------|----------|
| App | OWASP ASVS L2; Zod validation on every input; Helmet/CSP; CSRF (SameSite + double-submit for cookie sessions); rate limits; bot protection (Turnstile) on public forms |
| Data | TLS everywhere; disk encryption; field-level AES-256-GCM for secrets, bank details, health data, biometric templates; Aadhaar never stored (last 4 digits at most) |
| Isolation | RLS + app-level tenant checks; control plane can't read tenant PII (separate DB role, no grants); break-glass access is tenant-approved, time-boxed and audited |
| Secrets | `.env` only on the server (Stage 0–B), then Doppler/Infisical self-hosted; never in git |
| Supply chain | Renovate, `pnpm audit`, CodeQL, Trivy image scan |
| DPDP | Consent records, purpose tags, rights console (access/correct/erase), breach workflow (72 h), DPA with every tenant, logs kept in India (180 days, CERT-In) |

### 12.1 Go-live security checklist (D-03) — tick every item before the first paying tenant
- [ ] `.env.prod` has fresh random `JWT_SECRET` (64+ chars), `ENCRYPTION_KEY`, `PHONE_HASH_PEPPER`, `TURN_SECRET`, `REVALIDATE_SECRET`; `OTP_DEV_ECHO=false`.
- [ ] Postgres not exposed publicly (only private network / Docker network); `aadhyay_app` role has no BYPASSRLS; strong passwords for both roles.
- [ ] Cloudflare proxied DNS + WAF on; origin firewall allows 80/443 only from Cloudflare IPs, plus 3478/5349/49160-49999 (TURN) and 7880-7881/50000-50999 (LiveKit) from anywhere; SSH key-only, port changed, fail2ban.
- [ ] Razorpay and Meta webhook secrets set; webhook signature tests pass (e2e `business`, `growth`).
- [ ] Turnstile enabled on signup/demo/enquiry forms.
- [ ] First founder logs in, enables TOTP, changes `SEED_ADMIN_PASSWORD`.
- [ ] Backups: run `infra/scripts/backup.sh` once by hand, then restore it into a scratch DB with `restore.sh` (restore drill).
- [ ] `pnpm audit --prod` has no high/critical; GitHub Dependabot/CodeQL enabled on the repo.
- [ ] Log retention 180 days in India (CERT-In); DPA template signed by the tenant; privacy policy + terms live on aadhyay.com.
- [ ] k6 `infra/k6/load.js` passes thresholds (p95 < 300 ms, errors < 1%) against staging.

---

## 13. Hosting and deployment

| Stage | Where | How |
|-------|-------|-----|
| Local dev | Laptop | `docker compose up` (postgres+postgis, redis, minio, mailpit, coturn, livekit) + `pnpm dev` |
| 0 | Oracle Cloud Always Free ARM VM (Mumbai/Hyderabad) | Docker Compose: caddy, api, realtime, worker, web, postgres, redis, coturn, livekit; nightly `pg_dump` → R2 |
| A | **E2E Networks Delhi NCR** (2 VMs) | Same compose, DB on its own VM; WAL-G continuous backup to object storage |
| B | E2E Delhi NCR (3–4 VMs) | Separate realtime node; Postgres on a dedicated-CPU node |
| C+ | E2E Delhi NCR + Chennai DR | Primary + streaming replica; k3s or Nomad when > 6 nodes |

- **Zero-downtime deploys:** build images in CI → push to GHCR → `docker compose pull && up -d` with health checks; Drizzle migrations are expand/contract (add column → backfill → switch reads → drop later).
- **Backups:** RPO 15 min (WAL-G), RTO 4 h; quarterly restore drill.
- **Migration between providers** = restore the backup + DNS switch (about 1 hour), because everything is containerised.

### 13.1 Deploy files (D-01)
| File | Purpose |
|------|---------|
| `backend/Dockerfile` | One image for api / realtime / worker (command selects the process) |
| `frontend/web/Dockerfile` | Next.js production image |
| `infra/docker-compose.prod.yml` | caddy, web, api, realtime, worker, redis, coturn, livekit; `postgres` + `backup` under profiles `single` (Stage 0) or `db` (DB VM at Stage A) |
| `infra/caddy/Caddyfile` | HTTPS, host routing (`api.`, `rt.`, apex/`*.` → web), on-demand TLS for verified custom domains |
| `infra/livekit.yaml` | Group calls / live classes SFU config |
| `infra/scripts/backup.sh`, `restore.sh` | Nightly `pg_dump -Fc` → object storage; restore drill / provider move |
| `infra/k6/load.js` | Load test (morning-peak profile) |
| `.env.prod.example` | Every production variable |
| `.github/workflows/ci.yml` | Typecheck, unit + e2e on real Postgres/Redis, web build, mobile typecheck; on `main` builds and pushes images to GHCR |

### 13.2 Runbook — Stage 0 (Oracle Cloud Always Free, ₹0)
1. Create an Oracle Cloud account → region **Mumbai or Hyderabad** → VM.Standard.A1.Flex (4 OCPU, 24 GB, Ubuntu 24.04 ARM). Open ingress 80, 443, 3478 tcp/udp, 5349, 49160-49999/udp, 7880-7881, 50000-50999/udp in the VCN security list **and** `iptables` on the VM.
2. Install Docker: `curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker $USER`.
3. DNS on Cloudflare (free): `aadhyay.com`, `*.aadhyay.com`, `api`, `rt` → VM IP (proxied); `turn` and `lk` → VM IP (**DNS only**, not proxied — media cannot pass Cloudflare's proxy).
4. `git clone` the repo to `/opt/aadhyay`; `cp .env.prod.example .env.prod`; fill all secrets (`openssl rand -base64 48`). Put the LiveKit key/secret in `infra/livekit.yaml` too.
5. Create Cloudflare R2 buckets `aadhyay` and `aadhyay-backups` (free 10 GB); fill `S3_*`.
6. Images: CI pushes multi-arch images to GHCR — or build on the VM: `docker build -f backend/Dockerfile -t ghcr.io/aadhyay/aadhyay-backend .` (same for web).
7. Start: `docker compose -f infra/docker-compose.prod.yml --env-file .env.prod --profile single up -d`. The `api` container runs migrations + idempotent seed on start.
8. Smoke test: `curl https://api.aadhyay.com/v1/health` → `{"ok":true}`; open `https://aadhyay.com/pricing`; sign up a test school; log in at `https://control.aadhyay.com`.
9. Meta: in the Meta app set webhook `https://api.aadhyay.com/v1/whatsapp/webhook` with `META_VERIFY_TOKEN`. Razorpay: webhook `https://api.aadhyay.com/v1/payments/webhook/razorpay`.
10. Work through the checklist in §12.1. **Move to Stage A when the first tenant pays** (Oracle free tier has no SLA).

### 13.3 Runbook — Stage A (E2E Networks, Delhi NCR)
1. Create 2 VMs in Delhi NCR: **app** (4 vCPU / 8 GB) and **db** (2 vCPU / 8 GB + 100 GB SSD), both in the same VPC; DB VM has no public ingress except SSH from your IP.
2. DB VM: `docker compose ... --profile db up -d postgres backup`. Add WAL-G for 15-minute RPO: `walg` sidecar with `WALG_S3_PREFIX=s3://aadhyay-backups/wal` and `archive_command='wal-g wal-push %p'` (replace the `/bin/true` placeholder in the compose file).
3. App VM: set `DATABASE_URL`/`APP_DATABASE_URL` to the DB VM's private IP; `docker compose ... up -d` (no profile → no local postgres).
4. Move data from Stage 0: run `backup.sh` on the old VM → `restore.sh s3://aadhyay-backups/db/<stamp>.dump` on the new DB → switch Cloudflare DNS records to the app VM → ~1 hour total, announce a 30-minute maintenance window at night.
5. Deploys: `TAG=<git sha> docker compose ... pull && docker compose ... up -d` (rolling per service; health checks gate traffic). Roll back by redeploying the previous `TAG`.
6. Monitoring: Uptime Kuma (free, on app VM) on `/v1/health` + Telegram/email alerts; `docker stats` and Postgres `pg_stat_statements` weekly review.

---

## 14. Performance budgets
| Metric | Target |
|--------|--------|
| API p95 (simple reads) | < 120 ms |
| API p95 (writes) | < 250 ms |
| Messenger delivery (online → online) | < 300 ms |
| Bus location → parent screen | < 3 s |
| Public site LCP (4G) | < 1.5 s |
| Admin console TTI | < 2.5 s |
| Concurrent sockets per realtime node (4 vCPU) | 20,000 |

Techniques: Fastify, connection pooling (PgBouncer at Stage B), Redis caching of tenant config/permissions, cursor pagination, DB indexes on `(tenant_id, …)`, partitioned big tables (attendance, pings, audit, outbox), ISR for websites, CDN for media.

---

## 15. Architecture decision log (ADR — append only)
| # | Date | Decision | Reason |
|---|------|----------|--------|
| 1 | 2026-10-07 | NestJS + Fastify modular monolith, 3 entrypoints | Founders' choice; boundaries for long life |
| 2 | 2026-10-07 | PostgreSQL + RLS (ORM: see ADR-8) | Relational ERP, money, isolation |
| 3 | 2026-10-07 | Official WhatsApp Cloud API only; no Baileys | Founders' decision; compliance |
| 4 | 2026-10-07 | Own E2EE messenger on @noble primitives (not libsignal, which is AGPL) | Licence and cost |
| 5 | 2026-10-07 | Expo React Native with flavour configs; common app with institution picker | Founders' decision |
| 6 | 2026-10-07 | Free tier hosting until first payment → E2E Networks Delhi NCR | ₹0 seed + North India target |
| 7 | 2026-10-07 | Messenger free & unlimited; cost controlled by P2P calls + media expiry after delivery | Founders' decision |
| 8 | 2026-10-07 | Drizzle ORM instead of Prisma | Prisma CLI needs a binary engine download (blocked in build env); Drizzle is pure TS, SQL-first (RLS), lighter. Schema in backend/src/db/schema |
| 9 | 2026-10-07 | Contact discovery: phones sent over TLS, HMAC-hashed server-side, only hashes stored | Client-side hashing with a public pepper gives no real privacy; this is honest and simple |
| 10 | 2026-10-07 | Bus tracking links use short opaque tokens (hash stored) instead of JWTs | Short URLs for SMS/WhatsApp; revocable |
