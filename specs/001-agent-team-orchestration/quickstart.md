# Quickstart & Validation: Agent Team Orchestration Setup

How to run Staplr locally and prove each user story works end to end. API details are in
[contracts/openapi.yaml](./contracts/openapi.yaml) and
[contracts/sandbox-terminal.md](./contracts/sandbox-terminal.md); entities are in
[data-model.md](./data-model.md).

## Prerequisites

- Docker Engine 24+ (or Docker Desktop) and Node.js 22 LTS.
- A GitHub personal access token that can read contents, push, and create pull requests on at
  least one repository. Optionally, a GitLab token with the `api` scope.
- A Claude Pro/Max account and/or a ChatGPT account with Codex access. For Codex, device-code
  login may need to be enabled in the ChatGPT security settings.

## Run

```bash
cp .env.example .env              # set STAPLR_MASTER_KEY (32 random bytes, base64), SESSION_SECRET, PUBLIC_URL
npm ci
npm run db:migrate
npm run sandbox:build             # builds docker/sandbox/claude and codex images (pinned CLI versions)
npm run dev                       # http://localhost:3000
# or the packaged form:
docker compose up -d              # staplr + docker-socket-proxy; data in the `staplr-data` volume
docker compose --profile https up -d   # adds caddy for HTTPS from other computers (set PUBLIC_URL to https://…)
```

`PUBLIC_URL` must be `https://…` or `http://localhost:3000`. Any other `http://` address is refused
at startup unless `STAPLR_ALLOW_INSECURE_HTTP=1` is set (research R10).

## Automated checks

```bash
npm run typecheck && npm run lint
npm test                          # unit + integration + contract
npm run test:docker               # sandbox + health checks with the stub CLI image (needs Docker)
npm run test:e2e                  # Playwright user stories + axe accessibility
```

Expected result: everything passes. `test:e2e` includes an axe scan of every screen with zero
WCAG 2.2 AA violations.

## Manual validation scenarios

| # | Story | Steps | Expected |
|---|---|---|---|
| 0 | Sign-in (FR-042) | Open the app on a fresh install; create the user; sign out; call `GET /api/agents` without a cookie | First-run setup appears once; the API call returns 401 |
| 1 | Story 1 | Global Settings → add GitHub token; add a read-only token | The first shows "Connected" with the account name and `…last4`; the second is rejected and names the missing permissions; nothing stored for it |
| 2 | Story 1 | Revoke the token on GitHub, then "Check now" | Connection shows "Needs attention: revoked"; its projects show "Not ready" |
| 3 | Story 2 | Provider Connections → Connect Claude; complete the login in the terminal; "I've finished logging in" | Connection shows "Connected"; the sandbox container is gone (`docker ps`) |
| 4 | Story 2 | Start a Codex login and close the tab | After 15 minutes the session is `expired`; no connection is created; the container is removed |
| 5 | Story 2 | Next day: "Check now" on the Claude connection | Passes without logging in again (SC-002 spot check) |
| 6 | Story 3 | Souls → copy Developer; create a "Security Reviewer" from scratch | The copy keeps role Developer; Project Manager is not offered for the from-scratch soul |
| 7 | Story 4 | Agents → create PM, BA, Dev (Claude), QA (Codex) agents | Only that provider's models are listed; each agent shows "Ready" |
| 8 | Story 5 | Projects → Add → choose the connection → search for and pick a repository | Progress shown, then "Downloaded"; base branch = the repository's default branch |
| 9 | Story 5 | Assign BA/Dev/QA only → Finish setup; then add the PM; then try adding a second PM | Blocked with "Project Manager required"; then Ready; the second PM is blocked with an offer to replace |
| 10 | Story 5 | Refresh; then change the base branch; then delete the project | "Last updated" changes; the base branch is saved; `/data/repos/<id>` (inside the `staplr-data` volume) is removed and the agents still exist |
| 11 | Story 6 | Model Prices → edit a price | A new current row appears; the old row has an end time; every figure is labeled as a list price for estimates |
| 12 | Story 7 | Add a project → its page opens on the board; create 2 tickets; drag one to Review; with the keyboard only (Tab to card, Space, arrows, Space) move the other to End; use "Move to…" on a card; edit a title; delete a ticket; reload | Four columns New/Review/Testing/End; new tickets appear at the top of New; every move and edit is kept after reload; the deleted ticket is gone; screen reader announces pick-up, moves, and drop |
| 13 | Story 7 (SC-009) | Seed 200 tickets (`npm run seed:board -- --project <id> --count 200`) and open the board | Board renders in under 1 s; a move is saved in under 500 ms (network panel) |
| 14 | Security (SC-004) | Search for the token and credential strings in the `staplr-data` volume (`docker run --rm -v staplr-data:/data alpine grep -r "<secret>" /data`, ignoring the DB's sealed blobs), the logs, and every `.git/config` | No plain-text secret found |
| 15 | Transport (FR-042, R10) | Set `PUBLIC_URL=http://192.168.x.x:3000` (not localhost) and start Staplr; then add `STAPLR_ALLOW_INSECURE_HTTP=1` | First start stops with a message that HTTPS is required; with the override it starts, logs a warning, and the sign-in page shows a banner |
| 16 | Restart recovery | Start a project download and open a sandbox login, then `docker compose restart staplr` | The project shows "Download failed: interrupted" with Retry; the login session is Failed; no sandbox container remains (`docker ps`) |

## Troubleshooting

- `503 docker_unavailable` when connecting a provider: the socket proxy isn't reachable; check
  `docker compose ps`.
- Staplr refuses to start with "HTTPS is required": `PUBLIC_URL` is a plain `http://` address other
  than localhost. Use `docker compose --profile https up -d` with an `https://` URL, or set
  `STAPLR_ALLOW_INSECURE_HTTP=1` if you accept sending passwords and tokens unencrypted.
- "database is locked" or very slow git on Docker Desktop: make sure `/data` is the `staplr-data`
  named volume, not a folder bind-mounted from the host.
- Codex login hangs at "device code": enable device-code sign-in in the ChatGPT account security
  settings, or use the browser-login fallback shown in the instructions panel.
