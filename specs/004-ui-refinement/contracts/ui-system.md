# UI Contract: Staplr Design System (feature 004)

This feature changes no HTTP API. Its contract is the shared design system every screen must use:
an AdminLTE layout with Apple-style details. Values come from [research.md](../research.md); tests
enforce the marked rules.

## Tokens (`src/web/styles/tokens.css`)

- Colours (light, dark via `[data-theme]` and `prefers-color-scheme`): `--c-bg`, `--c-surface`,
  `--c-surface-raised`, `--c-fg`, `--c-muted`, `--c-separator`, `--c-control`, `--c-accent`,
  `--c-accent-fg`, `--c-accent-soft`, `--c-bar`, `--c-status-{good,attention,failed,progress,
  neutral}` and `-soft`.
- Sidebar (same in both themes): `--c-sidebar`, `--c-sidebar-fg`, `--c-sidebar-muted`,
  `--c-sidebar-accent`, `--c-sidebar-current`.
- Stat tiles (same in both themes): `--c-tile-accent`, `--c-tile-progress`, `--c-tile-attention`,
  `--c-tile-failed`, with white text.
- **Test**: every text/background pair in research R1 meets 4.5:1 (borders and focus 3:1),
  including the sidebar over white (slide-in worst case) and the light bars over black.
- Type `--fs-*`/`--lh-*` (5 sizes), space `--space-1..8` (8 values), radius `--r-card|control|pill`,
  motion `--motion-fast|base`, `--ease`. **Test** (SC-006): markup and style sheets use only these
  scales.

## Shell (`src/web/routes/__root.tsx`, `src/web/components/ui/nav/`)

| Part | Rules |
|---|---|
| `Sidebar` | ≥ 1024 px: fixed, dark, frosted, 248 px; brand, the three places, "Your projects". Collapses to a 72 px icon rail via the top bar toggle (remembered in `localStorage`); collapsed items keep an accessible name and tooltip; current item `aria-current="page"` in `--c-sidebar-accent` on `--c-sidebar-current`. |
| `TopBar` | Every width, sticky, frosted: menu button named "Menu" (`aria-expanded`, `aria-controls` = `sidebar` or `sidebar-panel`), current section name, theme choice, Sign out. |
| `SidebarPanel` | < 1024 px: the toggle opens the same sidebar as a Radix Dialog (`aria-label="Navigation"`), focus kept inside, closes on Escape, outside tap, or choosing a link, focus returns to the toggle. |
| `TabBar` | < 768 px: Home, Projects, Settings (icon + label), safe-area aware, hidden while typing, current `aria-current="page"`. |

## Components (`src/web/components/ui/`)

| Component | Props (essentials) | Rules |
|---|---|---|
| `PageHeader` | `title`, `breadcrumbs: {label, to?}[]`, `description`, `action?` | Solid, not sticky; breadcrumb `nav` (ordered list, last item `aria-current="page"`) above the `h1`; at most one primary action |
| `Card` | `title?`, `headingLevel?`, `titleId?`, `tools?`, `footer?`, `as?` | Header bar when `title` given (hairline below), body, optional footer bar; soft radius and shadow; `data-card` |
| `CardRow` | `title`, `details?`, `status?`, `reason?`, `actions?`, `href?` | Same slot order on every item card |
| `StatTile` | `label`, `value`, `icon`, `tone: accent\|progress\|attention\|failed`, `to` | Solid tile colour, white text, "More info" link naming its destination |
| `StatusBadge` | `status` or `meaning` + `label`, `reason?` | Icon + word, never colour alone |
| `Button` | `variant: primary\|secondary\|destructive\|quiet`, `filled?`, `busy?` | ≥ 44 × 44 px; one primary per area |
| `DataState` | `isLoading`, `error`, `isEmpty`, `what`, `empty`, `onRetry` | One layout with `data-state`; next step in each state |

## Screens (FR-013)

Every signed-in screen: `TopBar`, then `PageHeader` with breadcrumbs, then content of `Card`s and
`DataState`. Home adds `StatTile`s above "Needs attention". Sign-in and first-run setup use a centred
card without navigation.

## Accessibility (FR-014, SC-003)

axe with zero violations on every screen in light and dark, at 1280 px and 320 px, with reduced
transparency emulated, and with the slide-in panel open; focus visible (3 px accent ring); no
sideways scroll at 320 px except the board's columns; every control 44 × 44 px.
