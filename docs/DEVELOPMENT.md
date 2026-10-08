# Development

Everything here was run on a clean database on 2026-10-08 (Linux, Node 24, pnpm 10.28, NTFS-mounted repo).

## First run

```bash
pnpm install
pnpm setup          # .env with fresh secrets → docker compose up --wait → build → migrate → base seed
pnpm db:seed:demo   # three demo institutions (≈45 s)
pnpm dev            # api :4000, realtime :4001, worker, web :3000 (+ tsc --watch), prefixed logs
pnpm health         # every service UP?
```

`pnpm setup --demo` does the demo seed too. `pnpm doctor` checks toolchain, `.env`, filesystem and infrastructure and prints a fix for each problem.

| Script | What it does |
|---|---|
| `pnpm dev` / `dev:api` / `dev:web` / `dev:worker` / `dev:realtime` / `dev:backend` | run all or one process (`scripts/dev.mjs --only=…`) |
| `pnpm dev:mobile` | Expo (`FLAVOUR=aadhyay` by default) |
| `pnpm db:migrate` | build backend, apply Drizzle migrations, refresh RLS (`aadhyay_apply_rls()`) |
| `pnpm db:seed` | plans, price book, super admin (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`) |
| `pnpm db:seed:demo` | demo tenants; idempotent (existing demo tenants are skipped), refuses `NODE_ENV=production` |
| `pnpm db:reset` | drop + recreate the **local** database, migrate, seed (asks you to type the DB name; `--yes`, `--demo`) |
| `pnpm db:generate` | `drizzle-kit generate` after a schema change |
| `pnpm infra:up` / `infra:down` | docker compose |

## Demo logins (local only)

Password for every demo account: **`Demo@12345`**. Log in at `http://localhost:3000/app/login` → “Use email & password instead”, or with the phone number + OTP (the OTP is shown on screen while `OTP_DEV_ECHO=true`).

| Tenant | Role | Email | Phone |
|---|---|---|---|
| control plane | Super admin | `platform@demo.aadhyay.local` (at `/control/login`) | — |
| demo-school | Owner / Director | `owner@school.demo.aadhyay.local` | +919100000001 |
| demo-school | Principal | `principal@school.demo.aadhyay.local` | +919110000001 |
| demo-school | Accountant | `accountant@school.demo.aadhyay.local` | +919110000002 |
| demo-school | Transport manager | `transport@school.demo.aadhyay.local` | +919110000003 |
| demo-school | Librarian | `librarian@school.demo.aadhyay.local` | +919110000004 |
| demo-school | Front office | `frontoffice@school.demo.aadhyay.local` | +919110000005 |
| demo-school | HR manager | `hr@school.demo.aadhyay.local` | +919110000006 |
| demo-school | Driver | `driver@school.demo.aadhyay.local` | +919110000007 |
| demo-school | Teacher | `teacher@school.demo.aadhyay.local` | +919110000100 |
| demo-school | Parent (3 children) | `parent@school.demo.aadhyay.local` | +919120000001 |
| demo-school | Student | `student@school.demo.aadhyay.local` | +919130000001 |
| demo-college | Owner, College admin, Accountant, Faculty, Student | `owner@ / admin@ / accountant@ / faculty@ / student@college.demo.aadhyay.local` | +9192… |
| demo-coaching | Owner, Coaching admin, Counsellor, Instructor, Learner | `owner@ / admin@ / counsellor@ / instructor@ / learner@coaching.demo.aadhyay.local` | +9193… |

The seed prints the full table with names and phones at the end of every run. Names differ from the table only if the seed code changes; phones are fixed (`+91 9 <tenant> <group> <seq>`).

### What the demo contains (verified row counts)

- **demo-school** (Meerut): 250 students, 120 guardians (10 families with three children), 25 teachers, 15 staff, 12 classes / 14 sections, 7 subjects with per-section teachers, timetable, 10 days of attendance, 42 homework assignments, Half-Yearly exam with 1,250 marks (published), fee structures + 169 receipts, 3 buses / routes / 52 riders (siblings share a bus), 15 CRM leads, calendar, notices, website news/events/gallery, 30 library books / 60 copies / 8 issues.
- **demo-college** (Ghaziabad): 4 departments, 16 faculty, 3 programmes, 4 semester cohorts, 120 students, 960 credit results (SGPA/CGPA), timetable, attendance, mid-semester exam, semester fees, 4 placement drives, 2 hostels / 20 rooms, library, CRM.
- **demo-coaching** (Noida): 6 instructors, 4 batches, 80 learners, 3 LMS courses with modules and lessons, question bank + scheduled online test, coupon, 25 leads, website.

Messenger conversations are **not** seeded: messages are end-to-end encrypted on the device, so the server cannot create them.

## Environment

`.env` is validated at startup (Zod, `backend/src/config/env.ts`); the process exits with the failing keys listed. Required: `DATABASE_URL`, `APP_DATABASE_URL`, `JWT_SECRET` (≥ 32 chars), `ENCRYPTION_KEY` (`base64:` + 32 random bytes), `PHONE_HASH_PEPPER`. In production the API also refuses dev defaults (`TURN_SECRET`, `LIVEKIT_*`), `OTP_DEV_ECHO=true` and placeholder JWT secrets.

| Variable | Default | Notes |
|---|---|---|
| `REDIS_NAMESPACE` | `aad` | prefix for all Redis keys and pub/sub channels; tests use `e2e` on Redis DB 15 |
| `TRUST_PROXY` | prod: `loopback,linklocal,uniquelocal`, else `loopback` | who may set `X-Forwarded-For`; never `true` outside tests |
| `SMS_PROVIDER` / `WHATSAPP_PROVIDER` / `PUSH_PROVIDER` / `PAYMENT_PROVIDER` | `log` | local providers log instead of sending |

## Known local issues

- **NTFS / exFAT drives**: Turbopack cannot follow pnpm's symlinks; the web dev script uses `--webpack`. Slow installs are normal on such drives.
- **Low memory (≤ 8 GB)**: API + realtime + worker + web + tsc use ~3 GB. Use `pnpm dev:backend` and `pnpm dev:web` separately if processes get killed (exit 137).
- **coturn**: `--no-dtls` was removed upstream; it is no longer in `docker-compose.yml`.
- Local ports are bound to `127.0.0.1` except LiveKit (phones on the LAN need it).
