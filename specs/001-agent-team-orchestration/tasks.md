---

description: "Task list for Agent Team Orchestration Setup"
---

# Tasks: Agent Team Orchestration Setup

**Input**: Design documents from `specs/001-agent-team-orchestration/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml,
contracts/sandbox-terminal.md, quickstart.md

**Tests**: Included and mandatory. Constitution Principle I (Test-First, non-negotiable) requires
every test task to be written and seen FAILING before its implementation tasks. No task combines a
test with the code it tests.

**Organization**: Tasks are grouped by user story. Paths follow the single-package layout in
plan.md: Node.js server in `src/server/`, React app in `src/web/`, shared Zod schemas in
`src/shared/`, tests in `tests/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on unfinished tasks)
- **[Story]**: The user story the task belongs to (US1–US7)

---

## Preflight: Supported provider authentication

- [X] T155 Review research R18 and its official sources; record review date and the chosen Claude owner-API-key/Codex-account flows in `docker/sandbox/README.md`. Confirm direct owner billing, no Claude.ai token collection, and no modification of provider CLI authentication. This documentation gate precedes provider implementation; pinned-image behavior verification follows in T071.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and tooling

- [X] T001 Create `package.json` (single package, `"type": "module"`, `"engines": {"node": ">=22"}`) with scripts `dev`, `build`, `start`, `typecheck` (`tsc --noEmit`), `lint`, `format`, `format:check` (`prettier --check .`), `test` (unit+integration+contract), `test:docker`, `test:e2e`, `db:generate`, `db:migrate`, `sandbox:build`, `seed:board`, and install exactly the dependencies in research.md R15, including `@dnd-kit/core` and `@dnd-kit/sortable`, plus dev-only `ajv` and `yaml`. Do NOT add `ajv-formats` or an ID library (IDs use `crypto.randomUUID()`). After installing, re-check the maintenance column in R15: `npm audit --audit-level=high` must be clean, and run `npm view <pkg> time --json` for any package whose latest release is older than 24 months and update R15 if anything changed
- [X] T002 [P] Create `tsconfig.json` with `"strict": true`, `"noUncheckedIndexedAccess": true`, path aliases `@shared/*` → `src/shared/*`, `@server/*` → `src/server/*`, `@web/*` → `src/web/*`
- [X] T003 [P] Configure ESLint (typescript-eslint strict, react-hooks, jsx-a11y) in `eslint.config.js` and Prettier in `.prettierrc.json`
- [X] T004 [P] Create `vite.config.ts` (React plugin, root `src/web`, build output `dist/web`, dev proxy `/api` → `http://localhost:3000` including WebSocket)
- [X] T005 [P] Create `vitest.config.ts` with projects `unit` (`tests/unit`), `integration` (`tests/integration`), `contract` (`tests/contract`), `docker` (`tests/docker`, only run by `test:docker`)
- [X] T006 [P] Create `playwright.config.ts` (webServer `npm run dev` with `STAPLR_TEST_MODE=1`, Chromium + mobile viewport 320×640) and `tests/e2e/fixtures.ts` exporting an `axeCheck(page)` helper using `@axe-core/playwright` with tags `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`
- [X] T007 [P] Create `.env.example` (`STAPLR_MASTER_KEY`, `SESSION_SECRET`, `DATA_DIR=./data`, `PORT=3000`, `PUBLIC_URL=http://localhost:3000`, `STAPLR_ALLOW_INSECURE_HTTP=0`, `DOCKER_HOST`) and confirm `.gitignore` (created when the repository was initialised) lists `node_modules/`, `dist/`, `data/`, `.env`, `.tools/`
- [X] T008 [P] Create `Dockerfile` (Node 22 slim + `git`, non-root user, serves `dist/`) and `compose.yaml` with services `staplr` (named volume `staplr-data:/data`, `DOCKER_HOST=tcp://docker-proxy:2375`, `PUBLIC_URL` from `.env`), `docker-proxy` (`tecnativa/docker-socket-proxy`, env `CONTAINERS=1 EXEC=1 IMAGES=1 NETWORKS=1 POST=1`, raw socket mounted read-only into the proxy only; T017 is the authority, so add `ALLOW_START=1`, `ALLOW_STOP=1` or `ALLOW_RESTARTS=1` only if it shows they are needed), and an optional `caddy` service under compose profile `https` (`tls internal`, proxies to `staplr:3000`) per research R10 and R11
- [X] T009 [P] Create `.github/workflows/ci.yml` running `npm ci`, `typecheck`, `lint`, `format:check`, `test`, `npm audit --audit-level=high`, and `test:e2e`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Encryption, configuration, database, authentication, logging, error capture,
Docker/git wrappers, health scheduler, catalog, audit, and UI shell. Every story depends on these.

**⚠️ CRITICAL**: No user story work starts until this phase is complete.

### Tests (write first, must fail)

- [X] T010 [P] Unit tests for AES-256-GCM seal/open in `tests/unit/crypto.test.ts`: round-trip; a fresh 12-byte nonce per call; tampered ciphertext or authTag throws; envelope contains `{keyVersion, nonce, ciphertext, authTag}`; wrong key fails
- [X] T011 [P] Unit tests for config parsing in `tests/unit/config.test.ts`: startup fails with a clear message when `STAPLR_MASTER_KEY` is missing or does not base64-decode to exactly 32 bytes; `PUBLIC_URL` must be `https://…`, `http://localhost…` or `http://127.0.0.1…`, and any other `http://` URL fails startup with a message that HTTPS is required unless `STAPLR_ALLOW_INSECURE_HTTP=1`; the derived `cookieSecure` is true if and only if `PUBLIC_URL` starts with `https://`
- [X] T012 [P] Unit tests for log redaction in `tests/unit/logger.test.ts`: values under `token`, `password`, `credential*`, `cookie`, `authorization`, `headers.cookie`, `headers.authorization`, `apiKey`, `api_key`, nested variants and `headers.x-api-key` are replaced with `[REDACTED]`
- [X] T013 [P] Integration tests for auth in `tests/integration/auth.test.ts`: `POST /api/setup` creates the user once and then returns 409; username "3–64 chars", password min 12; sign-in sets the `staplr_session` cookie with `HttpOnly` and `SameSite=Strict`, and with `Secure` if and only if `PUBLIC_URL` is https (checked with an https URL and with `http://localhost`); wrong password returns 401; session idle timeout 12 h and absolute 7 d (fake clock); state-changing request with a foreign `Origin` returns 403; the session id is stored only as a SHA-256 hash
- [X] T014 [P] Contract test harness in `tests/contract/harness.ts` that loads `specs/001-agent-team-orchestration/contracts/openapi.yaml` (via `yaml`) and validates a Fastify `inject` response (status + body) against the declared schema with `ajv`, registering the formats `date-time`, `date` and `uri` itself with `ajv.addFormat` (no `ajv-formats` package)
- [X] T015 [P] Route-coverage contract test in `tests/contract/auth-coverage.test.ts`: enumerate every registered API route and assert 401 without a session, except `GET /api/setup/status`, `POST /api/setup`, and `POST /api/session`; also assert the static app shell (HTML and JS bundle) is served without a session and contains no user data (FR-042)
- [X] T016 [P] Docker hardening test in `tests/docker/docker-hardening.test.ts`: containers created via the wrapper run as non-root, `CapDrop: ["ALL"]`, `SecurityOpt: ["no-new-privileges"]`, read-only root filesystem with `/home/agent` and `/tmp` mounted as tmpfs (`rw,nosuid,size=64m`), `Memory` 512 MiB, `NanoCpus` 1 CPU, `PidsLimit` 256, no host binds, label `staplr.managed=true`
- [X] T017 [P] Docker proxy permission test in `tests/docker/docker-proxy-permissions.test.ts`, run against the compose `docker-proxy` service: `createHardenedContainer` can create, start, exec with a TTY, read logs, stop, kill, and remove a container and inspect a sandbox image; requests the proxy must refuse (`POST /volumes/create`, `POST /build`, `GET /swarm`) return 403 (research R11)
- [X] T018 [P] Git wrapper integration test in `tests/integration/git.test.ts` using a temporary local bare repository: clone with a token passes the token only through an in-memory askpass mechanism; after clone, `.git/config` and remote URLs contain no token; `fetch` + fast-forward works; a non-fast-forward is reported as `history_rewritten`
- [X] T019 [P] Health scheduler unit test in `tests/unit/health-scheduler.test.ts` (fake timers): registered checkers run on start, every 60 minutes, and on `runAll()`; a failing checker does not stop the others
- [X] T020 [P] Catalog loader unit test in `tests/unit/catalog.test.ts`: `catalog/models.json` has a non-empty revision and a models array validated against its Zod schema; each entry has `provider` in `claude|codex`, `id`, `label`, `retired` boolean, and `inputPricePerMTok`/`outputPricePerMTok` that are either decimal strings ≥ 0 or `null`; every non-null price has a `priceSource` HTTPS URL and a `pricesAsOf` ISO date (research R9); each provider has exactly one non-retired model with `probeModel: true`
- [X] T021 [P] Audit unit test in `tests/unit/audit.test.ts`: `recordAudit()` rejects any `detail` containing keys `token`, `password`, `credential`, `secret`, `apiKey`, `api_key`, `x-api-key` (case-insensitive, nested); entries are append-only (no update/delete exported)
- [X] T022 [P] Diagnostics integration test in `tests/integration/diagnostics.test.ts`: an unhandled error thrown in a test-only route returns a Problem response and creates one `error_event` with `requestId`, `route`, `message`, and a stack with secrets redacted; `GET /api/error-events` returns newest first, at most 200, and 401 without a session
- [X] T023 [P] E2E test for first-run setup and sign-in in `tests/e2e/auth.spec.ts`: setup screen shown only while no user exists; field-level validation messages; sign in; sign out returns to sign-in; axe check on both screens
- [X] T024 [P] E2E test for the Audit page in `tests/e2e/audit.spec.ts`: empty state on a fresh install; after adding and removing a seeded connection the page lists `scc.added` and `scc.removed` newest first with target name and time and no secret values; axe check (FR-041)
- [X] T025 [P] Migration reversibility test in `tests/integration/migrations.test.ts`: on a temp SQLite file apply every migration up in order, then every `down` script in reverse order (only the migration journal remains), then up again; the schema dump after the second up equals the dump after the first up (Constitution: reversible migrations)

### Cross-cutting tests (define now; add and run each story slice before its behavior)

- [X] T143 [P] Define incremental secret tests in `tests/integration/no-plaintext-secrets.test.ts`: add applicable assertions before each credential-handling implementation, using known GitHub token/Claude key/Codex secret fixtures. Assert no plaintext outside sealed DB columns, in API responses/logs/error/audit/non-DB data files/git configs. Run full flow again in Polish (SC-004).
- [X] T144 [P] Define incremental health/readiness tests in `tests/integration/health-readiness.test.ts` before each checker/readiness behavior: auth rejection, model denial, transient errors, credential/catalog invalidation and propagation in same read cycle. Fake-clock hourly worst-case authentication-failure visibility below 70 minutes; final combined rerun in Polish (SC-006).
- [X] T145 [P] Define `tests/e2e/a11y-responsive.spec.ts` and add each screen case before its UI implementation: axe, full keyboard/focus, both themes, 320px no horizontal scroll; final complete sweep in Polish. Include model-access checks and API-key dialogs.
- [X] T146 [P] Define `tests/e2e/screen-states.spec.ts`: before implementing each screen add loading/empty/error/success assertions, specific recovery text and working Retry for retryable errors using fixtures/interception. Include auth, provider/API-key, souls, agents, projects/board, prices, Audit and Diagnostics; rerun all in Polish.
- [X] T147 [P] Define performance fixtures/tests in `tests/integration/perf.test.ts`; before picker/list implementations assert repository search over 1,000 repos under 300ms and lists with 100 agents/50 projects under 500ms on documented 2-vCPU host; final rerun in Polish.
- [X] T148 [P] Define incremental outbound tests in `tests/integration/egress.test.ts` before each external integration: the Staplr process may reach GitHub API, configured GitLab baseUrl, api.anthropic.com for owner-key checks, or Docker proxy only. Separately verify sandbox network behavior in Docker tests; no telemetry or other third-party destination. All retained personal data stays local except allowed provider/platform requests (FR-043); final full flow rerun in Polish.

### Implementation

- [X] T026 [P] Implement `src/server/lib/crypto.ts` (`seal(plaintext: Buffer): SealedEnvelope`, `open(env): Buffer`, AES-256-GCM via `node:crypto`, `keyVersion: 1`) to pass T010
- [X] T027 [P] Implement `src/server/config.ts` parsing env with Zod (`STAPLR_MASTER_KEY` 32 bytes base64, `SESSION_SECRET`, `DATA_DIR`, `PORT`, `PUBLIC_URL`, `STAPLR_ALLOW_INSECURE_HTTP`, `DOCKER_HOST`, `STAPLR_TEST_MODE`, `SANDBOX_IDLE_MS` default 900000) and the derived `cookieSecure`, to pass T011
- [X] T028 [P] Implement `src/server/lib/logger.ts` (pino JSON, request-id mixin, redaction list from T012) to pass T012
- [X] T029 [P] Create `src/shared/status.ts` with the spec's Status Vocabulary as const enums: source control `connected|needs_attention` + reasons `invalid|expired|revoked|missing_permission`; provider `connected|needs_relogin`; agent/project readiness `ready|not_ready` + reason codes `needs_relogin|no_provider_connection|model_unavailable|download_failed|repository_unavailable|base_branch_missing|source_control_needs_attention|no_project_manager|agent_not_ready`; download `downloading|downloaded|download_failed`; ticket `new|review|testing|end` with labels `New|Review|Testing|End` in that fixed order
- [X] T030 [P] Create `src/shared/schemas/common.ts` with the `Problem` schema (`code`, `message`, optional `details`) and an `ErrorCode` union of every code named in `contracts/openapi.yaml`
- [X] T031 Create the Drizzle setup: `drizzle.config.ts`, `src/server/db/client.ts` (better-sqlite3 at `${DATA_DIR}/staplr.db`, `journal_mode=WAL`, `foreign_keys=ON`), `src/server/db/ids.ts` (`newId()` = `crypto.randomUUID()`), and `src/server/db/migrate.ts` exposing `migrateUp()` and `migrateDown(toVersion)` (used by T025 and applied on startup); every migration `src/server/db/migrations/<n>_<name>.sql` has a hand-written `<n>_<name>.down.sql` because drizzle-kit does not generate them
- [X] T032 Add tables `user` (`username` "3–64 chars, unique", `passwordHash` Argon2id, at most one row), `session` (id stored as SHA-256 hash, `expiresAt`, `lastSeenAt`), `audit_entry`, and `error_event` (`id, at, requestId, route, message, stack (redacted)`) per data-model.md to `src/server/db/schema.ts` and generate migration `0001_core` with `0001_core.down.sql`; T025 must now pass
- [X] T033 Implement `src/server/app.ts`: Fastify with Zod type provider, request id per request, `@fastify/cookie`, global error handler that returns `application/problem+json` and writes unhandled errors to `error_event` through the logger's redaction, and an `Origin` check for POST/PUT/PATCH/DELETE
- [X] T034 Implement auth in `src/server/modules/auth/service.ts`, `src/server/modules/auth/routes.ts` (`/api/setup/status`, `/api/setup`, `/api/session` GET/POST/DELETE) and `src/server/modules/auth/hook.ts` (global `onRequest` hook enforcing a session on every API route except the allowlist in T015; session cookie `Secure` from `config.cookieSecure`) to pass T013 and T015
- [X] T035 [P] Implement `src/server/modules/audit/service.ts` (`recordAudit`) and `src/server/modules/audit/routes.ts` (`GET /api/audit-entries`, newest first, `before` cursor) to pass T021
- [X] T036 [P] Implement `src/server/modules/diagnostics/routes.ts` (`GET /api/error-events`, newest first, 200 max) to pass T022
- [X] T037 [P] Implement `src/server/lib/docker.ts` (dockerode client from `DOCKER_HOST`; `createHardenedContainer(opts)` applying every setting in T016 including the tmpfs mounts; `execStream(containerId, cmd, {stdin?})` that streams exec stdout and stdin without the archive API (research R5); `removeQuietly(id)`; `cleanupOrphans(label)`) to pass T016 and T017
- [X] T038 [P] Implement `src/server/lib/git.ts` (simple-git with an askpass script that reads the token from a per-command environment variable; `clone`, `fetchAndFastForward`, `listRemoteBranches`; no next-feature worktree stub) to pass T018
- [X] T039 [P] Implement `src/server/modules/health/scheduler.ts` (`registerChecker(name, fn)`, `start()`, `runAll()`, 60-minute interval) to pass T019
- [X] T040 [P] Create `catalog/models.json` and `src/server/modules/prices/catalog.ts` (Zod-validated `{revision, models}` loader, `catalogRevision()`, `listModels(provider)` excluding retired, `probeModel(provider)`) to pass T020. Data rule (research R9): list the Claude and Codex model IDs the pinned CLIs accept, mark one `probeModel` per provider; fill in a price ONLY when copied from the provider's public pricing page, recording that page as `priceSource` and the copy date as `pricesAsOf`; otherwise set both prices to `null` (shown as "Unknown"). Never estimate or recall a price from memory
- [X] T041 Implement `src/server/main.ts` bootstrap: load config (stopping with a clear message on an insecure non-localhost `PUBLIC_URL`, per T011), run migrations, create `src/server/lib/startup.ts` (`registerStartupTask(name, fn)`, `runStartupTasks()`) and run every registered startup task after migrations and before listening, build app, register module routes, serve `dist/web` via `@fastify/static` with SPA fallback, start the health scheduler, and call `cleanupOrphans("staplr.sandbox")`
- [X] T042 [P] Create design tokens in `src/web/styles/tokens.css` (color, spacing, type scale; light and dark themes; WCAG AA contrast for text and focus ring) and Tailwind 4 setup in `src/web/styles/app.css`
- [X] T043 [P] Create design-system components in `src/web/components/ui/`: `Button.tsx`, `TextField.tsx`, `TextArea.tsx` (with character counter), `Select.tsx`, `Combobox.tsx`, `Dialog.tsx`, `ConfirmDialog.tsx`, `DropdownMenu.tsx`, `StatusBadge.tsx` (renders every status in `src/shared/status.ts` with text, not color alone), `DataState.tsx` (loading/empty/error with a Retry action, used by every screen), `Toast.tsx`, `LiveRegion.tsx` (polite ARIA announcements), all built on Radix primitives with visible focus
- [X] T044 Create the web shell: `src/web/main.tsx` (TanStack Query client, router), `src/web/lib/api.ts` (fetch wrapper that parses Problem errors and redirects to sign-in on 401), `src/web/routes/__root.tsx` (AppShell with skip link, nav to Settings, Providers, Souls, Agents, Projects, Model Prices, Audit, Diagnostics; shows the insecure-HTTP banner when the server reports `STAPLR_ALLOW_INSECURE_HTTP=1`; responsive from 320 px)
- [X] T045 Create `src/web/routes/setup.tsx` and `src/web/routes/sign-in.tsx` (first-run setup shown only when `needsSetup`; validation messages tied to fields) to pass T023
- [X] T046 [P] Create `src/web/routes/audit.tsx` (Audit page listing entries with action, target, time; `DataState` for loading/empty/error; "Load older" using the `before` cursor) to pass T024

**Checkpoint**: Foundation ready. Signing in works, every route is protected, errors are captured
locally, migrations are reversible, and secrets tooling exists.

---

## Phase 3: User Story 1 - Connect a Source Control Account (Priority: P1) 🎯 MVP

**Goal**: Add, validate, mask, replace, delete, and health-check GitHub/GitLab tokens.

**Independent Test**: Add a valid GitHub and GitLab token → both "Connected" with account names; a
token without push or pull-request permission is rejected naming the missing permissions; only
`…last4` is ever shown; "Check now" on a revoked token shows "Needs attention: revoked"; "Check all
connections" re-checks every connection.

### Tests for User Story 1 (write first, must fail) ⚠️

- [X] T047 [P] [US1] Create the fake GitHub/GitLab HTTP server used by tests in `tests/fakes/platform-fake.ts` (tokens configurable as valid/limited/revoked; implements the endpoints the adapters call; the app points at it only when `STAPLR_TEST_MODE=1` sets the base URL override)
- [X] T048 [P] [US1] Adapter unit tests with msw in `tests/unit/source-control-adapters.test.ts`: GitHub classic token scopes from `X-OAuth-Scopes` (`repo` required); GitHub fine-grained token permission probe (contents read, contents write, pull requests write); GitLab `GET /api/v4/personal_access_tokens/self` requiring `api` scope; 401 maps to `invalid`, expired maps to `expired`
- [X] T049 [P] [US1] Contract tests in `tests/contract/source-control.contract.test.ts` for `GET/POST /api/source-control-connections`, `PATCH/DELETE /api/source-control-connections/{id}`, `POST .../{id}/check`, `POST /api/health/check-all` (responses match openapi.yaml and never contain a `token` field)
- [X] T050 [P] [US1] Integration tests in `tests/integration/source-control.test.ts`: create stores the sealed token and returns `tokenLast4`; a missing permission returns 422 `token_missing_permissions` with `details.missingPermissions` and no row stored; `name` "1–80 chars, unique"; GitLab `baseUrl` must be HTTPS; PATCH with a new token re-validates and writes audit `scc.replaced`; DELETE writes `scc.removed`; Check now on a revoked token sets `needs_attention`/`revoked` and `lastCheckedAt`; `check-all` returns 202 and updates every connection
- [X] T051 [P] [US1] E2E test in `tests/e2e/us1-source-control.spec.ts` against the fake server (T047): add GitHub connection, reject an insufficient token, see a masked token, Check now, "Check all connections", delete; axe check on Global Settings at desktop and 320 px

### Implementation for User Story 1

- [X] T052 [US1] Add table `source_control_connection` to `src/server/db/schema.ts` with fields per data-model.md (`name` "1–80 chars, unique"; `platform` `github|gitlab`; `baseUrl`; `accountName`; `grantedPermissions` json; `tokenSealed` blob; `tokenLast4`; `status` `connected|needs_attention`; `statusReason`; `missingPermissions` json; `lastCheckedAt`; `lastCheckResult`) and generate migration `0002_source_control` with `0002_source_control.down.sql`
- [X] T053 [P] [US1] Create Zod schemas in `src/shared/schemas/source-control.ts` (`SourceControlConnectionCreate`, `SourceControlConnectionUpdate`, `SourceControlConnection` response without any token field)
- [X] T054 [P] [US1] Define the adapter interface `verifyToken(token) → {accountName, grantedPermissions, missingPermissions, failure?}` in `src/server/modules/source-control/adapters/types.ts`, with required permissions `read_contents`, `push`, `create_pull_request`
- [X] T055 [P] [US1] Implement the GitHub adapter `verifyToken` in `src/server/modules/source-control/adapters/github.ts` using `@octokit/rest` (base URL `https://api.github.com`, overridable only in test mode) to pass T048
- [X] T056 [P] [US1] Implement the GitLab adapter `verifyToken` in `src/server/modules/source-control/adapters/gitlab.ts` using `@gitbeaker/rest` against the connection's `baseUrl` (default `https://gitlab.com`) to pass T048
- [X] T057 [US1] Implement `src/server/modules/source-control/service.ts`: `create` (validate first, store nothing on failure, `seal(token)`, `tokenLast4`, audit `scc.added`), `update` (rename and/or replace token, audit `scc.replaced`), `remove` (audit `scc.removed`; projects that used the connection are cleared by the `ON DELETE SET NULL` foreign key added in T106, so no project code lives here), `check(id)`, `decryptTokenForUse(id)` (internal only)
- [X] T058 [US1] Implement routes in `src/server/modules/source-control/routes.ts` per openapi.yaml, plus `src/server/modules/health/routes.ts` (`POST /api/health/check-all` → 202, runs `scheduler.runAll()`), to pass T049 and T050
- [X] T059 [US1] Register the source control health checker in `src/server/modules/health/checkers/source-control.ts` (re-verify each token; update `status`, `statusReason`, `missingPermissions`, `lastCheckedAt`, `lastCheckResult`)
- [X] T060 [P] [US1] Create the Global Settings screen `src/web/routes/settings/source-control.tsx` with a page-level "Check all connections" button (FR-013), `src/web/features/source-control/ConnectionCard.tsx` (name, platform, account, `…last4`, StatusBadge with reason, last checked, Check now, Replace token, Delete with ConfirmDialog) and `AddConnectionDialog.tsx` (platform select, GitLab address field, token field with `type=password`, server errors shown next to fields, missing permissions listed); uses `DataState` for loading/empty/error; to pass T051

**Checkpoint**: US1 works on its own.

---

## Phase 4: User Story 2 - Connect Providers with API Key or Sandbox Login (Priority: P1) 🎯 MVP

**Goal**: Save and replace a verified owner-provided Claude API key; use isolated Codex
sandbox login and encrypted bundle reuse; detect authentication failure and disconnect safely.

**Independent Test**: Add Claude with a valid API key, reject an invalid replacement while
retaining the previous key; restart and reuse both providers. Complete Codex sandbox login
with the stub CLI, then verify timeout/cancellation/recovery. No Claude OAuth file is captured.

### Tests for User Story 2 (write first, must fail) ⚠️

- [X] T061 [P] [US2] Create `docker/sandbox/stub.Dockerfile` for Codex only: prints a fake login URL, waits for OK, writes a fake Codex auth.json with configurable expiry, and exposes deterministic auth-status/exact-model probe commands. Add a Claude Models API fake in `tests/fakes/anthropic-fake.ts` with paginated key-specific access, auth rejection, rate-limit and outage fixtures.
- [X] T062 [P] [US2] Unit tests in `tests/unit/credential-bundle.test.ts`: Codex-only exec-tar bundle seals/restores byte-for-byte, absent auth.json gives login_not_complete, no plaintext host write; attempts to extract Claude subscription files are rejected. Claude API keys seal/open through the existing crypto module, never through a CLI bundle.
- [X] T063 [P] [US2] Docker tests in `tests/docker/sandbox-lifecycle.test.ts`: Codex-only hardened login, complete-before-auth 409, complete-after-auth creates connection and destroys container, tmpfs credentials restored through exec-tar, cancellation/idle timeout/concurrent logins/re-login. Re-login preserves ID and increments credentialRevision; failed re-login keeps prior bundle; provider=claude returns 422 before container creation.
- [X] T064 [P] [US2] Restart-recovery test in `tests/integration/sandbox-recovery.test.ts`: with a session row `in_progress` and a leftover container labeled `staplr.sandbox`, running the startup tasks makes the session `failed` with `failureReason = "Staplr restarted"`, removes the container, and saves nothing
- [X] T065 [P] [US2] WebSocket tests in `tests/integration/sandbox-terminal-ws.test.ts` per `contracts/sandbox-terminal.md`: upgrade without a session closes with `4401`; a second socket closes with `4409`; invalid message closes with an `error`; a frame over 64 KiB is rejected; `input` resets the idle deadline; terminal output never appears in captured logs
- [X] T066 [P] [US2] Contract tests in `tests/contract/providers.contract.test.ts` for GET/POST /api/provider-connections, PATCH/DELETE /{id}, PUT /{id}/api-key, GET /{id}/impact, POST /{id}/check, POST /{id}/models/{model}/check, and Codex sandbox endpoints. Responses strictly exclude all credential values; reject unknown input fields, invalid provider/authType combinations and unauthenticated requests.
- [X] T067 [P] [US2] Integration tests in `tests/integration/providers.test.ts`: valid Claude key is verified through all Models API pages then sealed; invalid/transient create saves nothing; failed replacement preserves old key; successful replacement keeps ID, increments revision and invalidates access; concurrent names are unique per provider. Test exact-model pair isolation, initial unknown state and current-revision evidence before T079. Codex expiry/auth failure sets needs_relogin; model denial does not; network/rate-limit/service failure preserves confirmed status with retry metadata. Disconnect removes secrets and access rows; audit added/replaced/relogged/removed; impact uses registered sources.
- [X] T068 [P] [US2] E2E `tests/e2e/us2-provider-connection.spec.ts`: add Claude key with direct API-billing disclosure, see Connected with no key echoed; invalid replacement keeps prior connection; restart reuses it. Codex terminal login/complete/cancel and re-login; Claude fix is Replace API key, Codex fix is Re-login; disconnect impact confirmation; axe and loading/error/success states.
- [X] T069 [P] [US2] Docker performance test in `tests/docker/perf.test.ts` (plan Performance Goals): the sandbox terminal emits its first output within 10 s of `POST /api/sandbox-sessions`; `runAll()` over 20 connections (10 stub provider + 10 fake source control) completes within 60 s
- [X] T070 [P] [US2] Longevity tests (implemented in `tests/integration/sandbox-sessions.test.ts`, 720-hour case, plus `tests/integration/providers.test.ts`): fake-clock 720 hourly checks reuse a valid Claude key and Codex credential without re-entry; authentication revoked on day 12 becomes needs_relogin; transient failure does not. Fixtures establish orchestration behavior, not actual 30-day provider validity.

### Implementation for User Story 2

- [X] T071 [P] [US2] Build the pinned unmodified Codex login image in `docker/sandbox/codex.Dockerfile`, plus `scripts/build-sandbox-images.mjs` for Codex and test stub images. Codex includes tar and file credential configuration. Claude key validation uses the Models HTTP API; do not build a speculative Claude agent runtime or collect Claude subscription credentials. In `docker/sandbox/README.md`, record official-source review, pinned versions, verified Codex paths/login/status/exact-model flags and real Codex image-limit results. Verify no silent model fallback; update hardening limits with tests first if needed. Do not claim live auth tests passed without credentials.
- [X] T072 [P] [US2] Provider definitions (implemented as `src/server/modules/sandbox/profiles.ts` for Codex and `src/server/modules/providers/anthropic.ts` for Claude; no separate definitions.ts): Claude uses api_key with official Models API discovery (no CLI runtime in this setup feature); Codex uses codex_login, device login, auth.json path, status and exact-model probe commands. Instructions explain direct Claude API billing and Codex device-code setup. No Claude subscription file paths or setup-token fallback.
- [X] T073 [US2] Add provider_connection per data-model.md: provider/authType, mutually exclusive apiKeySealed or credentialBundleSealed, credentialRevision, expiry/status/check metadata; sandbox_login_session restricted to codex; model_access keyed by connection+model with revision-bound availability/check metadata and ON DELETE CASCADE. Generate reversible migration `0003_providers`; enforce provider/authType/secret-column invariants and no stored account identity.
- [X] T074 [P] [US2] Create Zod schemas in `src/shared/schemas/providers.ts` and `src/shared/schemas/sandbox.ts` (session request/response, WebSocket messages: `input` ≤ 4096 chars, `resize` cols 20–500 rows 5–200, `ping`; server messages `output`, `status`, `expiresAt`, `error`)
- [X] T075 [US2] Implement `src/server/modules/providers/credential-bundle.ts` for Codex auth.json only using in-memory exec-tar and seal; restore to hardened tmpfs container and extract refreshed bundles. Explicitly reject Claude paths. Claude API keys use `crypto.ts` directly; no Claude subscription file is read. Pass T062.
- [X] T076 [US2] Implement `src/server/modules/sandbox/service.ts` for provider=codex only: validate name/reloginOf, hardened login, complete verifies auth and seals bundle, cancel/idle/final cleanup and restart recovery. Atomic successful re-login keeps ID, increments revision and invalidates access results; failures retain old bundle. Write added/relogged audit; pass T063/T064/T069.
- [X] T077 [US2] Implement the terminal bridge `src/server/modules/sandbox/terminal.ts` with `@fastify/websocket`: session-cookie and Origin check before upgrade; docker exec TTY attach; 64 KiB frame limit and 16 KiB/s input rate limit; close codes `1000/4401/4404/4408/4409/4500`; no logging of TTY data; to pass T065
- [X] T078 [US2] Implement provider service/routes: create Claude api_key connection via full paginated authenticated Models API validation, PUT /{id}/api-key with atomic validated replacement and credential revision invalidation, list/rename/impact/disconnect, Codex sandbox routes. Strict Zod schemas and secret-free responses; do not return/log keys. Implement `impact.ts` registry for later agent/project sources. Add audit provider.replaced; pass T066/T067.
- [X] T079 [US2] Implement provider health and model access in `src/server/modules/health/checkers/provider.ts` and `src/server/modules/providers/model-access.ts`: Claude complete authenticated model discovery; Codex temporary hardened container with status and exact-assigned-model probes, persisting refreshed bundle. Startup/hourly/Check now plus individual model checks deduplicate pairs; no silent fallback. Distinguish auth rejection, model denial and transient errors per R19; bounded concurrency/deadlines satisfy T069. Store availability by current credential/catalog revisions; pass T067/T070.
- [X] T080 [P] [US2] Create Provider Connections screen and `ApiKeyDialog.tsx`: Claude owner-key create/replace with password field, direct API-billing explanation and secret-free success; Codex sandbox page only with accessible xterm/countdown/complete/cancel. Cards show authType, last check/error, Check now/Check all, Retry, Replace API key or Re-login, Rename and impact-aware Disconnect. Pass T068; unknown model checks explain possible Codex subscription usage.

**Checkpoint**: US1 and US2 work independently.

---

## Phase 5: User Story 3 - Create Agent Roles (Souls) (Priority: P2)

**Goal**: A soul library with four read-only defaults, plus custom souls created from scratch or
copied.

**Independent Test**: The four defaults exist; create a "Security Reviewer" (Project Manager not
offered); copy Developer → editable copy with role Developer; editing a default is refused.

### Tests for User Story 3 (write first, must fail) ⚠️

- [X] T081 [P] [US3] Contract tests in `tests/contract/souls.contract.test.ts` for `/api/souls`, `/api/souls/{id}`, `/api/souls/{id}/copy`
- [X] T082 [P] [US3] Integration tests in `tests/integration/souls.test.ts`: the four defaults are seeded with `isDefault=true`; creating from scratch with `roleType=project_manager` returns 422; PUT or DELETE on a default returns 403; copy keeps `roleType` and sets `copiedFromId`; `name` "1–80 chars, unique", `description` "≤ 500 chars", `instructions` "≤ 20,000 chars"; `roleType` cannot change on edit
- [X] T083 [P] [US3] E2E test in `tests/e2e/us3-souls.spec.ts`: view defaults, create custom, copy Developer and edit; when agents use a soul, show the affected agents before saving; axe check

### Implementation for User Story 3

- [X] T084 [P] [US3] Write default soul content in `src/server/modules/souls/defaults/project-manager.md`, `business-analyst.md` (analyzes tickets, asks the user clarifying questions, writes the spec/design), `developer.md`, `qa.md`
- [X] T085 [US3] Add table `soul` (`name` "1–80 chars, unique"; `roleType` `project_manager|business_analyst|developer|qa|custom`; `description` "≤ 500 chars"; `instructions` "≤ 20,000 chars (markdown)"; `isDefault`; `copiedFromId`) to `src/server/db/schema.ts` and migration `0004_souls` that seeds the four defaults from T084, with `0004_souls.down.sql`
- [X] T086 [P] [US3] Create Zod schemas in `src/shared/schemas/souls.ts` (`SoulInput`; a from-scratch create schema whose `roleType` excludes `project_manager`)
- [X] T087 [US3] Implement `src/server/modules/souls/service.ts` (create, update custom only, copy, delete custom only; the in-use guard is added in T095) and routes in `src/server/modules/souls/routes.ts` to pass T081 and T082
- [X] T088 [P] [US3] Create the Souls screens `src/web/routes/souls/index.tsx` (library list grouped by role, default badge, Copy, Edit, Delete; `DataState` for loading/empty/error) and `src/web/routes/souls/$soulId.tsx` (editor; defaults shown read-only with a "Copy to customize" action; role picker without Project Manager for new souls; show usedByAgents before editing a used soul) to pass T083

**Checkpoint**: US3 works on its own.

---

## Phase 6: User Story 4 - Configure Agents with Provider and Model (Priority: P2)

**Goal**: Agents that combine a soul, a provider connection, and a catalog model, with readiness.

**Depends on**: US2 (provider connections) and US3 (souls) for real data. Tests may seed rows
directly.

**Independent Test**: Create a Developer agent on Claude and a QA agent on Codex; only that
provider's models are offered; disconnecting the provider shows "Not ready: no provider
connection" and the impact list names the agent.

**Note**: Spec Story 4 scenario 6 (deleting an agent on a project team is blocked) needs project
teams, so it is implemented in T114 and verified at the **US5 checkpoint** by T104. Until then,
deleting an agent is always allowed.

### Tests for User Story 4 (write first, must fail) ⚠️

- [X] T089 [P] [US4] Unit tests in `tests/unit/agent-readiness.test.ts`: reasons `no_provider_connection` (null connection), `needs_relogin` (connection status), `model_unavailable` (retired or unknown model); multiple reasons accumulate; otherwise `ready`
- [X] T090 [P] [US4] Contract tests in `tests/contract/agents.contract.test.ts` for `/api/models`, `/api/agents`, `/api/agents/{id}`
- [X] T091 [P] [US4] Integration tests in `tests/integration/agents.test.ts`: unique names, provider/connection match, only non-retired catalog models with available access for current credential/catalog revisions can be assigned; unknown/denied gives 422. GET /api/models?providerConnectionId returns disabled unknown candidates and freshness. A model allowed on one connection but denied on another stays isolated; no fallback. Re-login/key/catalog change invalidates evidence; transient errors preserve current confirmed access. Include soul-in-use and disconnect impact/nullable link checks.
- [X] T092 [P] [US4] E2E test in `tests/e2e/us4-agents.spec.ts`: create agents for both providers, see readiness, change model, offer Claude API-key entry or Codex sandbox login when the selected provider has no connection, axe check

### Implementation for User Story 4

- [X] T093 [US4] Add table `agent` (`name` "1–80 chars, unique"; `soulId` FK; `provider`; `providerConnectionId` FK nullable with `ON DELETE SET NULL`; `model`) to `src/server/db/schema.ts` and migration `0005_agents` with `0005_agents.down.sql`
- [X] T094 [P] [US4] Create Zod schemas in `src/shared/schemas/agents.ts` (`AgentInput`, `Agent` with `role`, `readiness`, `reasons`, `projects`)
- [X] T095 [US4] Add the in-use deletion guard to `src/server/modules/souls/service.ts` (409 `soul_in_use` with `details.agents`, FR-019)
- [X] T096 [US4] Implement agents/readiness.ts and service/routes: model validation requires current available model_access for selected connection; unknown/denied/retired gives model_unavailable with precise fix action, missing connection/auth failure have separate reasons. GET /api/models?providerConnectionId returns ModelAccess candidates plus catalogRevision per contract. Recompute readiness on read; tests T089–T091. PM/team guards arrive in T114.
- [X] T097 [US4] Implement `src/server/modules/agents/impact.ts`: register an impact source with `registerImpactSource` (T078) that returns the agents (id, name) using a provider connection, so the impact endpoint lists them; to pass the agent part of T091
- [X] T098 [P] [US4] Create the Agents screens `src/web/routes/agents/index.tsx` (table/cards: name, role, provider, model, StatusBadge with reasons, projects; `DataState` for loading/empty/error) and `src/web/routes/agents/$agentId.tsx` (form: name, soul select, provider select, connection select filtered by provider with a "Connect provider" shortcut, model select from `/api/models?providerConnectionId=…` with unknown candidates disabled, freshness and Check availability action) to pass T092

**Checkpoint**: US4 works with US2 and US3 data.

---

## Phase 7: User Story 5 - Assemble a Project Team (Priority: P3)

**Goal**: Pick a repository, download it, set the base branch, refresh, relink, build a team with
exactly one Project Manager, compute readiness, and delete projects.

**Depends on**: US1 (connections) and US4 (agents).

**Independent Test**: Add a project from the repository picker → "Downloaded"; assign PM, BA, Dev
and QA → "Ready"; removing the PM makes it "Not ready: no Project Manager"; a second PM is blocked;
deleting the source control connection makes the project "Not ready"; deleting an agent on the team
is blocked (also closes Story 4 scenario 6); a restart during a download leaves it "Download
failed: interrupted".

### Tests for User Story 5 (write first, must fail) ⚠️

- [X] T099 [P] [US5] Adapter unit tests in `tests/unit/repository-listing.test.ts` (msw): GitHub `GET /user/repos` paginated and filtered to `permissions.push=true`; GitLab `GET /projects?membership=true&min_access_level=30`; branch listing; server-side search by `q`
- [X] T100 [P] [US5] Unit tests in `tests/unit/project-readiness.test.ts`: every reason (`download_failed`, `repository_unavailable`, `base_branch_missing`, `source_control_needs_attention`, `no_project_manager`, `agent_not_ready:<id>`) and all-clear gives `ready`; a `null` `sourceControlConnectionId` (connection removed) gives `source_control_needs_attention` with the message "connection removed"
- [X] T101 [P] [US5] Contract tests in `tests/contract/projects.contract.test.ts` for all `/api/projects*` paths except board and tickets, and `/api/source-control-connections/{id}/repositories*`
- [X] T102 [P] [US5] Integration tests in `tests/integration/projects.test.ts` using local bare repositories via a fake adapter: create returns 202 `downloading` then `downloaded` with `baseBranch` = default branch; a clone failure gives `download_failed` and retry works; when free disk space at `DATA_DIR` is below 1 GiB the download fails with reason "insufficient disk space" before cloning; refresh fast-forwards and updates `lastUpdatedAt`; a rewritten remote returns 409 and keeps the local copy and `lastRefreshError`; base branch change to a non-existent branch returns 422; relink to another repository via `PATCH {relink}` re-downloads and clears `repository_unavailable`; deleting the source control connection (T057) clears `sourceControlConnectionId` and the project becomes Not ready: `source_control_needs_attention`; the provider impact endpoint lists the projects reached through its agents; delete removes `${DATA_DIR}/repos/<id>/` and team assignments, keeps agents, sets `deletedAt`, hides the project from the list, and keeps `usage_record` rows attributable
- [X] T103 [P] [US5] Restart-recovery test in `tests/integration/download-recovery.test.ts`: with a project `downloading` and a partial `base` directory, running the startup tasks makes it `download_failed` with `downloadError = "interrupted"`, removes the partial directory, and a retry clones it successfully
- [X] T104 [P] [US5] Integration tests in `tests/integration/teams.test.ts`: assigning a second PM returns 409 `pm_already_assigned`; `replace-project-manager` swaps in one step; `finalize-team` without a PM returns 422 `no_project_manager`; `missingRoleWarnings` lists absent BA, developer, and QA; one agent on two projects; deleting an agent on a team returns 409 `agent_in_use` with `details.projects` (Story 4 scenario 6); changing an agent's soul so that a project would have 0 or 2 PMs returns 409 `pm_rule_violation`
- [X] T105 [P] [US5] E2E test in `tests/e2e/us5-projects.spec.ts`: add project via connection → repository combobox search → confirm; see progress then Downloaded; build the team; PM-required block; second-PM block with replace; Refresh; change base branch; "Relink repository" after the fake repository is renamed; delete with a confirmation stating what is removed and kept; axe checks at desktop and 320 px

### Implementation for User Story 5

- [X] T106 [US5] Add tables `project` (`name` "1–80 chars"; `sourceControlConnectionId` nullable FK with `ON DELETE SET NULL`; `repoFullName`; `repoRemoteId`; `baseBranch`; `downloadStatus` `downloading|downloaded|download_failed`; `downloadError`; `lastUpdatedAt`; `lastRefreshError`; `deletedAt`; no stored readiness column), `team_assignment` (composite PK `projectId`+`agentId`, `assignedAt`), and `usage_record` (append-only, fields per data-model.md including `ticketId` "no FK; the ticket may be deleted later" and `ticketTitle` "snapshot at write time"; nothing writes to it yet) to `src/server/db/schema.ts` and migration `0006_projects` with `0006_projects.down.sql`
- [X] T107 [P] [US5] Create Zod schemas in `src/shared/schemas/projects.ts` (`ProjectCreate`, `ProjectPatch` with `name`/`baseBranch`/`relink`, `Project`, `Team`, `Repository`)
- [X] T108 [US5] Add `listRepositories(q?)`, `getRepository(remoteId)`, `listBranches(remoteId)`, and `cloneUrl(remoteId)` to `src/server/modules/source-control/adapters/github.ts` and `gitlab.ts`, and the repository and branch routes to `src/server/modules/source-control/routes.ts`, to pass T099
- [X] T109 [US5] Implement `src/server/modules/projects/download.ts`: free-disk check (fail with "insufficient disk space" below 1 GiB free at `DATA_DIR`); background clone into `${DATA_DIR}/repos/<projectId>/base` via `src/server/lib/git.ts` with progress parsed from `git --progress` (0–100); status updates; retry; refresh (`fetchAndFastForward`; `history_rewritten` returns 409 and keeps the copy); registers a startup task with `registerStartupTask` that marks `downloading` projects `download_failed` ("interrupted") and removes their partial `base` directory; to pass T103
- [X] T110 [US5] Implement `src/server/modules/projects/readiness.ts` (pure function from T100; `computeProjectReadiness(projectId)` is evaluated when a project is read, with no stored readiness column) to pass T100
- [X] T111 [US5] Implement `src/server/modules/projects/service.ts` (create, get, list excluding deleted, rename, base branch change validated against remote branches, relink that re-downloads, delete removing the repos directory and team assignments and setting `deletedAt`; ticket removal is added in T137) and routes in `src/server/modules/projects/routes.ts` to pass T101 and T102
- [X] T112 [US5] Implement `src/server/modules/projects/team-service.ts` (assign, remove, replace PM, finalize, missing-role warnings, exactly-one-PM rule per FR-033) and team routes to pass T104
- [X] T113 [US5] Register the repository health checker in `src/server/modules/health/checkers/repository.ts` (repository still reachable and base branch exists, giving `repository_unavailable` or `base_branch_missing`)
- [X] T114 [US5] Add guards to `src/server/modules/agents/service.ts`: block deleting an agent with team assignments (409 `agent_in_use`); block a soul change that leaves any of its projects with 0 or 2+ PMs (409 `pm_rule_violation`), to pass T104
- [X] T115 [US5] Implement `src/server/modules/projects/impact.ts`: register an impact source with `registerImpactSource` (T078) that returns the projects (id, name) whose team includes an agent using a provider connection; to pass the projects part of T102
- [X] T116 [P] [US5] Create the Projects list `src/web/routes/projects/index.tsx` (`DataState` for loading/empty/error) and the add wizard `src/web/features/projects/AddProjectWizard.tsx` (step 1 connection select; step 2 accessible repository Combobox with server search and an empty state naming the needed permissions; step 3 confirm)
- [X] T117 [P] [US5] Create the project detail page `src/web/routes/projects/$projectId.tsx` (download progress bar with text percentage, Download failed + Retry, Refresh with last updated, base branch Select, "Relink repository" action opening the repository picker when the reason is `repository_unavailable`, readiness reasons with fix links, Delete ConfirmDialog stating removed vs kept items; `DataState` for loading/error)
- [X] T118 [P] [US5] Create `src/web/features/projects/TeamRoster.tsx` (members with role/provider/model/readiness, Add agent, Remove, Replace Project Manager dialog, missing-role warnings, Finish setup button showing the PM-required error) to pass T105

**Checkpoint**: Projects reach "Ready", the hand-off point for the next feature. Story 4
scenario 6 is now verified.

---

## Phase 8: User Story 6 - Review and Adjust Model Prices (Priority: P3)

**Goal**: Model list prices with history, and the `estimateCost` rule the next feature uses.

**Independent Test**: The price list shows prices (or "Unknown") labeled "List price used for
estimates"; editing a price creates a new current row and closes the old one; estimates use the
price in effect at the run time.

### Tests for User Story 6 (write first, must fail) ⚠️

- [ ] T119 [P] [US6] Unit tests in `tests/unit/estimate-cost.test.ts`: SC-007 exact scaled decimal arithmetic, half-up 6 dp, effective intervals, before/after changes, unknown/null prices or counts never zero. Add integration tests in `tests/integration/catalog-upgrade.test.ts` for catalog-revision reconciliation on startup idempotency, retired/removed IDs invalidating access and immediate computed readiness, and unchanged/revised defaults preserving user overrides and historical intervals.
- [ ] T120 [P] [US6] Integration tests in `tests/integration/prices.test.ts`: startup merge creates `source=default` rows from `catalog/models.json` (copying `priceSource`/`pricesAsOf`, keeping `null` prices as null) without duplicating on restart; `POST /api/model-prices` closes the current row (`effectiveUntil` = now) and inserts a `source=user` row; at most one current row per provider+model; prices must match `^\d+(\.\d{1,6})?$` and be ≥ 0
- [ ] T121 [P] [US6] Contract tests in `tests/contract/prices.contract.test.ts` for `GET/POST /api/model-prices`
- [ ] T122 [P] [US6] E2E test in `tests/e2e/us6-model-prices.spec.ts`: view prices with the estimate label and source/date, edit a price, view history, "Unknown" shown with an "Enter price" action for a model without a price, axe check

### Implementation for User Story 6

- [ ] T123 [US6] Add table `model_price` (`provider`; `model`; `inputPricePerMTok` and `outputPricePerMTok` "decimal text \| null … ≥ 0; null = Unknown" USD per 1M tokens; `priceSource`, `pricesAsOf` nullable; `effectiveFrom`; `effectiveUntil` null = current; `source` `default|user`) to `src/server/db/schema.ts` and generate migration `0007_model_prices` with `0007_model_prices.down.sql`
- [ ] T124 [P] [US6] Implement `src/server/modules/prices/decimal.ts` (scaled-BigInt decimal parse, multiply, and half-up rounding to 6 dp; no floating point)
- [ ] T125 [US6] Implement prices service/estimate per T119/T120, plus startup catalog reconciliation in `src/server/modules/prices/catalog.ts`: validated revision, idempotent merge before readiness, retired/removed models unavailable, stale access invalidated. Preserve user overrides/history; changed current defaults close at reconciliation time, unchanged defaults add no rows. Expose revision to models API. Pass T119/T120 and catalog-upgrade fixtures.
- [ ] T126 [US6] Add `GET/POST /api/model-prices` to `src/server/modules/prices/routes.ts` and call `mergeCatalogOnStartup()` from `src/server/main.ts` to pass T121
- [ ] T127 [P] [US6] Create the Model Prices screen `src/web/routes/model-prices.tsx` (table grouped by provider, every figure labeled "List price used for estimates" with source and date, Edit dialog, expandable history, "Unknown" with an Enter price action; `DataState` for loading/error) to pass T122

**Checkpoint**: US6 passes price and catalog-upgrade acceptance using US5 fixtures.

---

## Phase 9: User Story 7 - Manage Tickets on the Project Kanban Board (Priority: P3)

**Goal**: Every project opens on a Kanban board (New / Review / Testing / End) where the user
creates, edits, deletes, and moves tickets by drag and drop or keyboard. No assignment yet.

**Depends on**: US5 (projects exist).

**Independent Test**: Add a project → its page opens on an empty four-column board; create a
ticket (top of New); move it to Review by drag, to Testing with the keyboard, to End via "Move
to…"; edit; delete; reload keeps everything; 200 tickets load in under 1 s.

### Tests for User Story 7 (write first, must fail) ⚠️

- [ ] T128 [P] [US7] Unit tests in `tests/unit/ticket-ordering.test.ts` against an in-memory SQLite: create places the ticket at `position = 0` in `new` and shifts the others +1; move within a column; move across columns; `toIndex` is clamped to `[0, count(target column)]`; delete closes the gap; after a random sequence of 200 create/move/delete operations positions stay "0-based, contiguous within (`projectId`, `status`)" and unique; `statusChangedAt` changes only when the column changes
- [ ] T129 [P] [US7] Contract tests in `tests/contract/tickets.contract.test.ts` for `GET /api/projects/{id}/board`, `POST /api/projects/{id}/tickets`, `PATCH/DELETE /api/tickets/{id}`, `POST /api/tickets/{id}/move`
- [ ] T130 [P] [US7] Integration tests in `tests/integration/tickets.test.ts`: the board always has exactly 4 columns in the order New, Review, Testing, End with those labels; `title` "1–200 chars, trimmed, required" (empty or 201 chars → 422); `description` "≤ 20,000 chars"; unknown fields such as `assigneeId` are rejected with 422 (FR-049); the board is available while the project is "Not ready"; deleting the project removes its tickets; a ticket of a deleted project returns 404; all routes return 401 without a session; ticket text is returned exactly as stored, never interpreted as HTML
- [ ] T131 [P] [US7] E2E test in `tests/e2e/us7-board.spec.ts`: after the add-project wizard finishes, the page opens on the Board tab with an empty state; create two tickets; drag one to Review; with the keyboard only (Tab to card, Space, ArrowRight, Space) move the other to Testing and assert the live-region announcements; use "Move to… → End"; edit a title; delete with confirmation; reload and assert every column and order; "time in column" visible on cards; creating a ticket and moving it from New to End completes in under 30 s of test time, once with the mouse and once with only the keyboard (SC-008); axe at desktop and 320 px, with columns stacked and no horizontal scroll at 320 px
- [ ] T132 [P] [US7] API performance tests in `tests/integration/board-perf.test.ts`: 200 tickets, board GET under 1 s and committed move POST under 500 ms p95 over 50 runs. These are supporting diagnostics; SC-009 acceptance is the browser test T156.

- [ ] T156 [US7] Before board implementation, add `tests/e2e/board-perf.spec.ts` per research R22/quickstart: production build, Chromium, 200 persisted tickets, 50 samples on documented 2-vCPU host; navigation-to-usable/rendered board p95 <1s; mouse/keyboard confirmation-to-committed acknowledgement p95 <500ms separately; reload preserves order. Record build/browser/host/RAM and exclude optimistic render as persistence evidence. Observe expected failure first.

### Implementation for User Story 7

- [ ] T133 [US7] Add table `ticket` (`projectId` FK; `title` "1–200 chars, trimmed, required"; `description` "≤ 20,000 chars, may be empty; stored as plain text"; `status` `new|review|testing|end`; `position` integer "0-based, contiguous within (`projectId`, `status`)"; `createdAt`; `updatedAt`; `statusChangedAt`; no assignee field) with a unique index on (`projectId`, `status`, `position`) to `src/server/db/schema.ts` and migration `0008_tickets` with `0008_tickets.down.sql`
- [ ] T134 [P] [US7] Create Zod schemas in `src/shared/schemas/tickets.ts` (`TicketStatus`, strict `TicketInput` and `TicketPatch` that reject unknown keys, `MoveRequest {toStatus, toIndex ≥ 0}`, `Ticket`, `Board` with exactly four columns)
- [ ] T135 [US7] Implement `src/server/modules/tickets/service.ts`: `getBoard(projectId)`, `create`, `update`, `move`, `remove`, each in one SQLite transaction following research R17 and data-model.md `ticket` rules, to pass T128 and T132
- [ ] T136 [US7] Implement `src/server/modules/tickets/routes.ts` (`GET /api/projects/{id}/board`, `POST /api/projects/{id}/tickets`, `PATCH/DELETE /api/tickets/{id}`, `POST /api/tickets/{id}/move` returning the updated board) and register them in `src/server/main.ts`, to pass T129 and T130
- [ ] T137 [US7] Extend project deletion in `src/server/modules/projects/service.ts` to delete all of the project's tickets in the same transaction (FR-030), and update the delete confirmation text in `src/web/routes/projects/$projectId.tsx` to list tickets as removed
- [ ] T138 [P] [US7] Create `scripts/seed-board.mjs` for `npm run seed:board -- --project <id> --count <n>` (inserts n tickets spread across columns through the service; refuses to run when `NODE_ENV=production`)
- [ ] T139 [P] [US7] Create `src/web/features/board/MoveToMenu.tsx`: a per-card `DropdownMenu` listing the other three columns plus "Move up" and "Move down" (disabled at the ends), giving a single-pointer and keyboard alternative to dragging (WCAG 2.5.7)
- [ ] T140 [P] [US7] Create `src/web/features/board/TicketDialog.tsx` (create/edit with `TextField` title, max 200, and `TextArea` description, max 20,000, character counters and server errors next to fields) and `src/web/features/board/DeleteTicketDialog.tsx` (`ConfirmDialog` wiring); render description as escaped plain text with preserved line breaks
- [ ] T141 [US7] Create the board components `src/web/features/board/Board.tsx`, `Column.tsx`, and `TicketCard.tsx` with `@dnd-kit/core` + `@dnd-kit/sortable` (needs T139 and T140): one sortable list per column; keyboard sensor (Space/Enter pick up and drop, arrows move, Escape cancels); screen-reader announcements via `LiveRegion` ("Picked up ticket X, column Review, position 2 of 5"); columns are labelled regions with heading and ticket count; stacked vertically below 640 px; optimistic move with rollback and error toast on failure; `DataState` for loading/empty/error; each card shows its title and relative "time in column" from `statusChangedAt`, and uses `MoveToMenu` and the edit and delete dialogs
- [ ] T142 [US7] Make the board the project's default view: add tabs "Board" (default) and "Setup" (the existing download/team/readiness content from T117/T118) to `src/web/routes/projects/$projectId.tsx`, and navigate to the Board tab when `AddProjectWizard.tsx` finishes, to pass T131

**Checkpoint**: All seven user stories work independently.

---

## Phase 10: Polish & Final Verification

Rerun the completed T143–T148 suites across all stories. Their definitions and each incremental
expected failing run occur before production implementation as specified in Foundation.
Do not introduce first-time security, state, accessibility or performance coverage here.

- [ ] T149 [P] E2E test for the Diagnostics page in `tests/e2e/diagnostics.spec.ts`: empty state; after triggering a test-only failing route, the page lists the error with time, route, request ID and message, and no secret values; axe check
- [ ] T150 Create `src/web/routes/diagnostics.tsx` (list of locally captured errors newest first, expandable redacted stack, `DataState` for loading/empty/error) to pass T149
- [ ] T151 [P] Write `README.md`: install with Docker Compose, generating and **backing up** `STAPLR_MASTER_KEY` (losing it makes saved tokens and logins unrecoverable), backing up the `staplr-data` volume, reaching Staplr from another computer over HTTPS (`PUBLIC_URL`, the `https` profile, and why plain HTTP is refused), building sandbox images, the provider authentication/billing distinction and official sources from research R18, troubleshooting from quickstart.md
- [ ] T152 **Manual task for a person, not the implementing agent**: run the SC-005 usability check with 5 test users following quickstart.md scenario 4 (Codex), completing login before testing cancellation in a separate session without help; record pass/fail per user and any confusion points in `specs/001-agent-team-orchestration/checklists/usability-sc005.md` (target: at least 4 of 5 succeed first time)
- [ ] T153 Run `npm audit --audit-level=high`, `typecheck`, `lint`, `format:check`, and all test suites (`test`, `test:docker`, `test:e2e`) defined in `package.json`, and fix any findings in the affected `src/` files without weakening tests
- [ ] T154 Execute every manual scenario in `specs/001-agent-team-orchestration/quickstart.md` and record results in `specs/001-agent-team-orchestration/checklists/quickstart-results.md`

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: needs Setup; BLOCKS all stories.
- **US1 (Phase 3)** and **US2 (Phase 4)**: need only Foundational; can run in parallel.
- **US3 (Phase 5)**: needs only Foundational.
- **US4 (Phase 6)**: needs US2 (provider connections) and US3 (souls).
- **US5 (Phase 7)**: needs US1 (connections and adapters) and US4 (agents).
- **US6 (Phase 8)**: needs US5 for the catalog-upgrade acceptance tests involving providers, agents and projects; unit price arithmetic remains independently testable.
- **US7 (Phase 9)**: needs US5 (projects and the project page).
- **Polish (Phase 10)**: final reruns after all stories; cross-cutting test definitions and their initial expected failures belong before their behavior implementations.

```text
Setup → Foundational ─┬─ US1 ───────────────┐
                      ├─ US2 ──┐            ├─ US5 ── US7 → Polish
                      ├─ US3 ──┴─ US4 ──────┘
                      └─ US6 (independent)
```

### Within each story

1. Test tasks first, including the applicable T143–T148 incremental cases; run them and confirm expected failures before the corresponding production behavior (Constitution I). Add later story cases as that story starts; do not skip or disable earlier tests.
2. Schema/migration (with its `down` script) → shared Zod schemas → services → routes → health checkers → UI.
3. The story's checkpoint is met when all of its tests pass.

### How US1 and US2 stay independent of later tables

Deleting a source control connection or a provider connection clears links in later tables through
`ON DELETE SET NULL` foreign keys (T093, T106), so US1 and US2 contain no code that reads agents
or projects. The provider impact list is a registry (T078): it returns empty lists until US4 (T097)
and US5 (T115) register their sources.

### Cross-story edits (sequential on purpose)

- `src/server/modules/souls/service.ts`: T087 (US3), then T095 (US4).
- `src/server/modules/agents/service.ts`: T096 (US4), then T114 (US5).
- `src/server/modules/source-control/adapters/*.ts` and `routes.ts`: T055, T056, T058 (US1), then
  T108 (US5).
- `src/server/modules/prices/routes.ts`: T096 (US4, `GET /api/models`), then T126 (US6). If US6
  is built first, T096 adds to the file instead of creating it.
- `src/server/modules/projects/service.ts`: T111 (US5), then T137 (US7).
- `src/web/routes/projects/$projectId.tsx`: T117 (US5), then T137 and T142 (US7).
- `src/server/main.ts`: T041, then T126 and T136 register routes; T076 and T109 register startup
  tasks through `src/server/lib/startup.ts`.
- `src/server/modules/providers/impact.ts`: T078 creates it; T097 (agents) and T115 (projects)
  register sources from their own modules.
- `src/server/db/schema.ts`: every migration task touches it, so they run in story order
  (0001 → 0008).

---

## Parallel Examples

### Phase 2

```text
Tests together: T010–T025
Then implementations together: T026, T027, T028, T029, T030, T035, T036, T037, T038, T039, T040, T042, T043, T046
```

### User Story 1

```text
Tests together: T047, T048, T049, T050, T051
Then: T053, T054 in parallel → T055 + T056 in parallel → T057 → T058 → T059; T060 alongside T057–T059
```

### User Story 2

```text
Tests together: T061–T070
Then: T071, T072, T074 in parallel → T073 → T075 → T076 → T077 → T078 → T079; T080 alongside
```

### User Story 5

```text
Tests together: T099–T105
UI together after services: T116, T117, T118
```

### User Story 7

```text
Tests together: T128, T129, T130, T131, T132, T156
Then: T133 → T134 → T135 → T136 → T137; UI: T138, T139, T140 in parallel → T141 → T142
```

---

## Implementation Strategy

### MVP (US1 + US2, the two P1 stories)

1. Phase 1 and Phase 2.
2. US1: connect GitHub/GitLab. Validate on its own (quickstart scenarios 1–2).
3. US2: Claude API-key setup and Codex sandbox login. Validate on its own (quickstart scenarios 3–5 and 16).
4. **Stop and demo**: the user can securely store repository access and reusable provider credentials. This
   validates both provider authentication paths first.

### Incremental delivery

5. US3 souls, then US4 agents: a configured team exists.
6. US6 prices and catalog-upgrade acceptance after US5.
7. US5 projects and teams: projects reach "Ready", the hand-off to the next feature.
8. US7 ticket board: each project opens on its Kanban board.
9. Polish: security, outbound traffic, screen states, accessibility, performance, Diagnostics
   page, README, usability check, quickstart run.

### Notes

- `[P]` means different files and no unfinished dependencies.
- Work on branch `001-agent-team-orchestration` (the repository was initialised during analysis
  remediation).
- Commit after each task or logical group (Conventional Commits).
- Never weaken or skip a failing test to get past a gate (constitution, Development Workflow).
- Before T071, confirm the CLI credential paths and flags on the pinned versions (research R5).
