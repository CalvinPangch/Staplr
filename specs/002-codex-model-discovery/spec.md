# Feature Specification: Codex Model Discovery and Official Prices

**Feature Branch**: `002-codex-model-discovery`
**Created**: 2026-11-08
**Status**: Draft
**Input**: User description: "after the codex login, and remember all available model"

## Clarifications

### Session 2026-11-08

- Q: What happens to a model the account can use but Staplr's own model list does not know? → A:
  Remember it and offer it for agents, with price "Unknown" (Option A).
- Q: Codex on a ChatGPT plan is not charged per token, so which official price is used for Codex
  estimates? → A: OpenAI's API pricing page for the same model names, labelled "API list price; your
  plan may not charge per token".
- Q: With no prices screen, what shows when the official page has no price for a model or cannot be
  reached? → A: "Unknown" until the official page lists it; the last price found is kept while the
  page is temporarily unreachable.
- Q: How often are the official pricing pages read? → A: At start-up and then every 24 hours, with
  a "Refresh prices" action (placed on the Providers screen, see below).
- Q: Where are prices shown once the prices screen is removed? → A: Next to each model in the agent
  form and in each connection's model list; "last updated" and "Refresh prices" are on the
  Providers screen. There is no separate prices screen.
- Q: What happens to prices the owner already set by hand? → A: They are kept as history (past
  estimates unchanged) but closed at upgrade time; official prices apply from then on.

## Context

Today, after the owner finishes a Codex sign-in, Staplr saves the login but knows nothing about
which models that account can use. Every Codex model is shown as "Not checked yet", and the owner
must press "Check availability" on each model, one at a time, before any agent can use it. Claude
does not have this problem, because its key reveals the full model list when it is added.

This feature makes Codex behave the same way: as soon as a Codex login succeeds, Staplr finds out
every model that login can use and remembers the result, so agents can be set up immediately.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Models are ready right after signing in (Priority: P1)

The owner signs in to Codex in the sandbox and confirms the login. Without any further action,
the new Codex connection shows which models it can use. When the owner then creates an agent on
that connection, the usable models can be chosen straight away.

**Why this priority**: This is the whole request. Without it, the owner must check models one by
one before Codex is usable, which is slow and easy to get wrong.

**Independent Test**: Complete a Codex sign-in, open the agent form, choose the new connection,
and confirm the usable models are selectable without pressing "Check availability".

**Acceptance Scenarios**:

1. **Given** the owner has just completed a Codex sign-in, **When** the connection appears on the
   Providers screen, **Then** it shows that model discovery is in progress or finished, and once
   finished it lists how many models are available.
2. **Given** discovery has finished, **When** the owner opens the agent form and picks this
   connection, **Then** every model the login can use is selectable and every model it cannot use
   is shown as not available, with no model left as "Not checked yet".
3. **Given** discovery is still running, **When** the owner opens the agent form, **Then** models
   not yet known are shown as "Checking…" rather than "Not checked yet", and become selectable
   without a page reload once they are confirmed.

---

### User Story 2 - The remembered list stays current (Priority: P2)

The models an account can use change over time: the owner's plan changes, a model is retired, or
a new one is released. The remembered list is refreshed whenever the login is renewed or
re-checked, so it never silently goes stale.

**Why this priority**: A remembered list that is wrong is worse than no list, because agents would
be set up on models that no longer work.

**Independent Test**: Re-login an existing Codex connection with an account that has a different
set of models, and confirm the remembered list changes to match.

**Acceptance Scenarios**:

1. **Given** a Codex connection with remembered models, **When** the owner re-logs in, **Then** the
   list is discovered again and replaces the old one.
2. **Given** a Codex connection, **When** the hourly check runs, **Then** the model list is read
   again and every model an agent uses is re-checked; a model that is no longer usable is marked
   not available and its agents show "Not ready" with the reason. **When** the owner presses
   "Check now" or "Refresh models", **Then** every listed model is re-checked.
3. **Given** discovery fails for a temporary reason (for example, the provider cannot be reached),
   **When** the failure happens, **Then** the previously remembered list is kept, the connection
   says the last refresh failed and when it will be retried, and no model changes state.

---

### User Story 3 - See what was found (Priority: P3)

The owner can see, on the Codex connection, the list of models the login can use, when it was last
refreshed, and refresh it on demand.

**Why this priority**: Useful for trust and troubleshooting, but the main value (agents can be set
up) is delivered by Story 1.

**Independent Test**: Open the Codex connection and read the list, the last-refreshed time, and
use "Refresh models".

**Acceptance Scenarios**:

1. **Given** a Codex connection with remembered models, **When** the owner views it, **Then** the
   available models, the not-available models, and the time of the last refresh are shown.
2. **Given** the owner presses "Refresh models", **When** the refresh finishes, **Then** the list and
   the time are updated, and the owner is told how many models changed.

---

### User Story 4 - Prices come from the providers (Priority: P3)

The owner no longer types prices. Staplr reads the official pricing pages for Claude and Codex,
shows each model's list price where models are chosen, and keeps prices current on its own.

**Why this priority**: Estimates stay correct without the owner maintaining a price list; it does
not block setting up agents.

**Independent Test**: Start Staplr, open the agent form and see each model's official list price
with its source and date; confirm there is no prices screen; press "Refresh prices" and see
"Prices last updated" change.

**Acceptance Scenarios**:

1. **Given** Staplr has started, **When** the owner opens the agent form, **Then** each model shows
   its input and output list price labelled "List price used for estimates", with source and date,
   or "Unknown" if the official page does not list it.
2. **Given** a Codex model, **When** its price is shown, **Then** it carries the note "API list
   price; your plan may not charge per token".
3. **Given** an official page changes a price, **When** Staplr next reads it (within 24 hours or on
   "Refresh prices"), **Then** the new price applies from that moment and earlier estimates keep the
   old one.
4. **Given** an official page cannot be read, **When** the read fails, **Then** prices stay as they
   were and the Providers screen says when they were last updated.
5. **Given** an installation upgraded from a version with hand-set prices, **When** the owner looks
   at prices, **Then** the hand-set price is history only and cannot be edited anywhere.

---

### Edge Cases

- The login succeeds but the account can use no models at all: the connection says so plainly and
  the agent form explains that this account has no Codex models available.
- The account can use a model that is not in Staplr's own model list: it is remembered and
  offered for agents like any other available model, labelled with its provider name, and its
  price shows "Unknown" until the provider's official pricing page lists it.
- Discovery is still running when the sign-in page is closed: discovery continues and its result is
  remembered.
- Staplr restarts while discovery is running: the connection shows the last complete list (or
  "not checked" if there was none), and discovery is started again after the restart.
- The login is rejected during discovery (for example, it was revoked straight away): the connection
  shows "Needs re-login" and no model is marked available.
- Two discoveries for the same connection are requested at once: only one runs; the other waits
  for its result.
- An official pricing page changes its layout and no price can be read: the last prices found stay
  in use and the Providers screen says when prices were last updated successfully.
- A model the account used to have is no longer available: it is marked not available, never
  silently replaced by another model, and agents using it show "Not ready".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After a Codex sign-in is confirmed, the system MUST start finding out which models that
  login can use, without any action from the owner.
- **FR-002**: The system MUST remember, for each Codex connection, every model found and whether it
  is available to that login, together with when this was last confirmed.
- **FR-003**: Remembered models MUST be tied to the exact login they were found with. A re-login,
  or any change to the saved login, MUST make the previous list provisional until discovery has
  confirmed it again.
- **FR-004**: The agent form MUST let the owner choose any model remembered as available for the
  selected Codex connection, with no per-model check required.
- **FR-005**: The system MUST show discovery progress on the connection and in the agent form while
  it runs, and update both when it finishes, without the owner reloading the page.
- **FR-006**: The system MUST refresh the remembered list on re-login, on "Check now" and on
  "Refresh models" by listing the models again and checking each one. The hourly check MUST
  list the models again and re-check only the models that agents use; a newly listed model shows
  "Not checked yet" until the owner refreshes or the next full refresh.
- **FR-007**: A temporary failure during discovery or refresh MUST keep the last confirmed list
  unchanged and tell the owner when it will be retried. Only a clear answer from the provider may
  change whether a model is available.
- **FR-008**: The system MUST never substitute one model for another. A model that becomes
  unavailable MUST make every agent that uses it "Not ready" with the reason.
- **FR-009**: Discovery and refresh MUST run in the same isolated way as the sign-in, and MUST NOT
  reveal, log or store the login itself in plain form.
- **FR-010**: Each model check during discovery MUST be at most a minimal request, so that discovery
  uses as little of the owner's Codex allowance as possible, and the owner MUST be told before the
  first discovery that it may use a small part of that allowance.
- **FR-011**: The owner MUST be able to see, per Codex connection, the available and not-available
  models and the time of the last successful refresh.
- **FR-012**: Claude connections MUST keep working as they do today.
- **FR-013**: A model the login can use that is not in Staplr's own model list MUST be remembered
  and offered for agents like any other available model. Its price MUST show "Unknown" until the
  provider's official pricing page lists it.
- **FR-014**: If such a model later stops being available to every connection, it MUST stay in the
  price history but no longer be offered for new agents.
- **FR-015**: Prices MUST come from the providers' official pricing pages: Anthropic's for Claude
  models and OpenAI's API pricing page for Codex models. Codex prices MUST be labelled "API list
  price; your plan may not charge per token".
- **FR-016**: The owner MUST NOT be able to enter or edit prices; the Model Prices screen is removed.
  A model with no official price MUST show "Unknown", and estimates for it MUST be "Unknown",
  never zero.
- **FR-017**: If an official pricing page cannot be reached or read, the last price found MUST be
  kept, and the owner MUST be told when prices were last updated successfully.
- **FR-018**: The system MUST read the official pricing pages at start-up and then every 24 hours,
  and the owner MUST be able to trigger "Refresh prices" from the Providers screen. A price
  change MUST start applying from the moment it is found; earlier estimates keep the price that
  applied at their run time.
- **FR-019**: Each model's input and output list price, labelled "List price used for estimates"
  with its source page and date (or "Unknown"), MUST be shown next to the model in the agent form
  and in the connection's model list. The Providers screen MUST show when prices were last updated
  and offer "Refresh prices". There MUST be no separate prices screen.
- **FR-020**: On upgrade, every current price the owner set by hand MUST be closed at that moment
  and kept as history, so earlier estimates do not change; from then on only official prices apply.

### Key Entities

- **Codex connection**: an existing saved Codex login. Gains a model-discovery state (not started,
  in progress, finished, last refresh failed) and the time of the last successful refresh.
- **Discovered model**: a model found through a Codex login that is not in Staplr's own model list.
  It has a name as the provider reports it, the connections it is available on, and a price that is
  "Unknown" until the provider's official pricing page lists it.
- **Model price**: an existing record of the list price per million input and output tokens. Its
  source is now always an official pricing page (with page and date); earlier hand-set prices remain
  as closed history.
- **Model access**: an existing record of whether a model can be used through a given connection,
  for the exact login and model list it was confirmed with. Discovery fills it for every Codex model
  at once instead of one at a time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After confirming a Codex sign-in, the owner can create an agent on that connection
  without pressing any "Check availability" button, in 100% of successful sign-ins.
- **SC-002**: Discovery for a typical account (up to 10 candidate models) finishes within 2 minutes
  of the sign-in being confirmed.
- **SC-003**: When a model stops being available, every agent using it shows "Not ready" no later
  than the next hourly check.
- **SC-004**: A temporary provider failure never changes which models are shown as available, in
  100% of tested failure cases.
- **SC-005**: No login secret appears in plain form in logs, responses, error records or stored
  data during discovery.
- **SC-006**: A price change published on an official pricing page appears in Staplr within 24 hours,
  or right away after "Refresh prices".

## Assumptions

- "Remember all available models" means the models that the owner's own Codex login can actually
  use, confirmed against the provider, not every model the provider publishes.
- Discovery reuses the existing isolated sign-in environment and the existing per-connection model
  records; no new kind of login is involved.
- Each confirmation uses a minimal request, which may consume a very small part of the owner's
  Codex allowance; this is acceptable once the owner has been told.
- The hourly check that already exists for connections re-reads the model list and re-checks the
  models agents use; full re-checks happen on re-login, "Check now" and "Refresh models".
- This feature does not change how Claude connections work. It replaces hand-entered prices with
  prices read from the providers' official pricing pages (Anthropic for Claude, OpenAI API pricing
  for Codex) and removes the Model Prices screen.
- Reading the official pricing pages is the only new outside contact this feature adds; nothing about
  the owner, their projects or their usage is sent.
