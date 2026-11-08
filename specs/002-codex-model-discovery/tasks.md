# Tasks: Codex Model Discovery and Official Prices

**Input**: Design documents from `specs/002-codex-model-discovery/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-changes.md, quickstart.md

**Tests**: Required. The constitution (Principle I) makes test-first non-negotiable: every test task
is written and run **failing for the expected reason** before its implementation task.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on unfinished tasks)
- **[Story]**: US1–US4 are the spec's user stories (US4: prices come from the providers).

## Path Conventions

Web application as in feature 001: `src/server/`, `src/shared/`, `src/web/`, `tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 [P] Save the official pricing pages as test fixtures: `tests/fixtures/pricing-claude.md` (from `https://platform.claude.com/docs/en/about-claude/pricing.md`) and `tests/fixtures/pricing-openai.md` (from `https://developers.openai.com/api/docs/pricing.md`), plus `tests/fixtures/pricing-openai-changed-layout.md` with the "### Standard pricing data" heading removed; record the download date at the top of `tests/fixtures/README.md`
- [X] T002 [P] Save the pinned CLI's model listing as a fixture: `tests/fixtures/codex-debug-models.json` (output of `codex debug models` in `staplr-codex:local`, 0.167.0)
- [X] T003 [P] Add `stub-models` to `docker/sandbox/stub/` (prints a JSON catalog in the same shape as T002; models from a `models=` option on the stub login line, hidden entries with `"visibility":"hide"`), copy it in `docker/sandbox/stub.Dockerfile`, and mirror the behaviour in `tests/fakes/fake-sandbox-driver.ts` (`stub-models` command; `OK models=a,b denied=b`)

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T004 Migration test first: extend `tests/integration/migrations.test.ts` to expect up/down/up of `0009_model_discovery` and the new columns and tables below
- [X] T005 Create `src/server/db/migrations/0009_model_discovery.sql` and `.down.sql`: on `provider_connection` add `discoveryStatus` "enum `not_started` | `running` | `finished` | `failed`, default `not_started`", `discoveryError` "text | null, short, secret-free", `modelsRefreshedAt` "text | null"; create `discovered_model` (`providerConnectionId` FK `ON DELETE CASCADE`, `model` "provider id, 1–200 chars", `label` "provider display name, 1–120 chars", `listedAt`; PK (`providerConnectionId`, `model`)); create `price_refresh` (`provider` "enum `claude` | `codex`" PK, `lastAttemptAt`, `lastSuccessAt`, `lastError`); allow `model_price.source = 'official'`; close every current `source='user'` price row at migration time (FR-020). Update `src/server/db/schema.ts` to match
- [X] T006 [P] Extend shared schemas: `src/shared/schemas/providers.ts` (`discoveryStatus`, `discoveryError`, `modelsRefreshedAt` on `ProviderConnection`; `discovered`, `checking`, `price` on `ModelAccess`) and `src/shared/schemas/prices.ts` (`source` adds `official`; `PriceStatus`)
- [X] T007 Update `specs/001-agent-team-orchestration/contracts/openapi.yaml` with every change in `contracts/api-changes.md` (new fields, `POST /api/provider-connections/{id}/discover`, `GET /api/prices/status`, `POST /api/prices/refresh`, removal of `POST /api/model-prices`, audit actions `models.discovered` and `prices.refreshed`)

**Checkpoint**: schema and contracts in place; stories can start.

---

## Phase 3: User Story 1 - Models are ready right after signing in (Priority: P1) 🎯 MVP

**Goal**: completing a Codex sign-in discovers the login's models; the agent form can use them at once.

**Independent Test**: complete a Codex sign-in, open the agent form, pick the connection: available
models are selectable with no "Check availability" press; none shows "Not checked yet".

### Tests for User Story 1 ⚠️ (write first, see them fail)

- [ ] T008 [P] [US1] Unit tests in `tests/unit/model-list.test.ts`: `parseModelList` keeps `visibility = "list"` entries from `tests/fixtures/codex-debug-models.json`, ignores `hide`, rejects malformed JSON and entries whose `slug` is not 1–200 chars or `display_name` not 1–120 chars
- [ ] T009 [P] [US1] Integration tests in `tests/integration/model-discovery.test.ts` (fake driver): completing a sign-in sets `discoveryStatus` `running` then `finished`; one probe per listed model, at most 2 at a time; available and denied models are recorded in `model_access` for the current credential revision; a model not in the shipped catalog is stored in `discovered_model`, offered by `GET /api/models` and accepted by `POST /api/agents`; while running, unanswered models report `checking: true`; an account with no models finishes with zero available; a revoked login during discovery sets `needs_relogin` and marks nothing available; the login secret never appears in responses, logs or the database
- [ ] T010 [P] [US1] Contract tests in `tests/contract/discovery-prices.contract.test.ts` for the changed `ProviderConnection` and `GET /api/models` shapes
- [ ] T011 [P] [US1] Docker test in `tests/docker/model-discovery.test.ts`: with the stub image, sign in with `OK models=m1,m2,m3 denied=m2`, complete, and assert m1 and m3 available, m2 unavailable, all sandboxes removed afterwards; with 10 listed stub models, assert discovery reaches `finished` within 120 s of completing the sign-in (SC-002)
- [ ] T012 [P] [US1] E2E in `tests/e2e/us2-model-discovery.spec.ts`: sign in to Codex (stub), see "Discovering models…" then "N models available" on the card; open the agent form and create an agent on a discovered model without pressing "Check availability"; axe at desktop and 320 px

### Implementation for User Story 1

- [ ] T013 [P] [US1] Add `listCommand` and `parseModelList` to both profiles in `src/server/modules/sandbox/profiles.ts` (real: `codex -c cli_auth_credentials_store="file" debug models`; stub: `stub-models`), and lower probe effort in the real probe command (`-c model_reasoning_effort="low"`)
- [ ] T014 [US1] Add `discover(bundle)` to `src/server/modules/providers/codex.ts`: restore the login in a fresh hardened sandbox, run the list command, probe each listed model (at most 2 concurrently, 120 s each), return `{auth, models: [{id,label,verdict}], refreshedBundle}`, always remove the sandbox
- [ ] T015 [US1] Create `src/server/modules/providers/discovery.ts`: one run per connection at a time (a second request joins the running one), sets `discoveryStatus`/`discoveryError`/`modelsRefreshedAt`, replaces `discovered_model` rows, writes `model_access` evidence for the current credential revision, persists a refreshed bundle, records audit `models.discovered` (counts only); start it from `complete()` in `src/server/modules/sandbox/service.ts` without delaying the response
- [ ] T016 [US1] In `src/server/modules/providers/service.ts`: `listModelAccess` merges discovered models with the shipped catalog (deduplicated by id) and reports `discovered` and `checking`; a discovered model is offered only while it is in `discovered_model` for the selected connection; `toPublic` returns the discovery fields
- [ ] T017 [US1] In `src/server/modules/agents/service.ts` and `src/server/modules/agents/readiness.ts`: accept a model that is in the shipped catalog (not retired) or discovered for the selected connection; readiness uses the discovered label when the catalog has none
- [ ] T018 [US1] Register discovery recovery in `src/server/app.ts`: at start-up, connections left `running` go back to `not_started` and discovery is started again (edge case "restart while discovering")
- [ ] T019 [P] [US1] Web: `src/web/features/providers/ProviderCard.tsx` shows discovery status ("Discovering models…", "N models available", "This account has no Codex models available", failure message) and polls while running; `src/web/routes/agents/$agentId.tsx` shows "Checking…" for unanswered models and updates without reload; announce completion through the live region
- [ ] T020 [P] [US1] Show the allowance notice before the first discovery on the Codex sign-in page in `src/web/routes/settings/provider-login.tsx` (FR-010): "Finding your models sends one very short request per model (about 10)."

**Checkpoint**: US1 works on its own (MVP).

---

## Phase 4: User Story 2 - The remembered list stays current (Priority: P2)

**Goal**: the list is rediscovered on re-login, "Check now" and on demand; temporary failures keep the last good list.

**Independent Test**: re-login with an account that has a different model set; the list changes to match.

### Tests for User Story 2 ⚠️

- [ ] T021 [P] [US2] Integration tests in `tests/integration/model-discovery.test.ts`: re-login replaces the list and invalidates earlier evidence until confirmed (FR-003); "Check now" rediscovers; a temporary failure (stub exit 75) keeps the previous `discovered_model` and `model_access` rows, sets `failed` with a retry message, and changes no model; a model that disappears becomes unavailable and every agent using it shows Not ready with the reason, never a substitute (FR-008); the hourly check runs the list command, records newly listed models as "Not checked yet", and probes only models that agents use (assert the probe count); a discovered model that is no longer listed for any connection keeps its price history but is not offered by `GET /api/models` and is refused by `POST /api/agents` with `422 model_unavailable` (FR-014)
- [ ] T022 [P] [US2] Contract test for `POST /api/provider-connections/{id}/discover` (`202`, `404`, `409` for Claude or needs re-login, `503`) in `tests/contract/discovery-prices.contract.test.ts`

### Implementation for User Story 2

- [ ] T023 [US2] Add `POST /api/provider-connections/{id}/discover` to `src/server/modules/providers/routes.ts` (session and Origin checked, Zod-validated params); call discovery from re-login completion and from `check()` for Codex in `src/server/modules/providers/service.ts`; and in `src/server/modules/health/checkers/provider.ts` make the hourly Codex check run the list command, store newly listed models in `discovered_model` as "Not checked yet" (no probe), and probe only the models agents use (FR-006)
- [ ] T024 [US2] Temporary-failure handling in `src/server/modules/providers/discovery.ts`: only a clear answer changes availability; `failed` keeps the previous rows and records "Last refresh failed; it will be retried at the next hourly check"

**Checkpoint**: US1 and US2 work independently.

---

## Phase 5: User Story 3 - See what was found (Priority: P3)

**Goal**: the owner sees available and unavailable models, the last refresh time, and can refresh.

**Independent Test**: open a Codex connection, read the list and time, press "Refresh models".

### Tests for User Story 3 ⚠️

- [ ] T025 [P] [US3] E2E in `tests/e2e/us2-model-discovery.spec.ts`: the connection lists available and not-available models and "last refreshed"; "Refresh models" updates them and announces how many changed; loading, empty and error states; axe

### Implementation for User Story 3

- [ ] T026 [US3] Add an expandable model list with "Refresh models" to `src/web/features/providers/ProviderCard.tsx` (Codex only), using `GET /api/models` and `POST /api/provider-connections/{id}/discover`

**Checkpoint**: all discovery stories work.

---

## Phase 6: User Story 4 - Prices come from the providers (Priority: P3)

**Goal**: prices come only from the official pages, are shown beside each model, and refresh daily.

**Independent Test**: start Staplr with the fixture pages served; prices appear beside models in
the agent form; the Prices screen is gone; "Refresh prices" updates "Prices last updated".

### Tests for US4 ⚠️

- [ ] T027 [P] [US4] Unit tests in `tests/unit/official-prices.test.ts`: parse `tests/fixtures/pricing-claude.md` ("## Model pricing" table: model name, "Base input tokens", "Output tokens", `$2 / MTok`, footnote `<sup>` removed) and `tests/fixtures/pricing-openai.md` (first table under "### Standard pricing data": model id, "Short context input", "Short context output"; `(<272K context length)` removed); values must match `^\$\d+(\.\d{1,6})?$`; unparsable rows skipped and reported, never zero; the changed-layout fixture or fewer than 3 parsed rows counts as unreadable; Claude names map to ids through catalog labels
- [ ] T028 [P] [US4] Integration tests in `tests/integration/official-prices.test.ts` (msw serving the fixtures): start-up read creates `official` rows with page URL and date; an unchanged second read adds no rows; a changed price closes the current row at that moment and opens a new one; an unreachable or unreadable page changes nothing and records `lastError`; hand-set rows were closed by the migration and stay in history; earlier estimates keep their price; after the first successful official read for a provider, every current `default` row for that provider is closed at that moment, so models the official page does not list show "Unknown"; `POST /api/model-prices` now returns 404; `GET /api/prices/status` and `POST /api/prices/refresh` work and need a session; only `platform.claude.com` and `developers.openai.com` are contacted (extend `tests/integration/egress.test.ts`)
- [ ] T029 [P] [US4] Contract tests for `GET /api/prices/status`, `POST /api/prices/refresh` and the `price` field of `GET /api/models` in `tests/contract/discovery-prices.contract.test.ts`; delete `tests/contract/prices.contract.test.ts`'s POST cases
- [ ] T030 [P] [US4] E2E in `tests/e2e/us2-model-discovery.spec.ts`: no "Prices" link or route; prices with "List price used for estimates", source and date beside each model in the agent form, the Codex note "API list price; your plan may not charge per token", "Unknown" for an unlisted model; "Prices last updated" and "Refresh prices" on the Providers screen; axe. Delete `tests/e2e/us6-model-prices.spec.ts` and remove `/model-prices` from `tests/e2e/a11y-responsive.spec.ts`

### Implementation for US4

- [ ] T031 [US4] Create `src/server/modules/prices/official.ts`: fetch both Markdown pages (allow-listed hosts, 15 s timeout, 2 MB cap, no credentials) and parse them as specified in research R3
- [ ] T032 [US4] In `src/server/modules/prices/service.ts`: add `applyOfficialPrices(provider, rows, at)` (close-and-insert only on change, `source='official'`, `priceSource` = page URL, `pricesAsOf` = read date) and `price_refresh` bookkeeping; remove `setPrice`; keep `estimateCost` unchanged; on the first successful official read for a provider, close every current `default` row for that provider; `mergeCatalog` no longer writes prices and is reduced to catalog validation
- [ ] T033 [US4] Remove `POST /api/model-prices` and add `GET /api/prices/status`, `POST /api/prices/refresh` in `src/server/modules/prices/routes.ts`; add `price` to each item of `GET /api/models`
- [ ] T034 [US4] Schedule reads in `src/server/main.ts`/`src/server/app.ts`: once at start-up (after migrations, not blocking sign-in) and every 24 hours; one run at a time; audit `prices.refreshed` with provider and number of changes
- [ ] T035 [P] [US4] Web: delete `src/web/routes/model-prices.tsx`, its route in `src/web/router.tsx` and nav link in `src/web/routes/__root.tsx`; show prices beside models in `src/web/routes/agents/$agentId.tsx` and in the Codex model list; add "Prices last updated" and "Refresh prices" to `src/web/routes/settings/providers.tsx`
- [ ] T036 [US4] Update `catalog/models.json` and `src/server/modules/prices/catalog.ts` so shipped entries no longer carry prices (prices now come only from official pages); update `tests/unit/catalog.test.ts` accordingly

**Checkpoint**: prices are official-only; the old screen is gone.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T037 [P] Update `README.md` and `docker/sandbox/README.md`: model discovery, the allowance note, official price sources and refresh schedule; remove mentions of editing prices
- [ ] T038 [P] Opt-in live check `tests/integration/official-prices-live.test.ts` (runs only with `STAPLR_LIVE_PRICES=1`) that reads both live pages and asserts at least 3 parsed rows each
- [ ] T039 Run all gates: `typecheck`, `lint`, `format:check`, `npm test`, `npm run test:docker`, `npm run test:e2e`, `npm audit --audit-level=high`; fix findings without weakening tests; feature 001's Claude tests must still pass unchanged (FR-012)
- [ ] T040 **Manual task for a person**: run the scenarios in `specs/002-codex-model-discovery/quickstart.md` with a real ChatGPT account (device-code sign-in enabled) and record results in `specs/002-codex-model-discovery/checklists/quickstart-results.md`, including whether `codex debug models` lists account-specific models after login (research R1)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after Setup; blocks all stories.
- **US1 (Phase 3)**: after Foundational. **MVP.**
- **US2 (Phase 4)**: after US1 (reuses the discovery run).
- **US3 (Phase 5)**: after US2 (uses the discover endpoint).
- **US4 (Phase 6)**: after Foundational only; independent of US1–US3 except the agent-form price display (T035), which touches the same file as T019, so do T019 first.
- **Polish (Phase 7)**: after all wanted stories.

### Within Each Story

Tests first and failing → profile/runner → service → routes → web.

### Parallel Opportunities

- T001, T002, T003 together.
- T006 and T007 alongside T004/T005.
- Within US1: T008–T012 together, then T013 alongside T019/T020.
- US4 (T027–T036) can be built in parallel with US2/US3 by a second person.

---

## Parallel Example: User Story 1

```text
# Tests together:
T008 tests/unit/model-list.test.ts
T009 tests/integration/model-discovery.test.ts
T010 tests/contract/discovery-prices.contract.test.ts
T011 tests/docker/model-discovery.test.ts
T012 tests/e2e/us2-model-discovery.spec.ts
# Then, in parallel:
T013 src/server/modules/sandbox/profiles.ts
T019 src/web/features/providers/ProviderCard.tsx + agents/$agentId.tsx
T020 src/web/routes/settings/provider-login.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

Setup → Foundational → US1. Stop and check: a real Codex sign-in leads straight to selectable
models (quickstart scenarios 1–2).

### Incremental Delivery

US1 → US2 (keeps the list current) → US3 (visibility) → US4 (official prices, removes the screen).
US4 can ship before US2/US3 if prices matter more.

### Parallel Team Strategy

One person on US1→US2→US3, another on US4 after Foundational.

---

## Notes

- Every test task must be seen failing before its implementation task.
- T040 needs a real account and a person; it cannot be completed by the implementing agent.
