# Research: Agent Team Orchestration Setup

**Feature**: `001-agent-team-orchestration` | **Date**: 2026-11-08

Each decision below resolves an unknown from the plan's Technical Context. Constitution
constraints applied throughout: strict typing, simplicity (one deployable), secrets encrypted at
rest, WCAG 2.2 AA, test-first.

## R1. Language and runtime

- **Decision**: TypeScript 5.x (`strict`) on Node.js 22 LTS for both server and web UI.
- **Rationale**: One language end to end, which suits a solo maintainer working with AI agents. It
  has first-class SDKs for GitHub (Octokit) and GitLab (Gitbeaker) and a mature Docker client
  (dockerode). Both Codex CLI and Claude Code are themselves Node-distributed CLIs.
- **Alternatives considered**: Python with FastAPI (weaker shared typing with the UI); Go (strong
  for Docker and process control, but a second language for the UI).

## R2. Application shape

- **Decision**: A single deployable. A Fastify 5 server serves a JSON API, a WebSocket endpoint
  for the sandbox terminal, and a statically built React 19 single-page app built with Vite.
- **Rationale**: Constitution IV requires starting as one deployable. Fastify has first-party
  WebSocket support (`@fastify/websocket`), which the interactive sandbox terminal needs.
  Next.js's App Router has no native WebSocket support and would add a second server model.
- **Alternatives considered**: Next.js (WebSocket gap and heavier framework); a separate
  frontend/backend deploy (rejected under Constitution IV).

## R3. Storage

- **Decision**: SQLite (file on the data volume) via `better-sqlite3` and Drizzle ORM. Versioned
  migrations use `drizzle-kit`, plus a hand-written `down` script for each (drizzle-kit does not
  generate them). Repositories live on disk under `/data/repos/<projectId>/base`. Compose keeps
  `/data` on a **named Docker volume** (`staplr-data`), not a bind-mounted folder, because SQLite's
  WAL mode and git are unreliable and slow on Windows/macOS bind mounts under Docker Desktop.
- **Rationale**: One user per installation (FR-042), so there's no concurrency pressure. SQLite
  needs no extra service, which keeps self-hosting simple, and backup is a single directory.
  Drizzle gives typed, parameterized queries (Constitution II).
- **Alternatives considered**: PostgreSQL (an extra service to run for no benefit at this scale);
  JSON files (no transactions or migrations).

## R4. Encrypting secrets at rest

- **Decision**: AES-256-GCM via `node:crypto`. The 32-byte master key comes from the
  `STAPLR_MASTER_KEY` environment variable and is never stored in the database. Each secret gets a
  fresh 12-byte nonce and stores `{keyVersion, nonce, ciphertext, authTag}`. Secrets are decrypted
  only in server memory, at the moment of use.
- **Rationale**: Meets FR-004, FR-009 and Constitution II using only the standard library. The
  `keyVersion` field allows key rotation later without a schema change.
- **Alternatives considered**: OS keychain (not portable to headless Linux servers); an external
  secret manager (conflicts with FR-043, which keeps everything on the installation).

## R5. Provider authentication and isolated login

- **Decision**: Claude uses the owner's Anthropic API key entered through an authenticated
  password field. Validate against the official paginated Models API, seal the key with R4,
  and never echo it. Failed create stores nothing; failed replacement keeps the old key.
  Claude checks use node fetch against the official Models API; this feature builds no Claude
  agent runtime. Runtime choice belongs to the next feature. Do not capture Claude.ai OAuth
  or offer setup-token fallback. No provider CLI binary is modified.
- **Codex**: retain short-lived hardened Docker login containers, device-code login, file
  storage and encrypted `~/.codex/auth.json` bundles. Read/restore bundles with in-memory
  exec-tar, not the archive API. The only credential path extracted is the Codex path.
  Destroy login containers at terminal state; recover interrupted sessions on startup.
- **Rationale**: R18 documents explicit API-key support for third-party Claude integrations;
  Codex documents headless credential reuse. Both credentials remain encrypted locally.
- **Alternatives considered**: Claude subscription file extraction (restriction identified in
  R18); a persistent CLI-owned environment (unnecessary lifecycle complexity for this setup).
- **Implementation verification**: verify pinned CLI flags/paths and limits using real images
  before wiring their integration. Stub tests prove orchestration, not real-provider access.

## R6. Health checks and failure classification

- **Decision**: Startup, hourly and Check now run bounded checks. Source control verifies
  required permissions. Claude checks the key and models through paginated `GET /v1/models`;
  Codex restores its bundle into a hardened temporary container, checks authentication and
  verifies exact assigned models as R19 requires. Checks deduplicate connection/model pairs.
- **Errors**: authentication rejection/confirmed expiry sets `needs_relogin`; explicit model
  denial updates only that pair; network, rate-limit and service errors preserve the last
  confirmed state, record a secret-free error and provide Retry. Never classify every error
  as revoked authentication. Re-seal refreshed Codex credentials after successful checks.
- **Timing**: enforce per-operation and full-run deadlines; the full run over 20 connections
  must finish within 60 seconds, leaving the 70-minute status propagation target achievable.
  Deduplicate overlapping scheduled/on-demand work. Timeout produces a retryable check error.
- **Rationale**: Meets FR-013/014 with connection-specific model evidence. Codex exact-model
  probes can consume subscription usage; Claude model listing does not generate tokens.
- **Alternatives considered**: auth-status alone (cannot prove model access); a cron service
  (extra deployable complexity); marking network outages as invalid credentials (false status).

## R7. Repository download, refresh, and working copies

- **Decision**: Use the system `git` binary through `simple-git`, run in the Staplr container. The
  download is a full clone into `/data/repos/<projectId>/base` using a credential helper that
  reads the token from memory for that one command, so the token is never written into
  `.git/config` or a URL. Refresh is `git fetch --prune`, then a fast-forward of the base branch;
  a non-fast-forward is reported as "remote history rewritten" (spec edge case). The base copy is
  never checked out for editing; next-feature worktrees are created with `git worktree add`.
- **Rationale**: Native worktree support (FR-028). Full history is required for worktrees and pull
  requests. Keeping the token out of on-disk config meets Constitution II.
- **Alternatives considered**: isomorphic-git (no worktree support); shallow clones (complicate
  worktrees and rebases).

## R8. Listing repositories

- **Decision**: GitHub via `@octokit/rest` (`GET /user/repos`, paginated, filtered to repositories
  where the token has push access). GitLab via `@gitbeaker/rest` (`GET /projects?membership=true
  &min_access_level=30`, Developer or higher) against the connection's instance address. Search
  is server-side over the cached list, refreshed when the picker opens.
- **Rationale**: FR-025 requires listing what the token can actually use. Filtering to push access
  avoids picking repositories agents can't work on.

## R9. Model catalog and prices

**Revised decision**: R19 separates the shipped catalog from per-connection access. R20
defines catalog updates; a catalog entry alone is not a selectable entitlement.

- **Decision**: Staplr ships a versioned catalog file (`catalog/models.json`) listing each
  provider's selectable models, their default list prices per million input and output tokens, a
  `retired` flag, a catalog revision, and exactly one `probeModel: true` per provider (a generic
  diagnostic only; Claude uses authenticated model discovery, R6). On startup the catalog is merged into the `model_prices` table: shipped
  prices become `source=default` rows, and user edits create new `source=user` rows that close the
  previous row (FR-037). R20 defines upgrade reconciliation. Retired models or explicit
  connection-specific denial produce model_unavailable; transient failures preserve confirmed
  evidence, and authentication failures request credential replacement/re-login (R19).
- **Catalog data rule**: the catalog file records `pricesAsOf` (date) and `priceSource` (the
  provider's public pricing page URL) for each price. A price is only filled in when it was copied
  from that source on that date. Any model whose price can't be confirmed ships with
  `inputPricePerMTok`/`outputPricePerMTok` set to `null`, which shows as "Unknown" with an
  "Enter price" action (FR-037). Implementers must never guess a price.
- **Rationale**: Subscription logins give no reliable model-listing API, so a maintained catalog
  matches the spec's assumption ("retrieved from or maintained for that provider").
- **Alternatives considered**: scraping the providers' pricing pages (brittle).

## R10. Sign-in for the single user

- **Decision**: First-run setup creates the one user with a password hashed with Argon2id
  (`@node-rs/argon2`). Sessions use an HTTP-only, `SameSite=Strict` cookie that maps to a
  server-side session row. The cookie is `Secure` exactly when `PUBLIC_URL` starts with
  `https://`. State-changing requests also require a matching `Origin` header. Every API route
  except `/api/setup/status`, `/api/setup` (allowed only while no user exists) and `/api/session`
  (sign-in) requires a session; the static app shell is served without one and contains no user
  data (FR-042).
- **Transport**: `PUBLIC_URL` must be `https://…`, or `http://localhost` / `http://127.0.0.1`.
  Any other `http://` URL stops startup with a clear message unless `STAPLR_ALLOW_INSECURE_HTTP=1`
  is set, which logs a warning on every start and shows a banner on the sign-in page. Browsers
  refuse to keep `Secure` cookies over plain HTTP on a LAN address, so without this rule sign-in
  would silently fail. For access from other computers, Compose offers an optional `caddy`
  service (profile `https`, `tls internal` for LAN names) that terminates HTTPS.
- **Rationale**: Simplest model that meets FR-042 and Constitution II, and keeps passwords and
  tokens off the network in plain text.
- **Alternatives considered**: always requiring HTTPS (blocks plain local use); always allowing
  plain HTTP (sends passwords and tokens unencrypted).

## R11. Running Docker safely from the Staplr container

- **Decision**: Ship with Docker Compose: a `staplr` service and a `docker-socket-proxy` service
  that exposes only the container, exec, image and network endpoints Staplr needs. Staplr never
  mounts `/var/run/docker.sock` directly. Sandbox containers get resource limits (CPU, memory, PID
  count), a dropped capability set, `no-new-privileges`, a read-only root filesystem with tmpfs
  for home and `/tmp`, and a private network.
- **Proxy settings**: start with `CONTAINERS=1 EXEC=1 IMAGES=1 NETWORKS=1 POST=1`. Tecnativa's
  README lists start, stop and restart as separate `ALLOW_START`, `ALLOW_STOP` and
  `ALLOW_RESTARTS` switches, and it is not confirmed that these settings are enough, so
  `tests/docker/docker-proxy-permissions.test.ts` is the authority. It must create, start, exec,
  read logs, stop, kill and remove a container through the proxy, and see blocked endpoints
  refused. Add whichever `ALLOW_*` switches that test shows are needed, and no others.
- **Rationale**: Sandboxes require a container runtime, and the proxy limits the damage if Staplr
  is ever compromised. See Complexity Tracking in plan.md.
- **Alternatives considered**: mounting the raw Docker socket (gives full root on the host);
  running Staplr directly on the host with no container (harder to install and upgrade).

## R12. Logging, audit, and error capture without third-party services

- **Decision**: Structured JSON logs with `pino`, with a request-ID on every line and a redaction
  list for token, credential and cookie fields. Audit entries go in an append-only `audit_entries`
  table shown on an Audit page (FR-041). Unhandled errors are written to a local `error_events`
  table and shown on a Diagnostics page. Nothing is sent off the installation.
- **Rationale**: Constitution v1.0.2 requires an error-reporting tool that records the request ID,
  route and a secret-free stack and lets the user review errors, and requires it to run locally
  when a feature forbids third-party transfer, as FR-043 does. The `error_events` store and the
  Diagnostics page meet that rule directly.

## R13. UI and accessibility

- **Decision**: React 19, TanStack Router and TanStack Query, Tailwind CSS 4 with design tokens,
  and Radix UI primitives wrapped as Staplr's design-system components. Forms use React Hook Form
  with the shared Zod schemas. The terminal uses xterm.js with its screen-reader mode enabled.
- **Rationale**: Radix provides keyboard and ARIA behavior for dialogs, menus and comboboxes (the
  repository picker), which supports Constitution III (WCAG 2.2 AA). Sharing Zod schemas means
  the server and UI validate the same rules.

## R14. Testing

- **Decision**:
  - Vitest for unit and integration tests. Server routes are tested in-process with Fastify's
    `inject`, and GitHub/GitLab are mocked with `msw`.
  - Docker-dependent tests run against real containers using a stub CLI image, tagged so they run
    on machines that have Docker.
  - Playwright with `@axe-core/playwright` for end-to-end and accessibility checks.
  - Contract tests validate API responses against `contracts/openapi.yaml`.
  - A migration test applies every migration up, then down, then up again
    (`tests/integration/migrations.test.ts`).
  - A Docker proxy test checks the permitted and refused endpoints (R11).
  - A screen-state sweep forces loading, empty and error states on every screen
    (`tests/e2e/screen-states.spec.ts`).
- **Rationale**: Covers Constitution I (unit, integration and contract layers) and III
  (automated accessibility checks) and gives fast feedback.

## R15. Dependency justification (Constitution IV)

| Dependency | Need | Lighter alternative rejected because | Maintenance: latest release (read from npm on 2026-11-08) |
|---|---|---|---|
| fastify, @fastify/websocket, @fastify/static, @fastify/cookie | HTTP API, sandbox terminal WebSocket, serving the SPA, session cookie | `node:http` would mean rebuilding routing, validation and WebSocket handling | fastify 5.12.8 (2026-11-02); websocket 11.3.7 (2026-11-04); static 10.1.10 (2026-11-04); cookie 11.1.5 (2026-10-27) |
| better-sqlite3, drizzle-orm, drizzle-kit | Storage, typed queries, migrations | Raw SQL has no typing or migration tooling | better-sqlite3 13.0.3 (2026-08-05); drizzle-orm 0.45.4 (2026-10-08); drizzle-kit 0.31.11 (2026-09-21) |
| zod | One validation schema shared by server and UI | Two hand-written validators would drift apart | 4.6.7 (2026-10-12) |
| dockerode | Sandbox containers and TTY exec | Shelling out to the `docker` CLI makes streaming the TTY fragile | 5.0.1 (2026-06-24) |
| simple-git (with system git) | Clone, fetch, worktree | isomorphic-git has no worktree support | simple-git 4.0.2 (2026-09-26) |
| @octokit/rest, @gitbeaker/rest | Official clients for each platform API | Hand-written REST clients would need pagination and errors handled by hand | octokit 22.0.1 (2025-10-31); gitbeaker 43.8.0 (2025-11-01) |
| @node-rs/argon2 | Password hashing | `scrypt` would work, but Argon2id is the current OWASP recommendation | 2.2.2 (2026-10-06) |
| pino | Structured logs with redaction | `console.log` has no structure or redaction | 10.4.0 (2026-10-02) |
| react, @tanstack/react-router, @tanstack/react-query, react-hook-form | UI | Needed for an accessible single-page app | react 19.3.1 (2026-10-14); router 1.170.46 (2026-10-22); query 5.107.1 (2026-11-06); react-hook-form 7.91.0 (2026-10-23) |
| @radix-ui/*, tailwindcss, @tailwindcss/vite | Accessible design-system primitives; Tailwind 4 needs its official Vite plugin to generate utility classes | Building ARIA widgets by hand is costly and error-prone; hand-written CSS for every screen duplicates the token system | react-dialog 1.3.1 (2026-10-12), representative of the Radix packages; tailwindcss 4.3.5 (2026-11-06); @tailwindcss/vite 4.3.5 (2026-11-06, peer range includes Vite 8) |
| @xterm/xterm | Sandbox terminal in the browser | No mature alternative exists | 6.0.0 (2025-12-22) |
| vitest, @playwright/test, @axe-core/playwright, msw | Tests | Required by Constitution I and III | vitest 5.1.0 (2026-11-02); playwright 1.65.0 (2026-11-05); axe-core/playwright 4.14.0 (2026-10-15); msw 3.0.4 (2026-11-06) |
| @dnd-kit/core, @dnd-kit/sortable | Kanban drag and drop with built-in keyboard sensor and screen-reader announcements (R16) | Native HTML5 drag and drop has no keyboard support and doesn't work on touch screens; building an accessible version is a lot of work | core 6.3.1 and sortable 10.0.0, both released 2024-12 (23 months ago): **written exception**, see below |
| ajv, yaml (dev only) | Contract tests validate API responses against `contracts/openapi.yaml` | Hand-checking response shapes would drift from the contract | ajv 8.20.0 (2026-04-24); yaml 2.9.1 (2026-09-11) |

**Maintenance rule** (Constitution IV): every dependency needs a release in the last 24 months and
no deprecation notice, and `npm audit --audit-level=high` must be clean (T001, CI T009). A package
that fails one of the first two checks needs a written exception here with a reason and a
fallback. None of the packages above is deprecated.

- **Exception, `@dnd-kit/core` and `@dnd-kit/sortable`**: last released in December 2024, so they
  pass the 24-month rule only until December 2026. They are stable, widely used, and have the
  best keyboard and screen-reader support of the options (R16). The successor `@dnd-kit/react` is
  still 0.5.3, so it is not adopted yet. Fallback if these stop working:
  `@atlaskit/pragmatic-drag-and-drop` (4.0.0, actively released) with Staplr's own keyboard
  handling and announcements. Re-check at T001.
- **Not used, `ajv-formats`**: last released March 2024 (31 months). The contract tests only need
  the formats `date-time`, `date` and `uri`, so `tests/contract/harness.ts` registers those three
  itself with `ajv.addFormat`.

**Not added**: an ID library. IDs come from `crypto.randomUUID()` (UUID v4) in the Node standard
library. Ordering never depends on ID order; it uses explicit timestamps and positions.

## R16. Kanban board interaction and accessibility

- **Decision**: Build the board with `@dnd-kit/core` and `@dnd-kit/sortable`: one sortable list per
  column, and cards can move between lists.
  - The keyboard sensor lets the user pick up a focused card with Space/Enter, move it with the
    arrow keys, drop it with Space/Enter, and cancel with Escape. Announcements tell screen-reader
    users each step ("Picked up ticket X, column Review, position 2 of 5").
  - Each card also has a **"Move to…" menu** (Radix DropdownMenu) listing the other columns plus
    "Move up" and "Move down". It's a simple alternative for anyone who finds dragging hard.
  - Columns are labelled regions with a heading and ticket count. Below 640 px the columns stack
    vertically, so the page never scrolls horizontally (Constitution III).
  - Moves are applied on screen immediately and rolled back with an error toast if the server
    rejects them.
- **Rationale**: Meets FR-047 (drag and drop plus keyboard), WCAG 2.2 AA (including 2.5.7
  Dragging Movements, which requires a single-pointer alternative, the "Move to…" menu) and SC-008.
- **Alternatives considered**: `react-beautiful-dnd` (deprecated); `pragmatic-drag-and-drop` (needs
  more custom accessibility work); native HTML5 drag and drop (no keyboard support).

## R17. Ticket ordering

- **Decision**: Each ticket has a `status` (column) and an integer `position` (0-based, contiguous
  within its column). A move runs in one SQLite transaction: close the gap in the source column,
  open a gap in the target column, then set the ticket's status and position. New tickets get
  position 0 in New, and the others in New shift down. `statusChangedAt` is set only when the
  column changes, which drives "time in column" (FR-048).
- **Rationale**: With one user and up to 500 tickets per project, renumbering at most a few hundred
  rows in a transaction takes well under 500 ms (SC-009) and keeps the order exact and easy to
  test.
- **Alternatives considered**: fractional or lexicographic ranks (avoid renumbering, but need
  periodic rebalancing and are harder to test, which doesn't pay off at this scale).

Sources for authentication: [Claude guidance](https://code.claude.com/docs/en/legal-and-compliance),
[Claude Models API](https://platform.claude.com/docs/en/api/models/list),
[Codex authentication](https://developers.openai.com/codex/auth).

## R18. Provider authentication prerequisite resolved

- **Decision (2026-11-08)**: Revise the spec explicitly to Claude owner-provided API keys and
  Codex sandbox account login. The user requested fixing the blocker. This removes the
  rejected Claude.ai credential collection mechanism; provider feasibility passes for this
  design, subject to normal pinned-version integration tests.
- **Primary evidence**: [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
  recommends API keys for third-party integrations and distinguishes permitted customer API-key
  management from restricted subscription credential collection. Keys belong to the single
  installation owner, whose usage is billed directly by Anthropic. Staplr does not resell usage.
  This feature does not modify or bundle Claude Code; its future runtime is a separate feature.
  [Claude Models API](https://platform.claude.com/docs/en/api/models/list) documents available
  models returned by the authenticated API. [Codex authentication](https://developers.openai.com/codex/auth)
  documents device login and cached credential reuse on headless hosts.
- **Rationale**: Resolves the earlier failed gate without assuming an exception for subscription
  tokens. API billing is disclosed in connection setup; estimates remain estimates.
- **Alternatives considered**: obtaining a special exception (not necessary for owner API keys);
  continuing OAuth extraction (rejected); requiring API keys for Codex too (unnecessary change).
- **Implementation gate**: record the source URLs/date, pinned Codex CLI version, exact-model probe
  behavior and image-limit test results in the sandbox README before integrating real CLIs.
  Recheck official guidance if provider behavior or authentication changes. No live credentials
  are available during planning, and no live-provider test is claimed.

## R19. Connection-specific model access (analysis I1)

- **Decision**: Maintain a result per connection/model pair: `available`, `unavailable`, or
  `unknown`, with credential revision, catalog revision, last successful verification time,
  last attempt time and a secret-free error code. Use provider-supported capability discovery
  if it proves access; otherwise require a minimal exact-model inference probe with no silent
  fallback. For Claude, intersect the non-retired catalog with the complete authenticated Models API response. For Codex, verify exact-model probe behavior and error classification on the pinned CLI.
  [Codex app-server guidance](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)
  distinguishes catalog listing from access verified by a successful inference turn.
- **Selection and checks**: show unknown models disabled with Check availability; only
  current `available` pairs can be newly assigned. Validate server-side on create/update.
  Startup/hourly/on-demand checks verify models already used by agents, deduplicated by pair;
  picker candidate checks happen on demand. Probes may consume subscription usage and the
  on-demand action explains this. A probe of the default model proves nothing about another
  selected model. The one `probeModel` remains only a generic login diagnostic.
- **Failure classification**: confirmed expired/revoked credentials set `needs_relogin`;
  explicit model denial sets only that pair unavailable; transient network/rate-limit/service
  failures preserve the last confirmed state and record a retryable error. A never-verified
  pair remains unknown. Re-login invalidates results tied to old credentials.
- **Readiness**: retired/missing catalog entries and non-available current access results
  produce `model_unavailable`, with precise explanation and Check availability action for
  unknown results. Auth failure uses `needs_relogin`. Project readiness follows immediately
  through the existing computed readiness functions. No extra top-level status is introduced.
- **Rationale**: A provider-wide catalog is not a connection-specific entitlement; this closes
  FR-021 and US4 scenario 5 without marking model denial as an expired login.
- **Alternatives considered**: allowing every catalog model (cannot prove access); using one
  successful default-model probe for all agents (does not test selected models).

## R20. Catalog update lifecycle (analysis U2)

- **Decision**: Versioned catalogs arrive with application releases. Validate/reconcile the
  bundled revision at startup before serving readiness; restarting the same revision is
  idempotent. Retired/removed identifiers become unavailable immediately; access results from
  older revisions are invalidated for recheck. Expose revision/check time in the later model
  contract. Do not fetch catalogs automatically from a new third-party service.
- **Price behavior**: preserve user overrides and all historical prices. An incoming changed
  default price closes the previous default interval and starts a new one at reconciliation
  time only if no current user override exists; unchanged defaults create no new row. Never
  backdate new defaults to overwrite history. Removed models retain historical price rows.
- **Rationale**: Defines the spec's periodic maintained-model refresh using the existing
  release channel and local startup lifecycle. Hourly access checks handle entitlement loss
  independently of catalog releases.
- **Alternatives considered**: remote catalog polling (adds an external dependency and trust
  path); assuming a bundled catalog updates itself (has no implementation mechanism).

## R21. Test ordering and formatting gate (analysis C1, C2)

- **Decision**: T143–T148 are defined in Foundation as incremental suites; split their execution by behavior and place
  each test's first expected failing run before its production implementation. Security and
  egress tests precede integrations, readiness tests precede health changes, and accessibility
  plus loading/empty/error/success checks precede each screen. Performance tests precede
  affected picker/list/board behavior. Polish only reruns the completed suites.
  Add `format:check` = `prettier --check .` to package scripts, CI and the final validation gate.
- **Rationale**: Directly satisfies Constitution I, III and the automatic formatting constraint.
  Existing generic test-first wording does not fix contradictory task placement.
- **Alternatives considered**: first adding cross-cutting tests during Polish (too late);
  configuring Prettier without checking it automatically (does not enforce formatting).

## R22. Browser-level board performance (analysis G1)

- **Decision**: Add a Playwright browser performance scenario before board implementation.
  Use a production build, 200 persisted tickets, Chromium on the same documented 2-vCPU host,
  a fresh page, no artificial throttling and no concurrent download/sandbox jobs. Record RAM,
  browser/build versions and fixture. Collect 50 samples and report p95.
- **Boundaries**: board navigation starts to all 200 cards rendered and controls usable must
  take under 1 second. Mouse drop or keyboard move confirmation to receipt of the response
  acknowledging the committed SQLite move must take under 500 ms, reported separately by
  input method. Reload outside that timing interval to prove the order persists. Measure
  the complete browser interval, not just the network request duration or optimistic render.
- **Rationale**: SC-009 is user-visible; Fastify inject latency cannot prove rendering or
  browser-to-server persistence timing. Retain API timing as supporting diagnostic evidence.
- **Alternatives considered**: API-only timing (omits rendering/transport); manual network-panel
  timing alone (does not define the full interaction interval reproducibly).

## Implementation dependency compatibility note (2026-11-08)

ESLint 10 cannot resolve with eslint-plugin-jsx-a11y 6.10.2, whose declared peer range ends
at ESLint 9. Pin ESLint and @eslint/js to 9 for the current accessibility lint integration.
This is a temporary dev-tool maintenance exception: npm reports ESLint 9.39.5 deprecated.
No peer-dependency enforcement is bypassed. Keep CI lint and axe gates enabled. Recheck the
plugin peer range during dependency upgrades and remove this exception when ESLint 10 is
supported. The high-severity audit gate passed after installation; 11 moderate transitive
advisories in drizzle-kit/esbuild and typescript-eslint/minimatch remain tracked by npm audit.
Do not apply npm audit fix --force blindly: its proposed downgrade changes tool behavior.
