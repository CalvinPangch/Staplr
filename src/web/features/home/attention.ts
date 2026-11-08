/**
 * What Home lists first (feature 004, FR-010): agents that are Not ready,
 * connections that need attention, projects whose download failed and teams
 * without a Project Manager. Derived from data Home already reads; failures
 * come before things that only need attention.
 */
export interface AttentionItem {
  kind: 'agent' | 'connection' | 'source-control' | 'project';
  id: string;
  name: string;
  reason: string;
  href: string;
  severity: 'failed' | 'attention';
}

interface Reason {
  code: string;
  message?: string | undefined;
}

export interface AttentionInput {
  agents: {
    id: string;
    name: string;
    readiness: 'ready' | 'not_ready';
    reasons: Reason[];
  }[];
  providerConnections: {
    id: string;
    name: string;
    status: string;
    lastCheckResult: string | null;
  }[];
  sourceControl: {
    id: string;
    name: string;
    status: string;
    lastCheckResult: string | null;
  }[];
  projects: {
    id: string;
    name: string;
    downloadStatus: string;
    reasons: Reason[];
  }[];
}

export function attentionItems(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const project of input.projects)
    if (project.downloadStatus === 'download_failed')
      items.push({
        kind: 'project',
        id: project.id,
        name: project.name,
        reason:
          project.reasons.find((r) => r.code === 'download_failed')?.message ??
          'The download failed.',
        href: `/projects/${project.id}`,
        severity: 'failed',
      });
  for (const agent of input.agents)
    if (agent.readiness === 'not_ready')
      items.push({
        kind: 'agent',
        id: agent.id,
        name: agent.name,
        reason: agent.reasons[0]?.message ?? 'Not ready.',
        href: `/agents/${agent.id}`,
        severity: 'attention',
      });
  for (const connection of input.providerConnections)
    if (connection.status === 'needs_relogin')
      items.push({
        kind: 'connection',
        id: connection.id,
        name: connection.name,
        reason: connection.lastCheckResult ?? 'Needs re-login.',
        href: '/settings/providers',
        severity: 'attention',
      });
  for (const connection of input.sourceControl)
    if (connection.status === 'needs_attention')
      items.push({
        kind: 'source-control',
        id: connection.id,
        name: connection.name,
        reason: connection.lastCheckResult ?? 'Needs attention.',
        href: '/settings/source-control',
        severity: 'attention',
      });
  for (const project of input.projects) {
    const missing = project.reasons.find(
      (r) => r.code === 'no_project_manager',
    );
    if (missing && project.downloadStatus !== 'download_failed')
      items.push({
        kind: 'project',
        id: project.id,
        name: project.name,
        reason: missing.message ?? 'The team has no Project Manager.',
        href: `/projects/${project.id}`,
        severity: 'attention',
      });
  }
  return items;
}
