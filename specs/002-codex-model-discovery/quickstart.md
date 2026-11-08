# Quickstart & Validation: Codex Model Discovery and Official Prices

Builds on feature 001's setup ([001 quickstart](../001-agent-team-orchestration/quickstart.md)).
API changes: [contracts/api-changes.md](./contracts/api-changes.md). Data: [data-model.md](./data-model.md).

## Prerequisites

- Feature 001 running (`npm run dev`), Docker running, `npm run sandbox:build`.
- A ChatGPT account with Codex and device-code sign-in enabled (for the real-CLI scenarios).
- Internet access to `platform.claude.com` and `developers.openai.com` for price reads.

## Automated checks

```bash
npm run typecheck && npm run lint && npm run format:check
npm test              # unit (price-table parsing, discovery state), integration, contract
npm run test:docker   # discovery with the stub image: list + probes in real containers
npm run test:e2e      # sign-in → models listed with prices; no prices screen; refresh actions
```

Expected: everything passes. Price parsing is tested against saved copies of both Markdown pages
(fixtures), never the live pages; one opt-in test (`STAPLR_LIVE_PRICES=1`) reads the live pages.

## Manual scenarios

| # | Steps | Expected |
|---|---|---|
| 1 | Complete a Codex sign-in | Providers shows "Discovering models…", then "N models available" within 2 minutes |
| 2 | New agent → Codex connection | Available models are selectable at once, each with its API list price and the plan note; unavailable ones are disabled; none says "Not checked yet" |
| 3 | Re-login with an account on a different plan | The list is discovered again and differs accordingly |
| 4 | Stop the network, press "Refresh models" | Previous list kept; "last refresh failed, will retry" shown |
| 5 | Open the navigation | There is no "Prices" screen; Providers shows "Prices last updated" and "Refresh prices" |
| 6 | Upgrade an install where a price was set by hand | Old price stays in history; current price is the official one or "Unknown" |
| 7 | Block `developers.openai.com`, press "Refresh prices" | Codex prices unchanged, Providers says when they last updated successfully |
| 8 | Agent form for a model the official page does not list | Price shows "Unknown"; agent can still be created |

## Allowance note

Discovery sends one very short request per listed model (about 10). The Codex sign-in page says
so before the first discovery.
