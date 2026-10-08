# Multi-Tenancy Audit
Two tenants, API only. A→B student GET/PATCH/DELETE: 404; list: no leakage; attendance/ledger with foreign IDs: 200 with no B data; header spoof: ignored; switch-tenant: 422; B→A: 404. Repo e2e also asserts RLS. Not tested: files, exports, reports, CMS, transport, messenger, sockets, mobile. RLS-less tenant tables are a risk.
