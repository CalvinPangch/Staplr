# Research: Codex Model Discovery and Official Prices

Investigated 2026-11-08 against `@openai/codex` 0.167.0 (the pinned image) and the live pricing pages.

## R1. How to list the models a Codex login can use

- **Decision**: Run `codex debug models` (with the file credential store) inside the same hardened,
  restored sandbox used for login checks. It prints the model catalog as JSON
  (`{ models: [{ slug, display_name, visibility, supported_in_api, ... }] }`). Candidates are the
  entries with `visibility = "list"`; hidden entries (`visibility = "hide"`) are ignored.
  Then confirm each candidate with the existing exact-model probe (`codex exec --model <slug>` with a
  one-word prompt) before marking it available.
- **Rationale**: Without arguments the command refreshes the catalog (`--bundled` is the option that
  skips the refresh), so with a login it reflects the account. The probe is the only evidence that
  the account can really run the model, which FR-002 and FR-008 require. Listing first keeps the
  number of probes to the models that exist (12 entries today, 9 listed).
- **Verified**: logged out, the command prints the bundled catalog (checked in the pinned image).
- **Not verified**: that the refreshed catalog differs by account, and that a logged-in refresh
  succeeds inside the sandbox. If the refresh fails silently, the list equals the bundled one and the
  probes still decide availability, so the result stays correct, only less targeted.
- **Alternatives considered**: probing every model in Staplr's shipped catalog (misses new models,
  rejected by the spec's Option A); trusting the list without probing (no evidence of access).

## R2. Spending as little allowance as possible (FR-010)

- **Decision**: One probe per listed model, at most 2 at a time, each with a 120 s limit, the
  smallest reasoning effort (`-c model_reasoning_effort="low"`) and the prompt "Reply with the single
  word OK.". Probes run on discovery, re-login, "Check now" and "Refresh models"; the hourly check
  re-reads the list (no allowance) and re-probes only models that agents use.
- **Rationale**: Discovery cost is bounded by the number of listed models (about 10). Hourly
  re-probing of every model would multiply usage by 24 per day for no benefit.
- **Alternatives considered**: re-probing all models hourly (wasteful); no probe (no evidence).

## R3. Reading the official prices

- **Decision**: Fetch the Markdown versions of the official pages:
  - Claude: `https://platform.claude.com/docs/en/about-claude/pricing.md`, table under
    "## Model pricing": column 1 model name (e.g. "Claude Sonnet 5.5"), column 2 "Base input
    tokens", last column "Output tokens", values like `$2 / MTok`.
  - Codex: `https://developers.openai.com/api/docs/pricing.md`, first table under
    "### Standard pricing data": column 1 model id (e.g. `gpt-6.1-sol`), "Short context input",
    "Short context output", values like `$2.00`. Parenthetical qualifiers such as
    `(<272K context length)` are removed from the id; rows ending in `-pro` are kept as their own id.
- Each value must match `^\$\d+(\.\d{1,6})?$` after removing ` / MTok` and footnote markup. A row that
  does not parse is skipped and reported; it never becomes zero.
- Claude names map to model ids through the catalog label and the Models API `display_name`; an
  unmapped name is ignored.
- **Layout change rule**: a page counts as unreadable when its expected heading or header row is
  missing, or when fewer than 3 rows parse. Then nothing is changed and "last updated" stays put.
- **Rationale**: both pages are served as Markdown (HTTP 200, `text/markdown`), much more stable
  than the 600–900 KB HTML pages, and the OpenAI page states that Markdown versions are provided.
- **Alternatives considered**: scraping HTML (fragile, large); a third-party price API (not
  official); shipping prices in the release only (stale, which is what the owner asked to stop).

## R4. When prices are read and how changes apply

- **Decision**: Read both pages at start-up (after migrations, before serving) and then every 24
  hours on a timer, plus on "Refresh prices". A changed price closes the current row at the moment it
  is found and opens a new `official` row; an unchanged price adds nothing. The existing exact
  decimal estimate rule and interval lookup are reused unchanged.
- **Rationale**: matches the clarified schedule and the existing history model, so past estimates
  never change.

## R5. Removing hand-entered prices

- **Decision**: Migration closes every current `user` price row at upgrade time (history kept).
  `POST /api/model-prices` and the Model Prices screen are removed. `GET /api/model-prices` remains
  read-only for estimates and the model lists. The `source` values become `official` (new); `user` rows are closed at upgrade and kept as
  history; `default` rows stay current until the first successful official read for their provider
  closes them.
- **Rationale**: clarified answer 5; keeps feature 001's audit and history intact.

## R6. Models Staplr does not know (clarified Option A)

- **Decision**: Discovered models are stored per connection with the provider's id and display name
  and are offered for agents when available. Agent validation accepts a model that is in the shipped
  catalog **or** discovered for that connection. Price is looked up by id like any other model and is
  "Unknown" until the official page lists it.

## R7. Egress

- **Decision**: Two new allowed hosts, `platform.claude.com` and `developers.openai.com`, for price
  reads only, with a 15 s timeout and a 2 MB size cap. Requests carry no credentials or user data.
  The egress test's allow-list is extended and a test proves no other host is contacted.

## R8. Dependencies

- No new runtime dependency. Markdown tables are parsed with a small, tested function; `fetch`
  is built into Node 22.
