# Aadhyay — Real Current State Audit

> **Update 2026-10-08 (later the same day):** several findings below have since been fixed and verified — see
> `docs/SECURITY.md`, `docs/TESTING.md`, `docs/DEVELOPMENT.md`. Fixed: control-plane brute force (now locks after 5
> failures), `trustProxy` (now limited to trusted proxies), RLS on the six tenant tables that lacked it, `files`
> upload/download checks, CSP on web and API, web typecheck (`CITIES`), wildcard permissions (`fees.*.view` never
> matched — principals could not see fees, teachers could not see academics/timetable), 500s on malformed ids,
> e2e tests sharing the dev Redis, missing demo data and demo logins.
> **Correction:** "teacher → 403 on students list" in this audit was caused by the audit probe sending `role` instead
> of `roleKeys`; it was not a product bug. A teacher created with `roleKeys: ['teacher']` can list students.


## Audit Date
2026-10-08 (single session, read-only except a disposable DB `aadhyay_audit` and this `docs/audit/` folder)

## Repository Commit / Branch
NOT A GIT REPOSITORY (`git log` fails). No commit or branch can be reported.

## Environment
Linux, Node 24.21.0, pnpm 10.28.0, Postgres 16 + PostGIS (Docker), Redis 7, MinIO, Mailpit, LiveKit, coturn (Docker). Repo sits on an NTFS (ntfs3) drive; 7 GB RAM.
**Audit limits:** no browser/UI automation tool was available, so *no interactive UI testing was done*. The machine ran out of memory several times (killing the web/API processes), which cut short route testing and Expo/mobile testing.

## Executive Verdict
**INTERNAL TEST READY, not pilot ready.** The backend is substantial and its core business flows and tenant isolation held up under live testing. Large parts (web UI interaction, mobile, every external integration, payments, WhatsApp, push, SMS) are **UNVERIFIED** — integrations run only in "log" mode locally. Several security gaps exist (below). Treat everything not listed under "What Actually Works" as unproven.

## What Actually Works (verified by running it)
| Feature | Evidence |
|---|---|
| Install, typecheck (backend, mobile, e2ee), compile backend | `tsc --noEmit` PASS; `tsc -p tsconfig.build.json` OK |
| Migrations from empty DB → 166 tables, 138 RLS policies, 308 indexes, 43 FKs | Ran `migrate.js` on fresh `aadhyay_audit`; queried catalog |
| Base seed: 6 plans + price book + 1 super admin (platform_users) | Queried DB |
| Self-serve tenant signup → owner OTP login → 12 default roles created | `POST /v1/public/signup` 201; `roles` rows |
| Tenant isolation (API): Tenant A token vs Tenant B student GET/PATCH/DELETE → 404, list → no leak; reverse direction same; `x-tenant-id` header spoof ignored; `switch-tenant` to foreign tenant refused (422) | Live probe, 2 tenants |
| App DB role `aadhyay_app` has NOBYPASSRLS, not superuser | `pg_roles` |
| Role enforcement at API: teacher → 403 on students list, fees, org settings, member invite; parent → 403 on student list/patch/fee-head create | Live probe |
| Unauthenticated → 401; garbage JWT → 401; tenant-owner token on `/control/*` → 401 | Live probe |
| OTP: wrong-code lockout (8 wrong then the *correct* code also rejected), single-use OTP, refresh-token rotation (reuse → 401), logout revokes access token | Live probe |
| Control-plane login (`POST /v1/control/auth/login`), metrics, tenant list, price-book | Live probe, 200s |
| Unit tests | 30/30 pass (7 files) |
| E2E tests (against disposable DB) | 15/16 on first run; the one failure (`messenger` pending-invite) was caused by my dev worker/realtime sharing Redis; with them stopped `messenger.e2e.ts` passed 3/3. Full suite was **not** re-run end-to-end afterward. |
| What e2e tests actually prove | They assert business outcomes (fee allocation oldest-first with receipt numbering, RLS between two schools, payroll LOP, auto-graded online test + rank, GST invoice split, lifecycle trial→grace→suspended, absent alert reaching parent inbox, E2EE round-trip with server deleting after ack). Meaningful, not status-only. |

## What Partially Works
- **Web app**: marketing routes `/`, `/pricing`, `/demo`, `/signup`, `/school-erp/delhi`, `/verify/*`, `/track/*`, `/control/login`, `/app/login` return 200; `/app/*` console routes redirect to `/app/login` without session; `/control` redirects to `/control/login`. **Behind login: UNVERIFIED** (no browser).
- **Web typecheck FAILS**: `(marketing)/layout.tsx` exports `CITIES`, which Next's generated types reject (`TS2344`). May break `next build`; `next build` was not run.
- **Web dev server**: Turbopack fails on this NTFS drive (cannot resolve `next`); works only with `next dev --webpack`.

## What Is Broken
1. Web `tsc` error above (P2).
2. `docker-compose.yml` coturn used unsupported `--no-dtls` → container crashed; I removed that flag during setup (the only repo edit besides `docs/audit/`; also `frontend/mobile/tsconfig.json` was auto-edited by Expo).
3. `.env` `ENCRYPTION_KEY` was invalid (no `base64:` prefix, 16 bytes) — all three backend processes crash at boot. The user has since fixed it.
4. `pnpm dev` at repo root starts only the API (+ tsc watch), never realtime/worker, and uses Turbopack.

## What Is Missing / Not Seeded
- **No demo tenant or demo users exist.** `seed.js` only creates plans, price book and one super admin. Tenants, students, teachers, parents are created via signup/API. There is no seeded sample school.
- **NO VERIFIED DEMO LOGIN FOUND** for any tenant role. See Login Information.
- Integration credentials (Razorpay, Meta WhatsApp, FCM, SMS, S3 prod) absent.

## What Is Mocked / Log-Only Locally
`SMS_PROVIDER=log`, `WHATSAPP_PROVIDER=log`, Razorpay key empty (adapter requires non-`rzp_log` key), push disabled unless `PUSH_PROVIDER=fcm` + service account. OTP is returned in the HTTP response (`devCode`) when `OTP_DEV_ECHO=true` and `NODE_ENV!=production`.

## What Is Unverified (and why)
Interactive web UI behind login (no browser tool); mobile app run (Expo started once, Metro `running`, but no device/simulator; later killed by OOM); realtime sockets outside e2e; GPS/transport live tracking outside e2e; LiveKit calls/video; WhatsApp; Razorpay payment + webhook signature + duplicate webhook; push; SMS; email delivery; file upload/IDOR; exports; CMS public site beyond what e2e covers; billing scheduler in a long-running worker; AI features (no AI provider key); performance (no measurements taken); Docker image builds; `next build`; k6 load tests; CSRF/XSS/SSRF/path traversal; white-label flavour generation.

## Login Information
**Control plane (verified on the disposable DB only):** URL `http://localhost:3000/control/login` (web) / `POST /v1/control/auth/login`. The audit DB account `audit-admin@aadhyay.test` with password `Audit@pass123` was created by me via `SEED_ADMIN_EMAIL/PASSWORD` and verified (201, token issued). It does **not** exist in the user's real `aadhyay` DB.
**User's real dev DB:** super admin `admin@aadhyay.com`; password is `SEED_ADMIN_PASSWORD` if set, else the seed script's default (see `backend/src/scripts/seed.ts`). **I did not verify a login against the real DB.** Change it.
**Tenant users:** phone + OTP only (`POST /v1/auth/otp/request` → `/auth/otp/verify`, with `tenantSlug`). With `OTP_DEV_ECHO=true` the code is in the request response. Owner phone = the phone given at signup. No seeded tenant users.

## Seed Information
Command: `cd backend && node dist/scripts/migrate.js && node dist/scripts/seed.js` (verified on a fresh DB). Created: 6 `plans`, price-book items, 1 `platform_users` super admin. Everything else (tenants, roles, classes, students) comes from signup + API calls. After my e2e + probe runs the audit DB held 17 tenants, 65 users, 20 students, 239 roles — these are test data, not seed.

## Complete Access Guide
See `QUICK_START.md`.

## Complete Feature List (what code exists vs. proven)
Backend modules present (from `backend/src/modules`): academics, accounts, ai, attendance, cms, comms, compliance, crm, exams, fees, front-office, homework, hr, learning (lesson plans, LMS, online tests, live), messenger, ops (library, inventory, hostel, canteen, certificates, behaviour, health records, alumni), org, packs (coaching/college/multibranch/store), people, reports, transport, whatsapp; plus control-plane (tenants, billing, public signup/demo) and kernel (auth, files, events/outbox). ~280 explicit route decorators (110 GET, 146 POST, 10 PUT, 9 PATCH, 4 DELETE) plus generated CRUD routes (`common/crud.ts`) — **exact total not measured**.
Runtime-proven only: fees, attendance→parent alert, exams/report-card visibility, notices, payroll/library/certificates/online-test, CMS public site + lead→student, transport link + public tracking, messenger E2EE round trip, billing quote→invoice→active, lifecycle trial→grace→suspended (all via the repo's own e2e tests, which I ran). All other modules: **IMPLEMENTED BUT UNVERIFIED**.

## Complete Role List
Default roles created per tenant (12, verified in DB): Owner/Director, Principal, Institution Admin, Accountant, Front Office/Counsellor, Teacher, HR Manager, Librarian, Store Keeper, Warden, Transport Manager, Driver/Attendant. Plus guardian/student "kinds" and platform roles (super_admin, ops, account_manager, finance). Only Owner, Teacher, Parent (guardian) and super admin were exercised.

## Database State
166 tables, 138 with RLS + policy, 308 indexes, 43 FKs, 0 triggers. 28 tables have no RLS: global/platform tables (plans, users, sessions, messenger_* etc.) and **6 tenant-bearing tables without RLS: `abuse_reports, wa_accounts, files, outbox_events, conversations, sessions`**. `wa_accounts` and `files` are accessed through the admin (RLS-bypassing) pool, so isolation there depends on application code only — **UNVERIFIED** (no file/IDOR test run). Only 43 FKs across 166 tables: integrity relies heavily on application logic.

## API State
Verified live: auth, signup, classes, students, attendance read, fee ledger read, org members, control metrics/tenants/price-book. Validation errors return 422 with Zod details; `GET /org/settings` unauthenticated returned 404 rather than 401 (inconsistent).

## Security State
See `33_SECURITY_RISK_REGISTER.md`. Highlights: no brute-force lockout on control-plane password login (15 wrong then success); `trustProxy: true` means client-supplied `X-Forwarded-For` can defeat IP-based limits (signup/OTP/demo) if the API is not behind a proxy that overwrites it — **bypass not conclusively demonstrated** (my signup test was rejected by validation); CORS reflects any origin with credentials in non-production (restricted in production by code); CSP disabled (`contentSecurityPolicy:false`); OTP IP limit is 30/h, phone limit 5/h.

## Multi-Tenant State
PASS on all API tests run (see above). Not tested: files, exports, reports, CMS, transport, messenger, realtime sockets, mobile API across tenants.

## Mobile State
Typecheck PASS. 20 route files under `frontend/mobile/app` (institution picker, login, parent/teacher/driver areas, chat, call, leave, pay). Expo Metro started and reported `packager-status:running`; **no app was opened, no screen tested.** Flavour generation: UNVERIFIED (`flavours/` has 8 files).

## Integration State
All IMPLEMENTED, none RUNTIME VERIFIED against a real provider (see Mocked). LiveKit/coturn/MinIO/Mailpit containers run locally; usage not tested.

## Testing State
30 unit + 16 e2e tests. E2E hits the same DB/Redis as dev unless `DATABASE_URL` is overridden, and collides with a running worker/realtime (shared Redis) — caused the one failure I saw. No frontend or mobile tests exist (`backend/test` only). k6 scripts exist in `infra/k6`, not run.

## Production Readiness
**NOT production ready.** Missing: verified payment/webhook path, verified WhatsApp/SMS/push, no UI test coverage, no frontend/mobile tests, web typecheck failing, no CSP, no login lockout on control plane, no demo data, unverified backups/DR, no performance measurements. Docker image builds and `next build` not run.

## Top Risks
1. Control-plane login: no lockout/rate limit (P1).
2. `trustProxy:true` with spoofable XFF (P1 if directly exposed).
3. Payments/webhooks never runtime-verified (P1).
4. `files`/`wa_accounts` outside RLS; isolation unverified (P1).
5. E2E tests and dev share Redis/DB by default (P2).
6. Web typecheck error / possible `next build` failure (P2).
7. Only 43 FKs for 166 tables (P2).
8. CSP disabled (P2).
9. Turbopack unusable on this drive; `pnpm dev` incomplete (P3).
10. Invalid example/default env pitfalls (ENCRYPTION_KEY) cause boot crash (P3).

## Top Missing Items
Demo seed tenant with users per role; UI tests; mobile tests; real-provider integration tests; CSP; control-plane lockout; documented working dev start script; `next build` in CI; measured performance baseline.

## Top Recommended Next Tasks
1. Add lockout/rate limit to `/control/auth/login`. 2. Constrain `trustProxy` to known proxies. 3. Fix `CITIES` export in marketing layout; run `next build`. 4. Add a `seed:demo` script (tenant + one user per role). 5. Verify Razorpay sandbox + webhook signature/idempotency. 6. Add RLS or tested guards for `files`, `wa_accounts`. 7. Separate test DB/Redis prefix for e2e. 8. Real browser/E2E UI tests. 9. Run mobile on a device with each role. 10. Measure performance with k6.
