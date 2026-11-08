# Quickstart results (feature 001)

Recorded 2026-11-08 by the implementing agent. **A person has not yet walked through the manual
scenarios in a browser**, so T154 stays open. This file records what automated evidence exists for
each scenario and what could not be verified.

| # | Scenario | Evidence | Gap |
|---|---|---|---|
| 0 | First-run and 401 | `tests/e2e/auth.spec.ts`, `tests/contract/auth-coverage.test.ts` | none |
| 1 | GitHub token + read-only rejection | `tests/e2e/us1-source-control.spec.ts`, `tests/integration/source-control.test.ts` | fake platform, not real GitHub |
| 2 | Revoked token | `tests/integration/health-readiness.test.ts` | fake platform |
| 3 | Claude key | `tests/e2e/us2-provider-connection.spec.ts`, `tests/integration/no-plaintext-secrets.test.ts` | fake Anthropic Models API; no live key tried |
| 4 | Codex login, 15-minute expiry | `tests/docker/sandbox-lifecycle.test.ts` (real Docker, **stub** image), `tests/integration/sandbox-sessions.test.ts` | **real Codex CLI login never run** (needs a ChatGPT account); see `docker/sandbox/README.md` |
| 5 | Restart reuse, 30 days | fake-clock 720-hour test in `tests/integration/sandbox-sessions.test.ts` | orchestration only, not real provider validity |
| 6 | Souls | `tests/e2e/us3-souls.spec.ts` | none |
| 7 | Agents | `tests/e2e/us4-agents.spec.ts` | Codex model checks use the stub |
| 8 | Add project | `tests/e2e/us5-projects.spec.ts` (local git remote) | not a real GitHub clone |
| 9 | Team rules | `tests/e2e/us5-projects.spec.ts`, `tests/integration/teams.test.ts` | none |
| 10 | Refresh, base branch, delete | same | none |
| 11 | Prices | `tests/e2e/us6-model-prices.spec.ts` | none |
| 12 | Board | `tests/e2e/us7-board.spec.ts` | screen-reader announcements asserted from the live-region text; no real screen reader used |
| 13 | 200-ticket performance | `tests/e2e/board-perf.spec.ts`; numbers in `board-perf-results.md` | measured on a 16-core machine, not the documented 2 vCPU host |
| 14 | No plaintext secrets | `tests/integration/no-plaintext-secrets.test.ts` (database, responses, audit, logs, `.git/config`) | the Docker-volume `grep` was not run |
| 15 | HTTPS requirement | `tests/integration/main.test.ts`, `tests/unit/config.test.ts` | not run with a real LAN address |
| 16 | Restart recovery | `tests/integration/sandbox-recovery.test.ts`, `tests/integration/download-recovery.test.ts` | `docker compose restart` not run |

Not done at all: T152 (usability check with 5 people, SC-005) is a human task.

Final automated gates on this date: typecheck, lint, format:check clean; unit, integration and
contract 326+ tests passing; Docker tests 9 passing; Playwright 154 passing (desktop and 320 px,
axe on every screen); `npm audit --audit-level=high` clean (moderate dev-tool advisories remain,
tracked in research.md).
