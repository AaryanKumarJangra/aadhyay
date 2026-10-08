# Security Risk Register
P1 Control-plane password login has no lockout/rate limit (verified: 15 wrong then success).
P1 trustProxy:true + XFF-based IP limits spoofable if API exposed without a sanitising proxy (code-evident; bypass not demonstrated).
P1 files, wa_accounts (stores encrypted WhatsApp tokens) lack RLS; isolation depends on app code (unverified).
P2 CSP disabled. P2 CORS reflects any origin with credentials outside production (production restricted by code). P2 unauth /org/settings → 404 not 401. P3 Seed default admin password is a known default; change it.
