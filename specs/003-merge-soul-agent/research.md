# Research: One Agent, One Markdown File

All decisions below resolve the open points of the plan's Technical Context. Nothing is left as
NEEDS CLARIFICATION.

## R1. Where the agent file is stored

- **Decision**: The agent row keeps the whole file text in a new `definition` column (≤ 20,000
  characters). On every save the header is parsed and the result is also written to the agent's
  ordinary columns (`name`, `role`, `provider`, `providerConnectionId`, `model`). The file is the
  source; the columns are a copy kept in the same transaction.
- **Rationale**: The spec makes the file the single source (FR-016) but the rest of Staplr (readiness,
  one-Project-Manager rule, unique names, impact lists, hourly model checks) already queries those
  columns. Keeping them as a parsed copy means none of that code changes, and the file text is shown
  back character for character (SC-004).
- **Alternatives considered**: storing only the text and parsing it on every read (every list and
  rule would parse files; slow and duplicated); storing files on disk (rejected by clarification Q1).

## R2. The header format and its parser

- **Decision**: The header is the block between a first line `---` and the next line `---`. Inside,
  one `key: value` per line; the key is everything before the first colon, the value everything
  after it, trimmed; a value may be wrapped in single or double quotes, which are removed. Blank
  lines and lines starting with `#` inside the header are ignored. Exactly these keys are accepted:
  `name`, `role`, `provider`, `connection`, `model`. Unknown, duplicate or missing keys are errors.
  The parser lives in `src/shared/agent-file.ts` so the browser shows the same problems while typing
  and the server enforces them on save. It returns either the settings and body or a list of
  problems, each `{ line, field, message }`.
- **Rationale**: Five flat string settings do not need YAML. A general YAML parser would accept
  nested values, anchors and type coercion (`model: 1.0` becomes a number) that the spec does not
  allow and that produce confusing messages. A 60-line parser with exact line numbers meets SC-001a.
  It reads like familiar "front matter".
- **Alternatives considered**: `yaml` / `gray-matter` packages (new dependency, far more syntax than
  needed, weaker error locations); JSON header (unfamiliar to write by hand).

## R3. Checks that need the server

- **Decision**: The shared parser checks the shape (header present and closed, known keys, role and
  provider values, name length). The server also checks: the name is unique among agents ignoring
  case; the connection names an existing connection of that provider; the model is verified for that
  connection (existing rule from features 001/002, discovered models included); the
  one-Project-Manager rule for every project the agent is on. All problems found are returned
  together in one `422` with the same `{ line, field, message }` shape, so the editor marks them.
  An empty `connection` or `model` is accepted and leaves the agent Not ready (spec FR-002).
- **Rationale**: One list of problems per save (SC-001a). The verified-model rule stays enforced on
  the server, so the file cannot bypass it.

## R4. Saves never overwrite a newer version

- **Decision**: Each agent has a `revision` integer, starting at 1 and increased on every save. The
  editor sends the revision it loaded; the server refuses a save with `409 agent_changed` when it does
  not match. The editor then offers "Reload" (keeps the owner's text in a copy box so nothing is lost).
- **Rationale**: Simplest reliable check for one owner with several tabs (FR-008); no locking.

## R5. Connection names inside files

- **Decision**: The file names a connection by its name; the server resolves it to the connection id
  (stored in `providerConnectionId`). When a connection is renamed, the same transaction rewrites the
  `connection:` line of every agent file that points to that connection id, bumps their revision and
  records one audit entry per agent. When a connection is disconnected, `providerConnectionId`
  becomes empty (existing foreign-key rule) but the file keeps the old name, so the agent shows Not
  ready "connection not found" and the owner sees what was there.
- **Rationale**: Names are what the owner reads and writes (FR-004b); ids keep the existing rules.

## R6. Role templates

- **Decision**: The four shipped templates move from `src/server/modules/souls/defaults/*.md` to
  `src/server/modules/agents/templates/*.md`. A `role_template` table holds templates kept from custom
  souls that no agent used at upgrade (FR-013); shipped templates are read from files, not stored, so
  a later release can improve them without a migration. `GET /api/agent-templates` returns both kinds,
  each as a ready file: a header with `role` set and `name`, `provider`, `connection`, `model` empty,
  then the body. Templates are read-only; deleting kept templates is not in this release.
- **Rationale**: The editor starts from text it can show as-is; no separate "role picker" model.

## R7. The upgrade (migration 0010) and its reversal

- **Decision**:
  - Up: copy `soul` and the agent→soul mapping into `soul_archive` / `agent_soul_archive` tables;
    add `role`, `definition`, `revision` to `agent`; fill each agent's file from its row and its
    soul (header from the agent's name, the soul's role, provider, the connection's current name and
    model; body = the soul's description as a first paragraph when it is not empty, a blank line,
    then the soul's instructions); copy custom souls no agent uses into `role_template`; rebuild
    `agent` without `soulId`; drop `soul`.
  - If an agent's text would exceed 20,000 characters (description 500 + instructions 20,000 + a
    header), the description is left out of the body and the upgrade summary in the audit log names
    the agent; nothing is cut from the instructions.
  - Down: recreate `soul` from `soul_archive`; for each agent, if its body still equals the text the
    upgrade made, point it back at its archived soul; otherwise create a new custom soul named
    "<agent name> (from agent file)" with the agent's role and current body, so later edits are kept
    (FR-015); agents created after the upgrade get such a soul too; `role_template` rows become
    custom souls; then drop the new columns and archive tables.
- **Rationale**: Reversible as the constitution requires, and nothing the owner wrote is lost in
  either direction.

## R8. Markdown preview

- **Decision**: Add the runtime dependency `react-markdown` (10.1.x) for the preview, with raw HTML
  disabled (default) and links opened only for `http`, `https` and `mailto` (default URL transform).
- **Rationale**: The spec requires a formatted preview (FR-004). `react-markdown` renders to React
  elements, so no HTML string is ever inserted into the page and there is nothing to sanitise; it
  ignores raw HTML in the text by default. It is widely used and maintained.
- **Alternatives considered**: `marked` (no dependencies, but produces an HTML string that needs a
  sanitiser such as DOMPurify and `dangerouslySetInnerHTML`, two security-sensitive pieces);
  `markdown-it` (same HTML-string issue); showing plain text only (does not meet FR-004).

## R9. The editor

- **Decision**: A plain, labelled `<textarea>` (the existing `TextArea` component, monospace) with a
  "Preview" tab, a problems list linked to line numbers, and helper buttons "Insert connection" and
  "Insert model" that rewrite the matching header line using the shared serializer. No code-editor
  library.
- **Rationale**: Fully keyboard- and screen-reader-friendly out of the box (WCAG 2.2 AA), works at
  320 px, no new dependency. Syntax colouring is not required by the spec.
- **Alternatives considered**: CodeMirror / Monaco (large dependencies, extra accessibility work).

## R10. What else moves

- **Decision**: `/api/souls*` routes, the soul service and impact hook, `src/web/routes/souls/*`,
  `src/web/features/souls/*`, the Souls entry in settings and the `us3-souls` e2e spec are removed.
  `roleLabels` moves to `src/web/features/agents/api.ts`. The project impact query reads `agent.role`
  instead of joining `soul`. Audit actions `soul.*` stay readable in the audit log as history; new
  agent edits record `agent.updated` with the changed setting names only, never the file text.
