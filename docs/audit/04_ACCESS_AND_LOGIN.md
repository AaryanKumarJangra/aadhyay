# Access & Login
| User | Role | Tenant | URL | Method | Verified |
|---|---|---|---|---|---|
| audit-admin@aadhyay.test / Audit@pass123 | super_admin | platform | /control/login, POST /v1/control/auth/login | password | YES (audit DB only; I created it) |
| admin@aadhyay.com | super_admin | platform | same | password (SEED_ADMIN_PASSWORD or seed default) | NOT VERIFIED on the real DB |
| tenant owner (phone given at signup) | Owner | per tenant | /app/login | OTP | YES (API, via devCode) |
| teacher (invited by owner) | Teacher | per tenant | /app/login | OTP | YES (API) |
| parent (guardian phone on student) | guardian | per tenant | /app/login, mobile | OTP | YES (API) |
NO VERIFIED DEMO LOGIN FOUND for any seeded tenant — none exists.
