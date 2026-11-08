# Feature Specification: One Agent, One Markdown File (Soul and Agent Combined)

**Feature Branch**: `003-merge-soul-agent`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "combine soul and agent. user can modify the md file."

## Overview

Today the owner sets up a team member in two places: a **soul** (role, description, working
instructions) in the soul library, and an **agent** (name, provider, connection, model) that points
at a soul. This feature removes the separate soul. Each agent becomes **one Markdown file**: a
settings header at the top (name, role, provider, connection, model) followed by the agent's working
instructions. The owner reads and edits that file in Staplr's own editor. The four ready-made roles
(Project Manager, Business Analyst, Developer, QA) remain as starting templates for a new agent.

Example of an agent file:

```markdown
---
name: Dev Agent
role: developer
provider: claude
connection: Work Claude
model: claude-sonnet-5-5
---

# Developer

You implement tickets in small, reviewed steps...
```

## Clarifications

### Session 2026-11-08

- Q: Where does the owner edit the Markdown file? → A: In Staplr's own editor on the agent's page
  (Option A). There are no files on disk for the owner to edit.
- Q: Is the Markdown file only the instructions, or the whole agent? → A: The whole agent: a
  settings header (name, role, provider, connection, model) followed by the instructions, all
  editable as one file (Option B).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create an agent as one Markdown file (Priority: P1)

The owner starts a new agent by choosing a role. Staplr opens the agent's Markdown file, already
filled with that role's template: a settings header with the role set, and the role's instructions
below it. The owner fills in the name, provider, connection and model in the header (helpers on the
page can insert a connection and a verified model for them) and saves. There is no soul to create or
pick first.

**Why this priority**: This is the core of the change. Setting up an agent becomes one file in one
place instead of two screens, and the separate soul library disappears.

**Independent Test**: On a fresh installation, create a Developer agent on a verified model without
visiting any other screen; it is Ready and its file shows the Developer template below the header.

**Acceptance Scenarios**:

1. **Given** the new-agent page, **When** the owner chooses the role Developer, **Then** the editor
   holds a file whose header says `role: developer` and whose body is the Developer template.
2. **Given** the editor, **When** the owner uses the connection and model helpers, **Then** the
   chosen connection name and a model verified for that connection are written into the header;
   models that are not verified cannot be inserted.
3. **Given** a complete, valid file, **When** the owner saves, **Then** the agent exists with the
   name, role, provider, connection, model and instructions from the file, and appears in the agent
   list.
4. **Given** the main navigation, **When** the owner looks for souls, **Then** there is no Souls
   screen; roles are part of each agent's file.

---

### User Story 2 - Edit an agent's Markdown file (Priority: P1)

The owner opens an agent and edits its Markdown file in Staplr's editor: the settings header and the
instructions that tell the agent how to work. The change applies from the agent's next ticket.
Editing one agent never changes another.

**Why this priority**: The owner asked to be able to modify the Markdown directly; this is how an
agent's behaviour is customised once souls are gone.

**Independent Test**: Edit the Developer agent's Markdown, save, reopen it, and see the saved text;
a second Developer agent's Markdown is unchanged.

**Acceptance Scenarios**:

1. **Given** an agent, **When** the owner edits its Markdown and saves, **Then** reopening the
   agent shows exactly the saved text.
2. **Given** two agents created from the same role, **When** one agent's Markdown is edited,
   **Then** the other agent's Markdown is unchanged.
3. **Given** unsaved edits, **When** the owner tries to leave the page, **Then** they are warned
   before the edits are lost.
4. **Given** a file that breaks a rule (too long; header missing or not closed; a required setting
   missing; an unknown setting; an unknown role, provider or connection; a model that is not
   verified for that connection; a name already used by another agent), **When** the owner saves,
   **Then** the save is refused, every problem is listed with the header line it concerns and what
   to fix, and the last saved version is kept.
5. **Given** the editor, **When** the owner reads it, **Then** they can see a formatted preview of
   the instructions as well as the text, and the header shown as the agent's settings.
6. **Given** a saved agent, **When** the owner changes `model:` in the header to another model
   verified for the same connection and saves, **Then** the agent uses that model from its next
   ticket.

---

### User Story 3 - Existing souls and agents carry over (Priority: P2)

After the upgrade every existing agent keeps working exactly as before: it gets its own copy of the
role and instructions of the soul it used. Nothing the owner wrote is lost.

**Why this priority**: Existing installations must upgrade without the owner redoing their team.

**Independent Test**: Upgrade an installation where two agents share an edited custom soul; both
agents keep their role, have identical Markdown equal to that soul's instructions, stay Ready, and
stay on their project teams.

**Acceptance Scenarios**:

1. **Given** an agent that used a soul, **When** the upgrade runs, **Then** the agent's file has a
   header with its name, the soul's role, and its provider, connection and model, followed by the
   soul's description and instructions.
2. **Given** two agents sharing one soul, **When** the upgrade runs, **Then** each gets its own
   copy, so later edits to one do not affect the other.
3. **Given** a custom soul no agent used, **When** the upgrade runs, **Then** its text is kept and
   the owner can find it [assumed: offered as an extra template when creating an agent].
4. **Given** projects whose teams relied on soul roles, **When** the upgrade runs, **Then** every
   project still has exactly the same Project Manager and readiness as before.

---

### User Story 4 - Role rules still hold (Priority: P2)

The role now belongs to the agent. The project rules that depended on the soul's role keep working:
each project has exactly one Project Manager.

**Why this priority**: Moving the role must not break team validity.

**Independent Test**: Try to change the role of a project's only Project Manager agent to Developer;
the change is refused and names the project.

**Acceptance Scenarios**:

1. **Given** an agent that is the only Project Manager of a project, **When** the owner changes
   `role:` in its header and saves, **Then** the save is refused and the affected projects are named.
2. **Given** a project with a Project Manager, **When** the owner changes another team member's
   role to Project Manager, **Then** the change is refused because the project would have two.
3. **Given** a change of role, provider, connection, model or Markdown, **When** it is saved,
   **Then** it applies from the agent's next ticket, as edits do today.

### Edge Cases

- The owner clears the instructions below the header: allowed; the agent works with no extra
  instructions, and the editor offers to insert the role's template again.
- The owner deletes the header or a required line: the save is refused and the message names the
  missing setting; nothing changes.
- A provider connection is renamed: every agent file that names it is updated to the new name, so
  no agent breaks; the edit is recorded in the audit log.
- A provider connection is disconnected: agent files keep the old name; those agents show Not ready
  with "connection not found", and the save of such a file is accepted only after the owner names an
  existing connection or leaves the connection empty (Not ready).
- The header names a model not verified for the connection: the save is refused, as model rules
  are today; an existing agent whose model later becomes unavailable stays saved and shows Not
  ready.
- Changing `role:` in the header does not replace the instructions; a button offers to replace them
  with the new role's template after asking.
- A role template changes in a later release: existing agents keep their own Markdown; only new
  agents start from the new template.
- Very long Markdown: refused above the limit with a clear message (the current limit for
  instructions is 20,000 characters; the combined file includes the former description too).
- The owner pastes text containing secrets (tokens, keys) into the Markdown: it is stored as the
  owner wrote it and is never sent anywhere except to the agent's own provider when it runs;
  Staplr does not show a warning in this release.
- An agent is deleted: its Markdown is deleted with it and an audit entry records the deletion.
- Two browser tabs edit the same agent: the second save does not silently overwrite the first; the
  owner is told the agent changed and can reload.
- The upgrade meets an agent whose soul was deleted or is missing: the agent gets its role's
  template and is flagged in the upgrade summary.

## Requirements *(mandatory)*

### Functional Requirements

**Agents own their role and instructions**

- **FR-001**: Each agent MUST be defined by one Markdown file: a settings header followed by the
  instructions. The separate soul entity, the soul library screen and its navigation link MUST be
  removed.
- **FR-002**: The header MUST be enclosed between two lines of three dashes at the top of the file
  and hold exactly these settings, one per line as `key: value`: `name` (1–80 characters, unique
  among agents ignoring case), `role` (`project_manager`, `business_analyst`, `developer`, `qa` or
  `custom`), `provider` (`claude` or `codex`), `connection` (the name of an existing connection of
  that provider, or empty), and `model` (a model verified for that connection, or empty). An empty
  connection or model is allowed and leaves the agent Not ready with that reason.
- **FR-003**: The system MUST ship one Markdown template per role. Starting a new agent MUST let the
  owner pick a role and open a file filled with that role's header and template. Changing `role:`
  MUST NOT replace the instructions; replacing them with the new role's template MUST be a separate
  action that asks first.
- **FR-004**: The owner MUST be able to view and edit an agent's whole file in Staplr's own editor,
  with a formatted preview of the instructions, and save it. A saved file MUST be shown back exactly
  as written. Helpers on the page MAY insert a connection name or a verified model into the header;
  they edit the same file.
- **FR-004a**: A save MUST validate the whole file and, when it is refused, list every problem with
  the header line it concerns and what to fix, keeping the last saved version unchanged.
- **FR-004b**: Renaming a provider connection MUST update the `connection:` line of every agent file
  that names it.
- **FR-005**: Each agent's Markdown MUST be independent: editing one agent never changes another.
- **FR-006**: Changes to an agent (role, provider, connection, model, Markdown) MUST apply from the
  agent's next ticket.
- **FR-007**: The whole file MUST be at most 20,000 characters; a longer save MUST be refused with a
  message, keeping the last saved version.
- **FR-008**: A save MUST NOT silently overwrite a newer version saved elsewhere; the owner MUST be
  told and offered a reload.
- **FR-009**: Every agent creation, edit (including Markdown edits) and deletion MUST be recorded in
  the audit log with the agent's name, without the Markdown text itself.

**Role rules**

- **FR-010**: Every project MUST keep exactly one Project Manager, now taken from the agents' own
  roles. A role change that would leave any project with none or with two MUST be refused, naming
  the projects.
- **FR-011**: Readiness rules for agents (connection, re-login, model availability) MUST stay as
  they are.

**Upgrade**

- **FR-012**: The upgrade MUST give every existing agent its own file: a header with its name, its
  soul's role, its provider, connection name and model, followed by the soul's description and
  instructions, as a separate copy per agent.
- **FR-013**: The upgrade MUST keep the text of custom souls that no agent used, offered as
  additional templates when creating an agent, so nothing the owner wrote is lost.
- **FR-014**: After the upgrade every agent's readiness and every project's team and Project Manager
  MUST be the same as before.
- **FR-015**: The upgrade MUST be reversible: going back to the previous release restores souls and
  agents as they were before the upgrade, keeping Markdown edits made since for agents whose soul is
  restored as a per-agent copy.

**Where the Markdown lives**

- **FR-016**: Agent files MUST be stored inside Staplr and edited only through Staplr's editor;
  there are no files on disk for the owner to edit. The file is the single source of the agent's
  settings and instructions: what the agent list, readiness and project teams show is read from the
  last saved file.

### Key Entities

- **Agent**: A team member, defined by its Markdown file. The file's header gives name, role
  (Project Manager / Business Analyst / Developer / QA / Custom), provider, provider connection
  (by name) and model; the body gives the instructions. Also: last edited time and readiness
  (computed). Belongs to zero or more project teams.
- **Role template**: Read-only Markdown shipped with the release for each role, plus templates kept
  from unused custom souls at upgrade. Used only to fill a new agent's instructions.
- **Soul** (removed): its role and text move into each agent that used it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner can create a ready agent from a role template in under 2 minutes, on one
  screen, without visiting any other screen.
- **SC-001a**: Every refused save names each problem and the header line it concerns, in 100% of
  tests with a missing header, missing setting, unknown setting or value, unverified model and
  duplicate name.
- **SC-002**: After the upgrade, 100% of existing agents keep their role, their instructions text
  (character for character), their project teams and their readiness.
- **SC-003**: Editing one agent's Markdown changes no other agent in 100% of tests with agents made
  from the same role or the same former soul.
- **SC-004**: A saved Markdown file is shown back identically (character for character) every time
  it is reopened.
- **SC-005**: No project ever ends up with zero or two Project Managers through a role change.
- **SC-006**: The agent editor, including the Markdown editor and preview, passes the accessibility
  checks at desktop width and at 320 px wide.

## Assumptions

- The four role templates are the instructions of today's default souls.
- "Custom" stays a role for agents that are none of the four standard roles.
- Restricting the Project Manager role to copies of the default PM soul (feature 001, FR-018) is
  replaced by FR-010: any agent may be given the Project Manager role, and the one-PM-per-project
  rule keeps teams valid.
- Staplr reads only the header; the instructions are plain text the owner controls. Staplr does
  not interpret them beyond showing a preview and passing them to the agent when it runs (agent
  runs are a later feature).
- The header uses the common "front matter" layout seen in other tools' agent files, so it looks
  familiar; only the five settings above are accepted in this release.
- Feature 001's soul requirements (FR-015 to FR-019) and the soul parts of FR-020 and FR-022 are
  superseded by this feature.
- Single owner, as in feature 001; no sharing or permissions for agent files.
