# Data Model: Agent Team Orchestration Setup

**Feature**: `001-agent-team-orchestration` | Storage: SQLite via Drizzle (research R3)

Conventions:

- IDs are UUID v4 from `crypto.randomUUID()`, stored as text. Ordering never relies on IDs.
- Times are ISO-8601 UTC text.
- `sealed` means an AES-256-GCM envelope `{keyVersion, nonce, ciphertext, authTag}` stored as a
  blob (research R4). Sealed columns are never returned by the API.
- Status values come from the spec's **Status Vocabulary** and live in `src/shared/status.ts`.
- Every migration ships with a matching `down` script (Constitution: reversible migrations).
  `tests/integration/migrations.test.ts` applies all migrations up, then all down, then up again.
- Links that must survive the deletion of the thing they point to use `ON DELETE SET NULL`
  (`agent.providerConnectionId`, `project.sourceControlConnectionId`). No service code is needed
  to clear them.
- Readiness of agents and projects is **computed when read**; there is no stored readiness column.

## Personal data (Constitution II)

Only data the spec requires is stored, and each field below has a stated purpose.

| Field | Table | Purpose |
|---|---|---|
| username | user | Sign in the single user (FR-042) |
| passwordHash | user | Check the password; an Argon2id hash only, never the password (FR-042) |
| accountName | source_control_connection | Show which GitHub/GitLab account a token belongs to (FR-003) |

Not stored: any profile, email or plan of a Codex/Claude account. Credential bundles are sealed
and never read for identity data.

## Entity relationships

```text
User (1) ── owns the installation
SourceControlConnection (1) ──< Project
ProviderConnection (1) ──< Agent
Soul (1) ──< Agent ;  Soul (0..1) ──< Soul (copiedFrom)
Project (1) ──< TeamAssignment >── (1) Agent
Project (1) ──< Ticket
SandboxLoginSession (0..1) ── creates ──> ProviderConnection
ModelPrice  (history rows per provider+model)
UsageRecord ──> Project, Agent, ProviderConnection   (written by next feature)
AuditEntry, ErrorEvent  (append-only)
```

## user

| Field | Type | Rules |
|---|---|---|
| id | text PK | |
| username | text | 3–64 chars, unique |
| passwordHash | text | Argon2id |
| createdAt | text | |

At most one row. `POST /api/setup` is rejected once a row exists (FR-042).

## session

| Field | Type | Rules |
|---|---|---|
| id | text PK | random 256-bit value; stored as a SHA-256 hash, never as plain text |
| userId | text FK → user | |
| createdAt, expiresAt, lastSeenAt | text | 12 h idle timeout, 7 d absolute |

## source_control_connection

| Field | Type | Rules |
|---|---|---|
| id | text PK | |
| name | text | 1–80 chars, unique |
| platform | enum `github` \| `gitlab` | |
| baseUrl | text | `https://api.github.com` for GitHub; GitLab defaults to `https://gitlab.com`, otherwise a user-entered HTTPS URL (FR-002) |
| accountName | text | as returned by the platform |
| grantedPermissions | json text[] | |
| tokenSealed | blob | sealed token (FR-004) |
| tokenLast4 | text | the only part ever displayed |
| status | enum `connected` \| `needs_attention` | |
| statusReason | enum `invalid` \| `expired` \| `revoked` \| `missing_permission` \| null | |
| missingPermissions | json text[] | named in the UI |
| lastCheckedAt, lastCheckResult | text, text | FR-013 |
| createdAt, updatedAt | text | |

**Validation on save (FR-003)**: the token must authenticate and must grant read contents, push,
and create pull/merge request. Otherwise the request is rejected (422) and nothing is stored.

**Transitions**: `connected` ⇄ `needs_attention`, driven by health checks or "Check now". Deleting
the connection clears `project.sourceControlConnectionId` through the foreign key
(`ON DELETE SET NULL`); a project with no connection is Not ready
(`source_control_needs_attention`, message "connection removed").

## provider_connection

| Field | Type | Rules |
|---|---|---|
| id | text PK | |
| provider | enum `claude` \| `codex` | FR-006 |
| name | text | 1–80 chars, unique per provider |
| credentialBundleSealed | blob | sealed tar of the CLI credential files (R5) |
| credentialExpiresAt | text \| null | read from the credential file when present |
| status | enum `connected` \| `needs_relogin` | |
| lastCheckedAt, lastCheckResult | text | |
| createdAt, updatedAt | text | |

**Transitions**: created as `connected` by a successful sandbox login session. A failed check
sets `needs_relogin`. A re-login (a new sandbox session with `reloginOf = id`) replaces the bundle
in place and sets `connected`, keeping every agent link (FR-011). Disconnecting deletes the row
and the bundle (FR-012); `agent.providerConnectionId` is cleared by the foreign key
(`ON DELETE SET NULL`), so the agents that used it show Not ready (`no_provider_connection`).

## sandbox_login_session

| Field | Type | Rules |
|---|---|---|
| id | text PK | |
| provider | enum | |
| reloginOf | text FK → provider_connection \| null | |
| containerId | text \| null | removed when the session ends |
| status | enum `in_progress` \| `succeeded` \| `failed` \| `cancelled` \| `expired` | |
| failureReason | text \| null | |
| lastActivityAt, startedAt, endedAt | text | |
| resultConnectionId | text \| null | |

**Transitions**: `in_progress` moves to `succeeded`, `failed`, `cancelled`, or `expired` (after 15
minutes of inactivity, FR-008). All of these are terminal, and the container is destroyed on
entering any of them. Several sessions may be `in_progress` at once, and each one that succeeds
creates its own connection (FR-010).

**Startup recovery**: when Staplr starts, every session still `in_progress` becomes `failed` with
`failureReason = "Staplr restarted"`, and any leftover sandbox container (label
`staplr.sandbox`) is removed. Nothing partial is saved.

## soul

| Field | Type | Rules |
|---|---|---|
| id | text PK | |
| name | text | 1–80 chars, unique |
| roleType | enum `project_manager` \| `business_analyst` \| `developer` \| `qa` \| `custom` | |
| description | text | ≤ 500 chars |
| instructions | text | ≤ 20,000 chars (markdown) |
| isDefault | boolean | defaults are read-only (FR-017) |
| copiedFromId | text FK → soul \| null | |
| createdAt, updatedAt | text | |

**Rules**:

- A soul created from scratch cannot have `roleType = project_manager`. A copy keeps its source's
  `roleType` (FR-017, FR-018).
- Deletion is blocked while agents reference the soul (FR-019).
- The four default souls are seeded by a migration.

## agent

| Field | Type | Rules |
|---|---|---|
| id | text PK | |
| name | text | 1–80 chars, unique |
| soulId | text FK → soul | the agent's role = `soul.roleType` |
| provider | enum | must equal `providerConnection.provider` |
| providerConnectionId | text FK → provider_connection \| null | `ON DELETE SET NULL`: cleared when that connection is disconnected |
| model | text | must exist in the catalog for that provider (FR-021) |
| createdAt, updatedAt | text | |

**Derived readiness (FR-023)**: Not ready if `providerConnectionId` is null
(`no_provider_connection`), the connection is `needs_relogin` (`needs_relogin`), or the model is
retired or failed its probe (`model_unavailable`).

**Rules**:

- Deletion is blocked while the agent has any team assignment (FR-024).
- A soul change is blocked if it would leave any of the agent's projects with 0 or 2 or more
  Project Managers (FR-022).

## project

| Field | Type | Rules |
|---|---|---|
| id | text PK | |
| name | text | defaults to the repository name; 1–80 chars |
| sourceControlConnectionId | text FK \| null | `ON DELETE SET NULL`: cleared when that connection is deleted |
| repoFullName | text | e.g. `org/repo` |
| repoRemoteId | text | platform repository id, used for relinking |
| baseBranch | text | defaults to the repository's default branch (FR-029) |
| downloadStatus | enum `downloading` \| `downloaded` \| `download_failed` | |
| downloadError | text \| null | |
| lastUpdatedAt | text \| null | time of the last successful download or refresh (FR-027) |
| lastRefreshError | text \| null | |
| deletedAt | text \| null | soft-delete marker (FR-030) |
| createdAt, updatedAt | text | |

**Derived readiness (FR-034)**: Ready only when all of these hold. Otherwise it is Not ready with
every applicable reason:

- the connection is `connected`
- `downloadStatus = downloaded`
- the repository is reachable and `baseBranch` exists (checked during health checks and refresh)
- exactly one assigned agent has the role `project_manager`
- every assigned agent is Ready

The possible reasons are `download_failed`, `repository_unavailable`, `base_branch_missing`,
`source_control_needs_attention` (including a removed connection), `no_project_manager`, and
`agent_not_ready:<agentId>`.

**Startup recovery**: when Staplr starts, every project still `downloading` becomes
`download_failed` with `downloadError = "interrupted"`, so the user can retry it. The partial
`base` directory is removed before the retry clones again.

**Deletion (FR-030)**: removes `/data/repos/<id>/` (the base copy and any worktrees), all team
assignments, and all tickets, then sets `deletedAt`. The row is kept so that usage records stay
attributable. Deleted projects are hidden from lists.

## team_assignment

| Field | Type | Rules |
|---|---|---|
| projectId | text FK → project | composite PK with agentId |
| agentId | text FK → agent | |
| assignedAt | text | |

**Rule (FR-033)**: inserting an agent whose role is `project_manager` is rejected when the project
already has one. Finishing project setup (`POST /api/projects/{id}/finalize-team`) is rejected
when it has none.

## ticket

| Field | Type | Rules |
|---|---|---|
| id | text PK | |
| projectId | text FK → project | the board this ticket belongs to |
| title | text | 1–200 chars, trimmed, required (FR-046) |
| description | text | ≤ 20,000 chars, may be empty; stored as plain text and rendered escaped |
| status | enum `new` \| `review` \| `testing` \| `end` | the column; column order is fixed: New, Review, Testing, End (FR-044) |
| position | integer | 0-based, contiguous within (`projectId`, `status`) |
| createdAt, updatedAt | text | |
| statusChangedAt | text | set at creation and whenever `status` changes; drives "time in column" (FR-048) |

**Rules**:

- Create: `status = new`, `position = 0`; the other New tickets shift +1 in the same transaction.
- Move `(ticketId, toStatus, toIndex)`: `toIndex` is clamped to `[0, count(target column)]`. In one
  transaction, remove the ticket from its source column (positions after it −1), insert it into
  the target (positions ≥ `toIndex` +1), and update `status`, `position`, `statusChangedAt` (only
  if the column changed) and `updatedAt`. Any column may move to any column (FR-047).
- Delete (FR-050): hard delete; positions after it in its column −1.
- No assignee field in this feature (FR-049).
- Unique index on (`projectId`, `status`, `position`), checked by tests after every move.
- Moving a ticket on a deleted project is impossible (the tickets are removed with the project).

**State transitions**: `new ⇄ review ⇄ testing ⇄ end`. Any column can move to any column by hand in
this feature. The next feature adds agent-driven rules.

## model_price

| Field | Type | Rules |
|---|---|---|
| id | text PK | |
| provider | enum | |
| model | text | |
| inputPricePerMTok | decimal text \| null | USD per 1M input tokens, ≥ 0; null = Unknown (unverified catalog price, R9) |
| outputPricePerMTok | decimal text \| null | USD per 1M output tokens, ≥ 0; null = Unknown |
| priceSource, pricesAsOf | text \| null | for `default` rows: pricing page URL and date copied (R9) |
| effectiveFrom | text | |
| effectiveUntil | text \| null | null means this is the current price |
| source | enum `default` \| `user` | |

**Rules (FR-037)**:

- At most one current row (`effectiveUntil = null`) per provider and model.
- An edit closes the current row at the moment of the edit and inserts a new `user` row.
- Rows are never updated in any other way.

**`estimateCost(provider, model, inputTokens, outputTokens, at)`** (FR-038):

- Finds the row whose time range covers `at`.
- Returns `{amountUsd, priceId}` when found, or `"unknown"` when not.
- Calculates with exact decimal arithmetic and rounds half-up to 6 decimal places.

## usage_record *(defined here; written by the next feature, FR-040)*

| Field | Type |
|---|---|
| id | text PK |
| projectId, agentId, providerConnectionId | text FK (nullable after deletes; denormalized names kept) |
| projectName, agentName, agentRole | text (snapshot at write time) |
| ticketId | text (no FK; the ticket may be deleted later) |
| ticketTitle | text (snapshot at write time) |
| provider, model | text |
| inputTokens, outputTokens | integer \| null (null when not reported) |
| startedAt, endedAt | text |
| estimatedCostUsd | decimal text \| null (null shows as "Unknown") |
| priceId | text FK → model_price \| null |

Append-only: no update or delete path exists. A migration creates the table in this feature, but
nothing writes to it yet.

## audit_entry

| Field | Type | Rules |
|---|---|---|
| id | text PK | |
| at | text | |
| action | enum `scc.added` \| `scc.replaced` \| `scc.removed` \| `provider.added` \| `provider.relogged` \| `provider.removed` | FR-041 |
| targetType, targetId, targetName | text | |
| detail | json | never contains secret values (enforced by schema and test) |

## error_event

| Field | Type |
|---|---|
| id, at, requestId, route, message, stack (redacted) | text |
