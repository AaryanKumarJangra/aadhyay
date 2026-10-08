# 03 — Product Specification (modules, roles, rules)

> Every feature the product has. Plan key: **E** Essential · **P** Professional · **X** Enterprise · **A** paid add-on · **C** coaching plans. Module keys (used in code, feature flags and permissions) are in `code` font.

---

## 1. Apps and surfaces

| Surface | Users | URL / store |
|---------|-------|-------------|
| Marketing site | Public, prospects | aadhyay.com |
| Console (web) | Owner, principal, admin, accountant, teachers, staff, parents, students | app.aadhyay.com |
| Control plane (web) | Aadhyay team | control.aadhyay.com |
| Tenant website | Public, prospective parents | `<slug>.aadhyay.com` or custom domain |
| Bus tracking page | Parents (token link) | `<site-host>/track/<token>` |
| Common mobile app "Aadhyay" | Everyone (institution picker) + free Messenger for anyone | Play Store / App Store |
| White-label app | One institution's users | Institution's own store listing |

Mobile app roles (one app, navigation by permission): **Parent/Student**, **Teacher**, **Driver/Attendant**, **Admin-lite** (dashboards, approvals, fee collection), **Messenger-only** (no institution).

---

## 2. Roles

### 2.1 Platform (Aadhyay company) — control plane
| Role | Can do | Sees personal data? |
|------|--------|--------------------|
| Super Admin | Everything on the control plane; price book; kill switches | No (break-glass with tenant approval only) |
| Ops Admin | Provision tenants, onboarding, domains, flavours, feature flags | No |
| Finance Admin | Invoices, payments, credit notes, wallet, GST reports, dunning | Billing contacts only |
| Account Manager | Portfolio of tenants; set price inside range; health checks | No |
| Support Agent | Tickets; time-boxed approved sessions | Only during an approved session |
| Sales/Partner | Leads, demos, trials, commissions | Lead data only |

### 2.2 Institution (default templates per segment; fully editable)
Group Owner · Owner/Director · Principal/Dean/Centre Head · Institution Admin · HOD/Coordinator · Accountant · Front Office/Counsellor · Teacher/Faculty · HR Manager · Librarian · Store Keeper · Warden · Transport Manager · Driver/Attendant · Student · Parent/Guardian · Alumni.

Custom roles: permission matrix of `module.resource.action` × scope (`tenant|branch|class|section|own`) × conditions (amount limit, time window, maker-checker). Multiple roles per user; delegation for date ranges; quarterly access review prompt.

---

## 3. Module catalogue

| Key | Module | Plan | Capabilities |
|-----|--------|------|--------------|
| `org` | Organisation | E | Tenant profile, branches, academic sessions, branding (logo, colours, favicon, letterhead, seal/signature images), settings |
| `people` | Students, guardians, staff | E | Admission (offline/online), roll/admission numbers, siblings auto-link by guardian phone, categories, houses, custom fields (JSONB), document vault, bulk import (Excel/CSV with validation preview), disable with reason, APAAR ID, RTE tag, guardian ↔ student many-to-many with relation + primary flag + `receives_notifications` |
| `academics` | Academics | E | Classes, sections, subjects, subject groups, class teacher, electives, promotion (rule-based, bulk) |
| `timetable` | Timetable | E (AI: P) | Periods, class/teacher timetable, substitution manager, clash detection, AI auto-generator |
| `calendar` | Annual calendar | E | Holidays, events, PTMs, exam windows; feeds attendance & fees; iCal feed |
| `attendance` | Attendance | E (devices: A) | Modes: manual (default all present), QR, RFID/NFC, face, biometric, geo-fenced selfie (staff), live-class logs; day-wise or period-wise; leave requests (parent app) & approval; late threshold; offline queue; absence alert at cut-off time |
| `homework` | Homework & diary | E | Assign with attachments, submissions (photo/PDF), rubric evaluation, parent visibility, daily diary |
| `lessonplan` | Lesson plan & syllabus | P | Lessons, topics, status, copy previous, AI draft |
| `exams` | Examinations | E | Exam groups, schedule, marks entry (grid, offline), grade scales, divisions, moderation, admit-card & marksheet designer, publish results |
| `board-exams` | CBSE/Board + HPC | P | CBSE terms, co-scholastic, observations, Holistic Progress Card (NEP/PARAKH), board export formats |
| `online-exams` | Online tests | P / C | Question bank (MCQ, multi, numeric, matrix, assertion-reason, subjective), random papers, timers, sections, negative marking, proctoring (tab switch, snapshots), auto-grading, rank & percentile |
| `lms` | LMS / download centre | P / C | Courses → modules → content (PDF, video HLS, links), scheduled release, progress, DRM video via adapter (C Pro) |
| `live-classes` | Live classes | P | Zoom/Meet links or built-in LiveKit rooms; auto-attendance from join logs; recordings |
| `fees` | Fees | E | Fee heads, groups, structures per class/category, installments, discounts (sibling, staff, scholarship) with approvals, late fee rules, carry forward, quick collect, offline cash/cheque/DD/bank proof, online payment (UPI, cards, netbanking, UPI Autopay) into the **institution's** merchant account, receipts (A4 + thermal 58/80 mm), refunds, defaulter list, reminder ladder |
| `accounts` | Income & expense | P | Heads, vouchers, double-entry ledger (auto journal for every receipt), bank reconciliation, budget vs actual, Tally XML export |
| `hr` | HR | P (A on E) | Staff records, departments, designations, staff attendance, leave types/balances/approvals, documents |
| `payroll` | Payroll | P (A on E) | Salary structures, PF/ESI/PT/TDS, attendance-linked payroll run, payslips, bank transfer file |
| `behaviour` | Behaviour | P | Incidents, points, badges, counsellor notes (restricted) |
| `certificates` | Certificates & ID cards | E | Designer (drag fields on template), TC, character, bonafide, custom; ID cards (student/staff) with QR; bulk PDF; public QR verification page |
| `front-office` | Front office | E | Enquiries, visitor book (photo/OTP), call log, postal dispatch/receive, complaints with SLA |
| `crm` | CRM & admissions | P | Lead capture (website forms, WhatsApp, Meta/Google lead ads webhook, missed call, walk-in, import), dedupe by phone, scoring, pipeline stages, tasks, campaigns, source ROI, lead → application → student in one click |
| `transport` | Transport | P (GPS hw: A) | Vehicles, drivers, routes, stops (geo), student ↔ stop assignment (pickup & drop), transport fees, driver app trips, live map, geofence alerts, tracking links (multi-child rule §6), SOS, over-speed, trip reports |
| `hostel` | Hostel | A / X | Hostels, rooms, beds, allocation, mess, in/out register, outpass with parent approval, hostel fees |
| `library` | Library | P | Catalogue (ISBN lookup), copies with barcode, members, issue/return/renew, fines, OPAC search |
| `inventory` | Inventory & assets | P | Items, categories, stores, suppliers, stock in/out, purchase orders, asset tags, depreciation |
| `health` | Health & infirmary | A | Health records, vaccinations, sick-room visits, parent notification |
| `canteen` | Canteen & wallet | A | Student wallet (top-up via PG), POS, parent spending limits |
| `alumni` | Alumni | P | Directory, events, donations, mentoring, transcript requests |
| `cv` | Student CV / portfolio | P | CV builder, achievements, certificates, public portfolio link |
| `cms` | Website CMS | E (subdomain) | Block page builder, menus, news, events, gallery, notices, blog, media library, forms → CRM, themes per segment, SEO panel, redirects, multilingual, draft/schedule/version history, custom domain (A/X) |
| `comms` | Communication engine | E | Notice board, circulars, templates (hi/en), scheduled sends, routing rules, delivery logs, quiet hours, usage meter |
| `messenger` | Aadhyay Messenger | E (free for all) | 1:1 and group chat, media, voice notes, documents, replies, reactions, read receipts, typing, E2EE, contact import/manual add, pending invites, broadcast lists, institution groups (class, staff, parents) with admin rules, report/block |
| `calls` | Voice & video calls | E (free for all) | 1:1 and group voice/video, screen share, call history |
| `whatsapp` | WhatsApp Channel | A (usage) | Embedded signup, template studio, flow builder, inbox, campaigns, webhooks, metering |
| `ai` | AI copilot | P/X (credits) | Ask-your-data (read-only, permission-aware), remark drafts, circular drafting, translation, question generation, at-risk alerts |
| `voice-agent` | AI voice agent | A (usage) | Outbound/inbound AI calls via voice adapter; CRM integration |
| `reports` | Reports & BI | E/P/X | Standard reports per module, custom report builder, dashboards, scheduled email reports, exports (CSV/XLSX/PDF) |
| `compliance` | Compliance | E | UDISE+, APAAR, AISHE, RTE exports; DPDP consent register & rights requests |
| `multibranch` | Multi-branch | X (A on P) | Group dashboard, consolidated finance, central policies |
| `college` | College pack | A | Programmes, semesters, CBCS credits, SGPA/CGPA, university exam workflow, NAAC/NIRF/AISHE data, placements |
| `coaching` | Coaching pack | C | Batches, centres, test series, ranks, scholarship tests, storefront, coupons, memberships, 0% commission payouts |

---

## 4. Communication routing defaults (`comm_routing_rules` seed)

| Event key | Push+Inbox | WhatsApp | SMS | Notes |
|-----------|-----------|----------|-----|-------|
| `auth.otp` | — | Aadhyay number (auth template) | fallback 60 s | Platform cost |
| `attendance.present` | ✅ | — | — | Optional, off by default |
| `attendance.absent` | ✅ | fallback (no app activity 7 d) | — | Per child |
| `attendance.late` | ✅ | — | — | |
| `homework.assigned` / `diary.posted` / `notice.published` | ✅ | — | — | |
| `fee.due_soon` | ✅ | — | — | T-3 |
| `fee.overdue` | ✅ | ✅ | — | Payment link |
| `fee.paid` | ✅ (receipt PDF) | optional | — | |
| `result.published` | ✅ | ✅ | — | One summary per child |
| `trip.started` | ✅ (live map) | only if no app | — | Multi-child bus rule |
| `trip.near_stop` / `trip.boarded` / `trip.dropped` | ✅ | — | — | |
| `transport.sos` / `emergency.broadcast` | ✅ | ✅ | ✅ if undelivered 2 min | Safety |
| `ptm.scheduled` / `event.invite` | ✅ | optional | — | |
| `crm.lead_followup` | — | ✅ | — | Leads have no app |
| `billing.renewal_due` (Aadhyay → tenant) | ✅ banner | ✅ Aadhyay number | — | Email too |

Every row is editable per tenant. A wallet at ₹0 makes WhatsApp skip silently to the next channel.

---

## 5. Messenger rules
- Free and unlimited for every user; no institution required.
- Add contacts by importing the phone book (hashed discovery) or entering a number manually. **Messages to unregistered numbers are allowed**: they wait encrypted in the sender's outbox and deliver when that person joins; the sender is prompted to share an invite.
- Institution context: a teacher ↔ parent chat shows the child's name and class as context; the teacher's phone number is hidden; the institution can restrict hours (default 07:00–20:00 for parent-initiated messages) and make class groups broadcast-only.
- Read receipts, typing indicators and last seen can each be turned off by the user.
- Report → the reporter's device sends the last 5 decrypted messages to the institution admin (institution chats) or Aadhyay trust & safety (personal chats). Block stops all delivery.
- Disappearing messages (24 h / 7 d / 90 d) per chat.

---

## 6. Transport rules (multi-child)
1. Student ↔ stop assignment has `direction` (pickup/drop), `vehicle_id`, `route_id`, `stop_id`.
2. On `trip.started` for vehicle V: collect students assigned to V for that direction → their guardians.
3. For each guardian: **one link per vehicle**. If 2 children are on V → one link showing both (and both stops). If children are on V1 and V2 → two links (sent when each trip starts).
4. Link validity: from trip start to trip end + 15 min. It shows only that vehicle, its live position, the guardian's children's stops and ETAs.
5. Near-stop alert at 1 km or 5 min (configurable). Boarded/dropped events come from an attendant scan or tap.

---

## 7. Trial & subscription lifecycle (state machine)
`trial` (90 d) → `active` (paid) → `grace` (expiry + 30 d) → `suspended` → `archived` (suspended + 90 d, cold) → `purged` (suspended + 12 months).
Payment at any point before `purged` → `active`. Reminders: T-15, T-7, T-3 (pop-up), T-1, T0, then weekly during grace. In `suspended`: admin sees only dues, invoice, Pay Now and Export Data; staff see "service paused"; parents/students see "temporarily unavailable"; automations stop (7-day warning beforehand). Messenger keeps working for everyone (it is free and personal), but institution groups become read-only.

---

## 8. Control plane features
Tenant 360 · onboarding wizard (create tenant, pack, modules, import, domain, payments, WhatsApp) · plans & price book (list/min/max, approvals, coupons) · metering (students, staff, storage, messages per channel/category, AI, voice minutes, buses) · billing (proforma, GST tax invoices with SAC 998313/998314 to confirm with CA, credit notes, payment links, autopay, dunning) · wallet top-ups · lifecycle automation · feature flags · app flavours (config, assets, SHA, build status) · announcements · support tickets · analytics (MRR, ARR, churn, NRR, conversion, cost per tenant, **spend-ceiling gauge**) · partners & commissions · security (audit, break-glass approvals, DPDP requests).

---

## 9. Segment packs (configuration, not forks)
| Pack | Terminology | Default modules |
|------|------------|-----------------|
| School | Class / Section / Student / Parent | All E + transport |
| College | Programme / Semester / Course / Student | + college pack, placements |
| Institute | Course / Batch / Learner | Batches, certificates with QR, POS fees |
| Coaching | Batch / Centre / Learner | + coaching pack, test series, storefront |
| Creator | Course / Learner | Storefront, LMS, payments, community |

---

## 10. Non-functional requirements
- Languages: English + Hindi at launch (all strings externalised); more Indian languages later.
- Accessibility: WCAG 2.2 AA.
- Works on ₹8,000 Android phones (Android 9+), 3G networks; app size < 40 MB.
- Every list exports to CSV/XLSX; every tenant can export all of its data (JSON + files) in one click.
- Time zone: Asia/Kolkata default, per-tenant override.
