import { describe, it, expect, vi, afterEach } from 'vitest';
import { createScheduler } from '../../src/server/modules/health/scheduler';
import { createGitRemote } from '../fakes/git-remote';
import { platformFixture } from './helpers';

/**
 * SC-006 / FR-013 / FR-014. Each checker or readiness behavior adds its cases
 * here BEFORE its implementation (research R21); Polish reruns the combined set.
 */
afterEach(() => {
  vi.useRealTimers();
});

describe('hourly visibility of a failure (fake clock)', () => {
  it('shows an authentication failure within 70 minutes in the worst case', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-08T00:00:00Z'));
    let broken = false;
    let visibleAt: number | undefined;
    const scheduler = createScheduler();
    scheduler.registerChecker('credential', async () => {
      // each run takes up to a minute (plan: 20 connections in under 60 s)
      await new Promise((resolve) => setTimeout(resolve, 60_000));
      if (broken && visibleAt === undefined) visibleAt = Date.now();
    });
    const start = scheduler.start();
    await vi.advanceTimersByTimeAsync(60_000);
    await start;
    // the credential breaks one second after a check began: worst case
    await vi.advanceTimersByTimeAsync(1_000);
    broken = true;
    const brokeAt = Date.now();
    await vi.advanceTimersByTimeAsync(3_600_000 + 60_000);
    scheduler.stop();
    expect(visibleAt).toBeDefined();
    expect((visibleAt as number) - brokeAt).toBeLessThan(70 * 60_000);
  });

  it('does not stop other checkers when one fails, and reports each result', async () => {
    const scheduler = createScheduler();
    scheduler.registerChecker('a', async () => {
      throw new Error('provider unreachable');
    });
    scheduler.registerChecker('b', async () => undefined);
    const results = await scheduler.runAll();
    expect(results).toEqual([
      { name: 'a', ok: false },
      { name: 'b', ok: true },
    ]);
  });
});

describe('connection and readiness behavior', () => {
  const key = 'sk-ant-health-1';
  const models = ['claude-sonnet-5-5'];

  async function setup() {
    const f = await platformFixture();
    const remote = await createGitRemote(['main']);
    f.fake.github.setToken('ghp_healthToken0001', {
      login: 'octo',
      kind: 'classic',
      scopes: ['repo'],
      repos: [
        {
          id: 71,
          fullName: 'octo/app',
          defaultBranch: 'main',
          branches: ['main'],
          cloneUrl: remote.url,
        },
      ],
    });
    const scc = (
      await f.call('POST', '/api/source-control-connections', {
        name: 'gh',
        platform: 'github',
        token: 'ghp_healthToken0001',
      })
    ).json().id as string;
    const project = (
      await f.call('POST', '/api/projects', {
        sourceControlConnectionId: scc,
        repoRemoteId: '71',
      })
    ).json().id as string;
    await f.app.projects.whenIdle();
    f.anthropic.setKey(key, { models });
    const provider = (
      await f.call('POST', '/api/provider-connections', {
        provider: 'claude',
        authType: 'api_key',
        name: 'c',
        apiKey: key,
      })
    ).json().id as string;
    const souls = (await f.call('GET', '/api/souls')).json() as {
      id: string;
      roleType: string;
      isDefault: boolean;
    }[];
    const agent = (
      await f.call('POST', '/api/agents', {
        name: 'pm',
        soulId: souls.find(
          (x) => x.isDefault && x.roleType === 'project_manager',
        )?.id,
        provider: 'claude',
        providerConnectionId: provider,
        model: 'claude-sonnet-5-5',
      })
    ).json().id as string;
    await f.call('PUT', `/api/projects/${project}/team/${agent}`);
    return { f, remote, scc, project, provider, agent };
  }
  const codes = (r: { json(): { reasons: { code: string }[] } }) =>
    r.json().reasons.map((x) => x.code);

  it('GitHub token rejection marks the connection and its projects', async () => {
    const { f, remote, scc, project } = await setup();
    try {
      expect(
        (await f.call('GET', `/api/projects/${project}`)).json().readiness,
      ).toBe('ready');
      f.fake.github.setToken('ghp_healthToken0001', {
        login: 'octo',
        kind: 'classic',
        scopes: ['repo'],
        revoked: true,
      });
      await f.scheduler.runAll();
      const connection = (
        await f.call('GET', '/api/source-control-connections')
      )
        .json()
        .find((c: { id: string }) => c.id === scc);
      expect(connection.status).toBe('needs_attention');
      const after = await f.call('GET', `/api/projects/${project}`);
      expect(after.json().readiness).toBe('not_ready');
      expect(codes(after)).toContain('source_control_needs_attention');
    } finally {
      await f.close();
      await remote.close();
    }
  });

  it('Claude key rejection sets needs_relogin and reaches agent and project in the same read', async () => {
    const { f, remote, project, provider, agent } = await setup();
    try {
      f.anthropic.setKey(key, { models: [], reject: true });
      await f.scheduler.runAll();
      const connection = (await f.call('GET', `/api/provider-connections`))
        .json()
        .find((c: { id: string }) => c.id === provider);
      expect(connection.status).toBe('needs_relogin');
      const a = await f.call('GET', `/api/agents/${agent}`);
      expect(a.json().reasons.map((x: { code: string }) => x.code)).toContain(
        'needs_relogin',
      );
      const p = await f.call('GET', `/api/projects/${project}`);
      expect(codes(p)).toContain('agent_not_ready');
    } finally {
      await f.close();
      await remote.close();
    }
  });

  it('network, rate-limit and service errors preserve the last confirmed status', async () => {
    const { f, remote, scc, project, provider } = await setup();
    try {
      for (const failWith of [429, 503]) {
        f.anthropic.setKey(key, { models: [], failWith });
        f.fake.github.setToken('ghp_healthToken0001', {
          login: 'octo',
          kind: 'classic',
          scopes: ['repo'],
          failWith,
        });
        await f.scheduler.runAll();
        const c = (await f.call('GET', '/api/provider-connections'))
          .json()
          .find((x: { id: string }) => x.id === provider);
        expect(c.status).toBe('connected');
        const s = (await f.call('GET', '/api/source-control-connections'))
          .json()
          .find((x: { id: string }) => x.id === scc);
        expect(s.status).toBe('connected');
        expect(
          codes(await f.call('GET', `/api/projects/${project}`)),
        ).not.toContain('source_control_needs_attention');
      }
    } finally {
      await f.close();
      await remote.close();
    }
  });
});
