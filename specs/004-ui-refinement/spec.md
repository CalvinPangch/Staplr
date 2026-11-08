# Feature Specification: An AdminLTE-Style Staplr with Apple-Style Details and a Green Accent

**Feature Branch**: `004-ui-refinement`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "Redesign the whole Staplr website by refining the current green identity: keep the green palette and sidebar workspace navigation introduced in commit 89acff3, but make every screen (sign-in, setup, home, projects and board, agents and the agent file editor, providers, source control, settings, audit, diagnostics) consistent and calmer — one spacing scale, one type scale, consistent cards, lists, page headers, empty/loading/error states, status badges and buttons; better information hierarchy on each screen; WCAG 2.2 AA in light and dark themes; works from 320 px to desktop; no external font or asset hosts."

## Overview

Staplr already has a green identity and a sidebar workspace introduced earlier. Screens built at
different times still look different: page titles, cards, lists, status labels, buttons and the
messages for "loading", "nothing here yet" and "something failed" vary from screen to screen, and
the most important thing on each screen does not always stand out. This feature keeps the identity
and makes every screen feel like one calm product, so the owner finds what matters on each screen
at a glance. Nothing about what Staplr does changes; only how it looks and reads.

The layout follows the AdminLTE admin template: a dark sidebar with the brand at the top, a top
navigation bar with a menu toggle, a page title row with breadcrumbs, cards with a header bar, and
coloured stat tiles on Home. The details follow Apple's design patterns: neutral, quiet content
surfaces, frosted glass on the bars, the Inter typeface, soft rounded cards, and one tint colour for
everything the owner can act on. Staplr's green becomes that tint.

## Clarifications

### Session 2026-11-08

- Q: Should the green stay only as the accent colour, with backgrounds switching to Apple-style
  neutral white and light grey instead of today's green-tinted surfaces? → A: Yes (Option A):
  neutral white/grey surfaces (near-black in dark mode); green only as the accent for buttons,
  links, selection and focus.
- Q: Should the sidebar and the top bar of each page use Apple-style translucent "frosted glass"
  backgrounds? → A: Yes (Option A): frosted glass on the sidebar and the sticky page header only;
  solid everywhere else; solid fallback when the system asks for reduced transparency or more
  contrast. (Refined 2026-11-09: with the AdminLTE layout the frosted bars are the dark sidebar, the
  top navigation bar and the phone tab bar; the page title row is solid.)
- Q: On a phone, should navigation move to an Apple-style tab bar at the bottom instead of a
  collapsing sidebar menu? → A: Yes (Option A): a bottom tab bar on small screens (Home, Projects,
  Agents, Settings; at most 5 items, each with text and an icon); the sidebar on wider screens.
- Q: Should lists use Apple's grouped-list style instead of a separate card per item? → A: No
  (Option B): keep a separate card per item everywhere, restyled in the Apple manner.
- Q: Should Staplr bundle the Inter typeface (self-hosted) or keep each device's system font? → A:
  Bundle Inter (Option A), served by Staplr itself, for the same SF-like look on every device.

### Session 2026-11-09

- Q: Should the AdminLTE look replace the Apple-style direction recorded earlier, or be combined
  with it? → A: Combine (Option B): AdminLTE's layout (dark sidebar with brand, top navigation bar
  with a menu toggle, page title row with breadcrumbs, cards with a header bar, coloured stat tiles
  on Home) with the Apple-style details already chosen (neutral content surfaces, frosted bars,
  Inter, soft rounded cards, bottom tab bar on phones). Green stays the single accent.
- Q: Should the sidebar stay dark in the light theme as well? → A: Yes (Option A): the sidebar is
  dark in both themes (AdminLTE default); the content area follows the theme.
- Q: On phones, should the menu toggle also open the sidebar as a slide-in panel alongside the
  bottom tab bar? → A: Yes (Option A): the tab bar holds the three places; the menu toggle opens the
  dark sidebar as a slide-in panel with the project list, keeping focus inside while open and
  closing on Escape, a tap outside, or choosing a link.
- Owner decision (2026-11-09, during implementation): the main navigation has three places — Home,
  Projects, Settings. Agents is reached from Settings (and from Home's tiles and team rosters);
  breadcrumbs show it as Home › Settings › Agents.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One look across every screen (Priority: P1)

The owner moves between Home, Projects, a project's board, Agents, an agent's file, Providers,
Source control, Settings, Audit and Diagnostics, and every screen uses the same page header, the
same card and list styles, the same buttons and the same status labels, on neutral surfaces with
green used only for what can be acted on.

**Why this priority**: Consistency in a modern, Apple-style look is the core of the request and
makes every other improvement read as one product.

**Independent Test**: Open each screen in turn; the page header (title, short description, main
action in the same place), cards, lists, buttons and status labels look and behave the same on all
of them.

**Acceptance Scenarios**:

1. **Given** any signed-in screen, **When** it loads, **Then** it starts with the same page header
   layout: a title, a one-line description of what the screen is for, and the screen's main action
   (if any) in the same position.
2. **Given** any screen that shows a status (Ready, Not ready, Connected, Needs re-login,
   Downloaded, Download failed and others), **When** the owner reads it, **Then** the label has
   the same shape on every screen, uses the same meaning colours, and also shows the meaning in
   words and an icon, never colour alone.
3. **Given** buttons on any screen, **When** the owner looks for the main action, **Then** there is
   at most one primary button per area; secondary and destructive actions look distinct from it
   and from each other the same way everywhere.
4. **Given** the dark sidebar, **When** the owner moves between screens, **Then** it shows the
   brand at the top and the current screen highlighted in the green accent; the top navigation bar
   and the page title row with breadcrumbs stay the same on every screen.
5. **Given** a wide screen, **When** the owner presses the menu toggle in the top navigation bar,
   **Then** the sidebar collapses to icons only (each keeping its name for screen readers and as a
   tooltip) and expands again; the choice is remembered.

---

### User Story 2 - The important thing stands out on each screen (Priority: P1)

On each screen the owner can tell at a glance what needs attention: an agent that is Not ready, a
connection that needs re-login, a project that failed to download, a team without a Project
Manager. Details come second.

**Why this priority**: The owner uses Staplr to see whether the team is ready; a calmer layout
must make problems easier, not harder, to spot.

**Independent Test**: With one agent Not ready and one connection needing re-login, a first-time
viewer finds both problems on Home and on the relevant screens within 10 seconds.

**Acceptance Scenarios**:

1. **Given** Home, **When** something needs attention, **Then** it is listed first with a link to
   the screen that fixes it; when nothing needs attention, Home says so plainly.
2. **Given** a list of agents, connections or projects, **When** some items need attention,
   **Then** each such item shows its status label and its reason on the item itself, without
   opening it.
3. **Given** a detail screen (an agent's file, a project, a connection), **When** it opens,
   **Then** the most important facts (status and what to do next) appear above secondary details.

---

### User Story 3 - The same messages for loading, empty and errors (Priority: P2)

Whenever a screen is loading, has nothing to show yet, or cannot load, the owner sees the same kind
of message everywhere: what is happening, and what to do next (for example a retry button or a link
to add the first item).

**Why this priority**: These states are where the owner gets stuck; consistent wording and layout
removes guesswork.

**Independent Test**: Force each screen into loading, empty and error states; each shows the shared
message layout with a next step.

**Acceptance Scenarios**:

1. **Given** any list screen with no items, **When** it loads, **Then** it shows a short
   explanation and the action that adds the first item.
2. **Given** any screen whose data fails to load, **When** the error appears, **Then** it says what
   failed, keeps the rest of the screen usable, and offers Retry.
3. **Given** any screen still loading, **When** loading takes a moment, **Then** a loading message
   or placeholder of the same style appears and the layout does not jump when data arrives.

---

### User Story 4 - Comfortable on a phone and in the dark (Priority: P2)

The owner uses Staplr on a phone (from 320 px wide) and in dark mode. Every screen stays readable
and usable: nothing scrolls sideways, touch targets are easy to hit, and the dark theme keeps the
same green identity with enough contrast.

**Why this priority**: The constitution requires 320 px and WCAG 2.2 AA; the redesign must not
regress them and should make small screens feel intended rather than squeezed.

**Independent Test**: View every screen at 320 px and at desktop width, in light and dark themes;
no sideways scrolling, every control at least 44 by 44 px, and the automated accessibility check
passes on each.

**Acceptance Scenarios**:

1. **Given** a 320 px wide screen, **When** the owner opens any page, **Then** navigation is a tab
   bar fixed at the bottom (Home, Projects, Settings, each with text and an icon, the
   current one in the green accent), content uses the full width above it, and nothing scrolls
   sideways (the board may scroll its columns, as it does today).
2. **Given** a phone, **When** the owner taps the menu toggle in the top navigation bar, **Then**
   the dark sidebar slides in with the three places and the project list; Escape, a tap outside or
   choosing a link closes it and focus returns to the toggle.
3. **Given** dark mode, **When** the owner opens any page, **Then** every text and control meets
   WCAG 2.2 AA contrast and status labels stay distinguishable.
4. **Given** a keyboard user, **When** they move through any page, **Then** focus is always
   visible and follows the visual order.

### Edge Cases

- Very long names (projects, agents, connections, repositories) wrap or truncate with the full
  name still available, and never push controls off screen.
- Many items (100 agents, 200 tickets): lists and the board stay readable and the board keeps its
  current performance target.
- The owner has chosen the light or dark theme explicitly: the choice is kept; otherwise the system
  setting is followed, as today.
- Reduced motion: any new transitions are turned off when the system asks for reduced motion.
- Reduced transparency or increased contrast: the frosted sidebar, top navigation bar and tab bar become solid.
- On a phone, the on-screen keyboard is open (for example in the agent file editor): the bottom tab
  bar does not cover the field being edited.
- Content scrolling under the frosted top navigation bar: text behind it never reduces the bar's
  own text below WCAG 2.2 AA contrast.
- The sidebar is collapsed to icons: each item still has its name for screen readers and as a
  tooltip, and the current item is still marked.
- A page deep in the app (an agent, a project): the breadcrumbs show the path back (Home › Settings ›
  Agents › Dev Agent) and each earlier step is a link.
- A screen with both an error and data (for example a failed refresh): the old data stays visible
  with the error shown above it.
- Text zoomed to 200%: content reflows without loss of information or function.

## Requirements *(mandatory)*

### Functional Requirements

**Identity**

- **FR-001**: Content surfaces MUST be neutral in the Apple manner: white and light grey grouped
  backgrounds in the light theme, near-black and dark grey in the dark theme. The sidebar MUST be
  dark in both themes, as in AdminLTE, with its own text, icon and current-item colours that meet
  WCAG 2.2 AA on it. Staplr's green MUST be the single accent (tint) colour, used
  for primary buttons, links, the current navigation item, selection and focus; the only other use
  is one of the Home stat tiles (FR-010a). Status colours are separate from the accent and keep
  their meanings.
- **FR-002**: The redesign MUST NOT change what any screen does, which data it shows, or the words
  of existing actions, except where this specification asks for clearer wording or order.
- **FR-003**: All fonts, icons and images MUST be served by Staplr itself; no screen may load
  anything from another host.

**Shared building blocks**

- **FR-003a**: The sidebar, the top navigation bar and the phone tab bar MUST use a translucent,
  blurred (frosted glass) background (dark for the sidebar), with the top navigation bar staying at
  the top while the page scrolls. All other surfaces (content, page title row, cards, lists, dialogs,
  menus) MUST be solid. When the system asks for reduced
  transparency or increased contrast, the sidebar and bars MUST become solid; text on them MUST
  meet WCAG 2.2 AA in every case.

- **FR-004**: Every screen MUST use one spacing scale and one type scale (large page title, section
  title, body, small text) shared by all screens.
- **FR-004a**: All text MUST use the Inter typeface, shipped with and served by Staplr itself (no
  other host), with the device's system font as the fallback while it loads and if it cannot load;
  text MUST stay visible and readable while the font loads. Code and the agent file editor keep a
  monospaced font.
- **FR-005**: Every signed-in screen MUST start with the shared page title row, as in AdminLTE:
  breadcrumbs (Home › section › page) above the page title, a one-line description, and the main
  action (if any) in the same position.
- **FR-005a**: Every signed-in screen MUST show the shared top navigation bar: a menu toggle that
  collapses the sidebar to icons on wide screens (remembered per browser) and opens it on narrower
  ones, the current section's name, the theme choice and Sign out. Every control in it has a visible
  label or an accessible name.
- **FR-006**: Agents, connections, projects, settings entries, board tickets and Home's summaries
  MUST each be shown as a separate card in one shared design that joins AdminLTE's structure with
  Apple-style softness: an optional card header bar (title on the left, small tools such as status
  or actions on the right, separated by a hairline), a body, an optional footer for actions; neutral
  solid surface, generous rounded corners, a soft shadow or hairline border (not both heavy), and the
  same spacing between cards on every screen.
- **FR-007**: Status labels MUST use one shared style with a fixed set of meanings (ready / good,
  needs attention, failed, in progress, neutral), each shown with words and an icon, never colour
  alone.
- **FR-008**: Buttons MUST come in the shared kinds (primary, secondary, destructive, quiet), with
  at most one primary button per area, and every control at least 44 by 44 px.
- **FR-009**: Loading, empty and error states MUST use one shared layout with a plain explanation
  and a next step (Retry, or the action that adds the first item).

**Each screen**

- **FR-010**: Home MUST list what needs attention first (agents Not ready, connections needing
  re-login, projects failing to download, teams without a Project Manager), each linking to where it
  is fixed, and say plainly when nothing needs attention.
- **FR-010a**: Home MUST show AdminLTE-style stat tiles above the attention list: Projects, Agents
  ready (of total), Connections, and Needs attention (count), each with a large number, a label, an
  icon and a "More info" link to its screen (for Needs attention, the attention list on Home). Tiles use solid colours (the green accent, and the
  progress, attention and failed status colours) with text meeting WCAG 2.2 AA on them.
- **FR-011**: Every list of agents, connections and projects MUST show each item's status and, when
  it needs attention, its reason on the item itself.
- **FR-012**: Every detail screen MUST show status and the next step above secondary details.
- **FR-013**: These screens MUST be brought onto the shared building blocks: sign-in, first-run
  setup, Home, Projects, a project (team and board), Agents, an agent's file editor, Providers
  (including Codex sign-in and model lists), Source control, Settings, Audit and Diagnostics.

**Quality**

- **FR-014**: Every screen MUST meet WCAG 2.2 AA in light and dark themes and pass the automated
  accessibility check.
- **FR-015**: Every screen MUST work from 320 px wide to desktop without sideways scrolling (the
  board's columns excepted, as today).
- **FR-015a**: On phones (narrower than 768 px), navigation MUST be a tab bar fixed at the bottom with at most 5
  items (Home, Projects, Settings; Agents is found under Settings), each labelled with text and an icon, the current item
  shown in the green accent, staying clear of the device's safe areas and never covering content.
  On wider screens the sidebar holds the same destinations.
- **FR-015b**: On screens narrower than 1024 px (phones and tablets) the top navigation bar's menu toggle MUST open the dark sidebar as a
  slide-in panel (the three places and the project list). While open it MUST keep keyboard focus
  inside, be announced as a dialog with a name, and close on Escape, a tap outside, or choosing a
  link, returning focus to the toggle.
- **FR-016**: Any motion MUST be short, carry meaning, and be turned off when the system asks for
  reduced motion.
- **FR-017**: All existing behaviour tests MUST keep passing; where a test depends on wording or
  layout that this feature changes on purpose, the test changes with it and keeps its intent.

### Key Entities

Not applicable: this feature changes presentation only; no data is added or changed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of signed-in screens use the shared top navigation bar, page title row with
  breadcrumbs, status labels, buttons and loading/empty/error layout (checked screen by screen).
- **SC-002**: A first-time viewer finds every item that needs attention on Home within 10 seconds,
  in a test with one agent Not ready and one connection needing re-login.
- **SC-003**: Every screen passes the automated accessibility check with zero violations in light
  and dark themes, at desktop width and at 320 px, and with reduced transparency switched on.
- **SC-004**: No screen scrolls sideways at 320 px (board columns excepted).
- **SC-005**: Every interactive control is at least 44 by 44 px.
- **SC-006**: The number of distinct text sizes used across the app is at most 5, and the number of
  distinct spacing values at most 8.
- **SC-007**: No request leaves Staplr for fonts, icons or images (checked by the existing outbound
  traffic test), and Inter is served by Staplr on every screen.
- **SC-008**: The board still shows 200 tickets within its existing performance target.
- **SC-009**: Text is visible within the first paint of every screen, before the font has loaded
  (no invisible text while loading).

## Assumptions

- The layout follows AdminLTE (dark sidebar, top navigation bar, breadcrumbs, header-bar cards,
  stat tiles) rebuilt with Staplr's own components and tokens; the AdminLTE package itself (and its
  Bootstrap and jQuery dependencies) is not added. Green remains Staplr's accent colour.
- The Inter typeface is bundled and served by Staplr (decided in clarification); its licence (SIL
  Open Font License) allows this. The added font files are kept small by loading only the weights
  used.
- Icons, if added, come from a set shipped with Staplr, used next to words, never alone for meaning
  (icon-only controls keep an accessible name).
- Wording changes are limited to page descriptions, empty/error messages and status reasons where
  clarity improves; action names stay.
- No new screens, settings or data are added. Theme selection keeps working as today.
- Visual review by the owner happens on the running app; automated checks cover accessibility,
  320 px and outbound traffic.
