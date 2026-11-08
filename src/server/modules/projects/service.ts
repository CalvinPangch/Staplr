import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { fetchRemote, checkoutBranch } from '../../lib/git.js';
import { ServiceError } from '../../lib/problem.js';
import type {
  Project,
  ProjectCreate,
  ProjectPatch,
} from '../../../shared/schemas/projects.js';
import type { RoleType } from '../../../shared/status.js';
import { recordAudit } from '../audit/service.js';
import type { AgentService } from '../agents/service.js';
import { repositoryError } from '../source-control/errors.js';
import type { SourceControlService } from '../source-control/service.js';
import type { DownloadManager } from './download.js';
import { projectReadiness } from './readiness.js';

interface ProjectRow {
  id: string;
  name: string;
  sourceControlConnectionId: string | null;
  repoFullName: string;
  repoRemoteId: string;
  baseBranch: string;
  downloadStatus: 'downloading' | 'downloaded' | 'download_failed';
  downloadError: string | null;
  lastUpdatedAt: string | null;
  lastRefreshError: string | null;
  repositoryState: 'ok' | 'repository_unavailable' | 'base_branch_missing';
}

/** Runs when a project is deleted, for example to remove its tickets. */
export type ProjectDeleteHook = (projectId: string) => void;

export function createProjectService({
  db,
  clock,
  sourceControl,
  agents,
  downloads,
}: {
  db: Database.Database;
  clock: () => number;
  sourceControl: SourceControlService;
  agents: AgentService;
  downloads: DownloadManager;
}) {
  const now = () => new Date(clock()).toISOString();
  const deleteHooks: ProjectDeleteHook[] = [];

  const find = (id: string) =>
    db
      .prepare('SELECT * FROM project WHERE id=? AND deletedAt IS NULL')
      .get(id) as ProjectRow | undefined;
  function mustFind(id: string): ProjectRow {
    const row = find(id);
    if (!row)
      throw new ServiceError(404, 'not_found', 'That project does not exist.');
    return row;
  }

  const teamAgentIds = (projectId: string) =>
    (
      db
        .prepare('SELECT agentId FROM team_assignment WHERE projectId=?')
        .all(projectId) as { agentId: string }[]
    ).map((r) => r.agentId);

  /** Readiness is recomputed on every read; nothing about it is stored. */
  function toPublic(row: ProjectRow): Project {
    let connection: { status: 'connected' | 'needs_attention' } | null = null;
    if (row.sourceControlConnectionId) {
      try {
        connection = sourceControl.get(row.sourceControlConnectionId);
      } catch {
        connection = null;
      }
    }
    const team = teamAgentIds(row.id).map((agentId) => {
      const agent = agents.get(agentId);
      return {
        agentId,
        name: agent.name,
        role: agent.role as RoleType,
        ready: agent.readiness === 'ready',
      };
    });
    const { readiness, reasons } = projectReadiness({
      connection,
      downloadStatus: row.downloadStatus,
      downloadError: row.downloadError,
      repositoryState: row.repositoryState,
      team,
    });
    return {
      id: row.id,
      name: row.name,
      sourceControlConnectionId: row.sourceControlConnectionId,
      repoFullName: row.repoFullName,
      repoRemoteId: row.repoRemoteId,
      baseBranch: row.baseBranch,
      downloadStatus: row.downloadStatus,
      downloadProgress:
        row.downloadStatus === 'downloading'
          ? downloads.progress(row.id)
          : null,
      downloadError: row.downloadError,
      lastUpdatedAt: row.lastUpdatedAt,
      lastRefreshError: row.lastRefreshError,
      readiness,
      reasons,
    };
  }

  /** A connection that can be used for a new or relinked project. */
  async function usableRepository(connectionId: string, remoteId: string) {
    const connection = sourceControl.get(connectionId);
    if (connection.status !== 'connected')
      throw new ServiceError(
        409,
        'conflict',
        'This source control connection needs attention. Replace its token first.',
      );
    const found = await sourceControl.repository(connectionId, remoteId);
    if (!found.ok) {
      if (found.failure === 'not_found')
        throw new ServiceError(
          422,
          'invalid_input',
          'That repository is not available to this connection. Choose another repository.',
        );
      throw repositoryError(found.failure);
    }
    return found.repository;
  }

  return {
    list(): Project[] {
      return (
        db
          .prepare(
            'SELECT * FROM project WHERE deletedAt IS NULL ORDER BY name, createdAt',
          )
          .all() as ProjectRow[]
      ).map(toPublic);
    },

    get(id: string): Project {
      return toPublic(mustFind(id));
    },

    /** Throws 404 for unknown or deleted projects. */
    assertExists(id: string): void {
      mustFind(id);
    },

    async create(input: ProjectCreate): Promise<Project> {
      const repository = await usableRepository(
        input.sourceControlConnectionId,
        input.repoRemoteId,
      );
      const id = randomUUID();
      const at = now();
      const name = (
        input.name ??
        repository.fullName.split('/').pop() ??
        repository.fullName
      ).slice(0, 80);
      db.prepare(
        `INSERT INTO project(id,name,sourceControlConnectionId,repoFullName,repoRemoteId,baseBranch,downloadStatus,createdAt,updatedAt)
         VALUES(?,?,?,?,?,?,'downloading',?,?)`,
      ).run(
        id,
        name,
        input.sourceControlConnectionId,
        repository.fullName,
        repository.remoteId,
        repository.defaultBranch,
        at,
        at,
      );
      recordAudit(db, {
        action: 'project.created',
        targetType: 'project',
        targetId: id,
        targetName: name,
        detail: { repository: repository.fullName },
        at,
      });
      downloads.start(id);
      return toPublic(mustFind(id));
    },

    async patch(id: string, patch: ProjectPatch): Promise<Project> {
      const row = mustFind(id);
      let baseBranch = patch.baseBranch;

      if (patch.relink) {
        const repository = await usableRepository(
          patch.relink.sourceControlConnectionId,
          patch.relink.repoRemoteId,
        );
        if (baseBranch !== undefined) {
          const branches = await sourceControl.branches(
            patch.relink.sourceControlConnectionId,
            repository.remoteId,
          );
          if (!branches.ok) throw repositoryError(branches.failure);
          if (!branches.branches.includes(baseBranch))
            throw new ServiceError(
              422,
              'invalid_input',
              `The branch ${baseBranch} does not exist in that repository.`,
            );
        }
        db.prepare(
          `UPDATE project SET sourceControlConnectionId=?, repoFullName=?, repoRemoteId=?, baseBranch=?,
             repositoryState='ok', lastUpdatedAt=NULL, lastRefreshError=NULL, updatedAt=? WHERE id=?`,
        ).run(
          patch.relink.sourceControlConnectionId,
          repository.fullName,
          repository.remoteId,
          baseBranch ?? repository.defaultBranch,
          now(),
          id,
        );
        downloads.start(id);
        baseBranch = undefined;
      }

      if (baseBranch !== undefined && baseBranch !== row.baseBranch) {
        if (!row.sourceControlConnectionId)
          throw new ServiceError(
            409,
            'conflict',
            'Add a source control connection to this project first, then choose the base branch.',
          );
        const branches = await sourceControl.branches(
          row.sourceControlConnectionId,
          row.repoRemoteId,
        );
        if (!branches.ok) throw repositoryError(branches.failure);
        if (!branches.branches.includes(baseBranch))
          throw new ServiceError(
            422,
            'invalid_input',
            `The branch ${baseBranch} does not exist in the repository.`,
          );
        if (row.downloadStatus === 'downloaded') {
          try {
            await fetchRemote(
              downloads.baseDir(id),
              sourceControl.decryptTokenForUse(row.sourceControlConnectionId),
            );
            await checkoutBranch(downloads.baseDir(id), baseBranch);
          } catch {
            throw new ServiceError(
              409,
              'conflict',
              'Could not switch the base copy to that branch. Refresh the project and try again.',
            );
          }
        }
        db.prepare(
          "UPDATE project SET baseBranch=?, repositoryState='ok', updatedAt=? WHERE id=?",
        ).run(baseBranch, now(), id);
      }

      if (patch.name !== undefined)
        db.prepare('UPDATE project SET name=?, updatedAt=? WHERE id=?').run(
          patch.name,
          now(),
          id,
        );
      return toPublic(mustFind(id));
    },

    retryDownload(id: string): Project {
      const row = mustFind(id);
      if (row.downloadStatus !== 'download_failed')
        throw new ServiceError(
          409,
          'conflict',
          'Only a failed download can be retried.',
        );
      downloads.start(id);
      return toPublic(mustFind(id));
    },

    async refresh(id: string): Promise<Project> {
      mustFind(id);
      await downloads.refresh(id);
      return toPublic(mustFind(id));
    },

    async delete(id: string): Promise<void> {
      const row = mustFind(id);
      await downloads.whenIdle();
      db.transaction(() => {
        db.prepare('DELETE FROM team_assignment WHERE projectId=?').run(id);
        for (const hook of deleteHooks) hook(id);
        db.prepare(
          'UPDATE project SET deletedAt=?, updatedAt=? WHERE id=?',
        ).run(now(), now(), id);
        recordAudit(db, {
          action: 'project.deleted',
          targetType: 'project',
          targetId: id,
          targetName: row.name,
          at: now(),
        });
      })();
      await downloads.removeFiles(id);
    },

    /** Later features (tickets) clean up after themselves when a project goes. */
    registerDeleteHook(hook: ProjectDeleteHook): void {
      deleteHooks.push(hook);
    },

    whenIdle: () => downloads.whenIdle(),
    recoverDownloads: () => downloads.recover(),
  };
}

export type ProjectService = ReturnType<typeof createProjectService>;

declare module 'fastify' {
  interface FastifyInstance {
    projects: ProjectService;
  }
}
