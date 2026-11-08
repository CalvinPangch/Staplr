# Tasks: One Agent, One Markdown File (Soul and Agent Combined)

**Input**: Design documents from `specs/003-merge-soul-agent/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-changes.md, quickstart.md

**Tests**: Required. The constitution (Principle I) makes test-first non-negotiable: every test task
is written and run **failing for the expected reason** before its implementation task.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on unfinished tasks)
- **[Story]**: US1 create an agent as one file, US2 edit the file, US3 existing souls and agents
  carry over, US4 role rules still hold.

## Path Conventions

Web application as in features 001–002: `src/server/`, `src/shared/`, `src/web/`, `tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Add the runtime dependency `react-markdown` (exact version `10.1.0`) with `npm install --save-exact react-markdown@10.1.0`; record the justification from research R8 in the `package.json` change's commit message; confirm `npm audit --audit-level=high` stays clean
- [X] T002 [P] Move the four shipped role templates from `src/server/modules/souls/defaults/*.md` to `src/server/modules/agents/templates/` (`project-manager.md`, `business-analyst.md`, `developer.md`, `qa.md`) with `git mv`, keeping their text unchanged, and update the copy step in `scripts/copy-assets.mjs` if it lists the old folder

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the file format, the new schema and the migration that every story depends on.

- [X] T003 [P] Unit tests first in `tests/unit/agent-file.test.ts` for `parseAgentFile` / `setHeaderValue` / `renderAgentFile` in `src/shared/agent-file.ts`: a valid file returns `{ settings: { name, role, provider, connection, model }, body }`; line 1 must be `---` and the header must close with a line that is exactly `---`; each header line is `key: value` (value trimmed, surrounding single or double quotes removed, the key is everything before the first colon so `name: A: B` gives `A: B`); blank lines and lines starting with `#` inside the header are ignored; each of the five keys must appear exactly once; unknown, duplicate and missing keys are errors; `role` must be one of `project_manager`, `business_analyst`, `developer`, `qa`, `custom`; `provider` must be `claude` or `codex`; `name` must be 1–80 characters; `connection` and `model` may be empty; `model` when set must be 1–200 characters; the whole file must be at most 20,000 characters; CRLF and LF both parse; every problem is `{ line, field, message }` with a 1-based line (`field` is the key, or `header` / `file`) and ALL problems are returned together; `setHeaderValue(file, key, value)` rewrites only that header line and leaves every other character unchanged; `renderAgentFile(settings, body)` round-trips through `parseAgentFile`
- [X] T004 Implement `src/shared/agent-file.ts` to pass T003 (no new dependency; research R2)
- [X] T005 [P] Migration tests first in `tests/integration/migrations.test.ts` for `0010_agent_files` using a database at `0009` seeded with: the four default souls; a custom soul shared by two agents; an unused custom soul; an agent whose soul has an empty description; an agent whose connection was disconnected (NULL); an agent whose soul description + instructions + header would exceed 20,000 characters. Expect after up: `agent` has `definition TEXT NOT NULL` (1–20,000), `revision INTEGER NOT NULL` = 1, `role` with CHECK in the five role values, `model` nullable, no `soulId`; table `soul` gone; each agent's `definition` parses (T004) to its name, its soul's role type, its provider, its connection's current name (empty when NULL) and its model; the body is the soul's description, a blank line, then the soul's instructions (only instructions when the description is empty, and for the oversized agent, which is also named in an audit entry `agents.upgraded`); the two agents sharing a soul have equal but separate files; `role_template` has one row for the unused custom soul (`role`, `label` = soul name, `body`) and none for default or used souls; `soul_archive` and `agent_soul_archive` hold the old rows. Expect after down: `soul` restored from the archive; unchanged agents point at their original soul; an agent whose body was edited after up, and an agent created after up, each point at a new custom soul named `<agent name> (from agent file)` with the agent's role and current body; `role_template` rows become custom souls; new columns and archive tables are gone; then up again succeeds
- [X] T006 Write `src/server/db/migrations/0010_agent_files.sql` and `0010_agent_files.down.sql` to pass T005 (research R7; SQLite table rebuild for `agent`; parameter-free SQL only; header lines built exactly as `renderAgentFile` would)
- [X] T007 [P] Update `src/server/db/schema.ts`: `agent` gains `definition`, `revision`, `role`, nullable `model`, loses `soulId`; add `roleTemplates`; remove `souls`
- [X] T008 [P] Update `src/shared/schemas/agents.ts`: `agentCreateSchema = { definition: string 1–20,000 }` and `agentUpdateSchema = { definition, revision: int ≥ 1 }` (both `.strict()`); `agentSchema` adds `definition`, `revision`, `connectionName` (nullable), makes `model` nullable, removes `soulId`; add `agentTemplateSchema` `{ id, role, label, kind: 'shipped' | 'kept', definition }` and the problem detail type `{ line, field, message }[]`; delete `src/shared/schemas/souls.ts` once nothing imports it (T016)
- [X] T009 Update `specs/001-agent-team-orchestration/contracts/openapi.yaml` per `contracts/api-changes.md`: remove all `/api/souls*` paths and the `Soul` schemas; change `Agent` and the agent request bodies; add `/api/agent-templates` and `AgentTemplate`; add the `agent_file_invalid` (422) and `agent_changed` (409) problem descriptions

**Checkpoint**: files parse identically in browser and server; the database holds one file per agent.

---

## Phase 3: User Story 1 - Create an agent as one Markdown file (Priority: P1) 🎯 MVP

**Goal**: pick a role, get a ready file, fill the header (helpers available), save; no Souls screen.

**Independent Test**: on a fresh install, create a Developer agent on a verified model from one
screen; it is Ready and its file shows the Developer template below the header.

### Tests for User Story 1 ⚠️

- [X] T010 [P] [US1] Integration tests in `tests/integration/agent-files.test.ts` (replaces `tests/integration/souls.test.ts`, which is deleted): `GET /api/agent-templates` returns four `shipped` templates whose `definition` parses with `role` set and `name`, `provider`, `connection`, `model` empty, and whose body equals the template file; `POST /api/agents { definition }` with a valid file returns `201` with `revision: 1`, `definition` byte-for-byte as sent, and the parsed `name`, `role`, `provider`, `providerConnectionId`, `connectionName`, `model`; readiness `ready` on a verified model; an empty `connection` or `model` saves and is `not_ready` with the existing reasons; server-only problems are returned together in one `422 agent_file_invalid` with `details.problems` (duplicate name ignoring case, unknown connection for that provider, model not verified for that connection — discovered models allowed — plus parser problems); nothing is stored on `422`; audit `agent.created` has no file text; `/api/souls` and `/api/souls/{id}` answer `404`; nothing in replies or the database contains secrets (reuse `dumpPlaintext`)
- [X] T011 [P] [US1] Update `tests/integration/agents.test.ts` and every other test that creates agents through `{ soulId, provider, providerConnectionId, model }` (search `tests/` for `soulId`) to send a file built with `renderAgentFile`; keep each test's intent unchanged
- [X] T012 [P] [US1] Contract tests in `tests/contract/agents.contract.test.ts`: `GET /api/agent-templates`, `POST /api/agents` (201, 422), `GET /api/agents` match the updated OpenAPI; the removed soul endpoints are absent from the spec
- [X] T013 [P] [US1] E2E in `tests/e2e/us4x-agent-files.spec.ts` (named to run after `us4-agents.spec.ts`, which expects an empty agent list; replaces `tests/e2e/us3-souls.spec.ts`, which is deleted): New agent → choose Developer → the editor shows `role: developer` and the Developer instructions; type the name, use "Insert connection" and "Insert model" (an unverified model is not offered); save; the agent list shows it Ready; no "Souls" link in the navigation or settings; axe at desktop and 320 px

### Implementation for User Story 1

- [X] T014 [US1] Create `src/server/modules/agents/templates.ts`: read the four shipped files once (labels "Project Manager", "Business Analyst", "Developer", "QA"), read `role_template` rows as `kept`, and return each as a ready file via `renderAgentFile` with `name`, `provider`, `connection`, `model` empty
- [X] T015 [US1] Rewrite create in `src/server/modules/agents/service.ts`: parse with `parseAgentFile`, then server checks (unique name ignoring case; `connection` resolved by name among that provider's connections; model verified for the connection via `providers.listModelAccess`, discovered models included; empty connection/model allowed); collect ALL problems with their header line and throw `ServiceError(422, 'agent_file_invalid', "The agent file has N problems. Fix them and save again.", { problems })`; insert `definition` exactly as received, `revision = 1` and the parsed columns in one transaction; audit `agent.created` with `{ provider, role }` only; read paths select `role`, `definition`, `revision` and the connection name, no longer joining `soul`
- [X] T016 [US1] Remove souls: delete `src/server/modules/souls/` (service, routes), the soul wiring and `registerAgentImpact`'s soul hook in `src/server/app.ts` and `src/server/modules/agents/impact.ts`, and `src/shared/schemas/souls.ts`
- [X] T017 [US1] Routes in `src/server/modules/agents/routes.ts`: `POST /api/agents` takes `agentCreateSchema`; add `GET /api/agent-templates`; session and Origin checks as for the other agent routes
- [X] T018 [P] [US1] Web: move `roleLabels` to `src/web/features/agents/api.ts` (update `src/web/features/projects/TeamRoster.tsx` and `src/web/routes/agents/index.tsx`); add `useAgentTemplates()`; delete `src/web/routes/souls/` and `src/web/features/souls/`, their routes in `src/web/router.tsx`, the Souls entry in `src/web/routes/settings/index.tsx`, and soul wording on `src/web/routes/agents/index.tsx` and `src/web/routes/projects/$projectId.tsx`
- [X] T019 [US1] Web: create `src/web/features/agents/AgentFileEditor.tsx` — the labelled `TextArea` (monospace) for the whole file, live parser problems from `parseAgentFile` listed under it (each naming its line, linked with `aria-describedby`), and helper controls "Insert connection" (connections of the header's provider) and "Insert model" (only models `available` for the chosen connection, from `GET /api/models`) that call `setHeaderValue`
- [X] T020 [US1] Web: rewrite the new-agent flow in `src/web/routes/agents/$agentId.tsx`: first a template picker (shipped templates, then kept ones, grouped and labelled), then `AgentFileEditor` with the chosen template's file; Save posts `{ definition }`; server problems from `422` are merged into the same problems list; loading, empty (no templates), error and success states; announce success through the live region

**Checkpoint**: a new agent is created as a file from one screen; souls are gone.

---

## Phase 4: User Story 2 - Edit an agent's Markdown file (Priority: P1)

**Goal**: edit the whole file with preview; saves are exact, independent, never overwrite a newer
version; connection renames keep files valid.

**Independent Test**: edit the Developer agent's file, save, reopen; a second Developer agent is
unchanged; a stale tab's save is refused.

### Tests for User Story 2 ⚠️

- [X] T021 [P] [US2] Integration tests in `tests/integration/agent-files.test.ts`: `PUT /api/agents/{id} { definition, revision }` stores the text exactly and returns `revision + 1`; a save with an old revision returns `409 agent_changed` with `details.revision` and changes nothing; editing one of two agents made from the same template leaves the other byte-for-byte unchanged; changing `model:` to another verified model applies (readiness recomputed); changing `role:` keeps the body unchanged; a file over 20,000 characters is refused with the last version kept; audit `agent.updated` detail is `{ changed: [...] }` listing changed setting names and `instructions` when the body changed, never the text; renaming a provider connection rewrites the `connection:` line of every agent file using it (other characters unchanged), bumps their revision and records `agent.updated` `{ changed: ["connection"] }`; disconnecting a connection keeps the name in the file, `providerConnectionId` becomes null and the agent is `not_ready`
- [X] T022 [P] [US2] Contract tests in `tests/contract/agents.contract.test.ts` for `PUT /api/agents/{id}` (200, 409, 422)
- [X] T023 [P] [US2] E2E in `tests/e2e/us4x-agent-files.spec.ts`: edit instructions, switch to Preview (headings render; a `<script>` line in the text renders as text, not as an element), save, reload — text identical; break the header (`role: dev`, delete `provider:`) — save refused, two problems each naming its line, last version kept; leaving with unsaved edits warns; two tabs: the second save shows "changed somewhere else" with Reload and the owner's text kept in a copy box; axe at desktop and 320 px

### Implementation for User Story 2

- [X] T024 [US2] Update in `src/server/modules/agents/service.ts`: same parse and server checks as T015, plus `revision` check (`409 agent_changed` with the message from `contracts/api-changes.md`), store the text exactly, `revision + 1`, audit `agent.updated` with `{ changed }` only
- [X] T025 [US2] Route `PUT /api/agents/{id}` in `src/server/modules/agents/routes.ts` with `agentUpdateSchema` and Zod-validated params
- [X] T026 [US2] Connection rename: in `src/server/modules/providers/service.ts` `rename()` call a hook registered by the agent module (in `src/server/modules/agents/impact.ts`) inside the same transaction that rewrites the `connection:` line with `setHeaderValue` for every agent whose `providerConnectionId` is that connection, bumps `revision`, updates `updatedAt`, and records `agent.updated` `{ changed: ["connection"] }`
- [X] T027 [P] [US2] Web: in `src/web/features/agents/AgentFileEditor.tsx` add the "Edit" / "Preview" tabs (proper `tablist` roles, keyboard arrows) with the preview rendered by `react-markdown` (raw HTML skipped, default safe URL transform, links open in a new tab with `rel="noreferrer noopener"`), and the settings shown as a short list above the preview
- [X] T028 [US2] Web: edit flow in `src/web/routes/agents/$agentId.tsx` — load the agent's `definition` and `revision`, save with `PUT`, show `409` as a notice with "Reload" and a read-only copy box holding the owner's unsaved text, warn before leaving with unsaved edits (router blocker + `beforeunload`), and a "Replace instructions with the role template" button that asks first and leaves the header as is

**Checkpoint**: files are editable, exact, independent and safe against stale saves.

---

## Phase 5: User Story 3 - Existing souls and agents carry over (Priority: P2)

**Goal**: after upgrading, every agent works as before and nothing written is lost.

**Independent Test**: upgrade a seeded pre-feature database; agents keep role, text, teams and
readiness; the unused custom soul is offered as a template.

### Tests for User Story 3 ⚠️

- [X] T029 [P] [US3] Integration test in `tests/integration/agent-files-upgrade.test.ts`: build an installation at migration `0009` with the seed from T005 plus two projects (one PM each) and verified models, record every agent's readiness, role and teams and each project's Project Manager through the API, start the app (runs `0010`), and assert they are identical (SC-002); each agent's instructions equal its former soul's text character for character; `GET /api/agent-templates` includes the unused custom soul as `kind: 'kept'` with its name as label

### Implementation for User Story 3

- [X] T030 [US3] Make T029 pass: fix any reader still assuming souls (search `src/` for `soul`), including `src/server/modules/projects/impact.ts` which must read `agent.role` instead of joining `soul`, and the audit labels in `src/web/routes/audit.tsx` (keep `soul.*` labels for history; add `agents.upgraded`: "Agents converted to files")

**Checkpoint**: upgrades keep every team working.

---

## Phase 6: User Story 4 - Role rules still hold (Priority: P2)

**Goal**: exactly one Project Manager per project, enforced on the agent's own role.

**Independent Test**: changing the only PM's `role:` is refused naming the project; making a second
PM on a team is refused.

### Tests for User Story 4 ⚠️

- [X] T031 [P] [US4] Integration tests in `tests/integration/agent-files.test.ts`: saving a file that changes the only Project Manager's `role:` returns `422 agent_file_invalid` with a problem on the `role` line naming each affected project; saving a team member's file with `role: project_manager` on a project that already has one is refused the same way; any agent (not only former PM copies) may be created with `role: project_manager`; adding agents to teams keeps today's rules using the agent's own role (`tests/integration/teams.test.ts` updated to build agents from files)

### Implementation for User Story 4

- [X] T032 [US4] In `src/server/modules/agents/service.ts` run the existing `guard` for the one-PM rule on every save whose parsed `role` differs from the stored one, turning its result into a `role`-line problem naming the projects; check `src/server/modules/projects/team-service.ts` messages that mention souls ("Choose an agent whose soul has the Project Manager role" becomes "Choose an agent whose role is Project Manager")

**Checkpoint**: all stories work.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T033 [P] Update `tests/e2e/us4-agents.spec.ts`, `tests/e2e/us5-projects.spec.ts`, `tests/e2e/a11y-responsive.spec.ts` (drop `/souls`, `/souls/new`; add the new-agent template picker and an agent's editor) and any other e2e helper that creates agents through the old form
- [X] T034 [P] Update `README.md` (agents are Markdown files with a settings header; the four role templates; souls removed) and mark feature 001 FR-015–FR-019 as superseded in `specs/001-agent-team-orchestration/spec.md` with a pointer to this feature
- [X] T035 Run all gates: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run test:docker`, `npm run test:e2e`, `npm audit --audit-level=high`; fix findings without weakening tests
- [ ] T036 Run `specs/003-merge-soul-agent/quickstart.md` scenarios 1–7 in the dev app and record results in `specs/003-merge-soul-agent/checklists/quickstart-results.md`; scenario 8 (upgrade and roll back a real older database) is a **manual task for a person** with their own data

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after Setup; blocks all stories (the migration removes `soulId`).
- **US1 (Phase 3)**: after Foundational. **MVP.**
- **US2 (Phase 4)**: after US1 (reuses the editor and the save checks).
- **US3 (Phase 5)**: after Foundational; best after US1 so the app runs without souls.
- **US4 (Phase 6)**: after US2 (the guard runs on update).
- **Polish (Phase 7)**: after all stories.

### Within Each Story

Tests first and failing → service → routes → web.

### Parallel Opportunities

- T001 and T002 together.
- T003 and T005 together; then T007, T008 alongside T004/T006.
- US1: T010–T013 together; T018 alongside T014–T017.
- US2: T021–T023 together; T027 alongside T024–T026.
- US3 (T029–T030) alongside US2 by a second person.

---

## Parallel Example: User Story 1

```text
# Tests together:
T010 tests/integration/agent-files.test.ts
T011 tests/integration/agents.test.ts (+ other soulId users)
T012 tests/contract/agents.contract.test.ts
T013 tests/e2e/us4x-agent-files.spec.ts
# Then:
T014–T017 server (templates, service, removal, routes)
T018 web clean-up, in parallel with the server tasks
T019–T020 editor and new-agent flow
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

Setup → Foundational → US1. Stop and check quickstart scenario 1: an agent is created from a
template as one file and is Ready; no Souls screen.

### Incremental Delivery

1. US1 → create agents as files (MVP).
2. US2 → edit, preview, stale-save protection, rename propagation.
3. US3 → proven upgrade of existing installations.
4. US4 → Project Manager rule on the agent's own role.
5. Polish → docs, remaining e2e, all gates.
