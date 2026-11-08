import { readFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { renderAgentFile } from '../../../shared/agent-file.js';
import type { AgentTemplate } from '../../../shared/schemas/agents.js';
import type { RoleType } from '../../../shared/status.js';

/** The four roles shipped with Staplr; the text lives in ./templates/*.md. */
const shipped: { role: RoleType; label: string; file: string }[] = [
  {
    role: 'project_manager',
    label: 'Project Manager',
    file: 'project-manager.md',
  },
  {
    role: 'business_analyst',
    label: 'Business Analyst',
    file: 'business-analyst.md',
  },
  { role: 'developer', label: 'Developer', file: 'developer.md' },
  { role: 'qa', label: 'QA', file: 'qa.md' },
];

let cachedShipped: AgentTemplate[] | undefined;

/** A new agent's file: the role set, everything else for the owner to fill in. */
const asFile = (role: RoleType, body: string) =>
  renderAgentFile(
    { name: '', role, provider: 'claude', connection: '', model: '' },
    body,
  );

/**
 * Templates for a new agent: the shipped roles, then custom souls kept at the
 * feature 003 upgrade (research R6). Shipped text is read from files so a
 * later release can improve it without a migration.
 */
export function listTemplates(db: Database.Database): AgentTemplate[] {
  cachedShipped ??= shipped.map((t) => ({
    id: `shipped-${t.role}`,
    role: t.role,
    label: t.label,
    kind: 'shipped' as const,
    definition: asFile(
      t.role,
      readFileSync(new URL(`./templates/${t.file}`, import.meta.url), 'utf8'),
    ),
  }));
  const kept = (
    db
      .prepare('SELECT id, role, label, body FROM role_template ORDER BY label')
      .all() as { id: string; role: RoleType; label: string; body: string }[]
  ).map((t) => ({
    id: t.id,
    role: t.role,
    label: t.label,
    kind: 'kept' as const,
    definition: asFile(t.role, t.body),
  }));
  return [...cachedShipped, ...kept];
}
