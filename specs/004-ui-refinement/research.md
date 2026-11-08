# Research: A Modern, Apple-Style Staplr with a Green Accent

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

- Measured contrast (text pairs need 4.5, control borders and focus 3.0): light text 15.5–16.8,
  muted 4.66 (bg) / 5.07 (card), accent 6.50 (card) / 5.97 (bg), white on accent 6.50, control
  border 3.26; dark text 15.6–19.3, muted 7.69 / 6.30, accent 9.02, text on accent 8.18, control
  border 5.22; status pairs 4.57–9.03. Every pair passes AA.
- **Status vs accent**: "good" is a distinct, slightly brighter green and always comes with a
  check icon and a word; the accent is never used for a status (spec FR-001, FR-007).
- **Rationale**: Apple-like neutrals (`#F5F5F7`, `#1D1D1F`, `#1C1C1E`) with the existing deep green
  as the single tint, per clarification 1.
- **Alternatives**: Apple's system green `#34C759` as accent (fails 4.5:1 as text on white, 2.2:1);
  keeping green-tinted surfaces (rejected in clarification 1).

## R2. Frosted sidebar and page header

- **Decision**: sidebar and sticky page header use `--c-bar` = the page background at 92% opacity
  with `backdrop-filter: saturate(180%) blur(20px)`. Text on bars is limited to `--c-fg` and
  `--c-accent`. Bars become fully opaque under `@media (prefers-reduced-transparency: reduce)`,
  `@media (prefers-contrast: more)`, and `@supports not (backdrop-filter: blur(1px))`.
- **Worst case** (darkest/lightest content scrolled under the bar): at 92% the light bar is no
  darker than `#E1E1E3` (fg 12.9, accent 4.98) and the dark bar no lighter than `#2E2E30` (fg 12.5,
  accent 7.2). Secondary grey fails there (3.88 light), hence the fg/accent-only rule. At 80% the
  accent fails (3.73), so 92% is the minimum.
- **Rationale**: clarification 2; Apple uses translucent bars and switches them off for Reduce
  Transparency.

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

## R7. Navigation

- **Decision**: sidebar at ≥ 768 px; bottom tab bar below 768 px with Home, Projects, Agents,
  Settings (icon above label, 49 px tall plus `env(safe-area-inset-bottom)`), content padded so the
  bar never covers it; the bar hides while the on-screen keyboard is open (focus inside a text
  field on small screens). The viewport meta gains `viewport-fit=cover`. Sidebar and tab bar share
  one list of destinations; the current one gets the accent colour and `aria-current="page"`.
- **Rationale**: clarification 3; Apple tab bars hold up to five items.

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
