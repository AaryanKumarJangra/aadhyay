# Control plane

`control.aadhyay.com` (`/control/*`), platform staff only (separate login, `aad_ct` cookie, `@Platform(...)` roles). Shows platform data only: counts, configuration, billing, usage — never institution personal data; contact details are masked except for finance/super admin.

- **Dashboard** `GET /control/dashboard`: institutions by status, MRR/ARR/ARPU, new per month, trial conversion (cohort >90 days), churn, outstanding invoices, wallets, plan/segment/state mix, module adoption, 30-day usage (billed vs cost), expiring trials, overdue invoices, highest usage, system health.
- **Tenant 360**: lifecycle strip, KPIs, modules (switches), billing & usage, domains, audit. Actions: extend, suspend, reactivate, archive (super admin), wallet adjustment — each needs a reason and follows the lifecycle rules.
- **Onboarding** `POST /control/onboarding` (12-step wizard): provisions the tenant, then applies plan, timezone, branding, modules (with dependency checks), branches, custom domain (TXT + CNAME instructions), owner and principal.
- **Price book**: super admin edits list price and range with a reason; issued invoices keep their snapshot.
- **Audit** `platform_audit_logs` (revoked from the tenant DB role): who, action, institution, before/after, reason.
- Not yet built: break-glass support sessions, app-flavour build pipeline UI.
