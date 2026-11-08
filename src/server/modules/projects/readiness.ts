import type {
  DownloadStatus,
  Readiness,
  ReadinessReasonCode,
  RoleType,
} from '../../../shared/status.js';

export interface ProjectReadinessReason {
  code: ReadinessReasonCode;
  agentId?: string;
  message: string;
}

export interface ProjectReadinessInput {
  /** null when the source control connection was removed */
  connection: { status: 'connected' | 'needs_attention' } | null;
  downloadStatus: DownloadStatus;
  downloadError: string | null;
  /** result of the last reachability check */
  repositoryState: 'ok' | 'repository_unavailable' | 'base_branch_missing';
  team: { agentId: string; name: string; role: RoleType; ready: boolean }[];
}

/**
 * A project is ready only when its connection is connected, its repository is
 * downloaded and reachable, its base branch exists, its team has exactly one
 * Project Manager, and every member is ready. Every reason that applies is
 * reported with the way to fix it. Nothing here is stored.
 */
export function projectReadiness(input: ProjectReadinessInput): {
  readiness: Readiness;
  reasons: ProjectReadinessReason[];
} {
  const reasons: ProjectReadinessReason[] = [];
  if (!input.connection)
    reasons.push({
      code: 'source_control_needs_attention',
      message:
        'Source control connection removed. Add a connection on the Source control screen, then relink the repository.',
    });
  else if (input.connection.status === 'needs_attention')
    reasons.push({
      code: 'source_control_needs_attention',
      message:
        'The source control connection needs attention. Replace its token on the Source control screen.',
    });

  if (input.downloadStatus === 'downloading')
    reasons.push({
      code: 'downloading',
      message: 'The repository is still downloading.',
    });
  else if (input.downloadStatus === 'download_failed')
    reasons.push({
      code: 'download_failed',
      message: `The download failed${input.downloadError ? `: ${input.downloadError}` : ''}. Use Retry download.`,
    });

  if (input.repositoryState === 'repository_unavailable')
    reasons.push({
      code: 'repository_unavailable',
      message:
        'The repository can no longer be reached. Relink the repository if it was renamed or moved.',
    });
  else if (input.repositoryState === 'base_branch_missing')
    reasons.push({
      code: 'base_branch_missing',
      message:
        'The base branch no longer exists in the repository. Choose another base branch.',
    });

  const managers = input.team.filter((m) => m.role === 'project_manager');
  if (managers.length !== 1)
    reasons.push({
      code: 'no_project_manager',
      message:
        managers.length === 0
          ? 'The team has no Project Manager. Add one to the team.'
          : 'The team has more than one Project Manager. Keep exactly one.',
    });

  for (const member of input.team)
    if (!member.ready)
      reasons.push({
        code: 'agent_not_ready',
        agentId: member.agentId,
        message: `${member.name} is not ready. Open the agent to see why.`,
      });

  return { readiness: reasons.length === 0 ? 'ready' : 'not_ready', reasons };
}
