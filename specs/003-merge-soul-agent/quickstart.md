# Quickstart: One Agent, One Markdown File

How to prove the feature works end to end. Details: [spec.md](./spec.md),
[data-model.md](./data-model.md), [contracts/api-changes.md](./contracts/api-changes.md).

## Automated

```bash
npm run typecheck && npm run lint && npm run format:check
npm test              # parser, migration up/down, agent saves, PM rule, rename, conflicts
npm run test:e2e      # create from a template, edit the file, problems list, preview, 320 px + axe
```

## Manual scenarios

Prerequisite: `npm run dev`, signed in, one Claude connection named "Work Claude" with
`claude-sonnet-5-5` verified.

1. **Create from a template (US1, SC-001)**: Agents → New agent → choose Developer. The editor
   shows a header with `role: developer` and the Developer instructions. Fill `name: Dev Agent`,
   use "Insert connection" (Work Claude) and "Insert model" (Claude Sonnet 5.5), save. Expected: the
   agent is listed as Ready; no Souls screen exists in the navigation or settings.
2. **Edit the file (US2)**: open Dev Agent, change a sentence in the instructions, switch to Preview,
   save, reload the page. Expected: the text is exactly as saved; the preview shows formatting.
3. **Problems listed (FR-004a, SC-001a)**: change `role: developer` to `role: dev` and delete the
   `provider:` line, save. Expected: refused; two problems, each with its line number; reopening
   shows the last saved version.
4. **Two tabs (FR-008)**: open Dev Agent in two tabs, save in the first, then save in the second.
   Expected: the second is refused with "changed somewhere else" and offers Reload; its text stays
   available to copy.
5. **Independence (FR-005)**: create a second Developer agent; edit one; the other is unchanged.
6. **Project Manager rule (US4)**: on a project whose PM is "PM Agent", change its `role:` to
   `developer`, save. Expected: refused, naming the project.
7. **Connection rename (FR-004b)**: rename "Work Claude" to "Claude Main" on the Providers screen;
   open Dev Agent. Expected: `connection: Claude Main`; the agent stays Ready.
8. **Upgrade (US3, SC-002)**: with a database from before this feature where two agents share an
   edited custom soul and one custom soul is unused, start the new version. Expected: both agents
   have their own file with that soul's text; their readiness and teams are unchanged; the unused
   soul appears as a template when creating an agent. Roll back with the down migration: souls and
   agents are as before (edited agents get "<name> (from agent file)" souls).
