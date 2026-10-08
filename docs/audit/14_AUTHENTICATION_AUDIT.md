# Authentication Audit
OTP: single-use ✔; lockout after repeated wrong codes ✔ (correct code rejected afterward); request limits 5/h/phone, 30/h/IP; refresh rotation ✔; logout revokes access token ✔; garbage JWT 401 ✔. Control-plane password login: NO lockout (15 wrong → correct still 201). TOTP code exists; not tested. Expired OTP/token, concurrent sessions, password change: UNVERIFIED.
