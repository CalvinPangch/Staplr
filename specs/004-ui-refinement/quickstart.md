# Quickstart: An AdminLTE-Style Staplr with Apple-Style Details

How to check the redesign. Details: [spec.md](./spec.md), [contracts/ui-system.md](./contracts/ui-system.md).

## Automated

```bash
npm run typecheck && npm run lint && npm run format:check
npm test              # token contrast (incl. sidebar and tiles), scale scan, font loading, attention list
npm run test:e2e      # shell, breadcrumbs, slide-in panel, tab bar, stat tiles, axe light/dark, 1280/320 px
```

## Manual review (the owner, in `npm run dev`)

1. **Shell (US1)**: the dark sidebar shows the brand, Home, Projects, Settings and your
   projects; the top bar shows the menu toggle, the section name, theme and Sign out. Press the
   toggle on a wide screen: the sidebar collapses to icons (hover shows names) and stays that way
   after a reload.
2. **Title row**: every screen shows breadcrumbs above its title (for example Home › Settings ›
   Agents › Dev Agent); earlier steps are links.
3. **Cards**: cards with a header bar (title left, status or tools right) and soft corners; green
   only on actions, links, the current item and focus.
4. **Home (US2)**: four stat tiles (Projects, Agents ready, Connections, Needs attention), then the
   attention list with reasons and links; "Everything is ready." when nothing needs attention.
5. **States (US3)**: empty, failed and slow lists show the same layout with a next step.
6. **Phone (US4)**: at 320 px the bottom tab bar shows the three places; the menu toggle slides the
   dark sidebar in with your projects; Escape or a tap outside closes it and focus returns to the
   toggle; nothing scrolls sideways.
7. **Frosted bars**: scroll a long page; content blurs under the top bar. Turn on Reduce
   transparency: the sidebar, top bar and tab bar become solid.
8. **Dark mode and font**: repeat 1–6 in dark mode; the network panel shows Inter loaded from
   Staplr itself.
