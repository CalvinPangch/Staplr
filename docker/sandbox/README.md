# Provider integration preflight

Reviewed: 2026-11-08. Feature: 001-agent-team-orchestration.

Claude uses an owner-provided Anthropic API key, encrypted locally. Usage is billed directly
to the key owner. Staplr does not collect Claude.ai subscription credentials, resell usage,
or modify any provider CLI authentication method. Claude validation uses the Models HTTP API;
this feature does not build a Claude agent runtime.

Codex uses the owner account through the unmodified CLI in an isolated login sandbox, with
local encrypted credential reuse. Never log terminal output, keys or credential files.

Official sources reviewed during planning:

- https://code.claude.com/docs/en/legal-and-compliance
- https://platform.claude.com/docs/en/api/models/list
- https://developers.openai.com/codex/auth

## Images

| Image                      | File               | Purpose                                                                                                   |
| -------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------- |
| `staplr-codex:local`       | `codex.Dockerfile` | Real login sandbox: `@openai/codex` pinned to `0.167.0` (npm `latest` on 2026-11-08) on `node:22-alpine`. |
| `staplr-sandbox-stub:test` | `stub.Dockerfile`  | TEST ONLY fake Codex used by the Docker and end-to-end tests. Never contacts a provider.                  |

Build with `npm run sandbox:build` (both), or `npm run sandbox:build -- codex` / `-- stub`.
Run the app against the stub with `STAPLR_TEST_MODE=1 STAPLR_CODEX_PROFILE=stub` (what the
Playwright setup does); production uses the real image.

## What was verified against the pinned image (2026-11-08, no credentials)

Run in a container with a read-only root and a tmpfs home as user 1000:

- `codex --version` prints `codex-cli 0.167.0`.
- `codex login --help` lists `--device-auth` and a `status` subcommand; the option
  `-c cli_auth_credentials_store="file"` is accepted.
- `codex login status` with no login prints `Not logged in` and exits `1`.
- `codex exec --help` lists `--model` and `--skip-git-repo-check`.

## What is NOT verified

No live Codex login, status-after-login, exact-model probe, refreshed-token behavior or
resource-limit run has been performed: that needs a real ChatGPT account. Until it is done:

- The auth file location `~/.codex/auth.json` with the file credential store is taken from the
  Codex documentation, not observed.
- The `real` profile treats every status/probe failure as "could not check", so it never marks
  a connection as needing re-login on its own evidence. Only the stub profile classifies exit
  codes. Do not mark live-provider checks as passed from the stub.
- Image resource limits (512 MiB, 1 CPU, 256 processes) are verified for a generic hardened
  container (`tests/docker/docker-hardening.test.ts`), not for the real CLI under load.
