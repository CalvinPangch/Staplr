# Implementation Plan: Codex Model Discovery and Official Prices

**Branch**: `002-codex-model-discovery` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/002-codex-model-discovery/spec.md`

## Summary

When a Codex sign-in completes, Staplr lists the models the login can see (`codex debug models`
in the hardened sandbox), confirms each with one tiny exact-model probe, and remembers the result
per connection, including models Staplr's shipped catalog does not know. The agent form can then use
them immediately. Prices stop being hand-entered: Staplr reads the providers' official pricing pages
(Markdown versions) at start-up and every 24 hours, records changes as price history, and shows each
price beside its model. The Model Prices screen and its edit endpoint are removed; hand-set prices
are closed and kept as history.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node.js 22 — unchanged from feature 001
**Primary Dependencies**: Fastify 5, React 19, TanStack Query, existing sandbox driver; no new
runtime dependency (Markdown tables parsed by a small tested function; Node's built-in `fetch`)
**Storage**: SQLite (better-sqlite3), migration `0009_model_discovery` (+ down)
**Testing**: Vitest (unit, integration, contract, docker), Playwright + axe
**Target Platform**: self-hosted Linux container / Windows dev, Docker for sandboxes
**Project Type**: web application (Fastify API + React SPA), as in 001
**Performance Goals**: discovery of ≤10 models within 2 minutes (SC-002); price read under 15 s per page
**Constraints**: at most 2 concurrent probes; one probe per listed model per discovery; price pages
capped at 2 MB; only two new outside hosts
**Scale/Scope**: one owner, a handful of Codex connections, ~10 models each

All unknowns were resolved in [research.md](./research.md) (R1–R8). Remaining unverified point:
whether the logged-in catalog refresh is account-specific (R1); the design stays correct either way.

## Constitution Check

*GATE: passes before Phase 0 and after Phase 1.*

| Principle | How this design complies |
|---|---|
| I. Test-first | Price-table parsing gets unit tests against saved page fixtures (including a changed layout); discovery state machine and probe accounting get integration tests with the fake driver; docker tests run discovery against the stub image (stub gains a `debug models` command); e2e covers sign-in → models with prices, the removed screen, and both refresh actions. Each written and seen failing before code. The removal of `POST /api/model-prices` starts with a test expecting 404. |
| II. Security & privacy | Discovery runs in the same restored, hardened, throwaway container; the login is never written to disk on the host or logged. Price reads send no credentials or user data, use a host allow-list (R7), a timeout and a size cap, and all page content is treated as untrusted input (strict number pattern, no HTML rendering). New endpoints require a session and Origin check; inputs validated with Zod. |
| III. Accessible UX | Discovery progress and price-refresh state are announced through the live region; model lists show price text, not colour alone; loading, empty ("this account has no Codex models"), error and success states for both lists; 320 px and axe covered in e2e. |
| IV. Simplicity | No new dependency, service or queue: discovery reuses the sandbox driver and `model_access`; price reads reuse `model_price` history and the estimate rule. One new small table per concern (`discovered_model`, `price_refresh`). The prices screen and edit endpoint are deleted rather than hidden. |
| V. Spec-driven | Follows specify → clarify (6 answers recorded) → plan → tasks. |
| Operational | Reversible migration 0009; structured logs for discovery/price runs with counts only; failures recorded in `discoveryError` / `price_refresh.lastError` and Diagnostics. |

No violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-codex-model-discovery/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api-changes.md
└── tasks.md            # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/server/
├── db/migrations/0009_model_discovery.sql (+ .down.sql)
├── modules/sandbox/profiles.ts          # add listCommand / parseModelList (real + stub)
├── modules/providers/codex.ts           # discover(): restore, list, probe (≤2 at a time)
├── modules/providers/discovery.ts       # new: per-connection discovery runs, state, recovery
├── modules/providers/service.ts         # listModelAccess merges discovered models; status fields
├── modules/providers/routes.ts          # POST /{id}/discover
├── modules/agents/service.ts            # accept discovered models
├── modules/prices/official.ts           # new: fetch + parse both Markdown pages
├── modules/prices/service.ts            # applyOfficialPrices(); remove setPrice(); close user rows
├── modules/prices/routes.ts             # remove POST; add /api/prices/status, /api/prices/refresh
└── main.ts / app.ts                     # start-up read + 24 h timer; discovery recovery task
docker/sandbox/stub/stub-models          # stub listing for docker/e2e tests
src/web/
├── routes/model-prices.tsx              # deleted (and its nav link and route)
├── routes/settings/providers.tsx        # "Prices last updated", "Refresh prices"
├── features/providers/ProviderCard.tsx  # discovery status, model list, "Refresh models"
└── routes/agents/$agentId.tsx           # price beside each model; "Checking…" state
tests/
├── unit/official-prices.test.ts (+ fixtures/pricing-claude.md, pricing-openai.md)
├── integration/model-discovery.test.ts
├── integration/official-prices.test.ts
├── contract/discovery-prices.contract.test.ts
├── docker/model-discovery.test.ts
└── e2e/us2-model-discovery.spec.ts      # replaces us6-model-prices.spec.ts
```

**Structure Decision**: same web-application layout as feature 001; changes stay inside the
existing provider, prices and agent modules.

## Complexity Tracking

None.
