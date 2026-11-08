# Quickstart: A Modern, Apple-Style Staplr

How to check the redesign. Details: [spec.md](./spec.md), [contracts/ui-system.md](./contracts/ui-system.md).

## Automated

```bash
npm run typecheck && npm run lint && npm run format:check
npm test              # token contrast, type/spacing scale scan, outbound traffic (no font host)
npm run test:e2e      # every screen: axe light/dark, 1280 px and 320 px, reduced transparency
```

## Manual review (the owner, in `npm run dev`)

1. **One look (US1)**: visit Home, Projects, a project board, Agents, an agent's file, Providers,
   Source control, Settings, Audit, Diagnostics. Each starts with the same large title, one-line
   description and main action; cards, buttons and status labels match.
2. **Accent only for actions (FR-001)**: green appears only on primary buttons, links, the current
   navigation item, selection and focus. Status "Ready" uses its own green with a check icon.
3. **Frosted bars (FR-003a)**: scroll a long page; content blurs under the header and sidebar. In
   the OS turn on Reduce transparency (macOS/iOS) or emulate it in the browser: the bars become solid.
4. **Needs attention (US2)**: make one agent Not ready and one connection need re-login; Home lists
   both first, each with its reason and a link.
5. **States (US3)**: empty agent list, a failed load (stop the API), slow load; each shows the same
   layout with a next step.
6. **Phone (US4)**: at 320 px the bottom tab bar shows Home, Projects, Agents, Settings; nothing
   scrolls sideways; the tab bar does not cover a focused text field.
7. **Dark mode**: repeat 1, 3 and 6 in dark mode.
8. **Font (FR-004a)**: the network panel shows the Inter `woff2` loaded from Staplr itself, and text
   is visible before it arrives (throttle the network).
