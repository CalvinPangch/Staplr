# Tasks: A Modern, Apple-Style Staplr with a Green Accent

**Input**: Design documents from `specs/004-ui-refinement/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-system.md, quickstart.md

**Tests**: Required. The constitution (Principle I) makes test-first non-negotiable: every test task
is written and run **failing for the expected reason** before its implementation task. Existing
behaviour tests must keep passing (FR-017); when one depends on wording or layout this feature
changes on purpose, it is updated in the same task and keeps its intent.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on unfinished tasks)
- **[Story]**: US1 one look everywhere, US2 the important thing stands out, US3 shared loading /
  empty / error states, US4 phone and dark mode.

## Path Conventions

Web application as in features 001–003. This feature touches only `src/web/`, `package.json` and
`tests/`.

---

## Phase 1: Setup

- [ ] T001 Add runtime dependencies with exact versions: `npm install --save-exact @fontsource-variable/inter@5.3.0 lucide-react@1.70.0`; confirm `npm audit --audit-level=high` stays clean and record the justification (research R3, R4) in the commit message
- [ ] T002 Import only the Latin variable font in `src/web/main.tsx` (`@fontsource-variable/inter/wght.css` or the Latin-only entry), confirm after `npm run build` that the emitted Latin `woff2` in `dist/web/assets/` is at most 60 KB, and add `viewport-fit=cover` to the viewport meta in `src/web/index.html`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: tokens and shared components every story uses.

- [ ] T003 [P] Unit test first in `tests/unit/design-tokens.test.ts`: parse `src/web/styles/tokens.css`, resolve the light values (`:root`) and dark values (`:root[data-theme='dark']` and the `prefers-color-scheme: dark` block, which must be identical), and assert with the WCAG 2.x formula: text pairs ≥ 4.5:1 — `--c-fg` and `--c-muted` on `--c-bg` and `--c-surface`, `--c-accent` on `--c-bg` and `--c-surface`, `--c-accent-fg` on `--c-accent`, each `--c-status-*` on its `--c-status-*-soft`; ≥ 3:1 — `--c-control` on `--c-surface`, `--c-accent` (focus) on `--c-bg`; frosted-bar worst case: `--c-fg` and `--c-accent` on the bar colour composited at its opacity over black (light) and white (dark) ≥ 4.5:1; and that every token named in `contracts/ui-system.md` exists in both themes
- [ ] T004 [P] Unit test first in `tests/unit/design-scale.test.ts`: scan every `className` string in `src/web/**/*.tsx` and fail on font-size utilities other than `text-title`, `text-section`, `text-body`, `text-secondary`, `text-caption`, and on spacing utilities (`p*`, `m*`, `gap*`, `space-*`) whose value is not in the scale 1, 2, 3, 4, 6, 8, 12, 16 (4, 8, 12, 16, 24, 32, 48, 64 px) or 0; list each offending file and class (SC-006). It is expected to fail until Phase 7
- [ ] T005 Rewrite `src/web/styles/tokens.css` to the R1 palette (light and dark, both dark blocks identical), the R5 type scale as `--text-*` size/line-height/weight variables, the R6 spacing (`--space-1..8` = 4, 8, 12, 16, 24, 32, 48, 64 px), radii (`--radius-card` 14 px, `--radius-control` 10 px, `--radius-pill` 999 px), motion (`--motion-fast` 150 ms, `--motion-base` 200 ms, `--ease` `cubic-bezier(0.2,0,0,1)`) and `--c-bar` at 92% opacity; font stack `'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`; make T003 pass
- [ ] T006 Update the `@theme` mapping in `src/web/styles/app.css`: expose the new colour tokens as Tailwind colours (`bg-bg`, `bg-surface`, `bg-surface-raised`, `text-fg`, `text-muted`, `border-separator`, `border-control`, `bg-accent`, `text-accent`, `text-accent-fg`, `bg-status-*`, `text-status-*`), the five text sizes as `text-title|section|body|secondary|caption`, and the spacing scale; keep old token names as aliases until Phase 7 so screens keep compiling; set the focus ring to 3 px `--c-accent` with 2 px offset; base `body` text 16 px / 24 px
- [ ] T007 [P] Rework `src/web/components/ui/Button.tsx` to variants `primary` (accent fill), `secondary` (surface with control border), `destructive` (status-failed text and border, filled only in confirm dialogs), `quiet` (text only, accent); `min-h-11 min-w-11` (44 px), `--radius-control`, 150 ms colour/opacity transitions, `busy` keeps size and shows a spinner icon from `lucide-react` with `aria-hidden`
- [ ] T008 [P] Rework `src/web/components/ui/StatusBadge.tsx` to `meaning: 'good' | 'attention' | 'failed' | 'progress' | 'neutral'`, `label`, optional `reason`; pill shape, `text-caption`, status colour on its soft background, an icon per meaning (`CircleCheck`, `CircleAlert`, `CircleX`, `LoaderCircle`, `Circle`) with `aria-hidden`; keep the existing `status` prop mapping (connected, ready → good; needs_relogin, not_ready, needs_attention → attention; download_failed → failed; downloading, checking → progress) so callers keep working
- [ ] T009 [P] Create `src/web/components/ui/Card.tsx` with `Card` (solid `bg-surface`, `--radius-card`, light: 1 px `border-separator` + `0 1px 2px rgb(0 0 0 / 6%)`; dark: no border or shadow; padding 16 px, 24 px from 768 px) and `CardRow` (slots in fixed order: title — long titles truncate with the full text in `title` — then details, status badge with its reason, actions; optional `href` makes the title a link)
- [ ] T010 [P] Create `src/web/components/ui/PageHeader.tsx`: `<header>` with `h1` (`text-title`), one-line description (`text-body`, `text-muted` is not allowed on the bar — use `text-fg` at regular weight), and one optional action slot aligned right (wraps under the title below 480 px); sticky at the top of the scrolling content, frosted per research R2 (`background: var(--c-bar)` + `backdrop-filter: saturate(180%) blur(20px)`, opaque under `prefers-reduced-transparency: reduce`, `prefers-contrast: more` and `@supports not (backdrop-filter: blur(1px))`)
- [ ] T011 [P] Rework `src/web/components/ui/DataState.tsx` to one layout for loading (`LoaderCircle` + "Loading {what}…", reserved minimum height so the page does not jump), empty (icon + the `empty` sentence + its action), and error (`CircleX`, what failed, `Retry` secondary button, `role="alert"`); keep its props unchanged
- [ ] T012 Restyle the remaining shared controls with the tokens only (no raw colours): `src/web/components/ui/{Dialog,ConfirmDialog,Select,TextField,TextArea,Toast,Combobox,DropdownMenu}.tsx` — `bg-surface`/`bg-surface-raised`, `--radius-card` for dialogs and menus, `--radius-control` for fields, 44 px minimum heights, `text-body` labels, errors in status-failed text with an icon

**Checkpoint**: tokens pass contrast; shared components exist; screens still compile and existing tests pass.

---

## Phase 3: User Story 1 - One look across every screen (Priority: P1) 🎯 MVP

**Goal**: the shell and every screen use the shared page header, cards, buttons and status labels on
neutral surfaces with the green accent only for actions.

**Independent Test**: open every screen; each starts with the same page header, uses the same cards,
buttons and status labels; green appears only on actions, links, the current nav item and focus.

### Tests for User Story 1 ⚠️

- [ ] T013 [P] [US1] E2E in `tests/e2e/design-system.spec.ts`: for each signed-in route (`/`, `/projects`, a project, `/agents`, an agent, `/settings`, `/settings/providers`, `/settings/source-control`, `/audit`, `/diagnostics`) assert exactly one `h1` inside a `header` that is the first element of `main`, that the header is `position: sticky`, that every status label on the page contains an `svg` and visible text, that each card region has at most one primary button, and that the computed font family of the `h1` starts with `"Inter Variable"`; the sidebar's current item has `aria-current="page"` and the accent colour

### Implementation for User Story 1

- [ ] T014 [US1] Create `src/web/components/ui/nav/navItems.ts` (Home `/`, Projects `/projects`, Agents `/agents`, Settings `/settings`, each with a `lucide-react` icon: `House`, `FolderKanban`, `Bot`, `Settings`) and `src/web/components/ui/nav/Sidebar.tsx` (frosted per R2, `text-fg` labels, current item accent text on a light accent tint with `aria-current="page"`, 44 px rows), and use it in `src/web/routes/__root.tsx` in place of the current sidebar markup, shown from 768 px
- [ ] T015 [P] [US1] Move sign-in and first-run setup onto a centred `Card` with the shared fields and one primary button in `src/web/routes/sign-in.tsx` and `src/web/routes/setup.tsx`
- [ ] T016 [P] [US1] Projects list and project screen onto `PageHeader` + `Card`/`CardRow` + `StatusBadge` in `src/web/routes/projects/index.tsx`, `src/web/routes/projects/$projectId.tsx`, `src/web/features/projects/{AddProjectWizard,RepositoryPicker,TeamRoster}.tsx`
- [ ] T017 [P] [US1] Board onto the shared card style (tickets stay draggable cards; columns use `bg-bg` with `text-section` titles) in `src/web/features/board/{Board,Column,TicketCard,TicketDialog,MoveToMenu,DeleteTicketDialog}.tsx`
- [ ] T018 [P] [US1] Agents list, agent editor and template picker onto `PageHeader` + `Card` in `src/web/routes/agents/index.tsx`, `src/web/routes/agents/$agentId.tsx`, `src/web/features/agents/AgentFileEditor.tsx` (editor tabs as an Apple-style segmented control: one pill track, selected segment on `bg-surface`)
- [ ] T019 [P] [US1] Providers, Codex sign-in, model lists and prices onto the shared parts in `src/web/routes/settings/providers.tsx`, `src/web/routes/settings/provider-login.tsx`, `src/web/features/providers/{ProviderCard,CodexModels,ApiKeyDialog,CodexLoginDialog}.tsx`, `src/web/features/prices/{PricesPanel,ModelPrice}.tsx`
- [ ] T020 [P] [US1] Source control onto the shared parts in `src/web/routes/settings/source-control.tsx`, `src/web/features/source-control/{ConnectionCard,AddConnectionDialog,ReplaceTokenDialog}.tsx`
- [ ] T021 [P] [US1] Settings, Audit and Diagnostics onto `PageHeader` + `Card` in `src/web/routes/settings/index.tsx` (one card per destination with icon, title, one-line description and chevron), `src/web/routes/audit.tsx` and `src/web/routes/diagnostics.tsx` (tables inside a card, horizontally scrollable region kept for narrow screens)

**Checkpoint**: every screen shares the look; T013 passes.

---

## Phase 4: User Story 2 - The important thing stands out (Priority: P1)

**Goal**: Home lists what needs attention first; lists and detail screens show status and reason up
front.

**Independent Test**: with one agent Not ready and one connection needing re-login, Home lists both
first with reasons and links; their list items show the reason without opening them.

### Tests for User Story 2 ⚠️

- [ ] T022 [P] [US2] E2E in `tests/e2e/design-system.spec.ts`: with a Claude connection whose key is then rejected (fake Anthropic `reject: true`) and an agent on it, Home shows a "Needs attention" section listing the agent (with its reason) and the connection, each linking to its screen; with everything ready Home shows "Everything is ready."; on `/agents` and `/settings/providers` the affected cards show the status label and the reason text
- [ ] T023 [P] [US2] Unit test in `tests/unit/attention.test.ts` for `attentionItems()` in `src/web/features/home/attention.ts`: inputs per data-model.md (agents `not_ready` with first reason; provider connections `needs_relogin` with `lastCheckResult`; source-control connections `needs_attention`; projects `download_failed` or with reason `no_project_manager`); order failed first, then attention; empty input → empty list

### Implementation for User Story 2

- [ ] T024 [US2] Create `src/web/features/home/attention.ts` (`attentionItems()`, pure) and rewrite `src/web/routes/home.tsx`: `PageHeader` ("Home"), then a "Needs attention" card list (each item: kind icon, name, reason, link) or a `good` empty state "Everything is ready.", then summary cards for Projects, Agents and Connections with counts; reads the existing queries `useAgents`, `useProviderConnections`, source-control and projects queries; each section uses `DataState`
- [ ] T025 [US2] Show the status reason under the title on every card that needs attention, via `CardRow`'s `status` slot, in `src/web/routes/agents/index.tsx`, `src/web/features/providers/ProviderCard.tsx`, `src/web/features/source-control/ConnectionCard.tsx`, `src/web/routes/projects/index.tsx`
- [ ] T026 [US2] On detail screens put status and the next step first: agent editor (readiness and reasons above the file), project screen (readiness and missing-role warnings above team and board), provider card (status and next action above details) in `src/web/routes/agents/$agentId.tsx`, `src/web/routes/projects/$projectId.tsx`, `src/web/features/providers/ProviderCard.tsx`

**Checkpoint**: problems are found at a glance (SC-002).

---

## Phase 5: User Story 3 - The same messages for loading, empty and errors (Priority: P2)

**Goal**: every screen uses the shared state layout with a next step.

**Independent Test**: force each screen into loading, empty and error; each shows the shared layout.

### Tests for User Story 3 ⚠️

- [ ] T027 [P] [US3] Extend `tests/e2e/screen-states.spec.ts`: for every list screen (projects, agents, providers, source control, audit) intercept its API with an empty list and with a 500, and assert the shared empty layout (icon, sentence, action) and the shared error layout (`role="alert"`, what failed, `Retry` button that refetches); with a delayed response assert the loading layout and that the page height does not change when data arrives by more than the card height

### Implementation for User Story 3

- [ ] T028 [US3] Route every screen's data through `DataState` with a sentence and next step (empty: the action that adds the first item; error: Retry) in `src/web/routes/{projects/index,agents/index,audit,diagnostics,settings/providers,settings/source-control}.tsx` and `src/web/features/providers/CodexModels.tsx`; a failed refresh keeps old data visible with the error above it

**Checkpoint**: states are consistent everywhere.

---

## Phase 6: User Story 4 - Comfortable on a phone and in the dark (Priority: P2)

**Goal**: bottom tab bar on phones, frosted bars with a solid fallback, dark theme and 320 px clean.

**Independent Test**: at 320 px every screen shows the tab bar, no sideways scroll, 44 px targets;
axe passes in light, dark and reduced transparency.

### Tests for User Story 4 ⚠️

- [ ] T029 [P] [US4] Extend `tests/e2e/a11y-responsive.spec.ts`: run axe on every route in light and dark (`page.emulateMedia({ colorScheme })`), and with reduced transparency (`page.emulateMedia({ reducedMotion: 'reduce' })` plus the `prefers-reduced-transparency` media emulation via CDP `Emulation.setEmulatedMedia` features), at 1280 px and 320 px; assert no horizontal scroll (board columns excepted) and every visible button, link and form control has a box of at least 44 × 44 px
- [ ] T030 [P] [US4] E2E in `tests/e2e/design-system.spec.ts`: at 320 px a `nav` named "Main" is fixed to the bottom with exactly the links Home, Projects, Agents, Settings (each with an `svg` and text), the current one has `aria-current="page"`; the last element of the page content is not covered by it; focusing the agent file text area hides the tab bar; at 1280 px the tab bar is absent and the sidebar shows the same links; with reduced transparency emulated the header and sidebar have an opaque background (`backdrop-filter: none`)

### Implementation for User Story 4

- [ ] T031 [US4] Create `src/web/components/ui/nav/TabBar.tsx` from `navItems.ts` (fixed bottom, frosted per R2, 49 px plus `env(safe-area-inset-bottom)`, icon above `text-caption` label, accent for the current item, hidden from 768 px, hidden while a text field has focus on small screens) and use it in `src/web/routes/__root.tsx`; pad the main content bottom by the tab bar height below 768 px
- [ ] T032 [US4] In `src/web/styles/app.css` add the reduced-transparency, increased-contrast and no-`backdrop-filter` fallbacks for the sidebar, tab bar and page header (opaque `--c-bg`), and the reduced-motion rule for every new transition; check dark-mode borders and shadows per research R6
- [ ] T033 [US4] Fix any 320 px or dark-mode findings from T029/T030 in the affected screens (long names truncate with the full name in `title`; dialogs fit the screen; tables scroll inside their card)

**Checkpoint**: phone and dark mode are first-class.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T034 Remove the per-screen and obsolete classes and old token aliases from `src/web/styles/app.css` and component markup (e.g. `home-*`, `app-*` leftovers, `bg-info-soft`, `border-edge*`, raw `text-sm/lg/xl`, off-scale spacing) until T004 passes
- [ ] T035 [P] Update every existing e2e spec whose wording or layout changed on purpose (`tests/e2e/{settings-navigation,us1-source-control,us2-provider-connection,us4-agents,us4x-agent-files,us5-projects,us7-board,us8-model-discovery,audit,diagnostics,auth}.spec.ts`), keeping each test's intent (FR-017)
- [ ] T036 [P] Extend `tests/integration/egress.test.ts`: serving the built web app (`dist/web`) makes no outbound request, and the Inter `woff2` is served by Staplr (SC-007)
- [ ] T037 Run all gates: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run test:docker`, `npm run test:e2e` (including the board performance test, SC-008), `npm audit --audit-level=high`
- [ ] T038 **Manual task for the owner**: walk through `specs/004-ui-refinement/quickstart.md` in light and dark, on a desktop browser and a phone, and record the review in `specs/004-ui-refinement/checklists/visual-review.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after Setup; blocks all stories (tokens and shared components).
- **US1 (Phase 3)**: after Foundational. **MVP.**
- **US2 (Phase 4)**: after US1 (uses the restyled cards and Home layout).
- **US3 (Phase 5)**: after Foundational; touches the same screens as US1, so run after US1.
- **US4 (Phase 6)**: after US1 (the shell and navigation).
- **Polish (Phase 7)**: after all stories.

### Within Each Story

Tests first and failing → shared parts → screens.

### Parallel Opportunities

- T003 and T004 together; T007–T011 together after T005/T006.
- US1 screen tasks T015–T021 touch different files and can run together after T014.
- T022 and T023 together; T027, T029, T030 together.

---

## Parallel Example: User Story 1

```text
# Test first:
T013 tests/e2e/design-system.spec.ts
# Shell:
T014 src/web/components/ui/nav/* + routes/__root.tsx
# Then, in parallel:
T015 sign-in / setup
T016 projects
T017 board
T018 agents
T019 providers and prices
T020 source control
T021 settings, audit, diagnostics
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

Setup → Foundational → US1. Stop and review the running app: every screen has the new look
(quickstart steps 1–3).

### Incremental Delivery

1. US1 → one modern look everywhere (MVP).
2. US2 → Home "needs attention" and status reasons up front.
3. US3 → consistent loading, empty and error states.
4. US4 → tab bar, frosted fallback, dark and 320 px verified.
5. Polish → remove leftovers, scale test green, all gates, owner review.
