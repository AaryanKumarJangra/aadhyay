# Role Access Matrix (API-verified)
| Role | Login | students list | fee head create | org settings | invite member |
|---|---|---|---|---|---|
| Owner | OK | 200 | 201 | OK (used) | 201 |
| Teacher | OK | 403 | 403 | 403 | 403 |
| Parent | OK | 403 | 403 | - | - |
Parent reading own child's fee ledger: 200. Accountant, Principal, Driver, Staff, HR etc.: UNVERIFIED. Teacher getting 403 on the student list may be too restrictive for real use (limitation, unconfirmed).
