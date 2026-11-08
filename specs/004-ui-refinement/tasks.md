# Tasks: An AdminLTE-Style Staplr with Apple-Style Details and a Green Accent

**Input**: Design documents from `specs/004-ui-refinement/` (plan, spec, research R1–R14,
data-model, contracts/ui-system.md, quickstart)
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-system.md, quickstart.md

**Tests**: Required. The constitution (Principle I) makes test-first non-negotiable: every test task
is written and run **failing for the expected reason** before its implementation task. Existing
behaviour tests keep passing (FR-017); when one depends on wording or layout this feature changes on
purpose, it changes in the same task and keeps its intent.

**Regenerated 2026-11-09** after the AdminLTE clarifications. Tasks marked `[X]` were implemented
and verified (typecheck, lint, unit tests) under the earlier plan and still hold under this one;
the open tasks cover what the AdminLTE layout adds or changes (research R14).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on unfinished tasks)
- **[Story]**: US1 one look everywhere (shell, title row, cards), US2 the important thing stands out
  (Home tiles and attention), US3 shared loading/empty/error states, US4 phone and dark mode.

---

## Phase 1: Setup

- [X] T001 Add `@fontsource-variable/inter@5.3.0` and `lucide-react@1.70.0` with exact versions in `package.json`; `npm audit --audit-level=high` clean
- [X] T002 Import `@fontsource-variable/inter/wght.css` in `src/web/main.tsx` (Latin `woff2` measured at 48 KB ≤ 60 KB) and add `viewport-fit=cover` in `src/web/index.html`

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T003 [P] Contrast test `tests/unit/design-tokens.test.ts` for content, accent, status and light/dark frosted-bar pairs in both themes (identical dark blocks)
- [X] T004 [P] Scale test `tests/unit/design-scale.test.ts`: markup and style sheets use only the 5 text sizes and 8 spacing values (SC-006)
- [X] T005 Tokens in `src/web/styles/tokens.css` (R1 palette, `--fs-*`/`--lh-*`, `--space-1..8`, `--r-*`, motion, `--c-bar` 92%, Inter stack); old aliases removed
- [X] T006 Tailwind mapping and base styles in `src/web/styles/app.css` (element defaults in `@layer base` so utilities win; `.frosted` with reduced-transparency, more-contrast and no-blur fallbacks)
- [X] T007 [P] `Button` variants primary / secondary / destructive (+ `filled`) / quiet, 44 px, `data-variant` in `src/web/components/ui/Button.tsx`
- [X] T008 [P] `StatusBadge` with five meanings, icon + word, `data-status-badge` in `src/web/components/ui/StatusBadge.tsx`
- [X] T009 [P] `Card` + `CardRow` (soft card, fixed slot order, `data-card`) in `src/web/components/ui/Card.tsx`
- [X] T010 [P] `DataState` shared loading / empty / error layout with `data-state` in `src/web/components/ui/DataState.tsx`
- [X] T011 Restyle `Dialog`, `ConfirmDialog`, `Select`, `TextField`, `TextArea`, `Toast`, `Combobox`, `DropdownMenu` in `src/web/components/ui/` with tokens only
- [X] T012 Extend `tests/unit/design-tokens.test.ts` first, then add the tokens to `src/web/styles/tokens.css` (same in both themes): `--c-sidebar` `rgb(30 34 40 / 94%)`, `--c-sidebar-fg` `#F2F4F7`, `--c-sidebar-muted` `#B4BAC4`, `--c-sidebar-accent` `#5BD38A`, `--c-sidebar-current` `#24402F`, `--c-tile-accent` `#176B47`, `--c-tile-progress` `#1F5FBF`, `--c-tile-attention` `#8A4B00`, `--c-tile-failed` `#C41E1E`; test pairs: sidebar fg, muted and accent on the sidebar and on the sidebar composited at its opacity over white (slide-in worst case) ≥ 4.5; accent and fg on `--c-sidebar-current` ≥ 4.5; white on each tile ≥ 4.5; map them in `src/web/styles/app.css` (`bg-sidebar`, `text-sidebar-fg`, … , `bg-tile-*`)

**Checkpoint**: tokens and shared components ready; screens compile; unit tests pass.

---

## Phase 3: User Story 1 - One look across every screen (Priority: P1) 🎯 MVP

**Goal**: the AdminLTE shell (dark sidebar, top navigation bar), title rows with breadcrumbs and
header-bar cards on every screen, with the green accent only for actions.

**Independent Test**: every signed-in screen shows the sticky frosted top bar, the dark sidebar with
the current place marked, breadcrumbs above the title, and the shared cards and status labels; the
sidebar collapses to icons and stays collapsed after a reload.

### Tests for User Story 1 ⚠️

- [X] T013 [P] [US1] E2E `tests/e2e/design-shell.spec.ts` (new): at 1280 px every signed-in route shows a `header` landmark containing the menu toggle (`aria-expanded`, `aria-controls`), the current section name, the theme choice and Sign out, with `position: sticky` and a `backdrop-filter` containing `blur`; a dark sidebar (an `aside` named "Sidebar", a `complementary` landmark, containing `nav[aria-label="Main"]`) with brand, Home, Projects, Settings and "Your projects" (Settings stays current on `/agents` pages), the current item `aria-current="page"` coloured `--c-sidebar-accent`; pressing the toggle collapses the sidebar to icons (each link keeps an accessible name and a `title`), `aria-expanded` flips, and after a reload it is still collapsed (`localStorage` key `staplr-sidebar`); each route shows `nav[aria-label="Breadcrumb"]` above the `h1`, earlier steps links, last step `aria-current="page"` (Agents → "Home › Settings › Agents"; an agent → "Home › Settings › Agents › {name}")
- [X] T014 [P] [US1] Update `tests/e2e/design-system.spec.ts`: the page title row is the first child of `main`, contains the only `h1`, and is **not** sticky; keep the status-label, one-primary-per-card, accent and SC-007 checks; cards with a title render a header bar (`[data-card-header]`) with the title on the left

### Implementation for User Story 1

- [X] T015 [US1] Rework `src/web/components/ui/nav/Sidebar.tsx`: dark frosted surface (`bg-sidebar` + `.frosted-dark` fallbacks in `src/web/styles/app.css`), sidebar tokens for text, labels, current item and hover; a `collapsed` prop that renders a 72 px icon rail (links keep `aria-label` and `title`, the brand shows only its mark, "Your projects" hidden); exported for reuse by the panel
- [X] T016 [US1] Create `src/web/components/ui/nav/TopBar.tsx`: sticky frosted `header` with the menu toggle (`Menu` icon, accessible name "Show navigation"/"Hide navigation", `aria-expanded`, `aria-controls`), the current section name from `navItems`, `ThemeSelect` and `SignOutButton`. Both live **only** in the top bar (one control each, same labels as today, FR-002); the Settings "Preferences and account" card no longer repeats them and instead says "Theme and Sign out are in the top bar."
- [X] T017 [US1] Shell in `src/web/routes/__root.tsx` and `src/web/styles/app.css`: grid with the sidebar column from 1024 px (248 px, or 72 px when collapsed), the top bar sticky at the top of the content column, collapse state in `localStorage` key `staplr-sidebar` read/written in try/catch (default expanded); below 1024 px no sidebar column (the panel, T031, takes over)
- [X] T018 [US1] Rework `src/web/components/ui/PageHeader.tsx`: solid (no `.frosted`, not sticky), `breadcrumbs: { label: string; to?: string }[]` rendered as `nav aria-label="Breadcrumb"` with an ordered list and `›` separators (decorative), last item `aria-current="page"`; title `h1`, description, one action
- [X] T019 [US1] Pass breadcrumbs from every screen: `src/web/routes/{home,projects/index,projects/$projectId,agents/index,agents/$agentId,settings/index,settings/providers,settings/provider-login,settings/source-control,audit,diagnostics}.tsx` and `NotFound` in `src/web/routes/__root.tsx` (Settings children: Home › Settings › {page})
- [X] T020 [US1] Add header and footer bars to `src/web/components/ui/Card.tsx`: optional `title` (heading level prop), `tools` (right side) and `footer`; header bar with a hairline (`data-card-header`), footer bar with a hairline above; use them for titled cards: provider cards, source-control connection cards, the prices panel, the agent editor's "Connection and model" card, the team roster and the Settings "Preferences and account" card in their files under `src/web/features/**` and `src/web/routes/**`; bring board tickets in `src/web/features/board/TicketCard.tsx` onto the same card tokens (`rounded-card`, `shadow-card`, `border-separator`, `bg-surface`, card spacing) without a header bar, keeping the board's drag handles and density

**Checkpoint**: T013 and T014 pass; quickstart steps 1–3.

---

## Phase 4: User Story 2 - The important thing stands out (Priority: P1)

**Goal**: Home shows AdminLTE stat tiles and lists what needs attention first; cards show reasons.

**Independent Test**: with one agent Not ready and one connection needing re-login, Home's tiles
count them and the attention list names both with reasons and links.

### Tests for User Story 2 ⚠️

- [X] T021 [P] [US2] Unit test `tests/unit/attention.test.ts` for `attentionItems()` (kinds, reasons, links, failures first, empty)
- [X] T022 [P] [US2] E2E `tests/e2e/design-attention.spec.ts`: Home lists the Not ready agent and the re-login connection with reasons and links; "Everything is ready." when nothing needs attention; reasons on the affected cards
- [X] T023 [US2] Extend `tests/e2e/design-attention.spec.ts` with stat tiles: Home shows four tiles in a `region` named "Overview" — Projects, Agents ready ("N of M"), Connections, Needs attention (count) — each with a number, a label, an `svg` and a "More info" link whose accessible name includes its destination (for example "More info about agents") pointing to `/projects`, `/agents`, `/settings/providers` and the attention list (`#needs-attention`); axe passes

### Implementation for User Story 2

- [X] T024 [US2] `src/web/features/home/attention.ts` and the Home attention list in `src/web/routes/home.tsx`
- [X] T025 [US2] Status reasons on agent, project, provider and source-control cards (`CardRow` reason slot and existing last-check text)
- [X] T026 [US2] Status and next step first on the agent editor and project screens
- [X] T027 [US2] Create `src/web/components/ui/StatTile.tsx` (`label`, `value`, `icon`, `tone: accent | progress | attention | failed`, `to`, `moreLabel`): solid `bg-tile-*`, white text, large value (`text-title`), decorative icon, footer link "More info" with `sr-only` destination; and replace Home's summary cards in `src/web/routes/home.tsx` with the four tiles in a `section aria-label="Overview"` grid (1 column, 2 from 640 px, 4 from 1024 px), attention tile tone `failed` when any item failed, the attention list section getting `id="needs-attention"`

**Checkpoint**: SC-002 path works; T022 and T023 pass.

---

## Phase 5: User Story 3 - The same messages for loading, empty and errors (Priority: P2)

**Goal**: the shared state layout with a next step everywhere.

**Independent Test**: each list screen's empty, error and loading states look the same.

- [X] T028 [P] [US3] E2E in `tests/e2e/screen-states.spec.ts` for projects, agents, providers and source control (empty layout with icon and action, error with Retry, loading)
- [X] T029 [US3] `DataState` on every list screen with next-step actions ("Add your first …" labels distinct from the header actions)

**Checkpoint**: states are consistent everywhere.

---

## Phase 6: User Story 4 - Comfortable on a phone and in the dark (Priority: P2)

**Goal**: tab bar and slide-in sidebar on small screens; frosted bars with solid fallbacks; dark
theme and 320 px clean.

**Independent Test**: at 320 px the tab bar shows the three places, the menu toggle slides the dark
sidebar in and it obeys the focus rules; axe passes in light, dark and reduced transparency.

### Tests for User Story 4 ⚠️

- [X] T030 [P] [US4] E2E `tests/e2e/design-navigation.spec.ts` (tab bar, hidden while typing, same destinations on wide screens, frosted fallback). **Reopened**: 4 runs fail because each test changes the viewport inside a project that already fixes one; tag the phone test to run only in the `mobile` project and the wide-screen test only in `desktop` (or create the page with the viewport before navigating), and expect the dark sidebar (`aside` "Sidebar") from 1024 px
- [X] T031 [P] [US4] Extend `tests/e2e/a11y-responsive.spec.ts`: every screen in both themes at 1280 and 320 px (axe, no sideways scroll, 44 px targets), reduced transparency, 200% text zoom
- [X] T032 [P] [US4] E2E in `tests/e2e/design-shell.spec.ts`: at 320 px and at 900 px the menu toggle opens a `dialog` named "Navigation" containing the three places and "Your projects"; focus moves into it and Tab cycles inside; Escape closes it and focus returns to the toggle; a tap on the dimmed area closes it; choosing a link navigates and closes it; axe passes with the panel open; with `reducedMotion: 'reduce'` the panel and overlay have a computed `transition-duration` of `0s` (FR-016); update `design-navigation.spec.ts` so the frosted-fallback check targets the top bar instead of the page title row

### Implementation for User Story 4

- [X] T033 [US4] `src/web/components/ui/nav/TabBar.tsx` (the places from `navItems`, icon + label, safe area, hidden while typing) used below 768 px
- [X] T034 [US4] Create `src/web/components/ui/nav/SidebarPanel.tsx` on Radix Dialog (`@radix-ui/react-dialog`, already a dependency): left-anchored dark panel rendering `Sidebar` (expanded), title "Navigation" (visually hidden), overlay `bg-black/40`, slide-in transform 200 ms (none under reduced motion), closes on route change; wire its open state to the top bar toggle below 1024 px in `src/web/routes/__root.tsx`
- [X] T035 [US4] Move the frosted fallbacks to the new surfaces in `src/web/styles/app.css` (`.frosted` for the top bar and tab bar, `.frosted-dark` for the sidebar and panel) and fix any 320 px, dark-mode or target-size findings from T031/T032 in the affected screens

**Checkpoint**: phone and dark mode are first-class.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T036 [P] Unit test `tests/unit/font-loading.test.ts` (Inter from local files with `font-display: swap`; system fallback stack) and the in-browser outbound-request check in `tests/e2e/design-system.spec.ts` (SC-007)
- [X] T037 Update existing e2e specs whose wording or layout changed on purpose, keeping each test's intent (FR-017): `tests/e2e/{settings-navigation,us1-source-control,us2-provider-connection,us4-agents,us4x-agent-files,us5-projects,us7-board,us8-model-discovery,audit,diagnostics,auth}.spec.ts` (main navigation now has Home, Projects, Settings, with Agents under Settings; Sign out and theme in the top bar; breadcrumbs above titles; empty-state actions now "Add your first …"); find and fix the cause of the mobile-only failure in `us8-model-discovery.spec.ts:20`; and add to `tests/e2e/screen-states.spec.ts` the edge case "error and data together": after a list loads, a failed refetch keeps the items visible with the error and Retry shown above them (fix `DataState` usage if it fails)
- [X] T038 Run all gates and fix findings without weakening tests: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run test:docker`, `npm run test:e2e` (full run, both installations, including the board performance test, SC-008), `npm audit --audit-level=high`
- [ ] T039 **Manual task for the owner**: walk through `specs/004-ui-refinement/quickstart.md` in light and dark, on a desktop browser and a phone, and record the review in `specs/004-ui-refinement/checklists/visual-review.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup, Foundational**: done except T012 (sidebar and tile tokens), which blocks T015 and T027.
- **US1 (Phase 3)**: after T012. **MVP.** T015 → T016 → T017 (same shell files); T018 → T019; T020 independent.
- **US2 (Phase 4)**: T027 after T012 and T018 (Home's title row).
- **US3 (Phase 5)**: done.
- **US4 (Phase 6)**: T034 after T015–T017 (reuses the sidebar and the toggle).
- **Polish (Phase 7)**: after all stories; T037 before T038.

### Parallel Opportunities

- T013, T014, T023 and T032 (tests) together.
- T018–T019 alongside T015–T017; T020 alongside both.

---

## Parallel Example: User Story 1

```text
# Tests first:
T013 tests/e2e/design-shell.spec.ts
T014 tests/e2e/design-system.spec.ts
# Then, in parallel streams:
Shell:     T015 Sidebar → T016 TopBar → T017 __root.tsx + app.css
Title row: T018 PageHeader → T019 breadcrumbs on every screen
Cards:     T020 Card header/footer bars
```

---

## Implementation Strategy

### MVP First (User Story 1)

T012 → US1 (T013–T020). Stop and review: the AdminLTE shell, breadcrumbs and header-bar cards on
every screen (quickstart 1–3).

### Incremental Delivery

1. US1 → AdminLTE shell and title rows (MVP).
2. US2 → stat tiles on Home.
3. US4 → slide-in sidebar on small screens; fallbacks and fixes.
4. Polish → existing tests updated, full gate run, owner review.
