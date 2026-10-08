# Security

Only behaviour verified by tests or by hand is described here.

## Tenant isolation
- Runtime queries use role `aadhyay_app` (NOSUPERUSER, NOBYPASSRLS) inside `db.t()`, which sets `app.tenant_id` per transaction.
- `aadhyay_apply_rls()` (re-run on every migrate) enables RLS on **every** table with a `tenant_id` column: `tenant_isolation` for NOT NULL, `tenant_or_global` (`tenant_id IS NULL OR = current`) for nullable ones (`files`, `sessions`, `conversations`, `outbox_events`, `abuse_reports`, `security_events`, …).
- `wa_accounts` (encrypted WhatsApp tokens), `platform_users`, `company_expenses`, `platform_leads` are revoked from `aadhyay_app` entirely.
- The admin pool (`db.admin`, bypasses RLS) is still used by auth, control plane, messenger (cross-tenant by design), workers and files; those paths filter in code. Reducing it is open work.

## Authentication
- Phone OTP: single use, attempt lockout, 5 requests/hour/phone, 30/hour/IP.
- Password login (tenant users and control plane) goes through `LoginGuard`: progressive delay (200 ms × failures, ≤ 2 s), lock after 5 failures in 15 min (15 min, doubling per lockout, ≤ 24 h; the correct password is refused while locked), 30 attempts/IP/15 min, equal timing for unknown accounts. Every failure, lock, block and success is stored in `security_events`.
- Refresh tokens rotate; reuse of an old token revokes the whole session family. Logout revokes the access token immediately.
- `X-Forwarded-For` is only honoured from trusted proxies (`TRUST_PROXY`); the web BFF forwards the client IP and user agent.

## Authorization
Permissions are `module.resource.action`; `*` in the middle matches one segment (`fees.*.view`), a trailing `*` matches the rest (`fees.*`). Enforced by the API guard (`@Can`); the web hides navigation with the same matcher and renders a 403 page when the API refuses.

## Files
Uploads declare a purpose from an allow-list that fixes MIME types, size, who may upload, whether the file may be public and who may read it. Object keys are built only from server values (`<tenant>/<purpose>/<uuid>.<ext from MIME>`). Presigned PUTs sign Content-Type and Content-Length. Downloads: owner, public, or same tenant + the purpose's view permission; everything else is 404.

## Web
- CSP on every page (`next.config.ts`): scripts from self (+ inline, required by static/ISR pages; `unsafe-eval` only in dev), no objects, `base-uri`/`form-action`/`frame-ancestors` self, explicit connect/img/frame hosts. HSTS in production.
- Tenant HTML (CMS rich text / html blocks) is sanitised with an allow-list (`lib/sanitize.ts`); JSON-LD is escaped so it cannot close its script tag.
- API responses carry `default-src 'none'; frame-ancestors 'none'`.

## Errors
Malformed ids/values return 400 (not 500). Unique-constraint conflicts report the field names only, never the stored values. Stack traces stay in server logs.

## Open items
Admin-pool reduction; malware scanning hook for uploads; post-upload content sniffing; CSRF review of cookie-authenticated BFF routes (cookies are `SameSite=Lax`/`Strict`, httpOnly); TOTP enforcement for platform staff; browser-level security tests.
