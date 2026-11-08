# Data Model: One Agent, One Markdown File

Migration `0010_agent_files` (+ `0010_agent_files.down.sql`). See [research.md](./research.md) R1,
R6 and R7. No personal data is added.

## agent (changed)

| Column | Type | Rule | Purpose |
|---|---|---|---|
| id | TEXT PK | unchanged | |
| definition | TEXT NOT NULL | 1–20,000 characters | **New.** The agent file, exactly as the owner saved it (header + instructions). The source of everything below. |
| revision | INTEGER NOT NULL | ≥ 1, +1 per save | **New.** Detects a save based on an older version (R4). |
| name | TEXT NOT NULL | 1–80, unique ignoring case | Copy of header `name`. |
| role | TEXT NOT NULL | `project_manager` \| `business_analyst` \| `developer` \| `qa` \| `custom` | **New.** Copy of header `role` (was the soul's role type). |
| provider | TEXT NOT NULL | `claude` \| `codex` | Copy of header `provider`. |
| providerConnectionId | TEXT NULL | FK provider_connection, ON DELETE SET NULL | Header `connection` resolved to an id; NULL when the header is empty or the connection was disconnected. |
| model | TEXT NULL | 1–200 when set | Copy of header `model`; **now nullable** (empty model = Not ready). |
| createdAt, updatedAt | TEXT | unchanged | |
| ~~soulId~~ | | **removed** | |

Indexes: `agent_role(role)`, existing `agent_connection(providerConnectionId)`; `agent_soul` dropped.

Invariant: after every committed save, parsing `definition` gives exactly `name`, `role`,
`provider`, the name of `providerConnectionId` (or the unresolved name when the connection was
disconnected) and `model`.

## role_template (new)

| Column | Type | Rule | Purpose |
|---|---|---|---|
| id | TEXT PK | | |
| role | TEXT NOT NULL | role values above | Role written into the header of a new agent. |
| label | TEXT NOT NULL | 1–80 | Shown in the template picker (the former soul's name). |
| body | TEXT NOT NULL | ≤ 20,000 | Instructions placed below the header. |
| createdAt | TEXT NOT NULL | | |

Holds only templates kept from custom souls that no agent used at upgrade (FR-013). The four
shipped templates are files in `src/server/modules/agents/templates/` and are not stored.

## soul_archive, agent_soul_archive (new, upgrade only)

Exact copies of the old `soul` rows and of each agent's `soulId` at upgrade time, plus the body text
the upgrade generated per agent. Read only by the down migration (R7). Not used by the app.

## soul (removed)

Dropped by the up migration after archiving.

## The agent file (text format)

```text
---
name: <1–80 characters>
role: project_manager | business_analyst | developer | qa | custom
provider: claude | codex
connection: <connection name of that provider, or empty>
model: <model id verified for that connection, or empty>
---
<instructions, free Markdown>
```

Parsing rules (shared by browser and server, R2):

- Line 1 must be `---`; the header ends at the next line that is exactly `---`.
- Each header line is `key: value`; the value is trimmed; surrounding quotes are removed.
- Blank lines and lines starting with `#` inside the header are ignored.
- The five keys must each appear once; any other key is an error.
- Problems are reported as `{ line, field, message }` (`line` is 1-based; `field` is the key or
  `header` / `file`).

Server-only checks (R3): unique name; connection exists for the provider; model verified for the
connection; one Project Manager per project; total length ≤ 20,000.

## State and lifecycle

- **Create**: owner picks a template → editor text → save → `revision = 1`.
- **Save**: send `definition` + `revision`; on success `revision + 1`; on `409` nothing changes.
- **Connection rename**: every file naming the connection gets its `connection:` line rewritten,
  `revision + 1`, audit `agent.updated` (`changed: ["connection"]`).
- **Delete**: unchanged rule (blocked while on a project team).
- **Readiness**: unchanged computation from `providerConnectionId`, `model`, evidence; an empty
  connection or model gives the existing reasons ("no provider connection" / "model unavailable").
