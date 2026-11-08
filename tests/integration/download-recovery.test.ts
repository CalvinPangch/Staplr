import { it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createStartupRegistry } from '../../src/server/lib/startup';
import { platformFixture } from './helpers';
import { createGitRemote } from '../fakes/git-remote';

it('marks interrupted downloads failed, removes the partial copy and lets a retry succeed', async () => {
  const startup = createStartupRegistry();
  const f = await platformFixture({ startup });
  const remote = await createGitRemote(['main']);
  try {
    f.fake.github.setToken('ghp_recoveryToken0001', {
      login: 'octo',
      kind: 'classic',
      scopes: ['repo'],
      repos: [
        {
          id: 31,
          fullName: 'octo/app',
          defaultBranch: 'main',
          branches: ['main'],
          cloneUrl: remote.url,
        },
      ],
    });
    const connection = (
      await f.call('POST', '/api/source-control-connections', {
        name: 'gh',
        platform: 'github',
        token: 'ghp_recoveryToken0001',
      })
    ).json().id as string;

    // A project that was downloading when Staplr stopped, with a partial copy.
    const at = '2026-11-08T00:00:00.000Z';
    f.db
      .prepare(
        `INSERT INTO project(id,name,sourceControlConnectionId,repoFullName,repoRemoteId,baseBranch,downloadStatus,createdAt,updatedAt)
         VALUES('p1','app',?,'octo/app','31','main','downloading',?,?)`,
      )
      .run(connection, at, at);
    const base = join(f.dataDir, 'repos', 'p1', 'base');
    await mkdir(base, { recursive: true });
    await writeFile(join(base, 'half-written'), 'partial');

    const results = await startup.runStartupTasks();
    expect(results).toContainEqual({ name: 'recover-downloads', ok: true });
    const failed = (await f.call('GET', '/api/projects/p1')).json();
    expect(failed.downloadStatus).toBe('download_failed');
    expect(failed.downloadError).toBe('interrupted');
    expect(existsSync(base)).toBe(false);

    const retry = await f.call('POST', '/api/projects/p1/download');
    expect(retry.statusCode).toBe(202);
    await f.app.projects.whenIdle();
    expect(
      (await f.call('GET', '/api/projects/p1')).json().downloadStatus,
    ).toBe('downloaded');
    expect(existsSync(join(base, 'README.md'))).toBe(true);
  } finally {
    await f.close();
    await remote.close();
  }
});
