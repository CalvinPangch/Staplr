# Staplr

Staplr is a self-hosted web app for setting up an AI development team: connect GitHub or GitLab,
connect Claude (your own Anthropic API key) and Codex (a login you complete in an isolated
sandbox), define reusable roles ("souls"), build agents, add projects, assemble each project's
team, and track tickets on a Kanban board. One owner manages everything; all data stays on your
installation.

This release covers **setup and the manual board only**. Agents do not yet run on tickets.

## Install with Docker Compose

Requirements: Docker Engine 24+ (or Docker Desktop).

1. Copy `.env.example` to `.env` and set:
   - `STAPLR_MASTER_KEY`: 32 random bytes, base64. Generate with
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
   - `SESSION_SECRET`: a long random string (32+ characters).
   - `PUBLIC_URL`: `http://localhost:3000` on the same computer, or an `https://` address.
2. Build the sandbox image used for Codex sign-in: `npm ci && npm run sandbox:build -- codex`.
3. Start: `docker compose up -d`, then open `PUBLIC_URL` and create the owner account.

### Back up your master key and your data

> **Back up `STAPLR_MASTER_KEY` now.** It encrypts every saved token, API key and Codex login.
> If it is lost, those credentials cannot be recovered and must be entered again.

Back up the `staplr-data` Docker volume as well (database and downloaded repositories). The
key and the volume are both needed to restore a working installation.

### Reaching Staplr from another computer

Plain `http://` to anything other than `localhost` is refused at start-up, because passwords and
tokens would cross the network unencrypted. Use HTTPS:

```bash
# in .env: PUBLIC_URL=https://staplr.example.com
docker compose --profile https up -d      # adds a Caddy reverse proxy
```

Only if you accept unencrypted traffic, set `STAPLR_ALLOW_INSECURE_HTTP=1`; Staplr then logs a
warning and shows a banner on every page.

## Providers, billing and sign-in

- **Claude** uses an Anthropic API key you own. Usage is billed to that key by Anthropic. Staplr
  never asks for Claude.ai subscription credentials. The key is checked against the Models API,
  stored encrypted, and never shown again.
- **Codex** signs in through the unmodified Codex CLI in a locked-down container (read-only
  root, no capabilities, 512 MiB, 1 CPU). The resulting login is stored encrypted and reused.
  Codex uses your account's allowance, so list-price estimates may differ from what you are
  charged.
- **Codex models are found for you.** Right after a Codex sign-in, Staplr lists the models the
  login can see (`codex debug models`) and checks each one with one very short request (about
  10 in all, at most two at a time). The Providers screen shows "Discovering models…", then
  how many are available; "Show models" lists them and "Refresh models" finds them again. A
  re-login and "Check now" rediscover; the hourly check only re-lists (free) and checks the
  models your agents use. A model Staplr has never heard of is remembered and can be chosen.
- **Prices come from the official pages only:** Anthropic's
  [pricing page](https://platform.claude.com/docs/en/about-claude/pricing.md) for Claude and
  OpenAI's [API pricing page](https://developers.openai.com/api/docs/pricing.md) for Codex
  (labelled "API list price; your plan may not charge per token"). They are read at start-up,
  then once a day, and on "Refresh prices" on the Providers screen, which also shows when they
  were last updated. A price change applies from the moment it is found; earlier estimates keep
  their price. A model the page does not list shows "Unknown", never zero. Prices cannot be
  entered by hand, and if a page cannot be read the last prices found are kept.
- Every money figure in Staplr is an **estimate from list prices**, never an invoice.

What was and was not verified against the real Codex CLI is recorded in
[`docker/sandbox/README.md`](docker/sandbox/README.md). Official sources:
[Claude guidance](https://code.claude.com/docs/en/legal-and-compliance),
[Claude Models API](https://platform.claude.com/docs/en/api/models/list),
[Codex authentication](https://developers.openai.com/codex/auth).

Besides the GitHub/GitLab APIs, `api.anthropic.com` and Docker, the only hosts Staplr itself
contacts are `platform.claude.com` and `developers.openai.com`, to read the two pricing pages
(no credentials are sent).

## Development

```bash
npm ci
npm run sandbox:build        # Codex image and the test stub image
npm run dev                  # API + web with live reload
npm run typecheck && npm run lint && npm run format:check
npm test                     # unit + integration + contract
npm run test:docker          # real containers with the stub image (needs Docker)
npm run test:e2e             # Playwright + axe, desktop and 320 px, plus the board performance test
```

`npm run seed:board -- --project <id> --count 200` adds sample tickets (refused when
`NODE_ENV=production`). Specs, plan, tasks and manual validation scenarios live in
`specs/001-agent-team-orchestration/` and `specs/002-codex-model-discovery/` (model discovery
and official prices). `STAPLR_LIVE_PRICES=1 npx vitest run tests/integration/official-prices-live.test.ts`
reads the live pricing pages to confirm they still parse.

## Troubleshooting

- `503 docker_unavailable` when starting a Codex login: Docker or the socket proxy is not
  reachable. Check `docker compose ps`.
- Staplr stops with "HTTPS is required": see "Reaching Staplr from another computer".
- Very slow git or "database is locked" on Docker Desktop: keep `/data` on the named volume, not
  a bind mount from the host.
- Codex login waits at a device code: enable device-code sign-in in the ChatGPT security
  settings.
- A connection shows **Needs re-login**: for Claude choose _Replace API key_; for Codex choose
  _Re-login_.
- Errors that were captured locally are listed on the **Diagnostics** screen.
