# Dashboards

One route (`/app`), composed from what the user can do — never from role names:
`reports.dashboard.view` → institution · `fees.dashboard.view` → finance · attendance/homework view → teacher · `self.*` → family/student · otherwise a launchpad of the user’s own modules.

API (`backend/src/modules/dashboards`): `GET /dashboards/institution?range=7|30|90`, `/finance`, `/teacher`, `/family`. Each block is returned only if the caller may see it (fees blocks need fee permissions, admissions needs CRM…). Series are zero-filled per day/month; empty data is reported, and the UI explains how to create it. Alerts (unmarked sections, low-attendance sections, overdue fees, pending leave, SOS, follow-ups) link to the screen that fixes them.
