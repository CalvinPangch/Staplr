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

## R5. Sandbox login for Codex and Claude

- **Decision**: Each sandbox login session is a short-lived Docker container built from a
  Staplr-provided image with the provider CLI preinstalled. It has no host mounts, a read-only
  root filesystem with tmpfs mounts for the CLI's home directory and `/tmp`, runs as a non-root
  user, and has outbound network only. The browser
  connects to the container's terminal (Docker exec with a TTY) over a WebSocket and renders it
  with xterm.js. The user runs the provider's own login inside it:
  - **Claude**: interactive `claude` login (subscription OAuth). The user opens the printed URL in
    their own browser, so MFA and CAPTCHA happen there, then pastes the code back.
    `claude setup-token` (a one-year token) is a fallback offered in the UI.
  - **Codex**: `codex login --device-auth` (URL plus a one-time code), with the CLI configured to
    use file-based credential storage (`cli_auth_credentials_store = "file"`) so the result is
    written to `~/.codex/auth.json`.

  When login succeeds, Staplr reads the CLI's credential files out of the container
  (`~/.claude/.credentials.json` and `~/.claude.json`; `~/.codex/auth.json`) by running
  `tar -c` inside it through `docker exec` and streaming the output into memory, encrypts them as
  one **credential bundle** (R4), and destroys the container. Restoring runs `tar -x` the same
  way. Docker's archive API (`docker cp`) is deliberately not used: Docker's documentation says it
  cannot read tmpfs or mounted paths, and the home directory is a tmpfs. The sandbox images must
  therefore include `tar`. Agent runs in the next feature restore the bundle into their own
  container and write back any refreshed tokens afterwards.
- **Rationale**: These are the providers' own sign-in flows, so Staplr never sees the user's
  password. OpenAI documents copying `auth.json` to headless machines as supported. Keeping the
  whole credential file, rather than a single printed token, keeps the CLI's own refresh tokens,
  which supports SC-002 (30 days without re-login). The container boundary satisfies FR-008.
- **Known risks**: third-party reports describe `setup-token` tokens failing with 401 on some
  versions and having no automatic refresh, so it is a fallback only. Device-code login may need
  to be enabled in the ChatGPT account's security settings, and the UI must say so. File paths
  and flags MUST be checked against the CLI versions pinned in the sandbox images when they are
  built. The terms-of-use dependency in the spec's Assumptions still applies.
- **Alternatives considered**: capturing tokens by parsing terminal output (fragile, and loses the
  refresh token); a browser-in-container approach using noVNC (heavier, and worse for
  accessibility); asking for API keys (out of scope per the spec).

## R6. Connection health checks

- **Decision**: An in-process scheduler runs at startup and every 60 minutes, plus on demand
  ("Check now").
  - **Source control**: call the platform's "current user" API and read the token's
    scopes/permissions (GitHub `X-OAuth-Scopes` or the fine-grained permission probe; GitLab
    `personal_access_tokens/self`).
  - **Provider (scheduled)**: restore the bundle into a throwaway container and run the CLI's
    auth-status command, plus check the token expiry recorded in the credential file. This uses
    no model tokens.
  - **Provider ("Check now")**: also runs a minimal one-turn prompt on the provider's
    `probeModel` (the cheapest suitable model, named in `catalog/models.json`, R9) to prove the
    login really works, because status commands have been reported to show "logged in" when calls
    fail.
- **Rationale**: Meets FR-013, FR-014 and SC-006 (within 70 minutes: hourly checks plus the time
  they take to run, or immediately on "Check now")
  without spending model usage every hour.
- **Alternatives considered**: a cron container or job queue (extra moving parts; Constitution IV);
  running the real-call check hourly (wasted usage).

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

- **Decision**: Staplr ships a versioned catalog file (`catalog/models.json`) listing each
  provider's selectable models, their default list prices per million input and output tokens, a
  `retired` flag, and exactly one `probeModel: true` per provider (used by the "Check now" probe,
  R6). On startup the catalog is merged into the `model_prices` table: shipped
  prices become `source=default` rows, and user edits create new `source=user` rows that close the
  previous row (FR-037). Agents whose model is retired, or whose model fails the "Check now"
  probe, are marked "Not ready: model unavailable".
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
| @radix-ui/*, tailwindcss | Accessible design-system primitives | Building ARIA widgets by hand is costly and error-prone | react-dialog 1.3.1 (2026-10-12), representative of the Radix packages; tailwindcss 4.3.5 (2026-11-06) |
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

Sources consulted for R5/R6:
[OpenAI Codex authentication docs](https://developers.openai.com/codex/auth),
[Codex headless login guide](https://blog.laozhang.ai/en/posts/codex-headless-login),
[Claude Code setup-token notes](https://gist.github.com/coenjacobs/d37adc34149d8c30034cd1f20a89cce9),
[Headless Claude Code reference](https://www.vellum.ai/skills/headless-claude-code),
[setup-token 401 report](https://claudeissues.com/issue/84903-claude-code-oauth-token-from-claude-setup-token-returns-401-invalid-bearer-token).
