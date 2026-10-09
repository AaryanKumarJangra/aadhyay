# Authorization (v2)

**Rule:** `ALLOW = module enabled AND a grant matches the permission AND its scope covers the record AND its conditions pass.`
The API is the only enforcer. Web and mobile use the same engine for navigation and explanations, never for security.

## Pieces

| Piece | File | What it does |
|---|---|---|
| Catalogue | `backend/contracts/src/authz/catalogue.ts` | Every permission key (`module.resource.action`), its label, the scopes the API enforces for it, allowed conditions, sensitivity. `PermissionKey` is derived from it — unknown keys don't compile. |
| Engine | `backend/contracts/src/authz/engine.ts` | `decide`, `scopeFilter`, `effectiveAccess`, `describeGrant`, `validateRole`, `grantAuthority`. Pure, shared. |
| Templates | `backend/contracts/src/authz/templates.ts` | Default roles with per-permission scope and conditions. `TEMPLATE_VERSION` drives upgrades. |
| Loader | `backend/src/kernel/rbac/access.service.ts` | Memberships → role assignments → grants with resolved section / subject ids; cached per tenant version. |
| Guard | `backend/src/kernel/auth/access.guard.ts` | `@Can(...)` must be held **institution-wide**, unless the handler is `@Scoped()` (or the key is `self.*`). |
| Service helper | `backend/src/kernel/authz/authz.ts` | `Authz.assert(key, record)`, `Authz.where(key, cols)` for lists, structured 403s. |

## Scopes

| Scope | Covers | Source of ids |
|---|---|---|
| `tenant` | everything | — |
| `section` | assigned classes & sections | class teacher of a section, subject teacher via `class_subjects`, plus explicit `role_assignments` (section / class) |
| `subject` | (section, subject) pairs | `class_subjects.teacher_id` |
| `own` | own records | own student, own children (`student_guardians`), own staff record, own user |

A grant's scope is the narrower of the role's scope for that permission (`roles.scopes`) and the assignment's scope.
Branch scope is not offered: most tables have no `branch_id` yet, and the role editor only offers scopes the API enforces.

## Conditions

`maxAmountPaise` (refunds, concessions), `sameDayOnly` (teachers editing attendance), `makerChecker`
(decision comes back with `requiresApproval: true`; the action must be queued for a second approver).

## Adding an endpoint

1. Pick (or add) the key in the catalogue. Add `scopes` only for scopes you will actually enforce.
2. `@Can('module.resource.action')`. Without `@Scoped()`, section- or own-scoped users get `OUT_OF_SCOPE` automatically.
3. If the endpoint should work for scoped users, add `@Scoped()` **and** enforce: `Authz.assert(key, { sectionId, studentId, subjectId })`
   for one record, `Authz.where(key, { section, student })` for lists. For CRUD resources pass `scope: { section | student | studentArray }`.
4. Add an allowed + wrong-scope case to `backend/test/authz.e2e.ts`.

## Grant authority

Nobody can create, edit, assign, remove or deactivate a role holding more than they hold **institution-wide**, with conditions
at least as strict as their own. Full access (`*`) and role design (`org.role.*` except view) are Owner-only. The Owner role is
not editable, the last Owner cannot be removed, and only an Owner can change their own roles. Every change is audited with
before/after.

## Denials

```json
{ "error": { "code": "FORBIDDEN", "message": "Your role “Teacher” allows you to mark attendance only for assigned classes & sections; this record is outside that scope.",
  "details": { "permission": "attendance.student.create", "denial": "OUT_OF_SCOPE", "scope": "section", "role": "Teacher", "contact": "Institution Owner or Administrator" } } }
```

`denial` ∈ `NO_PERMISSION | OUT_OF_SCOPE | CONDITION_FAILED | GRANT_AUTHORITY | SELF_ASSIGNMENT | PROTECTED_ROLE`;
a disabled module returns `code: MODULE_DISABLED`. Unknown ids and other families' ids get the same 403, so it reveals nothing.

## API

`GET /access/catalogue` · `GET /access/me` · `POST /access/explain` · `GET /access/members/:membershipId` ·
`POST /access/roles/preview` · roles and members under `/org/roles`, `/org/members`.
