# Redesign progress

Status is earned only by an end-to-end check (API test, real data, or screenshot of the real screen). Matrix of findings:
`01-AUDIT-MATRIX.md`. Authorization design: `03-AUTHORIZATION.md`.

## Done and verified

| Area | What | Evidence |
|---|---|---|
| Authorization engine | Catalogue (typed keys), per-permission scope, conditions, module gate, explainable decisions, grant authority, effective access | 23 unit tests (`permissions.spec.ts`); typed `@Can` rejects unknown keys at compile time |
| Scope leaks A2–A11 | Attendance register/monthly/leave, student list/detail, documents, behaviour, exam results, marks by subject, homework, notices audience, driver vehicle, staff leave balances | `test/authz.e2e.ts` (11 tests) |
| Privilege escalation A6 | Grant authority on create/edit/delete role, assign/remove/deactivate; owner role protected; last owner; no self-assignment | `authz.e2e.ts › grant authority` |
| Sensitive data A5 | Religion/category/IDs/address, phone numbers, fee totals redacted per permission | `authz.e2e.ts › teacher` |
| Device punch bug | `any(${array})` expanded to a row constructor → QR/RFID ingestion failed | `authz.e2e.ts › attendance devices` |
| Role templates v2 | Owner, Principal, Admin, Coordinator, Teacher, Exam controller, Accountant, Counsellor, HR, Librarian, Store, Warden, Transport, Driver, Parent, Student; auto-upgrade of untouched system roles on migrate | migrate on dev DB: 8 added, 56 upgraded |
| Dashboards API | Institution, finance, teacher, family — permission-composed, zero-filled series | `authz.e2e.ts › dashboards`; checked against demo data |
| Global search API | Students (scoped), staff, receipts, leads | `authz.e2e.ts › dashboards…search` |
| Design system | Tokens, Button, fields, Card, Badge/Status/Scope/Role, Stat tile with delta & trend, DataTable (search/sort/paging/columns/bulk/export/mobile cards), Modal/Confirm/Drawer/Toast/Tabs, Skeleton/Empty/Error/AccessDenied, SVG charts (area, columns, bar list, donut) with tooltips, table view, CSV | Screenshots 1440 / 390 px |
| Shell | Catalogue-driven sidebar (collapsible, mobile drawer), header, Ctrl/Cmd+K palette, notification centre, user menu with institution switch | Screenshots: owner vs teacher navigation differ |
| Dashboards UI | Owner/Principal, Accountant, Teacher, Parent/Student, launchpad for other roles | Screenshots with demo data |
| Roles & permissions UI | Role list, permission matrix with per-permission scope and conditions, live plain-language summary, grant-authority warnings, create/copy/delete | Screenshot; API verified |
| Users & staff | Logins & roles (assign roles + scope with Can/Cannot preview, effective access, invite with RHF+Zod, deactivate, bulk) and staff records | Screenshot |
| My access | Effective access + “Why can’t I…?” | Built; uses `/access/explain` |
| Explained 403 | In-shell denial with reason, permission and contact | Screenshot as teacher |
| Student 360 | Overview (KPIs, timeline across modules filtered per permission), attendance calendar (letters + colour), fees ledger, exams chart, homework, profile with sensitive data gating | Screenshots as owner / teacher; timeline scoping checked via API |
| Attendance module | Scoped section list, marker (P/A/L/HD/LV, all present/absent, copy previous day, offline queue with visible sync state), today overview, leave approvals with names | Browser flow: mark → save → reload persisted; e2e leave list |
| Control plane | Shell, analytics dashboard, Institutions, Tenant 360 (lifecycle, modules, billing, domains, audit; audited actions), 12-step onboarding wizard, price book editor (reason + range check), leads, platform audit log | `test/control.e2e.ts` (4); browser flow creates an institution end to end |
| CMS v2 | Draft separate from live (saving never changes the site), author → review → publisher workflow, scheduling, restore to draft, version list; media library (upload, alt text, usage count, delete protection); 31-block registry; visual builder (palette, drag/drop, canvas with device preview via container queries, properties + style, undo/redo, autosave, SEO score + previews) | `test/cms.e2e.ts` (3); browser flow: add block → autosave → live unchanged → publish → live updated |
| Mobile app | Five tabs (Home · Work/Children/Trip/My school · Messages · Alerts · Profile) chosen by what the user can do; persona homes on the dashboards API; Work hub lists only real screens the role can use; child detail (attendance calendar with letters, homework, results, fees + pay); alerts with categories, mark read and deep links (push taps open the exact record); offline outbox for attendance and trip events with visible pending/failed state (4xx kept with the server’s reason, never dropped); driver screen limited to assigned vehicles; Feather icons replace emoji | Typecheck clean. **Not bundled or run here:** Metro cannot see pnpm’s symlinked packages on this NTFS (ntfs3) drive — `@expo/metro-runtime` is unresolvable even though it has been installed since before this work. Bundle from an ext4/APFS checkout (or `node-linker=hoisted` for the mobile package) to verify on a device |
| Driver regression | New Driver template had no tenant-wide vehicle/route access, so the old driver screen would fail; added `GET /transport/my/vehicles` (assigned vehicles + their routes + running trip) | `transport.e2e.ts` driver setup assertions |

Test totals at last run: backend unit 54/54, e2e 39/39 (22 original + 17 new; transport e2e extended), web typecheck clean.

Bugs found and fixed while verifying: QR/RFID punch array binding; leave list type mismatch; dashboard table name; family dashboard; onboarding wizard lost click after validation, blank optional fields rejected, plan defaults violating module dependencies; builder autosave on open, stuck “unsaved” after undo/redo, canvas hydration of rich text; CMS draft overwriting the live page; publish permission not enforced.

## Not done yet (in priority order)

1. Mobile: verify on a device/simulator (not possible here); more role screens (admin approvals, fee collection, staff leave approvals, exam marks).
2. Student import UI (API exists: dry run + validation), fees desk redesign, remaining module screens (exams marks entry, timetable grid, transport live map, CRM board, HR, library, inventory, hostel, reports hub, notices composer with audience count).
3. Break-glass support sessions; tenant-side branding editor with logo uploads; custom domain verification UI for tenants.
4. Branch scope (needs `branch_id` on sections/students); tenant-timezone date formatting in the web app (still `Asia/Kolkata`).
5. Not verified here: Google Maps embed renders blank in headless Chrome (CSP allows the final host; needs a real-browser check).
