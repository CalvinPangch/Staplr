# Research: An AdminLTE-Style Staplr with Apple-Style Details and a Green Accent

Updated 2026-11-09 for the AdminLTE layout (clarifications of 2026-11-09). R2 and R7 are
rewritten; R11–R14 are new; R1 gains the sidebar and stat-tile colours.

All open points of the plan are resolved here. Contrast figures were computed with the WCAG 2.x
relative-luminance formula on 2026-11-08.

## R1. Palette: neutral surfaces, one green accent

- **Decision** (tokens in `src/web/styles/tokens.css`):

  | Token | Light | Dark | Use |
  |---|---|---|---|
  | `--c-bg` | `#F5F5F7` | `#000000` | page (grouped) background |
  | `--c-surface` | `#FFFFFF` | `#1C1C1E` | cards, dialogs, inputs |
  | `--c-surface-raised` | `#FFFFFF` | `#2C2C2E` | menus, pop-overs, hover |
  | `--c-fg` | `#1D1D1F` | `#F5F5F7` | primary text |
  | `--c-muted` | `#6E6E73` | `#AEAEB2` | secondary text (solid surfaces only) |
  | `--c-separator` | `#D2D2D7` | `#38383A` | hairlines (decorative) |
  | `--c-control` | `#8E8E93` | `#8E8E93` | input and control borders (≥ 3:1) |
  | `--c-accent` | `#176B47` | `#5BD38A` | primary buttons, links, current nav, selection, focus |
  | `--c-accent-fg` | `#FFFFFF` | `#0B2A1A` | text on the accent |
  | status `good` | `#1A7F37` on `#EAF6EC` | `#6FDC8C` on `#14301F` | Ready, Connected, Downloaded |
  | status `attention` | `#8A4B00` on `#FFF4E0` | `#FFC861` on `#3A2A0A` | Not ready, Needs re-login |
  | status `failed` | `#C41E1E` on `#FDECEC` | `#FF8A80` on `#3A1716` | Download failed, errors |
  | status `progress` | `#1F5FBF` on `#EAF1FC` | `#8AB8FF` on `#16243D` | Downloading, Checking |
  | status `neutral` | `--c-muted` on `--c-bg` | same | Not checked, Unknown |
  | `--c-sidebar` | `rgb(30 34 40 / 94%)` | same | dark sidebar in both themes (frosted) |
  | `--c-sidebar-fg` | `#F2F4F7` | same | sidebar text and icons |
  | `--c-sidebar-muted` | `#B4BAC4` | same | sidebar section labels |
  | `--c-sidebar-accent` | `#5BD38A` | same | current item text and marker |
  | `--c-sidebar-current` | `#24402F` | same | current item background |
  | `--c-tile-{accent,progress,attention,failed}` | `#176B47`, `#1F5FBF`, `#8A4B00`, `#C41E1E` | same | Home stat tiles, white text |

- Measured contrast (text pairs need 4.5, control borders and focus 3.0): light text 15.5–16.8,
  muted 4.66 (bg) / 5.07 (card), accent 6.50 (card) / 5.97 (bg), white on accent 6.50, control
  border 3.26; dark text 15.6–19.3, muted 7.69 / 6.30, accent 9.02, text on accent 8.18, control
  border 5.22; status pairs 4.57–9.03. Sidebar (both themes): text 14.5, labels 8.19, accent
  8.47 on the sidebar; over white content when it slides in on a phone (worst case at 94%): text
  12.2, labels 6.9, accent 7.1; current item: accent 6.0 and text 10.3 on its background. Stat
  tiles, white text: 6.50 (accent), 6.09 (progress), 6.80 (attention), 5.91 (failed). Every pair
  passes AA.
- **Status vs accent**: "good" is a distinct, slightly brighter green and always comes with a
  check icon and a word; the accent is never used for a status (spec FR-001, FR-007).
- **Rationale**: Apple-like neutrals (`#F5F5F7`, `#1D1D1F`, `#1C1C1E`) with the existing deep green
  as the single tint, per clarification 1.
- **Alternatives**: Apple's system green `#34C759` as accent (fails 4.5:1 as text on white, 2.2:1);
  keeping green-tinted surfaces (rejected in clarification 1).

## R2. Frosted bars (sidebar, top navigation bar, phone tab bar)

- **Decision**: three surfaces are frosted: the dark sidebar (`--c-sidebar`, 94%), the top
  navigation bar and the phone tab bar (`--c-bar`, the page background at 92%), each with
  `backdrop-filter: saturate(180%) blur(20px)`. The top navigation bar is sticky at the top of the
  content column. The page title row with breadcrumbs is solid and scrolls with the page. Text on the
  light bars is limited to `--c-fg` and `--c-accent`; text on the sidebar uses the sidebar tokens.
  All three become opaque under `prefers-reduced-transparency: reduce`, `prefers-contrast: more`,
  and when `backdrop-filter` is unsupported.
- **Worst case**: light bars at 92% stay no darker than `#E1E1E3` (fg 12.9, accent 4.98); dark bars
  no lighter than `#2E2E30` (fg 12.5, accent 7.2); the sidebar figures are in R1. Secondary grey is
  not used on the light bars (3.88 in the worst case).
- **Rationale**: clarifications of 2026-11-08 (frosted bars) and 2026-11-09 (AdminLTE layout: the
  bars are the sidebar, the top navigation bar and the tab bar).

## R3. Typeface

- **Decision**: add `@fontsource-variable/inter` 5.3.0 (OFL-1.1, no dependencies), import only the
  Latin subset of the variable `wght` axis into the web bundle; Vite emits the `woff2` file next to
  the app, so it is served by Staplr. `font-display: swap` (the package default) keeps text visible
  with the system stack while it loads. Font stack: `'Inter Variable', -apple-system,
  BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`. Monospace stays the system stack.
- **Rationale**: clarification 5; one variable file covers every weight. Its size for the Latin
  subset is expected to be about 50 KB; the plan's 60 KB budget is checked when it is added.
- **Alternatives**: static Inter weights (more files); system font (rejected in clarification 5);
  loading from a font CDN (forbidden by the outbound-traffic rule).

## R4. Icons

- **Decision**: add `lucide-react` 1.70.0 (ISC, no dependencies). Only imported icons are bundled.
  Icons are decorative (`aria-hidden`) next to visible words; icon-only controls keep an accessible
  name. Used for the tab bar, sidebar, status labels and a few actions (about 15 icons).
- **Rationale**: the spec requires an icon with every status and tab; a consistent, maintained SF
  Symbols-like line set avoids hand-drawn SVGs.
- **Alternatives**: hand-copied SVG paths (unmaintained, licence notices per icon); emoji (not
  allowed by the design rules).

## R5. Type scale (≤ 5 sizes, SC-006)

- **Decision**: 28 px / 34 line, weight 700 (large page title); 20 / 26, 600 (section title);
  16 / 24, 400 (body, minimum for body text); 14 / 20, 400 (secondary); 12 / 16, 500 (captions,
  badges). Exposed as `text-title`, `text-section`, `text-body`, `text-secondary`, `text-caption`.
- **Rationale**: Apple's large-title hierarchy adapted to the web with a 16 px body.

## R6. Spacing, shape, elevation (≤ 8 spacing values, SC-006)

- **Decision**: spacing 4, 8, 12, 16, 24, 32, 48, 64 px only. Radius: 14 px cards and dialogs,
  10 px controls, full for badges and the tab bar indicator. Card: solid surface, 1 px
  `--c-separator` border in light, none in dark, plus `0 1px 2px rgb(0 0 0 / 6%)` in light only.
  Minimum control size 44 × 44 px.
- **Enforcement**: a unit test scans `src/web/**/*.tsx` class names and fails on text sizes or
  spacing utilities outside the scale (SC-006).

## R7. Navigation and the shell

- **Decision**: an AdminLTE shell rebuilt with Staplr's components:
  - **Sidebar** (≥ 1024 px): dark, frosted, 248 px wide; brand at the top, the three places
    (Home, Projects, Settings), then "Your projects". Collapsible to a 72 px icon rail with
    the menu toggle; the state is kept in `localStorage` (`staplr-sidebar`, per browser, read in a
    try/catch). Collapsed items keep `aria-label` and a tooltip with the name.
  - **Top navigation bar** (every width): sticky, frosted; menu toggle (`aria-expanded`,
    `aria-controls`), the current section's name, the theme choice and Sign out.
  - **Below 1024 px**: no fixed sidebar; the menu toggle opens it as a slide-in panel from the left
    (`role="dialog"`, `aria-modal="true"`, `aria-label="Navigation"`), built on Radix Dialog for
    focus trapping, Escape and outside-tap closing, and focus return to the toggle; choosing a link
    closes it. Content behind it is dimmed.
  - **Phone tab bar** (< 768 px): as before (Home, Projects, Settings; icon above label;
    49 px plus the safe area; hidden while typing).
- **Rationale**: clarifications of 2026-11-09 (Q1 B, Q2 dark in both themes, Q3 tab bar plus
  slide-in). Radix Dialog is already a dependency and handles the focus rules correctly.
- **Alternatives**: AdminLTE's own JavaScript and CSS (adds Bootstrap and jQuery, conflicts with
  Tailwind); a hand-written focus trap (more code, more risk).

## R8. Motion

- **Decision**: 150 ms for hover and press, 200 ms for showing and hiding, `cubic-bezier(0.2, 0,
  0, 1)`; only `opacity` and `transform` are animated; everything off under
  `prefers-reduced-motion` (rule already in `app.css`).

## R9. Shared building blocks

- **Decision**: new or reworked components in `src/web/components/ui/`: `PageHeader` (sticky,
  frosted, large title, description, one main action), `Card` (+ `CardHeader` slots for title,
  details, status, actions), `StatusBadge` (five meanings, icon + word), `Button` (primary,
  secondary, destructive, quiet), `DataState` (loading / empty / error / content with one
  layout), `TabBar`, `Sidebar`, `NavItem`. Screens use only these; existing per-screen class lists
  for cards and headers are removed.
- **Rationale**: FR-004–FR-009; one place to change each pattern.

## R10. Home "needs attention"

- **Decision**: Home reads the existing endpoints it already uses (agents, provider connections,
  projects) and derives the attention list client-side: agents `not_ready` (with first reason),
  connections `needs_relogin` / `needs_attention`, projects `download_failed`, projects without a
  Project Manager. No new endpoint.
- **Rationale**: FR-010 without server changes (presentation-only feature).

## R11. Page title row with breadcrumbs

- **Decision**: `PageHeader` becomes the AdminLTE content header: a breadcrumb trail above the
  title (`nav aria-label="Breadcrumb"` with an ordered list; earlier steps are links, the current
  step has `aria-current="page"`), the title (`h1`, `text-title`), a one-line description and at most
  one main action. It is solid and not sticky. Each screen passes its trail, for example
  `[Home, Agents, Dev Agent]`; Home shows only "Home".

## R12. Cards with a header bar

- **Decision**: `Card` gains optional `title`, `tools` (right side: status label or small actions)
  and `footer` props. With a title, the card renders a header bar (`h2`/`h3`, hairline under it), a
  body and an optional footer bar (hairline above). Without them it is the plain soft card. Radius,
  shadow and spacing stay as in R6.

## R13. Home stat tiles

- **Decision**: four tiles above the attention list (one column on phones, two from 640 px, four
  from 1024 px): Projects (accent tile), Agents ready of total (progress tile), Connections
  (progress tile), Needs attention (attention tile, or failed tile when any item failed). Each tile:
  large number (`text-title`), label (`text-body`), decorative icon, and a "More info" link with the
  destination named for screen readers. White text on solid tile colours (contrast in R1).

## R14. What changes in the code already built

- **Kept**: tokens, Tailwind mapping, frosted utility, `Button`, `StatusBadge`, `DataState`,
  `Card`/`CardRow`, nav items, tab bar, Home attention list, empty-state actions, design tests.
- **Changed**: the shell in `__root.tsx` (dark sidebar with collapse, top navigation bar,
  slide-in panel), `PageHeader` (breadcrumbs; solid, not sticky — the sticky frosted surface moves
  to the top bar), `Card` (header and footer bars), Home (stat tiles). The design-system test that
  expects a sticky header now expects a sticky top navigation bar and a breadcrumb trail.
