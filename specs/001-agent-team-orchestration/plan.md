# Implementation Plan: Agent Team Orchestration Setup

**Branch**: `001-agent-team-orchestration` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-agent-team-orchestration/spec.md`

## Summary

Build the setup half of Staplr, a self-hosted, single-user web app for configuring an AI
development team. It covers:

- GitHub/GitLab connections stored as encrypted tokens and checked for required permissions.
- Codex and Claude provider connections. The user signs in through the provider's own login inside
  an isolated Docker sandbox with a browser terminal; the resulting credential files are saved as
  an encrypted bundle for agents to reuse.
- Souls (role definitions) and agents (soul + provider + model).
- Projects: a picked repository downloaded as a base copy, with a base branch, a team, and exactly
  one Project Manager.
- A Kanban ticket board per project (New / Review / Testing / End). The user creates, edits,
  deletes, and moves tickets by drag and drop or keyboard; agents do not move tickets yet.
- Hourly and on-demand health checks that drive "Ready"/"Not ready".
- Model prices with history, and the cost-estimate rule the next feature will use.

Technical approach: one TypeScript deployable (Fastify API + WebSocket, React SPA), SQLite via
Drizzle on a named Docker volume, AES-256-GCM secrets with an environment-supplied master key,
Docker sandboxes reached through a restricted socket proxy, HTTPS required for any address other
than localhost, and system git for clone, refresh and worktrees. Details and rationale are in
[research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x (`strict`), Node.js 22 LTS

**Primary Dependencies**: Fastify 5 (+ websocket, static, cookie), React 19 + Vite, TanStack
Router/Query, Radix UI + Tailwind CSS 4, Zod, Drizzle ORM + better-sqlite3, dockerode,
simple-git, @octokit/rest, @gitbeaker/rest, @node-rs/argon2, pino, @xterm/xterm,
@dnd-kit/core + @dnd-kit/sortable (Kanban board). Justified in research R15–R16.

**Storage**: SQLite file at `/data/staplr.db`; repositories under `/data/repos/`; both on the
named volume `staplr-data`; encrypted secrets in SQLite (R3, R4)

**Testing**: Vitest (unit, integration with Fastify `inject`, msw for GitHub/GitLab), contract
tests against `contracts/openapi.yaml`, Docker-tagged sandbox tests with a stub CLI image,
Playwright + @axe-core/playwright for end-to-end and accessibility (R14)

**Target Platform**: Linux x86_64/arm64 host with Docker Engine 24+, shipped as Docker Compose
(`staplr` + `docker-socket-proxy`, plus an optional `caddy` service under profile `https`);
Docker Desktop on macOS/Windows for local use. Modern evergreen browsers.

**Project Type**: Web application (single deployable: API server + bundled SPA)

**Performance Goals**: Pages and API responses (other than downloads) in under 500 ms p95 on a
2-vCPU host; repository picker search in under 300 ms for up to 1,000 repositories; sandbox
terminal ready in under 10 s after "Connect"; a full health check of 20 connections in under 60 s;
a board with 200 tickets loads in under 1 s and a ticket move is saved in under 500 ms (SC-009).

**Constraints**: All data stays on the installation (FR-043); no secret in logs, the browser, or
`.git/config`; HTTPS for any non-localhost address unless explicitly overridden (R10); sandbox
containers isolated (non-root, capabilities dropped, read-only root with tmpfs home, resource
limits); WCAG 2.2 AA; usable from 320 px width.

**Scale/Scope**: 1 user per installation; up to about 50 projects, 100 agents, 20 connections;
repositories up to 5 GB each (disk is the user's responsibility); up to 500 tickets per project;
8 main screens (Sign-in/Setup, Global Settings, Provider Connections + sandbox, Souls, Agents,
Projects/Team, Project Board, Model Prices) plus Audit and Diagnostics.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.0.2.

| Principle / rule | How this design complies | Status |
|---|---|---|
| I. Test-first | Every user story maps to Playwright acceptance tests; services have Vitest unit tests; API routes have contract tests against `openapi.yaml`; Docker, git and the GitHub/GitLab APIs have integration tests. Tasks will order each test before its implementation. | Pass |
| II. Server-side validation | All inputs are checked against Zod schemas in route definitions, including WebSocket messages. | Pass |
| II. Authentication on every endpoint | Global session hook; only setup (while no user exists) and sign-in are open; a contract test lists every route and asserts 401 without a session (FR-042). | Pass |
| II. Secrets | Application secrets (master key, session secret) come from environment variables. User secrets are AES-256-GCM encrypted (R4). The pino redaction list, git credential helper and masked API responses keep secrets out of logs, `.git/config` and the browser (R7, R12). | Pass |
| II. Minimal personal data | Stores only the username, the password hash and the GitHub/GitLab account names. Each field and its purpose is listed in data-model.md "Personal data". No Codex/Claude account identity is stored. | Pass |
| II. Parameterized queries / escaping | Drizzle parameterizes all queries; React escapes rendered output by default. | Pass |
| II. No vulnerable dependencies | `npm audit --audit-level=high` runs in CI. | Pass |
| III. WCAG 2.2 AA, design system, states | Radix-based components; axe checks in Playwright; every screen defines loading, empty, error and success states; terminal screen-reader mode; layouts from 320 px up. The board supports keyboard dragging with screen-reader announcements plus a "Move to…" menu, so no action needs a mouse (FR-047, R16). A screen-state sweep forces loading, empty and error states on every screen (T146). | Pass |
| IV. Simplicity | One deployable, one database file, in-process scheduler. Docker is the only extra runtime, which sandbox isolation requires (see Complexity Tracking). | Pass, with justification |
| V. Spec-driven | spec → clarify → plan done; tasks next. | Pass |
| Typed code, lint/format/type checks | TypeScript `strict`, ESLint, Prettier, `tsc --noEmit` in CI. | Pass |
| Reversible migrations | drizzle-kit migrations, each with a hand-written `down` script, proved by an up/down/up migration test (T025) that is written first and passes once the first migration exists. | Pass |
| Structured logs + error reporting tool | pino JSON logs with request IDs. Unhandled errors are captured with request ID, route, and a redacted stack in a local `error_events` store, reviewable on the Diagnostics page. v1.0.2 allows a local tool and requires one when a feature forbids third-party transfer (FR-043). | Pass |
| IV. New dependencies justified | Every runtime and test dependency is listed in research R15 with its need, the alternative rejected, and its maintenance (latest release read from npm on 2026-11-08). `@dnd-kit/*` has a written exception (last release December 2024). `ajv-formats` and an ID package are not used. | Pass |

**Post-design re-check (after Phase 1, including the ticket board)**: The data model, contracts
and quickstart introduce no new services; the only new dependency is `@dnd-kit/*` (R16, with a
written maintenance exception in R15). Every
route in `contracts/openapi.yaml`, including the new ticket routes, requires `cookieAuth` except
`GET /api/setup/status`, `POST /api/setup` and `POST /api/session`. No response schema contains a
secret field (only `tokenLast4`). Ticket text is user content, rendered as escaped plain text.
**Gate: Pass.**

## Project Structure

### Documentation (this feature)

```text
specs/001-agent-team-orchestration/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── openapi.yaml     # HTTP API contract
│   └── sandbox-terminal.md  # WebSocket protocol for sandbox login sessions
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
package.json                 # single package; scripts: dev, build, test, test:e2e, db:migrate
tsconfig.json
vite.config.ts
drizzle.config.ts
compose.yaml                 # staplr + docker-socket-proxy (+ optional caddy, profile `https`); volume staplr-data
Dockerfile                   # staplr image (Node 22 + git)

catalog/
└── models.json              # shipped model list + default list prices (R9)

docker/
└── sandbox/
    ├── claude.Dockerfile    # pinned Claude Code CLI, non-root user
    └── codex.Dockerfile     # pinned Codex CLI, file credential store

src/
├── shared/                  # code shared by server and web
│   ├── schemas/             # Zod schemas = API request/response types
│   └── status.ts            # status vocabulary enums (spec "Status Vocabulary")
├── server/
│   ├── main.ts              # bootstrap: config, migrations, scheduler, Fastify
│   ├── app.ts               # Fastify instance, global auth hook, error handler
│   ├── config.ts            # env parsing (STAPLR_MASTER_KEY, DATA_DIR, PUBLIC_URL, …)
│   ├── db/
│   │   ├── schema.ts        # Drizzle tables (see data-model.md)
│   │   └── migrations/      # each migration has a matching .down.sql
│   ├── lib/
│   │   ├── crypto.ts        # AES-256-GCM seal/open
│   │   ├── startup.ts       # registry of startup recovery tasks
│   │   ├── logger.ts        # pino + redaction
│   │   ├── docker.ts        # dockerode wrapper, hardened container options
│   │   └── git.ts           # simple-git + in-memory credential helper
│   └── modules/
│       ├── auth/            # setup, sign-in/out, session hook
│       ├── source-control/  # connections, GitHub/GitLab adapters, repo listing
│       ├── providers/       # provider connections, credential bundles, impact-source registry
│       ├── sandbox/         # sandbox sessions, terminal WebSocket bridge
│       ├── health/          # scheduler + checkers
│       ├── souls/
│       ├── agents/
│       ├── projects/        # projects, download/refresh jobs, teams, readiness
│       ├── tickets/         # ticket board: CRUD, move/reorder
│       ├── prices/          # catalog merge, price history, estimateCost()
│       ├── audit/
│       └── diagnostics/     # error_events
└── web/
    ├── main.tsx
    ├── routes/              # one folder per screen
    ├── components/ui/       # design-system components (Radix wrappers + tokens)
    └── features/            # screen-specific components and hooks (incl. board/)

tests/
├── unit/                    # services, crypto, estimateCost, readiness rules
├── integration/             # routes via inject, git on temp repos, msw adapters
├── contract/                # responses validated against contracts/openapi.yaml
├── docker/                  # sandbox, health checks, proxy permissions (stub CLI image, tagged)
└── e2e/                     # Playwright user stories + axe
```

**Structure Decision**: A single package and a single deployable (Constitution IV), with server
code organized by feature module. `src/shared` holds the Zod schemas, which act as the contract
between server and UI. The two sandbox images are build assets, not services.

## Complexity Tracking

| Violation / interpretation | Why needed | Simpler alternative rejected because |
|---|---|---|
| Docker runtime plus a socket-proxy container alongside the app | FR-008 requires isolated sandbox login sessions, and agent runs in the next feature need the same isolation | Running the provider CLIs directly in the Staplr process would let a compromised CLI read every other secret; mounting the raw Docker socket would give full control of the host |
