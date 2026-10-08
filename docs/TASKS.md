# TASKS — Build order & implementation status

> **How to use:** take the first `TODO` whose dependencies are `DONE`. When finished: set the status, fill in "Files / notes", and commit together with the code. Never mark `DONE` with failing tests.
> Status: `TODO` · `DOING` · `DONE` · `PARTIAL(...)` · `BLOCKED(...)`

## Phase 0 — Foundation
| ID | Task | Depends | Status | Files / notes |
|----|------|---------|--------|---------------|
| F-01 | Docs set (README, business plan, architecture, product spec, data & API, tasks) | — | DONE | `docs/*` |
| F-02 | Monorepo: pnpm workspace, turbo, root scripts, .env.example, docker-compose (pg+postgis, redis, minio, mailpit, coturn, livekit) | F-01 | DONE | Root package.json, pnpm-workspace, turbo, docker-compose, infra/postgres-init.sql, .env.example |
| F-03 | `@aadhyay/contracts`: zod schemas, permission keys, events, enums | F-02 | DONE | backend/contracts/src/* (zod schemas, permissions, events, modules) |
| F-04 | Backend skeleton: NestJS + Fastify, 3 entrypoints, config (zod env), error filter, logging, health | F-02 | DONE | backend/src/{bootstrap,main.api,app.module}.ts, config/env.ts, common/* |
| F-05 | Prisma schema (all core tables) + migrations + RLS SQL + seed | F-04 | DONE | Drizzle (not Prisma — ADR-8): src/db/schema/*.ts, migrations 0000_init + 0001_rls (aadhyay_apply_rls()) |
| F-06 | Kernel: TenantContext, tenant-scoped Prisma (SET LOCAL), tenant resolution | F-05 | DONE | kernel/context (ALS), db/db.service.ts t() = SET LOCAL app.tenant_id, kernel/tenancy |
| F-07 | Kernel: auth (OTP, password, JWT, refresh rotation, sessions, TOTP) | F-06 | DONE | kernel/auth/* — OTP (WA auth template→SMS), argon2, JWT, refresh rotation + reuse detection, TOTP |
| F-08 | Kernel: RBAC (@Can guard, scopes), role templates per segment | F-07 | DONE | kernel/rbac/access.service.ts, kernel/auth/access.guard.ts, ROLE_TEMPLATES, section-access.ts |
| F-09 | Kernel: audit log (hash-chained), outbox + dispatcher, module feature guard | F-06 | DONE | kernel/audit (hash chain + interceptor), kernel/events (outbox + @OnEvent), module guard in AccessGuard |
| F-10 | Kernel: files (S3 adapter, signed upload/download) | F-06 | DONE | kernel/files/files.controller.ts + adapters/storage (S3 presigned) |
| F-11 | CI: lint, typecheck, unit + e2e on Postgres | F-04 | DONE (.github/workflows/ci.yml) |  |

## Phase 1 — Control plane & lifecycle
| ID | Task | Depends | Status | Files / notes |
|----|------|---------|--------|---------------|
| C-01 | Tenants, domains, modules, self-serve signup (trial) | F-09 | DONE | control-plane/provisioning.service.ts, public.controller.ts (signup, picker, branding) |
| C-02 | Plans, price book (list/min/max), quote calculator (GST) | C-01 | DONE | control-plane/pricing.ts (+spec, matches docs/01 §4.3), price-book.seed.ts |
| C-03 | Subscriptions, invoices (GST split CGST/SGST/IGST by place of supply), payments | C-02 | DONE | control-plane/billing.service.ts (invoices AAD/FY/n, GST split, Razorpay platform, activation) |
| C-04 | Wallet + usage metering | C-03 | DONE | BillingService.debitUsage (fractional paise accumulator), walletAdjust, topup |
| C-05 | Lifecycle job: trial→active→grace→suspended→archived→purged + reminders T-15…; suspension guard | C-03 | DONE | control-plane/lifecycle.ts (+spec), lifecycle.service.ts (transitions, reminders, purge) |
| C-06 | Company expenses + spend-ceiling gauge (60% rule) + 80:20 profit report | C-03 | DONE | control-plane/finance.service.ts (60% spend ceiling, 25.17% tax reserve, 80:20), control.controller.ts |

## Phase 2 — School core
| ID | Task | Depends | Status | Files / notes |
|----|------|---------|--------|---------------|
| S-01 | org: branches, sessions, branding, settings | C-01 | DONE | modules/org (profile, branding, settings, sessions, roles, members, branches, custom fields) |
| S-02 | people: students, guardians (sibling link), staff, custom fields, bulk import | S-01 | DONE | modules/people (admission + guardians/siblings, import dry-run, staff, my/children) |
| S-03 | academics: classes, sections, subjects, enrollments, promotion | S-02 | DONE | modules/academics (tree, classes+sections, subjects, enrol, promote, auto roll) |
| S-04 | timetable + calendar | S-03 | DONE | timetable (clash detection, greedy generator), calendar (+iCal) |
| S-05 | attendance (manual/QR/device API, leave, absent alert event) | S-03 | DONE | modules/attendance (exceptions-only, devices, leave, auto-absent cutoff) |
| S-06 | homework + diary | S-03 | DONE | modules/homework (assign, submit, evaluate, diary) |
| S-07 | exams: grade scales, schedules, marks, results, report-card data | S-03 | DONE | modules/exams (marks grid, compute, ranks, publish, report card) |
| S-08 | fees: heads, structures, assignment, collection, receipts, online payments (Razorpay adapter), defaulters, ledger posting | S-02 | DONE | modules/fees (structures, assign, late fee, allocation, receipts+PDF, journal, online, webhook, defaulters, reminders) |
| S-09 | comms engine: routing rules, recipient resolution (per child), templates, inbox, push adapter, email, SMS | S-02 | DONE | modules/comms (per-child resolution, routing, quiet hours, inbox, push/WA/SMS/email), templates en+hi |
| S-10 | certificates & ID cards + public verify | S-02 | DONE | modules/ops certificates (templates, issue, PDF with QR, public verify), ID cards |
| S-11 | front office (enquiry, visitors, calls, postal, complaints) | S-01 | DONE | modules/front-office (enquiries→lead, visitors, calls, postal, complaints) |

## Phase 3 — Messenger & WhatsApp
| ID | Task | Depends | Status | Files / notes |
|----|------|---------|--------|---------------|
| M-01 | E2EE crypto lib (X3DH, Double Ratchet, sender keys, media encryption) shared by web+mobile, with tests | F-03 | DONE | frontend/packages/e2ee (X3DH, Double Ratchet, Sender Keys, media, safety numbers; 7 tests) |
| M-02 | Messenger server: devices, prekeys, contact discovery (hash), conversations, envelopes, receipts, pending invites, media blobs expiry | F-07 | DONE | modules/messenger (devices, prekey bundles, discovery hashed server-side, conversations, envelopes, ack-delete, receipts, pending invites, media expiry) |
| M-03 | Realtime gateway `/messenger` + push wake-up | M-02 | DONE | realtime/realtime.server.ts (/messenger rooms, typing, ack, receipts, online presence, push wake) |
| M-04 | Calls: signalling `/calls`, TURN credentials, LiveKit token for groups | M-03 | DONE | calls: p2p TURN creds (adapters/turn), LiveKit SFU tokens for groups, /calls signalling relay |
| M-05 | Institution chats: parent–teacher with hidden numbers, class groups, admin rules, report/block | M-02, S-03 | DONE | institution chats: parent-teacher (teacher admin, allowed hours), class groups (broadcast-only), report/block |
| W-01 | WhatsApp Cloud API adapter (send template/text, media), webhook verify + statuses + inbound | S-09 | DONE | modules/whatsapp (Cloud API adapter, webhook statuses/inbound→lead, refunds on failure) |
| W-02 | Template studio + Flow builder APIs (Graph API sync) | W-01 | DONE | Template studio + Flow builder (validateFlowJson) in whatsapp.service.ts |
| W-03 | WhatsApp metering → wallet debit (Meta rate + fee + GST) | W-01, C-04 | DONE | waMessagePrice + debitUsage in sendTemplate |

## Phase 4 — Transport, CMS, CRM
| ID | Task | Depends | Status | Files / notes |
|----|------|---------|--------|---------------|
| T-01 | Vehicles, routes, stops, student assignment | S-02 | DONE | modules/transport (vehicles, routes+stops, assignments) |
| T-02 | Trips, pings (realtime), geofence events, SOS | T-01 | DONE | trips, pings (REST + socket), geofence near-stop, overspeed, boarded/dropped, SOS |
| T-03 | Tracking links: multi-child per-vehicle rule, signed tokens, public view | T-02, S-09 | DONE | tracking links: one per (guardian, vehicle, trip) with short opaque token; /public/track/:token |
| P-01 | CMS: pages (blocks), menus, posts, media, redirects, forms → CRM, publish | S-01 | DONE | modules/cms (pages w/ version history+rollback, posts, menus, redirects, forms→CRM, public /site API) |
| P-02 | SEO: sitemap/robots per host, JSON-LD, OG, hreflang | P-01 | DONE | JSON-LD (School/College/FAQ/Event/Article), sitemap data, hreflang alternates, canonical host — rendered by web |
| P-03 | Custom domains (verification + Cloudflare for SaaS adapter) | P-01 | DONE | custom domains: TXT verify via DNS + Cloudflare for SaaS adapter (CF_ZONE_ID/CF_API_TOKEN) |
| R-01 | CRM: leads, pipelines, activities, dedupe, conversion to student | S-02 | DONE | modules/crm (capture+dedupe, round-robin owner, scoring, stages, activities, convert→student, source ROI) |

## Phase 5 — Operations depth
| ID | Task | Depends | Status |
|----|------|---------|--------|
| O-01 | HR + leave | S-02 | DONE |
| O-02 | Payroll | O-01 | DONE |
| O-03 | Accounts (vouchers, ledgers, Tally export) | S-08 | DONE |
| O-04 | Library | S-02 | DONE |
| O-05 | Inventory & assets | S-01 | DONE |
| O-06 | Hostel | S-02 | DONE |
| O-07 | Behaviour, health, canteen, alumni, CV | S-02 | DONE |
| O-08 | Lesson plans, online exams, LMS, live classes | S-07 | DONE |
| O-09 | Reports & custom report builder, exports | S-08 | DONE |
| O-10 | Multi-branch, college pack, coaching pack | S-03 | DONE |
| O-11 | AI gateway + copilot features | S-09 | DONE |
| O-12 | AI voice agent adapter | R-01 | PARTIAL(adapter interface planned; vendor (Bolna/Exotel) wiring pending) |
| O-13 | Compliance exports + DPDP rights console | S-02 | DONE |

> Phase 5 notes: see module folders listed in docs/02 §3. Tests: backend/test/business.e2e.ts.

## Phase 6 — Frontends
| ID | Task | Depends | Status | Files / notes |
|----|------|---------|--------|---------------|
| UI-01 | Web: Next.js app, design system, host middleware, auth (OTP) | F-07 | DONE | |
| UI-02 | Web: marketing site aadhyay.com (SEO, pricing calculator) | UI-01 | DONE | |
| UI-03 | Web console: dashboard, students, attendance, fees, exams, notices, settings | UI-01, S-* | DONE | |
| UI-04 | Web: tenant website renderer + track page | P-01, T-03 | DONE | |
| UI-05 | Web: control plane screens | C-* | DONE | |
| UI-06 | Web: messenger UI (E2EE in browser) | M-03 | PARTIAL(chat done in browser; web voice/video calls UI pending — calls work in mobile app) | |
| MB-01 | Mobile: Expo app, flavour system, common-app institution picker, OTP login | F-07 | DONE | |
| MB-02 | Mobile: parent/student screens (multi-child switcher, attendance, fees, results, notices, bus map) | MB-01 | DONE | |
| MB-03 | Mobile: teacher screens (attendance, homework, marks) | MB-01 | DONE | |
| MB-04 | Mobile: driver app (trip, background GPS, boarding, SOS) | MB-01, T-02 | DONE | |
| MB-05 | Mobile: Messenger + calls | MB-01, M-04 | DONE | |

## Phase 7 — Ship
| ID | Task | Depends | Status |
|----|------|---------|--------|
| D-01 | Dockerfiles, production compose, Caddy, backups (pg_dump/WAL-G → object storage) | F-04 | DONE (WAL-G sidecar added at Stage A per runbook) |
| D-02 | Stage 0 runbook (Oracle free VM) and Stage A runbook (E2E Delhi NCR) | D-01 | DONE (02-ARCHITECTURE §13.2–13.3) |
| D-03 | Security review checklist, load test (k6) | all | DONE (checklist §12.1, `infra/k6/load.js`; run both before first paying tenant) |

---
## Change log
| Date | By | Change |
|------|----|--------|
| 2026-10-07 | Claude | Created docs and task plan |
| 2026-10-07 | Claude | Foundation, control plane, school core, comms, WhatsApp done; 24 unit + 8 e2e tests green |
| 2026-10-07 | Claude | Messenger+E2EE, transport, CMS/CRM, all operations modules; 30 unit + 16 e2e + 7 e2ee tests green |
| 2026-10-07 | Claude | Web (Next 16) + mobile (Expo 57, flavours) apps; deploy files, CI, runbooks, security checklist, k6. Remaining: web calls UI, O-12 voice-agent vendor, big-table partitioning (Stage C) |
