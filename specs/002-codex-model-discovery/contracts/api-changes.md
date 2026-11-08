# API Changes (delta to `specs/001-agent-team-orchestration/contracts/openapi.yaml`)

The OpenAPI file is updated in place during implementation; this lists every change.

## Changed

### `ProviderConnection` (response)
Adds, for every connection (Claude always `not_started` / `null`):

| Field | Type |
|---|---|
| `discoveryStatus` | `not_started` \| `running` \| `finished` \| `failed` |
| `discoveryError` | string \| null |
| `modelsRefreshedAt` | date-time \| null |

### `GET /api/models?providerConnectionId=`
- For a Codex connection, `models` now contains the shipped catalog entries **plus** every
  discovered model for that connection (deduplicated by id).
- Each `ModelAccess` item adds:
  - `discovered`: boolean (listed by the provider for this login)
  - `checking`: boolean (true while discovery is running and this model has no answer yet)
  - `price`: `{ inputPricePerMTok: string|null, outputPricePerMTok: string|null, priceSource: uri|null, pricesAsOf: date|null, label: "List price used for estimates", note: string|null }`.
    For Codex, `note` is `"API list price; your plan may not charge per token"`.
- Response adds `discoveryStatus` and `modelsRefreshedAt` for the connection.

### `POST /api/agents`, `PUT /api/agents/{id}`
A `model` is valid when it is in the shipped catalog (not retired) **or** discovered for the
selected connection, and is `available` for the current credential revision. Otherwise `422
model_unavailable` as before. No other change.

### `GET /api/model-prices`
Read-only. `source` may be `official`; rows keep their history. Used by the model lists.

### `POST /api/provider-connections/{id}/check`
For Codex, also starts discovery. Responds as before; `discoveryStatus` shows `running`.

## Added

### `POST /api/provider-connections/{id}/discover` — "Refresh models"
- `202` → `ProviderConnection` with `discoveryStatus: "running"`.
- `404` unknown connection; `409` not a Codex connection, or the connection needs re-login;
  `503 docker_unavailable`. Problem responses use `application/problem+json`.
- A second request while one is running returns `202` with the same running state (no second run).

### `GET /api/prices/status`
`200` → `{ providers: [{ provider, lastAttemptAt, lastSuccessAt, lastError }] }`.

### `POST /api/prices/refresh` — "Refresh prices"
`202` → same body as `GET /api/prices/status` with `lastAttemptAt` set. Reads run in the background;
a request while one is running does not start another.

## Removed

### `POST /api/model-prices`
Removed (returns `404`). Hand-entered prices are no longer accepted (FR-016).

## Audit actions
Adds `models.discovered` (target: provider connection; detail: counts only) and `prices.refreshed`
(detail: provider and number of changed prices). Removes `price.changed` from new writes; existing
entries stay.
