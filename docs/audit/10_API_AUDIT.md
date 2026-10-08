# API Audit
Decorator counts: 110 GET, 146 POST, 10 PUT, 9 PATCH, 4 DELETE (+ generic CRUD from common/crud.ts, not enumerated). Full per-endpoint table NOT produced. Probed endpoints listed in the master report. Observations: 422 for validation, 401/403/404 as expected; unauth GET /org/settings → 404 (should be 401); POST endpoints return 201 even for login/logout/refresh.
