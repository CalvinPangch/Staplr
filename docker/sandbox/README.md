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

T071 must record the actual pinned Codex CLI version, credential paths, login/status/exact-model
probe flags, and image resource-limit results before real CLI integration. No image, live login,
model probe or resource-limit test has been run yet. Never mark these checks passed from stubs.
