# Implementation Plan: A Modern, Apple-Style Staplr with a Green Accent

**Branch**: `004-ui-refinement` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/004-ui-refinement/spec.md`

## Summary

A presentation-only redesign. The tokens move to Apple-style neutral surfaces with Staplr's deep
green as the single accent; the sidebar and a new sticky page header become frosted glass with a
solid fallback; phones get a bottom tab bar; every item is an Apple-style card; text uses a bundled
Inter variable font. A small set of shared components (page header, card, status badge, buttons,
data states, navigation) is built or reworked first, then each screen is moved onto them. Home
gains a "needs attention" list derived from data it can already read. No server, API or data
changes.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19 (unchanged)
**Primary Dependencies**: Tailwind CSS 4, Radix UI, TanStack Router/Query (unchanged); **new**:
`@fontsource-variable/inter` 5.3.0 (OFL-1.1) and `lucide-react` 1.70.0 (ISC), both with no
dependencies (research R3, R4)
**Storage**: none changed
**Testing**: Vitest (unit: token contrast, class-scale scan), Playwright + axe (every screen, light
and dark, 1280 and 320 px, reduced transparency)
**Target Platform**: modern browsers; Safari, Chrome, Edge, Firefox (backdrop-filter with fallback)
**Project Type**: web application (React SPA served by the Fastify API)
**Performance Goals**: board shows 200 tickets within the existing target (SC-008); added font
≤ 60 KB (Latin subset); no layout shift when data or the font arrives
**Constraints**: WCAG 2.2 AA in both themes and on frosted bars (worst-case contrast, R2); 320 px;
no outbound requests; ≤ 5 text sizes, ≤ 8 spacing values
**Scale/Scope**: 13 routes, 12 shared UI components, ~40 feature components

No NEEDS CLARIFICATION remains; see [research.md](./research.md) R1–R10.

## Constitution Check

*GATE: passes before Phase 0 and after Phase 1.*

| Principle | How this design complies |
|---|---|
| I. Test-first | Before restyling: a unit test that parses `tokens.css` and asserts every listed text/background pair (4.5:1) and border/focus pair (3:1) in both themes; a unit test that scans class names for the type and spacing scales; e2e for the tab bar, frosted-bar fallback (emulated reduced transparency), Home attention list, and axe on every screen in both themes and widths. Each is seen failing first. Existing behaviour tests stay; wording changes in tests keep their intent (FR-017). |
| II. Security & privacy | No server change. Font and icons are bundled and served by Staplr; the outbound-traffic test still allows only the existing hosts. No new data collected. |
| III. Accessible UX | This feature is about Principle III: one design system of tokens and shared components; explicit loading, empty, error and success states; WCAG 2.2 AA verified numerically (R1, R2) and by axe; 320 px; focus visible; reduced motion and reduced transparency respected. |
| IV. Simplicity | Two dependencies, each justified with alternatives (R3, R4); no CSS-in-JS, no component library swap; screens keep their logic and only change markup and classes. Shared components replace per-screen class lists, reducing code. |
| V. Spec-driven | specify → clarify (5 answers) → plan → tasks. |
| Operational | No migrations. Visual changes only; existing logging unaffected. |

No violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/004-ui-refinement/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/ui-system.md
├── checklists/requirements.md
└── tasks.md            # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/web/
├── index.html                       # viewport-fit=cover
├── main.tsx                         # import Inter variable font
├── styles/tokens.css                # R1 palette, R5 type, R6 space/shape, R8 motion, R2 bar
├── styles/app.css                   # Tailwind theme mapping; shell, frosted bars, tab bar; old per-screen rules removed
├── components/ui/
│   ├── PageHeader.tsx               # new
│   ├── Card.tsx                     # new (Card, CardRow)
│   ├── StatusBadge.tsx              # reworked: five meanings, icon + word
│   ├── Button.tsx                   # reworked: primary / secondary / destructive / quiet
│   ├── DataState.tsx                # reworked: shared layout
│   ├── Dialog.tsx, ConfirmDialog.tsx, Select.tsx, TextField.tsx, TextArea.tsx, Toast.tsx, Combobox.tsx, DropdownMenu.tsx  # restyled
│   └── nav/{Sidebar,TabBar,navItems}.tsx  # new
├── routes/__root.tsx                # shell: sidebar ≥ 768 px, tab bar < 768 px
├── routes/home.tsx                  # needs-attention list (R10)
├── routes/**                        # every screen onto PageHeader / Card / DataState
└── features/**                      # cards and lists onto Card / CardRow / StatusBadge
tests/
├── unit/design-tokens.test.ts       # contrast of every token pair, both themes
├── unit/design-scale.test.ts        # type and spacing scale scan
└── e2e/
    ├── design-system.spec.ts        # tab bar, frosted fallback, font served locally, Home attention
    └── a11y-responsive.spec.ts      # extended: dark theme and reduced transparency
```

**Structure Decision**: same web layout as features 001–003; changes are confined to `src/web/`
and tests.

## Complexity Tracking

None.
