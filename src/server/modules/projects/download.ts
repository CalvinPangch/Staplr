import { mkdir, rm, statfs } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type Database from 'better-sqlite3';
import type { Config } from '../../config.js';
import {
  checkoutBranch,
  clone,
  fetchAndFastForward,
  hasRemoteBranch,
} from '../../lib/git.js';
import { ServiceError } from '../../lib/problem.js';
import type { SourceControlService } from '../source-control/service.js';

/** A download needs at least 1 GiB free at the data folder (spec edge cases). */
export const minimumFreeBytes = 1024 ** 3;

export type FreeBytes = (path: string) => Promise<number>;

export const defaultFreeBytes: FreeBytes = async (path) => {
  const stats = await statfs(path);
  return stats.bavail * stats.bsize;
};

/**
 * The token is sent to whatever address git clones from, so the address must
 * belong to the connection platform: github.com for GitHub, the configured
 * address for GitLab. Local paths and test hosts are accepted only in test mode.
 */
export function isAllowedCloneUrl(
  cloneUrl: string,
  connection: { platform: 'github' | 'gitlab'; baseUrl: string },
  options: { testMode: boolean; githubApiUrl: string },
): boolean {
  // fixtures clone from a folder on disk (a Windows path parses as a URL too)
  if (options.testMode && isAbsolute(cloneUrl)) return true;
  let url: URL;
  try {
    url = new URL(cloneUrl);
  } catch {
    return options.testMode && cloneUrl.length > 0;
  }
  if (options.testMode && url.protocol === 'file:') return true;
  if (
    url.protocol !== 'https:' &&
    !(options.testMode && url.protocol === 'http:')
  )
    return false;
  const host = url.hostname.toLowerCase();
  const allowed =
    connection.platform === 'github'
      ? ['github.com']
      : [new URL(connection.baseUrl).hostname.toLowerCase()];
  if (options.testMode && connection.platform === 'github')
    allowed.push(new URL(options.githubApiUrl).hostname.toLowerCase());
  return allowed.includes(host);
}

interface ProjectRow {
  id: string;
  sourceControlConnectionId: string | null;
  repoRemoteId: string;
  baseBranch: string;
  downloadStatus: string;
}

const cannotDownload =
  'Could not download the repository. Check the connection and retry.';

/**
 * Downloads and refreshes the base copy of each project under
 * ${DATA_DIR}/repos/<projectId>/base. Downloads run in the background; the
 * database row always says what state the copy is in. Errors are reduced to
 * short messages because git output can contain addresses and credentials.
 */
export function createDownloadManager({
  db,
  config,
  clock,
  sourceControl,
  freeBytes = defaultFreeBytes,
}: {
  db: Database.Database;
  config: Config;
  clock: () => number;
  sourceControl: SourceControlService;
  freeBytes?: FreeBytes;
}) {
  const now = () => new Date(clock()).toISOString();
  const progress = new Map<string, number>();
  const running = new Set<Promise<void>>();

  const reposDir = () => join(config.dataDir, 'repos');
  const projectDir = (id: string) => join(reposDir(), id);
  const baseDir = (id: string) => join(projectDir(id), 'base');
  const find = (id: string) =>
    db
      .prepare(
        'SELECT id, sourceControlConnectionId, repoRemoteId, baseBranch, downloadStatus FROM project WHERE id=? AND deletedAt IS NULL',
      )
      .get(id) as ProjectRow | undefined;

  function fail(id: string, message: string) {
    db.prepare(
      "UPDATE project SET downloadStatus='download_failed', downloadError=?, updatedAt=? WHERE id=?",
    ).run(message, now(), id);
    progress.delete(id);
  }

  async function download(id: string): Promise<void> {
    const project = find(id);
    if (!project) return;
    try {
      await mkdir(config.dataDir, { recursive: true });
      if ((await freeBytes(config.dataDir)) < minimumFreeBytes) {
        fail(id, 'insufficient disk space');
        return;
      }
      if (!project.sourceControlConnectionId) {
        fail(id, 'the source control connection was removed');
        return;
      }
      const found = await sourceControl.repository(
        project.sourceControlConnectionId,
        project.repoRemoteId,
      );
      if (!found.ok) {
        fail(
          id,
          found.failure === 'unavailable'
            ? 'the platform could not be reached'
            : found.failure === 'not_found'
              ? 'the repository was not found'
              : 'the connection token was rejected',
        );
        return;
      }
      if (
        !isAllowedCloneUrl(
          found.repository.cloneUrl,
          sourceControl.get(project.sourceControlConnectionId),
          { testMode: config.testMode, githubApiUrl: config.githubApiUrl },
        )
      ) {
        fail(id, 'unexpected repository address');
        return;
      }
      await rm(projectDir(id), { recursive: true, force: true });
      await mkdir(projectDir(id), { recursive: true });
      progress.set(id, 0);
      await clone(
        found.repository.cloneUrl,
        baseDir(id),
        sourceControl.decryptTokenForUse(project.sourceControlConnectionId),
        (percent) => progress.set(id, Math.min(99, percent)),
      );
      if (!(await hasRemoteBranch(baseDir(id), project.baseBranch))) {
        await rm(projectDir(id), { recursive: true, force: true });
        fail(id, `the base branch ${project.baseBranch} does not exist`);
        return;
      }
      await checkoutBranch(baseDir(id), project.baseBranch);
      db.prepare(
        `UPDATE project SET downloadStatus='downloaded', downloadError=NULL, lastUpdatedAt=?, lastRefreshError=NULL,
           repositoryState='ok', repositoryCheckedAt=?, updatedAt=? WHERE id=?`,
      ).run(now(), now(), now(), id);
      progress.delete(id);
    } catch {
      await rm(projectDir(id), { recursive: true, force: true }).catch(
        () => undefined,
      );
      fail(id, cannotDownload);
    }
  }

  return {
    baseDir,
    projectDir,
    /** 0-100 while downloading, otherwise null. */
    progress: (id: string): number | null => progress.get(id) ?? null,

    /** Marks the project downloading and clones it in the background. */
    start(id: string): void {
      db.prepare(
        "UPDATE project SET downloadStatus='downloading', downloadError=NULL, updatedAt=? WHERE id=?",
      ).run(now(), id);
      progress.set(id, 0);
      const job: Promise<void> = download(id).finally(() =>
        running.delete(job),
      );
      running.add(job);
    },

    /** Resolves when every background download has finished (tests, shutdown). */
    async whenIdle(): Promise<void> {
      while (running.size > 0) await Promise.all([...running]);
    },

    /** Fetches and fast-forwards the base branch. The local copy is never replaced. */
    async refresh(id: string): Promise<void> {
      const project = find(id);
      if (!project)
        throw new ServiceError(
          404,
          'not_found',
          'That project does not exist.',
        );
      if (
        project.downloadStatus !== 'downloaded' ||
        !project.sourceControlConnectionId
      )
        throw new ServiceError(
          409,
          'conflict',
          'Only a downloaded project with a source control connection can be refreshed.',
        );
      try {
        await fetchAndFastForward(
          baseDir(id),
          project.baseBranch,
          sourceControl.decryptTokenForUse(project.sourceControlConnectionId),
        );
      } catch (error) {
        const rewritten =
          error instanceof Error && error.message === 'history_rewritten';
        const message = rewritten
          ? 'The remote history was rewritten, so the local copy was kept. Relink or download the repository again to start from the new history.'
          : 'Could not refresh from the remote. The local copy was kept. Retry in a moment.';
        db.prepare(
          'UPDATE project SET lastRefreshError=?, updatedAt=? WHERE id=?',
        ).run(message, now(), id);
        throw new ServiceError(
          409,
          rewritten ? 'history_rewritten' : 'conflict',
          message,
        );
      }
      db.prepare(
        "UPDATE project SET lastUpdatedAt=?, lastRefreshError=NULL, repositoryState='ok', repositoryCheckedAt=?, updatedAt=? WHERE id=?",
      ).run(now(), now(), now(), id);
    },

    /** Removes the whole project folder: base copy and any working copies. */
    async removeFiles(id: string): Promise<void> {
      await rm(projectDir(id), { recursive: true, force: true });
    },

    /**
     * Start-up: a download cannot survive a restart. Mark it failed as
     * "interrupted" and delete the partial copy so a retry starts clean.
     */
    async recover(): Promise<void> {
      const rows = db
        .prepare("SELECT id FROM project WHERE downloadStatus='downloading'")
        .all() as { id: string }[];
      for (const { id } of rows) {
        await rm(projectDir(id), { recursive: true, force: true });
        fail(id, 'interrupted');
      }
    },
  };
}

export type DownloadManager = ReturnType<typeof createDownloadManager>;
