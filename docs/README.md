# Aadhyay — Documentation Index (single source of truth)

> **Brand:** Aadhyay · **Domain:** aadhyay.com · **Currency:** INR · **Tax:** 18% GST shown separately on every price
> **Team at start:** 2 founders · **Funding:** bootstrapped (₹0 seed), client money only · **Profit rule:** 80% of net profit reinvested, 20% to founders
> **Launch market:** Delhi NCR + West UP · **Hosting:** free tier first → Delhi NCR (E2E Networks) after the first paying client
> **Docs version:** 1.0 · **Last updated:** 2026-10-07

These six files are the **only** specification. Code must follow them. If code and docs disagree, the docs win; fix the code or update the doc in the same commit.

| # | File | What it answers | Read before |
|---|------|-----------------|-------------|
| 0 | `README.md` (this) | Index, rules for humans and AI agents, glossary | Anything |
| 1 | `01-BUSINESS-PLAN.md` | Market, pricing (INR + GST), full cost model, P&L, 80:20 rule, go-to-market | Pricing, billing, plan logic |
| 2 | `02-ARCHITECTURE.md` | Stack, folder structure, multi-tenancy, infra & hosting, messenger + E2EE, WhatsApp, app flavours, SEO, security, deployment | Any code |
| 3 | `03-PRODUCT-SPEC.md` | Every module, role, screen and business rule (incl. multi-child messaging + bus links, channel routing) | Building a feature |
| 4 | `04-DATA-AND-API.md` | Database conventions, every table, API conventions, events, error codes | Touching DB or API |
| 5 | `TASKS.md` | Ordered build plan with status of every task — what is done, what is next | Starting any work session |

---

## Rules for AI agents and developers (read every time)

1. **Start with `TASKS.md`.** Pick the first task whose status is `TODO` and whose dependencies are `DONE`. Do not skip ahead.
2. **Never invent requirements.** If something is not in these docs, stop and ask the founders; then write the answer into the right doc.
3. **Never invent vendor prices or limits.** All prices live in `01-BUSINESS-PLAN.md §Cost sources` with the date they were checked. Code reads prices from the database price book, never from constants.
4. **Update `TASKS.md` in the same commit** as the code: set status, list files touched, and note anything left.
5. **Follow the folder layout in `02-ARCHITECTURE.md §3` exactly.** New module = new folder in `backend/src/modules/<name>` with the standard file set.
6. **Every tenant table has `tenant_id` and an RLS policy.** No exceptions. Money is integer paise. Time is UTC in DB, shown in `Asia/Kolkata`.
7. **No vendor SDK is called from a module.** Modules call an adapter interface (`backend/src/adapters/*`). This keeps the 20–30 year promise: vendors are swapped by config.
8. **No unofficial WhatsApp libraries (Baileys, whatsapp-web.js, etc.).** Only Meta's official WhatsApp Cloud API.
9. **Feature flags over branches.** Every module is switchable per tenant from the control plane.
10. **Tests:** every service has unit tests; every API endpoint has at least one e2e test. CI must be green before a task is `DONE`.

## Status words used in TASKS.md
`TODO` · `DOING` · `DONE` · `BLOCKED(<reason>)` · `PARTIAL(<what is missing>)`

## Glossary (short)
| Term | Meaning |
|------|---------|
| Tenant | One customer institution (or group). Has its own slug, domain, branding, modules, data. |
| Control plane | Aadhyay company console: tenants, plans, billing, usage. Cannot see institution personal data. |
| Flavour | A white-label build of the mobile app for one tenant (own name, icon, package id, signing key/SHA, colours). |
| Common app | The single "Aadhyay" app in the stores; user picks their institution and logs in. |
| Aadhyay Messenger | Our own built-in chat/voice/video with end-to-end encryption. Free for everyone, unlimited. |
| WhatsApp Channel | Optional paid add-on using Meta's official WhatsApp Cloud API (Meta cost + GST + small Aadhyay fee). |
| Channel router | Engine that decides per message: app push / Aadhyay Messenger / WhatsApp / SMS / email, and fallbacks. |
| RLS | PostgreSQL Row-Level Security — database-enforced tenant isolation. |
| Paise | Money unit stored in DB (₹1 = 100 paise). |
| ITC | Input Tax Credit — GST paid on our purchases that we offset against GST we collect. |
