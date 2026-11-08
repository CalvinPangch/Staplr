import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { platformFixture } from './helpers';
import { createGitRemote, type GitRemote } from '../fakes/git-remote';

let f: Awaited<ReturnType<typeof platformFixture>>;
let remote: GitRemote;
let other: GitRemote;
let freeBytes = Number.MAX_SAFE_INTEGER;
const token = 'ghp_projectsTokenValue0001';

beforeEach(async () => {
  freeBytes = Number.MAX_SAFE_INTEGER;
  f = await platformFixture({ freeBytes: async () => freeBytes });
  remote = await createGitRemote(['main', 'release']);
  other = await createGitRemote(['main']);
  setRepos();
});
afterEach(async () => {
  await f.close();
  await remote.close();
  await other.close();
});

const repo = (id: number, fullName: string, git: GitRemote) => ({
  id,
  fullName,
  defaultBranch: 'main',
  branches: git.branches,
  cloneUrl: git.url,
});
function setRepos(
  repos = [repo(11, 'octo/app', remote), repo(12, 'octo/other', other)],
) {
  f.fake.github.setToken(token, {
    login: 'octo',
    kind: 'classic',
    scopes: ['repo'],
    repos,
  });
}

interface Project {
  id: string;
  name: string;
  sourceControlConnectionId: string | null;
  repoFullName: string;
  baseBranch: string;
  downloadStatus: string;
  downloadProgress: number | null;
  downloadError: string | null;
  lastUpdatedAt: string | null;
  lastRefreshError: string | null;
  readiness: string;
  reasons: { code: string; message?: string; agentId?: string }[];
}

const connect = async () =>
  (
    await f.call('POST', '/api/source-control-connections', {
      name: 'gh',
      platform: 'github',
      token,
    })
  ).json().id as string;
const add = async (connection: string, repoRemoteId = '11', extra = {}) =>
  f.call('POST', '/api/projects', {
    sourceControlConnectionId: connection,
    repoRemoteId,
    ...extra,
  });
const settle = () => f.app.projects.whenIdle();
const get = async (id: string) =>
  (await f.call('GET', `/api/projects/${id}`)).json() as Project;
const baseDir = (id: string) => join(f.dataDir, 'repos', id, 'base');
/** A downloaded project on the main repository. */
async function ready(extra = {}) {
  const connection = await connect();
  const created = await add(connection, '11', extra);
  expect(created.statusCode).toBe(202);
  await settle();
  return { connection, project: await get(created.json().id) };
}

describe('listing repositories', () => {
  it('lists repositories the connection can push to, with search, and their branches', async () => {
    const connection = await connect();
    const all = await f.call(
      'GET',
      `/api/source-control-connections/${connection}/repositories`,
    );
    expect(all.statusCode).toBe(200);
    expect(all.json()).toEqual([
      {
        remoteId: '11',
        fullName: 'octo/app',
        defaultBranch: 'main',
        private: false,
      },
      {
        remoteId: '12',
        fullName: 'octo/other',
        defaultBranch: 'main',
        private: false,
      },
    ]);
    const searched = await f.call(
      'GET',
      `/api/source-control-connections/${connection}/repositories?q=OTH`,
    );
    expect(
      searched.json().map((r: { fullName: string }) => r.fullName),
    ).toEqual(['octo/other']);
    const branches = await f.call(
      'GET',
      `/api/source-control-connections/${connection}/repositories/11/branches`,
    );
    expect(branches.json()).toEqual(['main', 'release']);
  });

  it('answers 404 for an unknown connection or repository and 503 on an outage', async () => {
    const connection = await connect();
    expect(
      (await f.call('GET', '/api/source-control-connections/nope/repositories'))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await f.call(
          'GET',
          `/api/source-control-connections/${connection}/repositories/999/branches`,
        )
      ).statusCode,
    ).toBe(404);
    f.fake.github.setToken(token, {
      login: 'octo',
      kind: 'classic',
      scopes: ['repo'],
      failWith: 503,
    });
    const down = await f.call(
      'GET',
      `/api/source-control-connections/${connection}/repositories`,
    );
    expect(down.statusCode).toBe(503);
    expect(down.json().code).toBe('provider_unavailable');
  });
});

describe('adding a project', () => {
  it('returns 202 downloading, then downloaded on the default branch', async () => {
    const connection = await connect();
    const created = await add(connection);
    expect(created.statusCode).toBe(202);
    expect(created.json()).toMatchObject({
      name: 'app',
      repoFullName: 'octo/app',
      baseBranch: 'main',
      downloadStatus: 'downloading',
      sourceControlConnectionId: connection,
    });
    const id = created.json().id as string;
    await settle();
    const done = await get(id);
    expect(done).toMatchObject({
      downloadStatus: 'downloaded',
      downloadError: null,
      baseBranch: 'main',
    });
    expect(done.lastUpdatedAt).toMatch(/^2026-/);
    expect(await readFile(join(baseDir(id), 'README.md'), 'utf8')).toContain(
      'fixture',
    );
    const listed = (await f.call('GET', '/api/projects')).json() as Project[];
    expect(listed.map((p) => p.id)).toEqual([id]);
  });

  it('keeps the token out of the downloaded repository', async () => {
    const { project } = await ready();
    const config = await readFile(
      join(baseDir(project.id), '.git', 'config'),
      'utf8',
    );
    expect(config).not.toContain(token);
  });

  it('uses a name given by the user and rejects a bad one', async () => {
    const connection = await connect();
    const named = await add(connection, '11', { name: 'My app' });
    expect(named.json().name).toBe('My app');
    await settle();
    expect((await add(connection, '12', { name: '' })).statusCode).toBe(422);
    expect(
      (await add(connection, '12', { name: 'n'.repeat(81) })).statusCode,
    ).toBe(422);
    expect((await add(connection, '12', { surprise: 1 })).statusCode).toBe(422);
  });

  it('refuses an unknown connection, an inaccessible repository, and a connection that needs attention', async () => {
    const connection = await connect();
    expect((await add('nope')).statusCode).toBe(404);
    const missing = await add(connection, '999');
    expect(missing.statusCode).toBe(422);
    expect(missing.json().code).toBe('invalid_input');
    f.fake.github.setToken(token, {
      login: 'octo',
      kind: 'classic',
      scopes: ['repo'],
      revoked: true,
    });
    await f.call('POST', `/api/source-control-connections/${connection}/check`);
    const blocked = await add(connection);
    expect(blocked.statusCode).toBe(409);
  });

  it('records a failed download and retries it successfully', async () => {
    const connection = await connect();
    setRepos([
      repo(11, 'octo/app', { ...remote, url: '/no/such/repository.git' }),
    ]);
    const created = await add(connection);
    const id = created.json().id as string;
    await settle();
    const failed = await get(id);
    expect(failed.downloadStatus).toBe('download_failed');
    expect(failed.downloadError).toMatch(/download/i);
    expect(failed.readiness).toBe('not_ready');
    expect(failed.reasons.map((r) => r.code)).toContain('download_failed');
    expect(existsSync(baseDir(id))).toBe(false);

    setRepos();
    const retry = await f.call('POST', `/api/projects/${id}/download`);
    expect(retry.statusCode).toBe(202);
    await settle();
    expect((await get(id)).downloadStatus).toBe('downloaded');
    expect(existsSync(join(baseDir(id), 'README.md'))).toBe(true);
  });

  it('only retries a download that failed', async () => {
    const { project } = await ready();
    const retry = await f.call('POST', `/api/projects/${project.id}/download`);
    expect(retry.statusCode).toBe(409);
  });

  it('fails before cloning when there is under 1 GiB of free space', async () => {
    freeBytes = 1024 ** 3 - 1;
    const connection = await connect();
    const id = (await add(connection)).json().id as string;
    await settle();
    const failed = await get(id);
    expect(failed.downloadStatus).toBe('download_failed');
    expect(failed.downloadError).toBe('insufficient disk space');
    expect(existsSync(baseDir(id))).toBe(false);
    freeBytes = 1024 ** 3;
    await f.call('POST', `/api/projects/${id}/download`);
    await settle();
    expect((await get(id)).downloadStatus).toBe('downloaded');
  });
});

describe('refreshing', () => {
  it('fast-forwards the base branch and updates the time', async () => {
    const { project } = await ready();
    await remote.commit('main', 'NEW.txt', 'fresh');
    f.advance(60_000);
    const refreshed = await f.call(
      'POST',
      `/api/projects/${project.id}/refresh`,
    );
    expect(refreshed.statusCode).toBe(200);
    expect(await readFile(join(baseDir(project.id), 'NEW.txt'), 'utf8')).toBe(
      'fresh',
    );
    expect(Date.parse(refreshed.json().lastUpdatedAt)).toBeGreaterThan(
      Date.parse(project.lastUpdatedAt as string),
    );
    expect(refreshed.json().lastRefreshError).toBeNull();
  });

  it('keeps the local copy and says so when the remote history was rewritten', async () => {
    const { project } = await ready();
    await remote.rewrite('main');
    const refused = await f.call('POST', `/api/projects/${project.id}/refresh`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().code).toBe('history_rewritten');
    const after = await get(project.id);
    expect(after.downloadStatus).toBe('downloaded');
    expect(after.lastRefreshError).toMatch(/rewritten/i);
    expect(after.lastUpdatedAt).toBe(project.lastUpdatedAt);
    expect(existsSync(join(baseDir(project.id), 'README.md'))).toBe(true);
    expect(existsSync(join(baseDir(project.id), 'REWRITTEN'))).toBe(false);
  });

  it('answers 404 for an unknown project and 409 while it is not downloaded', async () => {
    expect(
      (await f.call('POST', '/api/projects/nope/refresh')).statusCode,
    ).toBe(404);
    const connection = await connect();
    freeBytes = 0;
    const id = (await add(connection)).json().id as string;
    await settle();
    expect(
      (await f.call('POST', `/api/projects/${id}/refresh`)).statusCode,
    ).toBe(409);
  });
});

describe('editing a project', () => {
  it('renames and limits the name', async () => {
    const { project } = await ready();
    const renamed = await f.call('PATCH', `/api/projects/${project.id}`, {
      name: 'Renamed',
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().name).toBe('Renamed');
    expect(
      (await f.call('PATCH', `/api/projects/${project.id}`, { name: '' }))
        .statusCode,
    ).toBe(422);
    expect(
      (await f.call('PATCH', `/api/projects/${project.id}`, {})).statusCode,
    ).toBe(422);
  });

  it('changes the base branch to an existing branch and checks it out', async () => {
    const { project } = await ready();
    const changed = await f.call('PATCH', `/api/projects/${project.id}`, {
      baseBranch: 'release',
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().baseBranch).toBe('release');
    expect(
      await simpleGit(baseDir(project.id)).revparse(['--abbrev-ref', 'HEAD']),
    ).toBe('release');
  });

  it('refuses a base branch that does not exist', async () => {
    const { project } = await ready();
    const refused = await f.call('PATCH', `/api/projects/${project.id}`, {
      baseBranch: 'nope',
    });
    expect(refused.statusCode).toBe(422);
    expect((await get(project.id)).baseBranch).toBe('main');
  });

  it('relinks to another repository, re-downloads it and clears the unavailable reason', async () => {
    const { connection, project } = await ready();
    setRepos([repo(12, 'octo/other', other)]);
    await f.scheduler.runAll();
    const unavailable = await get(project.id);
    expect(unavailable.reasons.map((r) => r.code)).toContain(
      'repository_unavailable',
    );

    const relinked = await f.call('PATCH', `/api/projects/${project.id}`, {
      relink: { sourceControlConnectionId: connection, repoRemoteId: '12' },
    });
    expect(relinked.statusCode).toBe(200);
    expect(relinked.json()).toMatchObject({
      repoFullName: 'octo/other',
      downloadStatus: 'downloading',
    });
    await settle();
    const after = await get(project.id);
    expect(after.downloadStatus).toBe('downloaded');
    expect(after.reasons.map((r) => r.code)).not.toContain(
      'repository_unavailable',
    );
    await f.scheduler.runAll();
    expect((await get(project.id)).reasons.map((r) => r.code)).not.toContain(
      'repository_unavailable',
    );
  });

  it('reports a missing base branch from a health check', async () => {
    const { project } = await ready();
    setRepos([{ ...repo(11, 'octo/app', remote), branches: ['release'] }]);
    await f.scheduler.runAll();
    const after = await get(project.id);
    expect(after.readiness).toBe('not_ready');
    expect(after.reasons.map((r) => r.code)).toContain('base_branch_missing');
  });
});

describe('source control connection removal', () => {
  it('clears the link and shows Not ready with connection removed', async () => {
    const { connection, project } = await ready();
    expect(
      (await f.call('DELETE', `/api/source-control-connections/${connection}`))
        .statusCode,
    ).toBe(204);
    const after = await get(project.id);
    expect(after.sourceControlConnectionId).toBeNull();
    expect(after.readiness).toBe('not_ready');
    const reason = after.reasons.find(
      (r) => r.code === 'source_control_needs_attention',
    );
    expect(reason?.message).toMatch(/connection removed/i);
  });
});

describe('provider impact', () => {
  it('lists the projects reached through the agents of a connection', async () => {
    const { project } = await ready();
    f.anthropic.setKey('sk-ant-projects-1', { models: ['claude-sonnet-5-5'] });
    const provider = (
      await f.call('POST', '/api/provider-connections', {
        provider: 'claude',
        authType: 'api_key',
        name: 'claude',
        apiKey: 'sk-ant-projects-1',
      })
    ).json().id as string;
    const souls = (await f.call('GET', '/api/souls')).json() as {
      id: string;
      roleType: string;
      isDefault: boolean;
    }[];
    const soulId = souls.find(
      (s) => s.isDefault && s.roleType === 'developer',
    )?.id;
    const agent = (
      await f.call('POST', '/api/agents', {
        name: 'dev',
        soulId,
        provider: 'claude',
        providerConnectionId: provider,
        model: 'claude-sonnet-5-5',
      })
    ).json().id as string;
    await f.call('PUT', `/api/projects/${project.id}/team/${agent}`);
    const impact = await f.call(
      'GET',
      `/api/provider-connections/${provider}/impact`,
    );
    expect(impact.json().projects).toEqual([{ id: project.id, name: 'app' }]);
  });
});

describe('deleting a project', () => {
  it('removes the code and team, keeps agents and usage, and hides the project', async () => {
    const { project } = await ready();
    f.anthropic.setKey('sk-ant-projects-2', { models: ['claude-sonnet-5-5'] });
    const provider = (
      await f.call('POST', '/api/provider-connections', {
        provider: 'claude',
        authType: 'api_key',
        name: 'claude',
        apiKey: 'sk-ant-projects-2',
      })
    ).json().id as string;
    const souls = (await f.call('GET', '/api/souls')).json() as {
      id: string;
      roleType: string;
      isDefault: boolean;
    }[];
    const agent = (
      await f.call('POST', '/api/agents', {
        name: 'dev',
        soulId: souls.find((s) => s.isDefault && s.roleType === 'developer')
          ?.id,
        provider: 'claude',
        providerConnectionId: provider,
        model: 'claude-sonnet-5-5',
      })
    ).json().id as string;
    await f.call('PUT', `/api/projects/${project.id}/team/${agent}`);
    f.db
      .prepare(
        `INSERT INTO usage_record(id,projectId,agentId,providerConnectionId,projectName,agentName,agentRole,ticketId,ticketTitle,provider,model,startedAt,endedAt)
         VALUES('u1',?,?,?,'app','dev','developer','t1','A ticket','claude','claude-sonnet-5-5','2026-11-08T00:00:00Z','2026-11-08T00:01:00Z')`,
      )
      .run(project.id, agent, provider);

    const removed = await f.call('DELETE', `/api/projects/${project.id}`);
    expect(removed.statusCode).toBe(204);
    expect(existsSync(join(f.dataDir, 'repos', project.id))).toBe(false);
    expect((await f.call('GET', '/api/projects')).json()).toEqual([]);
    expect(
      (await f.call('GET', `/api/projects/${project.id}`)).statusCode,
    ).toBe(404);
    const row = f.db
      .prepare('SELECT deletedAt FROM project WHERE id=?')
      .get(project.id) as { deletedAt: string };
    expect(row.deletedAt).toMatch(/^2026-/);
    expect(
      f.db.prepare('SELECT COUNT(*) AS n FROM team_assignment').get(),
    ).toEqual({ n: 0 });
    expect((await f.call('GET', `/api/agents/${agent}`)).statusCode).toBe(200);
    expect(
      f.db.prepare('SELECT projectName FROM usage_record WHERE id=?').get('u1'),
    ).toEqual({ projectName: 'app' });
    expect(
      (await f.call('DELETE', `/api/projects/${project.id}`)).statusCode,
    ).toBe(404);
  });

  it('refuses to change or delete usage records', async () => {
    const { project } = await ready();
    f.db
      .prepare(
        `INSERT INTO usage_record(id,projectId,projectName,agentName,agentRole,ticketId,ticketTitle,provider,model,startedAt,endedAt)
         VALUES('u2',?,'app','dev','developer','t1','T','claude','m','2026-11-08T00:00:00Z','2026-11-08T00:01:00Z')`,
      )
      .run(project.id);
    expect(() =>
      f.db.prepare("UPDATE usage_record SET model='x' WHERE id='u2'").run(),
    ).toThrow(/append-only/);
    expect(() =>
      f.db.prepare("DELETE FROM usage_record WHERE id='u2'").run(),
    ).toThrow(/append-only/);
  });
});

describe('access', () => {
  it('needs a session', async () => {
    expect(
      (await f.app.inject({ method: 'GET', url: '/api/projects' })).statusCode,
    ).toBe(401);
  });
});
