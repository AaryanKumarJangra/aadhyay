# Aadhyay — Institution OS (aadhyay.com)

School / college / coaching ERP + free E2EE messenger + websites + white-label apps. Built for Delhi NCR & West UP first.

| Folder | What |
|--------|------|
| `backend/` | NestJS 12 + Fastify, PostgreSQL 16 (Drizzle, RLS), Redis. Three processes: `api`, `realtime`, `worker`. `backend/contracts` = shared Zod schemas. |
| `frontend/web` | Next.js 16: aadhyay.com marketing + SEO, admin console, tenant websites, bus tracking page, control plane. |
| `frontend/mobile` | Expo SDK 57 React Native app: common app + per-institution flavours. |
| `frontend/packages/e2ee` | Messenger cryptography (X3DH, Double Ratchet, Sender Keys). |
| `docs/` | **Read first.** Business plan, architecture, product spec, data/API, TASKS (what's done, build order). |
| `infra/` | Production compose, Caddy, LiveKit, backups, k6. |

## Run locally
```bash
pnpm install
pnpm setup            # .env with fresh secrets, docker infra (waits for health), build, migrate, base seed
pnpm db:seed:demo     # demo school, college and coaching institute with logins for every role
pnpm dev              # web :3000, api :4000, realtime :4001, worker — Ctrl+C stops all
pnpm health
```
Demo logins (password `Demo@12345`, local only) and every script: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Mobile: `pnpm dev:mobile`.

Tests: `pnpm --filter @aadhyay/backend test` (unit) and `pnpm test:e2e` (API end-to-end on an isolated `<db>_test` database and Redis namespace — safe to run while `pnpm dev` is up). See [docs/TESTING.md](docs/TESTING.md) and [docs/SECURITY.md](docs/SECURITY.md).

Deploy: see `docs/02-ARCHITECTURE.md` §13.2 (Stage 0, free) and §13.3 (Stage A, E2E Networks Delhi NCR).
# aadhyay
