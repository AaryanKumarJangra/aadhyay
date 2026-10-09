# Redesign audit — implementation matrix (2026-10-09)

Verified from code, not from `docs/TASKS.md` (which marks almost every row `DONE`). Baseline at audit time:
typecheck PASS (backend, contracts, web, e2ee), backend unit tests 44/44 PASS, infra containers healthy.

Status keys: **REAL** works end-to-end · **PARTIAL** backend real, product incomplete · **THIN** a page exists but is a
prototype (no states, no design, no workflow) · **UNSAFE** works but leaks or over-grants · **MISSING** absent.

## 1. Cross-cutting findings (root causes)

| # | Finding | Evidence | Severity | Root cause |
|---|---|---|---|---|
| A1 | Scope is not bound to the permission it was granted with | `access.service.ts` merges every assignment's scope into `ctx.scopes.all`; guard only checks key presence | High | RBAC modelled as "set of keys"; scope was an afterthought |
| A2 | Teacher can read **any** section's attendance register / month matrix | `attendance.controller.ts` `register`, `monthly` have no `assertSectionAccess` | High | Scope checks applied to writes only |
| A3 | Teacher can list **all** students in the tenant | `people.service.ts listStudents` has no scope filter | High | A1 |
| A4 | Any `people.*` key (e.g. librarian `people.staff.view`) opens any student | `assertCanSeeStudent` uses `p.startsWith('people.')` | High | Hand-written check instead of engine |
| A5 | Student detail returns religion, category, APAAR id, address, fee totals, guardian phones to everyone who can open it | `people.service.ts getStudent` | High (DPDP) | No field-level / sensitive-data permissions |
| A6 | Privilege escalation: `org.role.edit` / `org.member.edit` holders (every Principal via `org.*`) can create a `*` role or assign Owner to themselves | `org.controller.ts createRole/updateRole/setRoles` | Critical | No grant-authority rule |
| A7 | Teacher template grants `attendance.student.*` (incl. delete/approve/export), `homework.*`, `lms.*`, `behaviour.incident.*` | `contracts/permissions.ts` | High | Wildcards in templates |
| A8 | `admin` template = `*` (identical to Owner) | same | Medium | — |
| A9 | Leave list/decide: tenant-wide for any `attendance.leave.view` holder | `attendance.service.ts leaves/decideLeave` | Medium | A1 |
| A10 | Generic CRUD (`common/crud.ts`, ~55 resources) has no scope hook: behaviour incidents, documents, health visits are tenant-wide for any viewer | `crud.ts` | High | A1 |
| A11 | Exam section results readable for any section by any `exams.exam.view` holder | `exams.controller.ts :id/sections/:sectionId/results` | Medium | A1 |
| A12 | 403 says only "You do not have permission"; no reason, no permission key, no contact | `errors.ts forbidden()` | UX | — |
| A13 | Permission strings are free text in 200+ `@Can` calls, nav, mobile; no catalogue, no labels; typos are silent | grep `@Can(` | Medium | No catalogue |
| A14 | No effective-access view, no role editor, no scope UI | `settings/panels.tsx` shows roles as badges | UX | — |
| A15 | 49 `.catch(() => undefined/null/[])` in UI silently hide failures | grep | UX | No error-state components |
| A16 | Web hardcodes `Asia/Kolkata`/`todayIST` (17 places) instead of tenant timezone | grep | Low | — |

## 2. Feature matrix

| Feature | Backend / API | DB | Web | Mobile | AuthZ | Tests | Status | Required change |
|---|---|---|---|---|---|---|---|---|
| Tenant resolution / RLS | token → header → host; RLS on all tenant tables; app role NOBYPASSRLS | yes | — | — | header ignored when token has tid | e2e security | **REAL** | Keep. Add forged-header + cross-tenant cases to authz suite |
| Auth (OTP, password, refresh, TOTP) | real | yes | login page 62 lines | login 49 lines | — | e2e | **PARTIAL** | Premium login UI, session list UI |
| RBAC / roles / scopes | key-presence only | `roles.permissions text[]`, `role_assignments.scope_*` | badges only | role inferred from perms | **UNSAFE** (A1–A11) | 1 unit file | **UNSAFE** | Central engine, catalogue, per-permission scope, conditions, grant authority, explain, effective access |
| Module entitlement | `tenant_modules` + `@RequireModule` | yes | nav filter | — | real | partial | **PARTIAL** | Plan/add-on/flag merge, "Included / Add-on / Upgrade" states |
| Navigation | — | — | hardcoded `NAV` (17 items, flat) | per-role folders | client only | none | **THIN** | Catalogue-driven nav tree, typed perms, server route guards |
| Owner/Principal dashboard | `reports/dashboard` 11 scalars | — | 7 stat tiles, no trends | — | `reports.dashboard.view` | none | **THIN** | Role dashboards with trends (time series endpoints), charts, empty/loading/error |
| Teacher / Parent / Student / Accountant / Driver dashboards | partial endpoints | — | teacher: 1 card; parent: fee card | minimal | — | none | **THIN / MISSING** | Per-role dashboard compositions |
| Students / Student 360 | real CRUD, import dry-run | yes | list + basic detail | — | A3–A5 | e2e | **PARTIAL + UNSAFE** | Scoped list, sensitive fields gated, 360 tabs, timeline |
| Users & staff management | members list/invite/set roles | yes | none (`/r/staff` read list) | — | A6 | none | **MISSING (UI)** | People → Users & Staff, role assignment with scopes, effective access |
| Attendance | mark (exceptions), register, monthly, devices, leave, auto-absent | yes | 1-click grid | grid + offline queue (silent) | A2, A9 | e2e (alert) | **PARTIAL + UNSAFE** | Scope everywhere, dashboard, calendar, reports, visible sync state |
| Fees | structures, assign, collect, receipts PDF, online, defaulters, journal | yes | desk 47 lines | pay screen | ledger via assertCanSeeStudent | e2e | **PARTIAL** | Fees dashboard, refunds with maker-checker, amount-limit conditions |
| Exams | groups, marks, compute, publish, report card | yes | marks grid 34 lines | — | A11 | e2e | **PARTIAL** | Scope by assigned subject, analytics |
| Timetable | slots, clash detection, generator | yes | none | today list | view only | unit | **PARTIAL** | Visual grid |
| Homework | assign/submit/evaluate | yes | none | 21-line screen | section scope on write | e2e | **PARTIAL** | Screens |
| Comms / notices | routing, templates, inbox, per-child | yes | composer 31 lines | inbox 17 lines | inbox is own | e2e | **PARTIAL** | Audience count, delivery view, notification center |
| Notification center | inbox + unread count API | yes | none in header | inbox tab | own | — | **MISSING (UI)** | Header bell, categories, mark read, deep links |
| Global search (Cmd+K) | none | trgm index on students | none | — | — | — | **MISSING** | Scoped search endpoint + command palette |
| Messenger (E2EE) | real (X3DH, ratchet, sender keys) | yes | 72-line app | chat screens | own | e2e + 7 unit | **PARTIAL** | UI polish |
| Transport | trips, pings, geofence, SOS, tracking links | yes + PostGIS | 13-line page | driver 67 lines, parent bus | trip perms | e2e | **PARTIAL** | Live map dashboard, driver flow |
| CRM / admissions | leads, pipeline, forms → lead | yes | 26-line board | — | crm perms | e2e | **PARTIAL** | Pipeline UI, dashboard |
| CMS / website | pages w/ versions + rollback, menus, posts, forms, domains, sitemap | yes | **JSON textarea editor** | — | cms perms | partial | **THIN** | Visual builder (blocks / canvas / properties), media library, workflow, SEO score |
| HR / payroll | leave types, payroll runs, payslip math | yes | none | — | hr perms | e2e + unit | **PARTIAL** | Screens |
| Library / inventory / hostel | CRUD + issue/return, stock moves, allocation, outpass | yes | generic `/r/*` table+form | — | crud perms (A10) | partial | **THIN** | Module screens |
| Reports | 3 queries + 6 CSV datasets | — | 2 tables + CSV links | — | export is tenant-wide for `reports.*` | none | **THIN** | Reports hub, filters, saved views |
| Control plane | metrics, tenants, tenant detail, price book, finance, flavours, leads, lifecycle | yes | 4 pages, top-bar nav | — | platform roles | e2e | **THIN** | Sidebar shell, analytics dashboard, Tenant 360, onboarding wizard, price-book editor |
| Price book | DB-backed, quote engine, GST | yes | marketing reads it | — | `super_admin` patch | unit | **REAL** | Keep; add range/approval UI |
| Tenant lifecycle | state machine + reminders + purge | yes | banners | — | — | unit + e2e | **REAL** | Timeline UI in control plane |
| Break-glass / support session | none | none | none | — | — | — | **MISSING** | Model + approval + audit |
| Audit log | hash-chained + interceptor | yes | none | — | — | — | **PARTIAL** | Audit UI |
| Mobile app | expo-router, per-role folders, emoji tab icons, offline attendance queue without status | — | — | 1.1k lines | role guessed from perms | none | **THIN** | Home/Work/Messages/Notifications/Profile, role Work hubs, sync status |
| Design system | — | — | 8 primitives in one file, no tokens beyond 10 colours | 4 primitives | — | — | **MISSING** | Tokens + component library (web), tokens (mobile) |

## 3. Execution order (this redesign)

1. **Authorization engine v2** (A1–A13): catalogue, typed keys, per-permission scope, conditions, grant authority, explainable
   denials, effective access, scoped queries in attendance / people / exams / leave / CRUD, authz e2e matrix.
2. **Design system + application shell**: tokens, components, catalogue-driven sidebar, header with search and
   notifications, permission-aware 403 page.
3. **Role dashboards** backed by real time-series endpoints.
4. **Roles & permissions UI**, users & staff, effective access, "why can't I".
5. **Control plane**: shell, analytics, Tenant 360, onboarding wizard.
6. **CMS visual builder**, media library, workflow.
7. **Mobile** navigation and role hubs.

Progress against this list is tracked in `docs/redesign/02-PROGRESS.md`.
