# Testing

| Command | Suite | Last result (2026-10-08) |
|---|---|---|
| `pnpm --filter @aadhyay/backend test` | backend unit (`src/**/*.spec.ts`) | 44 / 44 pass |
| `pnpm test:e2e` | API end-to-end, real Postgres + Redis (`backend/test/*.e2e.ts`) | 22 / 22 pass |
| `pnpm test:security` | tenant isolation, RLS, files, auth lockout, RBAC | 6 / 6 pass (part of e2e) |
| `pnpm test:e2ee` | e2ee package unit tests + messenger e2e | messenger 3 / 3 pass |

## Isolation

E2E tests never touch the dev database or dev Redis data:

- database `<dev db>_test` (e.g. `aadhyay_test`), created and migrated by `test/global-setup.ts`; the run aborts if the name does not end in `_test`;
- Redis logical DB 15 and key/channel namespace `e2e`;
- `TRUST_PROXY=true` only inside tests (they simulate many client IPs).

So `pnpm dev` can keep running while tests run (verified: 22/22 with dev api/worker/realtime up).

## What the e2e tests prove

They assert business outcomes, not only status codes: oldest-first fee allocation and receipt numbering, GST split on tax invoices, trial → grace → suspended lifecycle, absent alert in the parent inbox, report-card visibility only after publish, sibling bus links, CMS form → deduplicated lead → student, E2EE delivery with server deletion after ack, payroll LOP, online test auto-grading.

`security.e2e.ts` checks: tenant A ↔ B by id, list, forged `x-tenant` headers and tenant switch (students, leads, sections, files, ledgers, notices, routes); RLS directly on the `aadhyay_app` role (cross-tenant select = 0 rows, cross-tenant insert rejected, `files` covered, `wa_accounts` denied, no tenant table without RLS, role has no BYPASSRLS/superuser); unsafe uploads rejected and private files not readable by other members; control-plane lockout after 5 failures (even with the right password) with `security_events`; OTP lockout, refresh-token rotation, logout revocation; teacher and guardian limits enforced by the API.

## Not covered yet

Browser (Playwright) tests, mobile tests, real payment/WhatsApp/SMS providers, load tests (`infra/k6` exists, not run). `next build --webpack` passes (2026-10-08).
