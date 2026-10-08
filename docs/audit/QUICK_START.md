# Aadhyay Quick Start
Commands marked ✔ were run during the audit on this machine. Others are unverified.

## Requirements
Node ≥22 (tested 24.21), pnpm 10.28 (`packageManager`), Docker with compose, ≥8 GB RAM recommended (7 GB machine hit OOM when API + web + Expo + tsc ran together).

## Install ✔
`pnpm install`

## Environment
`cp .env.example .env`. Required: `DATABASE_URL`, `APP_DATABASE_URL`, `JWT_SECRET` (≥32 chars), `PHONE_HASH_PEPPER` (≥8), and
`ENCRYPTION_KEY=base64:<32 random bytes>` — generate with `openssl rand -base64 32` ✔. Without the `base64:` prefix every backend process exits with "Invalid environment". Optional/defaulted: `REDIS_URL`, `API_PORT=4000`, `REALTIME_PORT=4001`, `WEB_URL`, S3_*, SMTP_URL, LIVEKIT_*, TURN_*, RAZORPAY_*, SMS/WHATSAPP/PUSH providers (`log` by default), `OTP_DEV_ECHO`.

## Infrastructure ✔
`docker compose up -d` (postgres+postgis :5432, redis :6379, minio :9000/9001, mailpit :8025, coturn :3478, livekit :7880). Note: coturn needed `--no-dtls` removed from docker-compose.yml.

## Build, migrate, seed ✔
```
pnpm --filter @aadhyay/contracts build && pnpm --filter @aadhyay/e2ee build
cd backend && npx tsc -p tsconfig.build.json
node dist/scripts/migrate.js
node dist/scripts/seed.js        # optional: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
```
Seed creates only plans, price book and one super admin. No demo school.

## Start backend ✔ (run each from `backend/`, one process per terminal)
```
node dist/main.api.js        # :4000/v1  (health: /v1/health)
node dist/main.realtime.js   # :4001
node dist/main.worker.js
```
## Start web ✔
`cd frontend/web && npx next dev --webpack -p 3000` — **`--webpack` is required on NTFS**; Turbopack fails to resolve `next`.
## Start mobile (partial)
`cd frontend/mobile && FLAVOUR=aadhyay npx expo start` — Metro reported running; app itself not opened.

## URLs
Marketing `http://localhost:3000/` · Signup `/signup` · Institution console `/app/login` · Control plane `/control/login` · Public tenant site `/site/<slug>` (unverified) · Track `/track/<token>` · API `http://localhost:4000/v1` · Mailpit `http://localhost:8025`.

## Logins
- Control plane: the super admin from the seed (`admin@aadhyay.com` unless `SEED_ADMIN_EMAIL` set; password from `SEED_ADMIN_PASSWORD`, else the default in `backend/src/scripts/seed.ts` — change it).
- Tenant users: phone + OTP. Create a school at `/signup` (or `POST /v1/public/signup`), then log in with the owner phone. With `OTP_DEV_ECHO=true` the OTP is returned by `/auth/otp/request` as `devCode` ✔.
- Test users: add staff via `POST /v1/org/members` (✔ teacher created), guardians by adding students with `guardians[]` (✔).

## Tests ✔
```
cd backend && npx vitest run                                  # 30 pass
# STOP any running worker/realtime first (shared Redis). Use a throwaway DB:
docker exec aadhyay-postgres-1 psql -U aadhyay_admin -d postgres -c "create database aadhyay_audit"
DATABASE_URL=postgresql://aadhyay_admin:aadhyay_admin@localhost:5432/aadhyay_audit \
APP_DATABASE_URL=postgresql://aadhyay_app:aadhyay_app@localhost:5432/aadhyay_audit \
  node dist/scripts/migrate.js
(same env) npx vitest run --config vitest.e2e.config.mts
```
Without overriding the URLs, e2e writes into your dev database.

## Common errors
- `Invalid environment` → bad `ENCRYPTION_KEY`.
- Web 500 "Could not find the Next.js package" → use `--webpack`.
- Processes vanish / exit 137 → out of memory; run fewer things at once.
- e2e messenger test fails → a dev worker/realtime is competing on Redis.
- Do not use `pkill -f` with a pattern that appears in your own command line.

## Reset local environment
`docker compose down -v` (DESTROYS all local data), then repeat Infrastructure → Seed. To drop only the audit DB: `docker exec aadhyay-postgres-1 psql -U aadhyay_admin -d postgres -c "drop database aadhyay_audit"`.
