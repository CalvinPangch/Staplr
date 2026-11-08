# Implementation Plan: One Agent, One Markdown File (Soul and Agent Combined)

**Branch**: `003-merge-soul-agent` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/003-merge-soul-agent/spec.md`

## Summary

Souls disappear. Each agent becomes one Markdown file: a five-line settings header (`name`, `role`,
`provider`, `connection`, `model`) followed by the agent's instructions, edited in Staplr's own
editor with a preview. The file is stored on the agent row exactly as saved; on every save it is
parsed by a small shared parser and its settings are copied into the agent's existing columns, so
readiness, the one-Project-Manager rule, model verification and project teams keep working
unchanged. A new agent starts from a role template (the four shipped ones plus custom souls kept at
upgrade). Saves report every problem with its line number and never overwrite a newer version. A
reversible migration turns every existing soul+agent pair into a per-agent file.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node.js 22 (unchanged)
**Primary Dependencies**: Fastify 5, React 19, TanStack Query, Zod 4; **new**: `react-markdown`
10.1.x for the preview (research R8). Header parser written in-house (R2), no YAML library.
**Storage**: SQLite (better-sqlite3); migration `0010_agent_files` (+ down)
**Testing**: Vitest (unit, integration, contract), Playwright + axe (desktop and 320 px)
**Target Platform**: self-hosted server, modern browsers (unchanged)
**Project Type**: web application (Fastify API + React SPA)
**Performance Goals**: save and validate a 20,000-character file in under 200 ms server-side; the
editor shows parser problems as the owner types without noticeable delay
**Constraints**: file ≤ 20,000 characters; file shown back character for character; no file text in
logs or audit entries
**Scale/Scope**: one owner, tens of agents

No NEEDS CLARIFICATION remains; see [research.md](./research.md) R1–R10.

## Constitution Check

*GATE: passes before Phase 0 and after Phase 1.*

| Principle | How this design complies |
|---|---|
| I. Test-first | Unit tests for the shared parser and serializer (every problem kind with its line number, quotes, comments, CRLF, round trip) are written first. Migration up/down tests use a database seeded with shared, unused, default and deleted-soul cases. Integration tests cover create/save/conflict/PM rule/rename propagation/audit; contract tests cover the new Agent and template shapes and the removed soul endpoints (404). E2E covers the editor, problems list, preview, and the removed Souls screen. Each test is seen failing before the code. |
| II. Security & privacy | The file is owner-written text: validated by length and header rules, stored as given, never logged or written to audit detail (only changed setting names). The preview renders through `react-markdown` without raw HTML and with safe link schemes; no `dangerouslySetInnerHTML`. Connection and model settings are re-checked on the server, so the file cannot reach a model the connection is not verified for. Endpoints keep session and Origin checks; bodies validated with Zod. No personal data added. |
| III. Accessible UX | The editor is the existing labelled `TextArea`; problems are a list linked to the field by `aria-describedby`, each naming its line; Preview is a tab with proper roles; the unsaved-changes warning and the "changed elsewhere" notice are announced; loading, empty (no agents / no templates), error and success states; 320 px and axe in e2e. |
| IV. Simplicity | One new dependency, justified in R8 (alternatives need an HTML sanitiser). No YAML library, no code-editor library, no new service: the agent module absorbs what the soul module did, and the soul module is deleted. The file is copied into existing columns instead of changing every reader. |
| V. Spec-driven | specify → clarify (2 answers recorded) → plan → tasks. Supersedes feature 001 FR-015–FR-019 and the soul parts of FR-020/FR-022, as stated in the spec. |
| Operational | Reversible migration 0010 with archive tables (R7); upgrade summary in the audit log; structured logs for saves record agent id and problem counts only. |

No violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/003-merge-soul-agent/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api-changes.md
├── checklists/requirements.md
└── tasks.md            # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/shared/
├── agent-file.ts                      # new: parse/serialize the header; problems with line numbers
└── schemas/agents.ts                  # Agent adds definition, revision, connectionName; input = { definition[, revision] }
src/server/
├── db/migrations/0010_agent_files.sql (+ .down.sql)
├── db/schema.ts                       # agent columns; role_template; soul removed
├── modules/agents/templates/*.md      # moved from modules/souls/defaults/
├── modules/agents/templates.ts        # new: shipped + kept templates as ready files
├── modules/agents/service.ts          # save from file: parse, server checks, PM rule, revision, audit
├── modules/agents/routes.ts           # POST/PUT take the file; GET /api/agent-templates
├── modules/agents/impact.ts           # drop soul usage hook
├── modules/providers/service.ts       # rename rewrites agent files (via a hook from the agent module)
├── modules/projects/impact.ts         # read agent.role instead of joining soul
├── modules/souls/                     # deleted
└── app.ts                             # remove soul wiring
src/web/
├── routes/agents/$agentId.tsx         # file editor: template picker (new), helpers, preview, problems, conflict
├── features/agents/api.ts             # roleLabels moved here; templates query
├── features/agents/AgentFileEditor.tsx  # new: textarea + preview tab + problems list
├── routes/souls/, features/souls/     # deleted; Souls link removed from settings and router
└── features/projects/TeamRoster.tsx   # import roleLabels from agents
tests/
├── unit/agent-file.test.ts
├── integration/agent-files.test.ts    # replaces souls.test.ts; agents.test.ts updated to send files
├── integration/migrations.test.ts     # 0010 up/down cases
├── contract/agents.contract.test.ts   # new shapes; souls endpoints 404
└── e2e/us4x-agent-files.spec.ts        # replaces us3-souls.spec.ts; us4-agents.spec.ts updated
```

**Structure Decision**: same web-application layout as features 001 and 002. The agent module
takes over role templates; the soul module is removed rather than kept beside it.

## Complexity Tracking

None.
