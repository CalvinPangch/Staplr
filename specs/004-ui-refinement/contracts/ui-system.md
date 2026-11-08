# UI Contract: Staplr Design System (feature 004)

This feature changes no HTTP API. Its contract is the shared design system every screen must use.
Values come from [research.md](../research.md) R1–R9; tests enforce the marked rules.

## Tokens (`src/web/styles/tokens.css`)

- Colours: `--c-bg`, `--c-surface`, `--c-surface-raised`, `--c-fg`, `--c-muted`, `--c-separator`,
  `--c-control`, `--c-accent`, `--c-accent-fg`, `--c-bar`, and per status meaning
  `--c-status-{good,attention,failed,progress,neutral}` / `-soft`. Light, dark (`[data-theme]` and
  `prefers-color-scheme`) defined for each. **Test**: every text/background pair listed in R1 meets
  4.5:1, borders and focus 3:1 (unit test parses `tokens.css`).
- Type: `--text-title|section|body|secondary|caption` (sizes and line heights in R5).
- Space: `--space-1..8` = 4, 8, 12, 16, 24, 32, 48, 64 px.
- Radius: `--radius-card` 14 px, `--radius-control` 10 px, `--radius-pill` 999 px.
- Motion: `--motion-fast` 150 ms, `--motion-base` 200 ms, `--ease` `cubic-bezier(0.2,0,0,1)`.
- **Test** (SC-006): class names in `src/web/**/*.tsx` use only `text-{title,section,body,
  secondary,caption}` for size and spacing utilities from the 8-value scale.

## Components (`src/web/components/ui/`)

| Component | Props (essentials) | Rules |
|---|---|---|
| `PageHeader` | `title`, `description`, `action?` (one element) | Sticky, frosted (R2); `h1` = title; at most one primary action |
| `Card` | `as?`, `children` | Solid surface, `--radius-card`, padding `--space-4` (16) on phones, `--space-6` (24) from 768 px |
| `CardRow` | `title`, `details?`, `status?`, `actions?`, `href?` | Same slot order on every card; title truncates with full text in `title` attribute when long |
| `StatusBadge` | `meaning: good\|attention\|failed\|progress\|neutral`, `label`, `reason?` | Icon + word, never colour alone; `reason` shown under the card title when present |
| `Button` | `variant: primary\|secondary\|destructive\|quiet`, `busy?` | ≥ 44 × 44 px; one `primary` per area |
| `DataState` | `isLoading`, `error`, `isEmpty`, `what`, `empty`, `onRetry` | One layout: icon, sentence, next step; keeps layout height while loading |
| `Sidebar` / `TabBar` | `items` (shared list) | Sidebar ≥ 768 px, tab bar < 768 px; current item accent + `aria-current="page"`; tab bar ≤ 5 items with icon + label; safe-area aware |
| `Dialog`, `ConfirmDialog`, `Select`, `TextField`, `TextArea`, `Toast` | unchanged APIs | Restyled with the tokens only |

## Screens (FR-013)

Every signed-in screen renders `PageHeader` first, then content made of `Card`s and `DataState`.
Screens: Home, Projects, Project (team, board), Agents, Agent file editor, Providers (incl. Codex
sign-in, model lists, prices), Source control, Settings, Audit, Diagnostics. Sign-in and first-run
setup use a centred `Card` without navigation.

## Accessibility (FR-014, SC-003)

axe with zero violations on every screen in light and dark, at 1280 px and 320 px, and with reduced
transparency emulated; focus visible (3 px accent ring, offset 2 px); no sideways scroll at 320 px
except the board's columns.
