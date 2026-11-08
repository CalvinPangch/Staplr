# Test fixtures

Saved 2026-11-08. Tests read these copies, never the live pages (the opt-in
`STAPLR_LIVE_PRICES=1` test reads the live pages).

- `pricing-claude.md`: https://platform.claude.com/docs/en/about-claude/pricing.md
- `pricing-openai.md`: https://developers.openai.com/api/docs/pricing.md
- `pricing-openai-changed-layout.md`: the OpenAI page with its "### Standard pricing data" heading
  renamed, to prove a layout change is detected and changes nothing.
- `codex-debug-models.json`: `codex debug models` from `@openai/codex` 0.167.0 in
  `staplr-codex:local`, logged out (bundled catalog), reduced to the fields Staplr reads.
