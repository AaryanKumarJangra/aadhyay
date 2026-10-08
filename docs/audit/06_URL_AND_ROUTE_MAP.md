# URL / Route Map (web, measured on localhost:3000)
200: / /pricing /demo /signup /school-erp/delhi /app/login /control/login /verify/abc /track/abc
307→/app/login (no session): /app /app/students /app/students/new /app/fees /app/attendance /app/exams /app/transport /app/crm /app/website /app/messenger /app/notices /app/reports /app/settings
307→/control/login: /control
Not reached before the server was OOM-killed: /app/billing /app/r/* /control/tenants /control/finance /site/<slug> (UNVERIFIED)
404 on bare paths /login /students /fees (console is under /app). Page files exist for the above plus /app/exams/[examId], /app/students/[id], /control/tenants/[id].
API: http://localhost:4000/v1 (health /v1/health). Realtime :4001 namespaces /messenger /calls /transport. No API docs endpoint found.
