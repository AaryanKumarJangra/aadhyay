# Database Audit
166 tables; 138 RLS-enabled with 138 policies; 308 indexes; 43 FKs; 0 triggers. RLS-less tables with tenant_id: abuse_reports, wa_accounts, files, outbox_events, conversations, sessions. Roles: aadhyay_app (no bypass), aadhyay_admin (superuser, bypass). Per-table inventory NOT produced. Migration from empty DB: works.
