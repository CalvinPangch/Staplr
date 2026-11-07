import type Database from 'better-sqlite3';
import type { createScheduler } from '../scheduler.js';
import type { SourceControlService } from '../../source-control/service.js';

interface Row {
  id: string;
  sourceControlConnectionId: string;
  repoRemoteId: string;
  baseBranch: string;
}

/**
 * Hourly and on "Check all": is each downloaded project repository still
 * reachable, and does its base branch still exist? Only a clear answer changes
 * anything: a rejected token or an outage says nothing about the repository, so
 * the last known state stays.
 */
export function registerRepositoryChecker(
  scheduler: ReturnType<typeof createScheduler>,
  {
    db,
    clock,
    sourceControl,
  }: {
    db: Database.Database;
    clock: () => number;
    sourceControl: SourceControlService;
  },
) {
  scheduler.registerChecker('repositories', async () => {
    const rows = db
      .prepare(
        `SELECT id, sourceControlConnectionId, repoRemoteId, baseBranch FROM project
         WHERE deletedAt IS NULL AND downloadStatus='downloaded' AND sourceControlConnectionId IS NOT NULL`,
      )
      .all() as Row[];
    for (const row of rows) {
      let state:
        'ok' | 'repository_unavailable' | 'base_branch_missing' | null = null;
      const found = await sourceControl.repository(
        row.sourceControlConnectionId,
        row.repoRemoteId,
      );
      if (!found.ok) {
        if (found.failure === 'not_found') state = 'repository_unavailable';
      } else {
        const branches = await sourceControl.branches(
          row.sourceControlConnectionId,
          row.repoRemoteId,
        );
        if (branches.ok)
          state = branches.branches.includes(row.baseBranch)
            ? 'ok'
            : 'base_branch_missing';
      }
      if (state)
        db.prepare(
          'UPDATE project SET repositoryState=?, repositoryCheckedAt=? WHERE id=?',
        ).run(state, new Date(clock()).toISOString(), row.id);
    }
  });
}
