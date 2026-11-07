# Contract: Sandbox Login Terminal (WebSocket)

Supports FR-007 to FR-011 and research R5.

## Lifecycle

1. `POST /api/sandbox-sessions` with body `{provider, name | reloginOf}` returns
   `SandboxSession{id, terminalUrl, instructions, expiresAt}`. The server starts a hardened
   container from the provider's pinned sandbox image, with the provider's login command as its
   entrypoint:
   - Claude: interactive `claude` login; `claude setup-token` as a fallback.
   - Codex: `codex login --device-auth`.
2. The browser opens a WebSocket to `terminalUrl` (`/api/sandbox-sessions/{id}/terminal`).
3. The user follows the login in the terminal. Any URL the CLI prints is opened in the user's own
   browser, so multi-factor and CAPTCHA steps happen there.
4. The user selects **"I've finished logging in"**, which calls `POST .../complete`. The server
   checks that the credential files exist inside the container:
   - If they don't, the response is `409 login_not_complete` and the session stays open.
   - If they do, the server seals the bundle, creates or updates the provider connection, sets
     the session to `succeeded`, closes the socket and removes the container.
5. Cancel (`DELETE`), a 15-minute idle timeout, or a container exit without credentials ends the
   session as `cancelled`, `expired`, or `failed`. The container is always removed and nothing is
   saved.

## Connection rules

- **Authentication**: the upgrade requires a valid session cookie and a same-origin `Origin`
  header; otherwise the server responds 401 or 403 before upgrading.
- **One terminal per session**: a second socket for the same session is rejected with close code
  `4409`.
- **Size limits**: a frame may carry at most 64 KiB, and input is limited to 16 KiB/s per session.

## Messages

All frames are JSON text and are validated against Zod schemas in `src/shared/schemas/sandbox.ts`.

### Client → server

| type | fields | effect |
|---|---|---|
| `input` | `data: string` (≤ 4096 chars) | written to the container TTY; resets the idle timer |
| `resize` | `cols: 20–500, rows: 5–200` | resizes the TTY |
| `ping` | — | keep-alive; also resets the idle timer |

### Server → client

| type | fields | meaning |
|---|---|---|
| `output` | `data: string` | TTY output (UTF-8) |
| `status` | `status`, `failureReason?`, `resultConnectionId?` | session state changed |
| `expiresAt` | `at: ISO time` | idle deadline, updated on activity |
| `error` | `code`, `message` | for example `docker_unavailable` or `container_exited` |

### Close codes

| code | meaning |
|---|---|
| `1000` | session ended normally (succeeded or cancelled) |
| `4401` | not signed in |
| `4404` | unknown or already ended session |
| `4408` | idle timeout (session expired) |
| `4409` | another terminal is already attached |
| `4500` | sandbox error (session failed) |

## Security guarantees (tested)

- Terminal output is never logged. The server keeps no copy of the TTY stream, because it may
  contain one-time codes.
- The container runs as a non-root user with all capabilities dropped, `no-new-privileges`, a
  read-only root filesystem with tmpfs mounts for the CLI home directory and `/tmp`
  (`rw,nosuid,size=64m`), limits of 512 MiB memory, 1 CPU and 256 PIDs, no host mounts, and
  outbound-only network.
- Credential files are read by running `tar -c` inside the container through `docker exec`,
  streamed directly into memory, sealed (R4), and never written to the Staplr host filesystem in
  plain text. The Docker archive API is not used because it cannot read tmpfs paths; restoring a
  bundle uses `tar -x` through `docker exec` the same way.
- The UI renders the terminal with xterm.js screen-reader mode on. The provider-specific
  instructions are shown as accessible text beside the terminal (Constitution III).
