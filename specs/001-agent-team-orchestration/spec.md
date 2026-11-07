# Feature Specification: Agent Team Orchestration Setup

**Feature Branch**: `001-agent-team-orchestration`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "i want to build an agent orchestration development team. we need to setup the github/gitlab token in the global settings. and we could create agent role/soul that can asigned to a project. (normally we have Project Manger , BA , Developer , QA) in the team. user can choose each agent is codex or cloude and its model. the codex/cloude need to login via sandbox and need to save the login information so that it can be reuse."

## Authentication revision (2026-11-08)

The user requested fixing the provider feasibility blocker. Claude now uses the owner's
Anthropic API key with direct provider billing. Codex retains its sandbox account login.
Earlier clarification references to both providers using saved subscription logins are
superseded by this revision and FR-006–FR-012 below.

## Clarifications

### Session 2026-11-08

- Q: How is a project added? → A: The user picks a repository from a list pulled from the connected
  account. The system then downloads that repository, and the user selects the agents for the team.
- Q: Is a Project Manager required on every team? → A: Yes. The Project Manager reads each ticket
  and assigns it to the next agent that should handle it, so a project cannot be ready without one.
- Q: Where do the tickets that the Project Manager reads come from? → A: Staplr's own built-in
  ticket board, worked in a spec-driven way. The user creates a ticket, the BA analyzes it and asks
  the user questions when something is unclear, and then the BA writes the spec/design.
- Q: How many Project Managers can one project team have? → A: Exactly one Project Manager per
  project.
- Q: How should Staplr keep a downloaded repository up to date? → A: Pull the latest code
  automatically before an agent starts each ticket, plus a manual "Refresh" button.
- Q: How should agents work on the downloaded repository? → A: Each ticket gets its own separate
  working copy (a worktree) taken from the project's downloaded repository, so tickets never
  interfere with each other or with the base copy. Ticket worktrees branch off the project's base
  branch, which defaults to the repository's default branch and can be changed per project.
- Q: What should "billing information" for each project/spec mean? → A: Token usage (input/output)
  for each agent run, plus an estimated cost based on each model's list price. The cost is always
  labeled "estimated" and is never presented as an invoice.
- Q: Should Staplr enforce spending limits on each project, or only report what was spent? → A:
  Report only. Staplr shows usage and estimated cost; there are no budgets, limits, or alerts.
- Q: How should the user view a project's usage and estimated cost? → A: A project total broken
  down by spec, by model, and by agent, with a date-range filter and CSV export.
- Q: Where will Staplr run: as a hosted multi-user service, or installed on the user's own machine
  or server? → A: Self-hosted. Each user runs their own Staplr installation and opens it in a
  browser. Tokens, provider logins, downloaded repositories, and usage records stay on that
  installation.
- Q: When a project is deleted, what happens to its downloaded code and its usage history? → A:
  The downloaded code and all working copies are deleted. The usage history is kept and marked as
  belonging to a deleted project.
- Q: Agents don't run in this feature, so where do usage recording, the usage view, and CSV export
  belong? → A: In the next feature (running the team). This feature keeps model prices, the cost
  calculation rule, and the definition of a usage record.
- Q: What makes an agent the Project Manager? → A: The role type of the agent's soul. Only the
  default Project Manager soul and copies of it have the Project Manager role type.
- Q: What is each card on the Kanban board: a ticket inside the project, or the project itself? →
  A: Each card is a ticket. Opening a project shows that project's own ticket board, with the
  columns New, Review, Testing, and End.
- Q: Should the ticket board be built in this feature or the next? → A: In this feature. After a
  project is added, its page shows the board, and the user creates tickets and moves them between
  columns by hand. Agents moving tickets comes in the next feature.
- Q: Can the user assign a ticket to an agent by hand in this feature? → A: No. Tickets stay
  unassigned in this feature; the Project Manager agent assigns them in the next feature.
- Q: Can tickets be edited or deleted, and what happens to them when their project is deleted? →
  A: The title and description can be edited at any time. A ticket can be deleted after
  confirming. Deleting a project deletes its tickets; usage records keep their own snapshot of the
  ticket title.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect a Source Control Account in Global Settings (Priority: P1)

The user opens Global Settings and adds an access token for GitHub or GitLab (or several). The
system checks the token, shows which account it belongs to and whether it has the permissions
agents will need, and stores it securely so every project can use it. The token is never shown
again in full.

**Why this priority**: Agents cannot read or change any project's code without repository access.
Everything else depends on it.

**Independent Test**: Add a valid GitHub token and a valid GitLab token in Global Settings; confirm
each shows as "Connected" with the account name; confirm a token missing a required permission is
rejected with a message naming that permission; confirm the saved token is shown only in masked
form.

**Acceptance Scenarios**:

1. **Given** no source control connection exists, **When** the user enters a valid GitHub token with
   all required permissions and saves, **Then** the system verifies it, shows the account name and
   granted permissions, and lists the connection as "Connected".
2. **Given** the user enters an invalid or expired token, or one missing a required permission,
   **When** they save, **Then** the system rejects it, stores nothing, and explains what is wrong
   and which permissions are required.
3. **Given** a saved token, **When** the user views Global Settings, **Then** only the last 4
   characters of the token are visible.
4. **Given** a saved token, **When** the user replaces or deletes it, **Then** the change takes
   effect for all projects, the old token is no longer stored, and projects that used a deleted
   connection show "Not ready".
5. **Given** a self-hosted GitLab instance, **When** the user adds a GitLab token, **Then** they can
   specify the instance address in addition to the token.
6. **Given** a saved connection, **When** the user selects "Check now", **Then** the system
   re-verifies it immediately and shows the result and the time of the check.

---

### User Story 2 - Connect AI Providers and Reuse Credentials (Priority: P1)

The user connects Claude with their own Anthropic API key and Codex through its account login
in an isolated sandbox. Credentials are stored encrypted and reused without repeated setup.
Claude usage is billed by Anthropic directly to the key owner; subscription login credentials
are not collected by Staplr.

**Why this priority**: Agents need an authenticated provider before they can be configured.

**Independent Test**: Save a valid Claude key; restart Staplr and check the connection without
re-entering it. Complete a Codex sandbox login and repeat the reuse check. Invalid credentials
are rejected and never saved. Both flows leave no secret in responses, logs or audit entries.

**Acceptance Scenarios**:

1. **Given** no Claude connection, **When** the user enters a name and their API key, **Then**
   Staplr verifies the key and lists the connection as Connected without returning the key.
2. **Given** a Codex sandbox login, **When** login succeeds and the user confirms completion,
   **Then** the encrypted credentials are saved as a named connection and the sandbox is removed.
3. **Given** invalid or rejected credentials, **When** the user saves them, **Then** nothing is
   saved and the error explains how to retry; a transient provider failure also saves nothing.
4. **Given** saved connections, **When** Staplr restarts or the user configures agents later,
   **Then** each connection can be checked and reused without repeating its setup.
5. **Given** expired/revoked credentials, **When** a check confirms authentication failure,
   **Then** the connection shows Needs re-login, its agents/projects show Not ready, and the
   fix action is Replace API key for Claude or Re-login for Codex, retaining the connection ID.
6. **Given** a used connection, **When** the user disconnects it, **Then** a confirmation lists
   affected agents/projects; confirming removes the credentials and makes them Not ready.
7. **Given** a Codex login, **When** the user cancels or it expires after 15 minutes of inactivity,
   **Then** nothing is saved and its sandbox is destroyed. Concurrent logins remain independent.
8. **Given** a Claude key replacement, **When** validation fails, **Then** the previous encrypted
   key remains intact; successful replacement invalidates prior model-access checks.

---

### User Story 3 - Create Agent Roles (Souls) (Priority: P2)

The user defines reusable agent roles, called "souls", that describe how an agent behaves: its
name, role type, responsibilities, working instructions, and boundaries. The system includes
ready-made souls for Project Manager, Business Analyst, Developer, and QA, which the user can use as
they are or copy and edit. The user can also create custom souls.

**Why this priority**: Souls give each agent a distinct job on the team. Default souls make it
possible to assemble a team quickly; custom ones make the product adaptable.

**Independent Test**: View the four default souls; create a custom "Security Reviewer" soul; copy
the default Developer soul, change its instructions, and save it; confirm all appear in the soul
library and the copy keeps the Developer role type.

**Acceptance Scenarios**:

1. **Given** a new installation, **When** the user opens the soul library, **Then** default souls
   for Project Manager, Business Analyst, Developer, and QA are available.
2. **Given** the soul library, **When** the user creates a soul from scratch with a name, role
   type, description, and instructions, **Then** it is saved and available for agent creation. The
   role types offered are Business Analyst, Developer, QA, and Custom.
3. **Given** a default soul, **When** the user copies it, **Then** they get an editable copy with
   the same role type, and the original default remains unchanged.
4. **Given** a soul used by one or more agents, **When** the user edits it, **Then** the system
   shows which agents are affected and the changes apply to those agents' next tickets.
5. **Given** a soul used by agents, **When** the user tries to delete it, **Then** the system
   blocks the deletion and lists the agents that still use it.

---

### User Story 4 - Configure Agents with Provider and Model (Priority: P2)

The user creates an agent by choosing a soul, an AI provider (Codex or Claude), a provider
connection, and a model offered by that provider. The agent's role comes from its soul. The user
can change these choices later.

**Why this priority**: The choice of provider and model per agent is a key requirement. It lets the
user match capability and cost to each role, for example a stronger model for the Developer and a
lighter one for the PM.

**Independent Test**: Create a "Dev Agent" using the Developer soul with Claude and a chosen Claude
model; create a "QA Agent" with Codex and a chosen Codex model; confirm each agent shows its role,
provider, and model, and that only models for the selected provider are offered.

**Acceptance Scenarios**:

1. **Given** at least one connected provider connection, **When** the user creates an agent,
   **Then** they must choose a name, a soul, a provider, a provider connection for that provider,
   and a model.
2. **Given** the user selects a provider, **When** they open the model list, **Then** only models
   available for that provider are offered.
3. **Given** no connected provider connection exists for a provider, **When** the user selects that
   provider, **Then** the system explains that a provider connection is required and offers to
   enter a Claude API key or start a Codex sandbox login, as appropriate.
4. **Given** an existing agent, **When** the user changes its soul, provider, provider connection,
   or model, **Then** the change is saved and applies to the agent's next ticket.
5. **Given** a model the provider has retired or that the provider connection can no longer access,
   **When** the system detects this, **Then** agents using it show "Not ready: model unavailable"
   and the user is prompted to pick another model.
6. **Given** an agent that is on one or more project teams, **When** the user tries to delete it,
   **Then** the system blocks the deletion and lists those projects.

---

### User Story 5 - Assemble a Project Team (Priority: P3)

The user adds a project by choosing one of their connected GitHub or GitLab accounts and then
picking a repository from that account's list. The system downloads the repository, and the user
selects which agents join the project's team. Every team must have exactly one Project Manager,
because the Project Manager reads each ticket and assigns it to the next agent that should handle
it. A typical team also has a Business Analyst, one or more Developers, and a QA. The same agent can
serve on several projects.

**Why this priority**: The team is where the earlier pieces come together. It depends on Stories
1–4.

**Independent Test**: Add a project by choosing a connection and picking a repository from the
list; confirm the repository is downloaded; assign a PM, BA, Developer, and QA agent; confirm the
team roster shows each member with its role, provider, and model, and shows the project as
"Ready". Remove the PM and confirm the project is no longer "Ready".

**Acceptance Scenarios**:

1. **Given** one or more source control connections, **When** the user starts adding a project,
   **Then** they choose a connection, and the system lists the repositories that connection can
   access, with search, so the user can select one.
2. **Given** the user has selected a repository, **When** they confirm, **Then** the system
   downloads it, shows download progress, and shows the project's repository as "Downloaded" when
   it finishes.
3. **Given** a downloaded project, **When** the user selects "Refresh", **Then** the system pulls
   the latest code from the remote repository and updates the project's "last updated" time.
4. **Given** a project, **When** the user assigns agents, **Then** the team roster shows each
   agent's name, role, provider, model, and readiness.
5. **Given** a team without a Project Manager, **When** the user tries to finish setting up the
   project, **Then** the system blocks it and explains that a Project Manager is required to read
   and assign tickets.
6. **Given** a team that already has a Project Manager, **When** the user tries to add another agent
   with the Project Manager role, **Then** the system blocks it and offers to replace the current
   Project Manager instead.
7. **Given** a team that has a Project Manager but is missing a Business Analyst, Developer, or QA,
   **When** the user views the roster, **Then** the system highlights the missing roles as a
   warning without blocking the user.
8. **Given** a team member that is "Not ready", or a project whose source control connection needs
   attention, **When** the user views the project, **Then** the project is shown as "Not ready"
   along with the specific reason and how to fix it.
9. **Given** an agent assigned to a project, **When** the user removes it from the team, **Then**
   the agent stays in the workspace and remains assigned to its other projects.
10. **Given** a project, **When** the user confirms deleting it, **Then** its downloaded code,
    working copies, team assignments, and tickets are removed, its agents stay in the workspace,
    and any usage records for it are kept and marked "Deleted project".

---

### User Story 6 - Review and Adjust Model Prices (Priority: P3)

The user views the list price Staplr uses for each model and corrects it when a provider changes
its pricing. These prices are used later to estimate the cost of agent runs.

**Why this priority**: Estimated cost reporting in the next feature depends on correct prices.
Setting them up now means cost tracking is accurate from the first ticket.

**Independent Test**: Open the model price list; confirm every model shows either a price with its
source and date, or "Unknown"; enter or change one model's price; confirm the new price applies
from now on and the previous price is still kept for its earlier period.

**Acceptance Scenarios**:

1. **Given** a new installation, **When** the user opens model prices, **Then** each offered model
   shows its price per input token and per output token with the source and date, or "Unknown"
   when no price could be verified, labeled as list prices used for estimates.
2. **Given** a model price, **When** the user changes it, **Then** the new price applies from that
   moment, and the old price is kept for the period it was in effect.
3. **Given** a model with no price, **When** the user views the list, **Then** it shows "Unknown"
   and invites the user to enter one.

---

### User Story 7 - Manage Tickets on the Project Kanban Board (Priority: P3)

After a project is added, opening it shows its ticket board as a Kanban board with four columns:
New, Review, Testing, and End. The user creates tickets, which start in New, and moves them
between columns by hand. In the next feature, agents will create the spec in Review, test in
Testing, and move tickets themselves; this feature delivers the board and manual control.

**Why this priority**: The board is where all work on a project will happen, and seeing it right
after adding a project shows the user what the team will work on. It needs a project (Story 5).

**Independent Test**: Add a project; confirm its page opens on an empty board with the four
columns; create a ticket and see it in New; move it to Review, Testing, and End by drag and drop
and by keyboard; reload and confirm every position is kept.

**Acceptance Scenarios**:

1. **Given** a project was just added, **When** the user opens it, **Then** the project page shows
   its ticket board with the columns New, Review, Testing, and End, and an empty state that
   invites the user to create the first ticket.
2. **Given** a project board, **When** the user creates a ticket with a title and description,
   **Then** it appears at the top of the New column.
3. **Given** a ticket on the board, **When** the user drags it to another column or position,
   **Then** it moves there and the change is saved.
4. **Given** a ticket on the board, **When** the user uses the keyboard-only move controls,
   **Then** they can move it to any column and position without a mouse.
5. **Given** a board with tickets, **When** the user reloads the page, **Then** every ticket is in
   the same column and order as before.
6. **Given** a ticket, **When** the user edits its title or description, **Then** the change is
   saved and shown on the card.
7. **Given** a ticket, **When** the user confirms deleting it, **Then** it is removed from the board
   permanently.

---

### Edge Cases

- A token is valid but lacks a required permission (reading code, pushing branches, or opening
  pull/merge requests): it is rejected at save time; if permissions are later reduced, the next
  health check marks the connection "Needs attention" and lists the missing permission.
- A source control token is revoked outside Staplr: the next health check (or "Check now") marks the
  connection "Needs attention" and its projects "Not ready".
- Two Codex sandbox logins run at once: each successful login creates its own
  separate provider connection; neither overwrites the other.
- The user closes the browser during a sandbox login: the session expires after its timeout and
  nothing is saved.
- The provider requires multi-factor authentication or CAPTCHA during login: the sandbox lets the
  user complete these steps interactively.
- The provider changes its list of available models: model lists update, and agents set to removed
  models show "Not ready: model unavailable".
- The repository download fails partway (network error, token lost access, very large repository):
  the project shows "Download failed" with the reason and a retry action, and does not become
  "Ready".
- The project's base branch is deleted or renamed upstream: the project shows "Not ready: base
  branch missing" and asks the user to choose another base branch.
- A manual refresh fails (network error, token revoked, remote history rewritten): the project
  keeps its previous local copy, shows the failure reason and last successful update time, and
  allows a retry.
- The chosen connection has no repositories it can access: the repository list shows an empty state
  explaining which token permissions are needed.
- A project's repository is deleted or renamed upstream: the project shows "Not ready: repository
  unavailable" and lets the user relink it.
- The user changes an agent's soul so that a project would have no Project Manager or two of them:
  the system blocks the change and names the affected projects.
- Staplr is stopped or restarted while a repository is downloading or a sandbox login is open:
  after it starts again the interrupted download shows "Download failed: interrupted" with a retry
  action, the interrupted login is marked failed and its sandbox is removed, and nothing partial
  is saved.
- An estimate is requested for a model with no known price: the result is "Unknown", never zero.

## Requirements *(mandatory)*

### Status Vocabulary

- **Source control connection**: "Connected" or "Needs attention" (with the reason: invalid,
  expired, revoked, or missing a named permission).
- **Provider connection**: "Connected" or "Needs re-login" (Claude fix: Replace API key; Codex fix: Re-login). Retryable check errors are shown separately.
- **Agent**: "Ready" or "Not ready" (with the reason: needs re-login, no provider connection, or
  model unavailable).
- **Project download**: "Downloading", "Downloaded", or "Download failed".
- **Ticket**: "New", "Review", "Testing", or "End" (the board columns).
- **Project**: "Ready" or "Not ready" (with each reason: download failed, repository unavailable,
  base branch missing, source control connection needs attention, no Project Manager, or a named
  agent not ready).

### Functional Requirements

**Global settings: source control**

- **FR-001**: System MUST let the user add, name, replace, and remove GitHub and GitLab access
  tokens in Global Settings. More than one connection per platform is allowed.
- **FR-002**: System MUST support GitLab instances at a user-specified address (self-hosted) in
  addition to gitlab.com.
- **FR-003**: System MUST validate each token when it is saved and show the account name and
  granted permissions. A token MUST be rejected unless it can read repository contents, push
  branches, and create pull/merge requests, and the message MUST name each missing permission.
- **FR-004**: System MUST store tokens encrypted, MUST NOT display them in full after saving (only
  the last 4 characters), and MUST NOT write them to logs or send them to the browser.
- **FR-005**: System MUST make every source control connection available to all projects.

**AI provider connections**

- **FR-006**: System MUST support two AI providers: Codex (OpenAI) and Claude (Anthropic).
- **FR-007**: System MUST let the user connect Claude with their own Anthropic API key and Codex by completing its own login flow in a sandbox. Claude subscription credentials MUST NOT be collected or stored by Staplr.
- **FR-008**: Codex login sandboxes MUST run on the user's installation, isolated from the system and agent working copies, expire after 15 minutes of inactivity, and be destroyed on completion, failure or cancellation.
- **FR-009**: System MUST encrypt saved Claude API keys and successful Codex login information at rest, reuse them for the selected connection, and never return credential values in API responses or logs.
- **FR-010**: System MUST allow named multiple connections for each provider. Concurrent Codex logins MUST create separate connections. Claude API key entry MUST explain direct Anthropic API billing.
- **FR-011**: Confirmed expired/revoked authentication MUST mark a provider connection Needs re-login. Claude MUST offer Replace API key and Codex MUST offer sandbox Re-login, preserving its ID and agent links. Failed replacement MUST retain the prior credential. Transient network, rate-limit and service errors MUST be retryable without falsely marking credentials revoked.
- **FR-012**: System MUST warn and list affected agents/projects before disconnecting a connection, and delete all its saved credentials on confirmation.

**Connection health checks**

- **FR-013**: System MUST check every source control connection and provider connection when Staplr
  starts, at least once every hour while it runs, and whenever the user selects "Check now" for one
  connection or for all of them. Each connection MUST show the time and result of its last check.
- **FR-014**: When a check fails, the system MUST update the connection's status and the readiness
  of every affected agent and project as part of the same check.

**Souls (agent roles)**

- **FR-015**: System MUST include default souls for Project Manager, Business Analyst, Developer,
  and QA.
- **FR-016**: The user MUST be able to create, view, copy, edit, and delete custom souls. Each soul
  has a name, role type, description, and working instructions.
- **FR-017**: System MUST keep default souls read-only; the user customizes them by copying. A copy
  keeps the role type of the soul it was copied from.
- **FR-018**: The Project Manager role type MUST be limited to the default Project Manager soul and
  copies of it. Souls created from scratch MUST have the role type Business Analyst, Developer, QA,
  or Custom.
- **FR-019**: System MUST block deletion of a soul that agents still use and list those agents.

**Agents**

- **FR-020**: The user MUST be able to create an agent by choosing a name, a soul, a provider, a
  provider connection, and a model. An agent's role is the role type of its soul.
- **FR-021**: System MUST offer only non-retired models verified available to the selected provider connection. Unknown availability MUST be shown disabled with a Check availability action. Server-side agent creation/edits MUST enforce the same rule; a catalog entry alone is not proof of access.
- **FR-022**: The user MUST be able to change an agent's soul, provider, provider connection, or
  model; changes apply from the agent's next ticket. System MUST block a soul change that would
  leave any of the agent's projects with no Project Manager or with two of them.
- **FR-023**: An agent MUST be Not ready with a reason if its provider connection is missing or needs re-login, its model is retired, or model availability for its current credentials is unknown or denied. Authentication and model-access failures MUST be distinguished. Transient check failures MUST preserve the last confirmed state and expose a retry action.
- **FR-024**: The user MUST be able to delete an agent that is not on any project team. Deletion of
  an agent on a project team MUST be blocked, listing those projects.

**Projects and teams**

- **FR-025**: When adding a project, the user MUST choose a source control connection; the system
  MUST then list the repositories that connection can access, with search, and the user MUST pick
  one repository.
- **FR-026**: After a repository is selected, the system MUST download a copy of it onto the
  installation, show progress, and record the download status. A failed download MUST be
  retryable.
- **FR-027**: Each project MUST offer a manual "Refresh" action that pulls the latest code from the
  remote repository and MUST show when the local copy was last updated. Automatically pulling the
  latest code before an agent starts each ticket belongs to the next feature.
- **FR-028**: The downloaded repository MUST be kept as the project's base copy, and agents MUST NOT
  work in it directly. In the next feature, each ticket gets its own isolated working copy (a
  worktree) made from the base copy. This feature MUST keep the base copy in a state from which
  per-ticket working copies can be created.
- **FR-029**: Each project MUST have a base branch that defaults to the repository's default branch.
  The user MUST be able to change it to any existing branch. Ticket working copies branch off the
  base branch, and pull/merge requests target it (next feature).
- **FR-030**: The user MUST be able to delete a project after confirming. Deletion MUST remove its
  downloaded repository, all of its working copies, its team assignments, and all of its tickets,
  and MUST keep its agents. Any usage records for the project MUST be kept, still show the
  project's name, and be marked "Deleted project". The confirmation MUST state what will be
  removed and what will be kept.
- **FR-031**: The user MUST be able to assign agents to a project team and remove them. One agent
  can serve on several projects.
- **FR-032**: System MUST show a team roster with each member's name, role, provider, model, and
  readiness.
- **FR-033**: Every project team MUST have exactly one agent with the Project Manager role, because
  the Project Manager reads each ticket and assigns it to the next agent to handle it. System MUST
  prevent adding a second Project Manager and let the user replace the current one instead. System
  MUST warn, but not block, when a team lacks a Business Analyst, Developer, or QA.
- **FR-034**: System MUST show a project as "Ready" only when its source control connection is
  "Connected", its repository is "Downloaded" and still reachable, its base branch exists, its team
  has exactly one Project Manager, and every team member is "Ready". Otherwise it MUST show "Not
  ready" with every reason that applies.

**Orchestration scope**

- **FR-035**: This feature covers setup and the manual ticket board. The system MUST NOT run agents
  on projects as part of this feature; agents taking tickets, moving them, handing off between
  roles, and committing to repositories belong to the next feature. A project shown as "Ready" is
  the hand-off point for that feature.
- **FR-036**: Tickets come from Staplr's own built-in ticket board, not from GitHub/GitLab Issues or
  an external tracker. Project setup MUST NOT require connecting a ticket source. The spec-driven
  ticket flow belongs to the next feature: the Project Manager assigns tickets, and the BA analyzes
  them, asks the user questions when something is unclear, and writes the spec/design.

**Model prices and cost estimates**

- **FR-037**: System MUST store a list price per input token and per output token for each provider
  model. Staplr starts with the prices it could verify against the provider's published pricing,
  each with its source and date; a model without a verified price starts as "Unknown". The user
  MUST be able to view and change every price. A change MUST take effect from that moment, and
  earlier prices MUST be kept with the period they applied to.
- **FR-038**: System MUST provide a cost estimate rule: given a model, input and output token
  counts, and a run time, it returns the cost using the price in effect at that time, or "Unknown"
  when no price is known.
- **FR-039**: Every money figure MUST be labeled estimated and MUST NOT be represented as an invoice or actual provider charge. Claude uses direct API billing; Codex uses account-based access, and list-price estimates may differ from actual charges.
- **FR-040**: The next feature MUST record every agent run as a usage record (see Key Entities)
  using the rule in FR-038. It also provides the usage view (totals by spec, by model, and by
  agent, with a date-range filter), the CSV export, and the report-only rule (no budgets, limits,
  or cost alerts). These are not built in this feature.

**Access and audit**

- **FR-041**: System MUST record an audit entry, without secret values, each time a source control
  connection or provider connection is added, replaced, re-logged, or removed. The user MUST be
  able to view these entries.
- **FR-042**: Each Staplr installation has exactly one workspace and one user, who manages
  everything in it. The system MUST require that user to sign in before any data or action is
  available: every API route except first-run setup and sign-in MUST reject requests that are not
  signed in, and the app shell served before sign-in MUST contain no user data. Tests MUST verify
  this for every route.

**Deployment**

- **FR-043**: Staplr MUST be self-hosted: the user runs it on their own machine or server and opens
  it in a browser. All tokens, provider logins, downloaded repositories, souls, prices, and usage
  records MUST be stored only on that installation. None of them may be sent to any
  Staplr-operated or third-party service, except GitHub/GitLab and the Codex/Claude providers
  themselves.

**Ticket board**

- **FR-044**: Each project MUST have its own ticket board, shown as a Kanban board with exactly
  four columns in this order: New, Review, Testing, End. Each card is one ticket.
- **FR-045**: Opening a project MUST show its ticket board, including straight after the project
  is added. The board MUST be available whether or not the project is "Ready".
- **FR-046**: The user MUST be able to create a ticket with a title (1–200 characters) and a
  description (up to 20,000 characters). A new ticket MUST start at the top of the New column.
- **FR-047**: The user MUST be able to move a ticket to any column and position by drag and drop,
  and by keyboard-only controls that do the same thing (Constitution III). Every move MUST be saved
  immediately and survive a reload.
- **FR-048**: Each ticket card MUST show its title and how long it has been in its current column.
- **FR-049**: Tickets MUST NOT be assignable to agents in this feature. Assignment is done only by
  the Project Manager agent, in the next feature.
- **FR-050**: The user MUST be able to edit a ticket's title and description at any time, and to
  delete a ticket after confirming. Deleting a ticket MUST remove it from the board permanently.

### Key Entities

- **Workspace**: The single workspace of one self-hosted Staplr installation. It owns global
  settings, connections, souls, agents, projects, and prices, and has one user, its owner.
- **Source Control Connection**: A GitHub or GitLab account linked by token. Attributes: name,
  platform, instance address, account name, granted permissions, masked token, status, last check
  time and result.
- **Provider Connection**: A Claude API-key connection or saved Codex account login. Attributes: provider, authentication type, name, status, credential revision, last check time and result. Credentials are encrypted.
- **Model Access**: The latest availability evidence for a provider connection/model pair, tied to its credential and catalog revisions, with check time and a retryable error when applicable.
- **Sandbox Login Session**: A short-lived, isolated session used only to complete a Codex login.
  Attributes: provider, status (In progress / Succeeded / Failed / Cancelled / Expired), start and
  end times.
- **Soul**: A reusable role definition. Attributes: name, role type (Project Manager / Business
  Analyst / Developer / QA / Custom), description, working instructions, default-or-custom flag,
  copied-from soul.
- **Agent**: A configured team member. Attributes: name, soul (which sets its role), provider,
  provider connection, model, readiness.
- **Project**: A unit of work linked to one repository. Attributes: name, source control connection,
  repository, base branch, download status, last updated time, readiness, deleted flag (kept so
  usage history stays attributable). Must have exactly one Project Manager on its team.
- **Team Assignment**: The link between an agent and a project. The agent's role comes from its
  soul.
- **Ticket**: One unit of work on a project's board. Attributes: project, title, description,
  status (New / Review / Testing / End), position within its column, created time, time it
  entered its current column.
- **Model Price**: A model's list price. Attributes: provider, model, price per input token, price
  per output token, effective-from time, effective-until time, source (default or user-edited).
- **Usage Record** *(defined here, written by the next feature)*: One agent run. Attributes:
  project, ticket/spec (with a snapshot of the ticket title, kept if the ticket is deleted), agent,
  role, provider, model, provider connection, input tokens, output tokens, start and end time,
  estimated cost (or "Unknown"), price used. Never edited after it is written.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can connect a source control account, connect one AI provider, and assemble
  a four-role team (PM, BA, Developer, QA) on a project in under 15 minutes, not counting the time
  the repository takes to download.
- **SC-002**: A provider connection still passes its health check 30 days after setup,
  without credential re-entry, unless the provider expired or revoked the credential.
- **SC-003**: 100% of invalid tokens, and of tokens missing a required permission, are rejected at
  save time with a message that names the problem.
- **SC-004**: Security testing finds no stored token or login secret in plain text in the user
  interface, logs, or audit entries, including Claude API keys.
- **SC-005**: In usability testing, at least 4 of 5 test users complete the sandbox login on their
  first attempt without help (Codex sandbox login).
- **SC-006**: When a token or provider login stops working, the connection and every affected agent
  and project show "Needs attention", "Needs re-login", or "Not ready" with a fix action within 70
  minutes (hourly checks plus the time they take to run), or immediately after "Check now".
- **SC-007**: For 100% of test cases, cost estimates equal the list price in effect at the run time
  multiplied by the token counts, including cases that span a price change; models without a price
  return "Unknown".
- **SC-008**: A user can create a ticket and move it from New to End in under 30 seconds, using
  either the mouse or the keyboard alone.
- **SC-009**: A board with 200 tickets opens in under 1 second, and a ticket move is saved in
  under 500 milliseconds.

## Assumptions

- Running the team is out of scope and will be specified as the next feature: agents moving
  tickets on the board, the Project Manager assigning tickets, the BA analyzing tickets and asking
  questions and writing the spec/design, hand-offs to Developer and QA, agents changing code,
  opening pull/merge requests, recording usage, and the usage view and CSV export.
- Staplr is self-hosted, with one user and one workspace per installation. A hosted multi-user
  service, shared organizations, member invitations, and role-based permissions are out of scope.
- The machine or server running Staplr has enough disk space for the downloaded repositories and
  per-ticket working copies, and has network access to GitHub/GitLab and the Codex/Claude
  providers.
- Staplr is reached over HTTPS, or over plain HTTP only from the same computer (localhost). Plain
  HTTP on any other address is refused unless the user explicitly allows it, because passwords and
  tokens would otherwise cross the network unencrypted.
- Budgets, spending limits, and cost alerts are out of scope; cost tracking only reports.
- Usage is tracked per ticket; a ticket's spec belongs to that ticket, so "per spec" and "per
  ticket" mean the same thing. Token counts will come from what the Codex/Claude tools report after
  each run.
- Codex and Claude are the only providers in scope; the design allows others to be added later.
- Codex offers an interactive account login producing reusable credentials. Claude connections
  use owner-provisioned Anthropic API keys; Claude subscription OAuth capture is out of scope.
- Provider integration uses the official authentication mechanisms documented in research R18.
  Provider checks must distinguish authentication failure, model denial and transient errors.

- The list of models for each provider is retrieved from or maintained for that provider and
  updated with application releases and reconciled on startup. Connection-specific model access is checked at startup, hourly and on demand; catalog updates do not prove entitlement.
- A project links to exactly one repository in this version; projects spanning several
  repositories are out of scope.
- Default soul content (responsibilities and instructions for PM, BA, Developer, QA) is provided by
  the product and can be improved without a spec change.
- Setting up the installation's single user account (first-run setup and sign-in) is part of this
  feature only to the extent FR-042 requires. Password recovery and multiple accounts are out of
  scope.
- Per Constitution Principle II, all secrets (tokens, provider logins) are encrypted at rest on the
  installation and excluded from logs.
