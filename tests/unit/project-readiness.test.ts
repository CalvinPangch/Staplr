import { describe, it, expect } from 'vitest';
import {
  projectReadiness,
  type ProjectReadinessInput,
} from '../../src/server/modules/projects/readiness';

const ready: ProjectReadinessInput = {
  connection: { status: 'connected' },
  downloadStatus: 'downloaded',
  downloadError: null,
  repositoryState: 'ok',
  team: [
    { agentId: 'pm', name: 'Pat', role: 'project_manager', ready: true },
    { agentId: 'dev', name: 'Dee', role: 'developer', ready: true },
  ],
};
const codes = (input: ProjectReadinessInput) =>
  projectReadiness(input).reasons.map((r) => r.code);

describe('project readiness', () => {
  it('is ready when every condition holds', () => {
    expect(projectReadiness(ready)).toEqual({
      readiness: 'ready',
      reasons: [],
    });
  });

  it('reports a failed download with its error and how to retry', () => {
    const result = projectReadiness({
      ...ready,
      downloadStatus: 'download_failed',
      downloadError: 'interrupted',
    });
    expect(result.readiness).toBe('not_ready');
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]?.code).toBe('download_failed');
    expect(result.reasons[0]?.message).toMatch(/interrupted/);
    expect(result.reasons[0]?.message).toMatch(/Retry/);
  });

  it('is not ready while the download is running', () => {
    expect(
      projectReadiness({ ...ready, downloadStatus: 'downloading' }),
    ).toMatchObject({
      readiness: 'not_ready',
      reasons: [{ code: 'downloading' }],
    });
  });

  it('reports an unreachable repository and a missing base branch', () => {
    expect(
      codes({ ...ready, repositoryState: 'repository_unavailable' }),
    ).toEqual(['repository_unavailable']);
    expect(codes({ ...ready, repositoryState: 'base_branch_missing' })).toEqual(
      ['base_branch_missing'],
    );
    expect(
      projectReadiness({ ...ready, repositoryState: 'repository_unavailable' })
        .reasons[0]?.message,
    ).toMatch(/Relink/);
  });

  it('reports a connection that needs attention', () => {
    const result = projectReadiness({
      ...ready,
      connection: { status: 'needs_attention' },
    });
    expect(
      codes({ ...ready, connection: { status: 'needs_attention' } }),
    ).toEqual(['source_control_needs_attention']);
    expect(result.reasons[0]?.message).toMatch(/needs attention/i);
  });

  it('treats a removed connection as needing attention and says so', () => {
    const result = projectReadiness({ ...ready, connection: null });
    expect(result.reasons.map((r) => r.code)).toEqual([
      'source_control_needs_attention',
    ]);
    expect(result.reasons[0]?.message).toMatch(/connection removed/i);
  });

  it('needs exactly one Project Manager', () => {
    expect(codes({ ...ready, team: ready.team.slice(1) })).toEqual([
      'no_project_manager',
    ]);
    expect(codes({ ...ready, team: [] })).toEqual(['no_project_manager']);
  });

  it('names every team member that is not ready', () => {
    const result = projectReadiness({
      ...ready,
      team: [
        { agentId: 'pm', name: 'Pat', role: 'project_manager', ready: false },
        { agentId: 'dev', name: 'Dee', role: 'developer', ready: true },
        { agentId: 'qa', name: 'Quinn', role: 'qa', ready: false },
      ],
    });
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: 'agent_not_ready', agentId: 'pm' }),
      expect.objectContaining({ code: 'agent_not_ready', agentId: 'qa' }),
    ]);
    expect(result.reasons[0]?.message).toMatch(/Pat/);
  });

  it('accumulates every reason that applies', () => {
    expect(
      codes({
        connection: null,
        downloadStatus: 'download_failed',
        downloadError: 'clone failed',
        repositoryState: 'base_branch_missing',
        team: [
          { agentId: 'dev', name: 'Dee', role: 'developer', ready: false },
        ],
      }),
    ).toEqual([
      'source_control_needs_attention',
      'download_failed',
      'base_branch_missing',
      'no_project_manager',
      'agent_not_ready',
    ]);
  });
});
