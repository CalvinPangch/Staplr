# Data Model: Codex Model Discovery and Official Prices

Changes to feature 001's model (see `specs/001-agent-team-orchestration/data-model.md`). One
reversible migration, `0009_model_discovery`, with `0009_model_discovery.down.sql`.

## provider_connection (changed)

| Field | Type | Rules |
|---|---|---|
| discoveryStatus | enum `not_started` \| `running` \| `finished` \| `failed` | default `not_started`; Codex only, Claude stays `not_started` |
| discoveryError | text \| null | short, secret-free message for `failed` |
| modelsRefreshedAt | text \| null | time of the last successful discovery |

**State transitions**: `not_started → running` on sign-in complete, re-login, "Check now" or
"Refresh models"; `running → finished` when listing and every probe have an answer; `running →
failed` on a temporary error (the previous `discovered_model` and `model_access` rows stay);
`running → not_started` on restart recovery, after which discovery is started again.

## discovered_model (new)

| Field | Type | Rules |
|---|---|---|
| providerConnectionId | text FK → provider_connection | `ON DELETE CASCADE` |
| model | text | provider id (slug), 1–200 chars |
| label | text | provider display name, 1–120 chars |
| listedAt | text | last time the CLI listed it |

Primary key (`providerConnectionId`, `model`). Rows are replaced as a set on each successful listing.
Availability itself stays in the existing `model_access` table, bound to the credential revision
(FR-003). A model in `discovered_model` but not in the shipped catalog is offered for agents when its
`model_access` row is `available`.

## model_price (changed)

| Field | Change |
|---|---|
| source | enum adds `official`; `default` and `user` remain for history only |
| priceSource | for `official` rows: the pricing page URL |
| pricesAsOf | for `official` rows: the date the page was read |

**Rules**:
- Upgrade closes every current `user` row at migration time (FR-020).
- A read that finds a changed price closes the current row and inserts an `official` row; an
  unchanged price adds nothing; a missing or unreadable price changes nothing (FR-017).
- At most one current row per provider and model (existing unique index).
- The first successful official read for a provider closes that provider's current `default` rows;
  afterwards only `official` rows are current.

## price_refresh (new, single row per provider)

| Field | Type | Rules |
|---|---|---|
| provider | enum `claude` \| `codex` | primary key |
| lastAttemptAt | text \| null | |
| lastSuccessAt | text \| null | shown as "Prices last updated" |
| lastError | text \| null | short, secret-free; e.g. "page layout not recognised" |

## Readiness (unchanged rule, new input)

An agent's model is current when it is in the shipped catalog (not retired) **or** discovered for
its connection, and its `model_access` row is `available` for the current credential revision.
