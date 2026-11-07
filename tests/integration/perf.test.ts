import { describe, it, expect } from 'vitest';
import { fixture, platformFixture, signedIn } from './helpers';

/**
 * Plan performance goals, measured on the documented host (2 vCPU). Each list
 * or picker adds its fixture and assertion BEFORE its implementation
 * (research R21). The limits below are the contract; do not loosen them.
 */
export const limits = {
  repositorySearchMs: 300,
  listEndpointMs: 500,
} as const;

async function timed(run: () => Promise<unknown>): Promise<number> {
  const started = performance.now();
  await run();
  return performance.now() - started;
}

describe('list endpoints stay within budget', () => {
  it('serves 200 audit entries and 200 error events in under 500 ms', async () => {
    const f = await fixture();
    try {
      const cookie = await signedIn(f);
      const audit = f.db.prepare(
        'INSERT INTO audit_entry(id,at,action,targetType,targetId,targetName,detail) VALUES(?,?,?,?,?,?,?)',
      );
      const errors = f.db.prepare(
        'INSERT INTO error_event(id,at,requestId,route,message,stack) VALUES(?,?,?,?,?,?)',
      );
      f.db.transaction(() => {
        for (let i = 0; i < 400; i++) {
          const at = new Date(Date.UTC(2026, 10, 8, 0, 0, i)).toISOString();
          audit.run(
            `a${i}`,
            at,
            'scc.added',
            'source_control_connection',
            `c${i}`,
            `conn-${i}`,
            '{}',
          );
          errors.run(
            `e${i}`,
            at,
            `r${i}`,
            '/api/x',
            'Unexpected server error.',
            null,
          );
        }
      })();
      for (const url of ['/api/audit-entries', '/api/error-events']) {
        const ms = await timed(() =>
          f.app.inject({ url, cookies: { staplr_session: cookie } }),
        );
        expect(ms, url).toBeLessThan(limits.listEndpointMs);
      }
    } finally {
      await f.app.close();
      f.db.close();
    }
  });
});

describe('pickers and lists', () => {
  it('searches 1,000 repositories in under 300 ms', async () => {
    const f = await platformFixture();
    try {
      f.fake.github.setToken('ghp_perfSearchToken01', {
        login: 'octo',
        kind: 'classic',
        scopes: ['repo'],
        repos: Array.from({ length: 1000 }, (_, i) => ({
          id: i + 1,
          fullName: `org/repo-${i}`,
          defaultBranch: 'main',
        })),
      });
      const connection = (
        await f.call('POST', '/api/source-control-connections', {
          name: 'perf',
          platform: 'github',
          token: 'ghp_perfSearchToken01',
        })
      ).json().id as string;
      const url = `/api/source-control-connections/${connection}/repositories?q=repo-99`;
      await f.call('GET', url); // warm up the HTTP stack
      const ms = await timed(() => f.call('GET', url));
      const result = (await f.call('GET', url)).json() as unknown[];
      expect(result).toHaveLength(11); // repo-99 and repo-990 .. repo-999
      expect(ms).toBeLessThan(limits.repositorySearchMs);
    } finally {
      await f.close();
    }
  });

  it('lists 100 agents in under 500 ms', async () => {
    const f = await platformFixture();
    try {
      f.anthropic.setKey('sk-ant-perf-agents', {
        models: ['claude-sonnet-5-5'],
      });
      const connection = (
        await f.call('POST', '/api/provider-connections', {
          provider: 'claude',
          authType: 'api_key',
          name: 'perf',
          apiKey: 'sk-ant-perf-agents',
        })
      ).json().id as string;
      const insert = f.db.prepare(
        `INSERT INTO agent(id,name,soulId,provider,providerConnectionId,model,createdAt,updatedAt)
         VALUES(?,?,'default-developer','claude',?,'claude-sonnet-5-5','2026-11-08T00:00:00Z','2026-11-08T00:00:00Z')`,
      );
      f.db.transaction(() => {
        for (let i = 0; i < 100; i++)
          insert.run(`a${i}`, `agent ${i}`, connection);
      })();
      const ms = await timed(() => f.call('GET', '/api/agents'));
      expect(
        ((await f.call('GET', '/api/agents')).json() as unknown[]).length,
      ).toBe(100);
      expect(ms).toBeLessThan(limits.listEndpointMs);
    } finally {
      await f.close();
    }
  });

  it('lists 50 projects with teams in under 500 ms', async () => {
    const f = await platformFixture();
    try {
      f.anthropic.setKey('sk-ant-perf-projects', {
        models: ['claude-sonnet-5-5'],
      });
      const connection = (
        await f.call('POST', '/api/provider-connections', {
          provider: 'claude',
          authType: 'api_key',
          name: 'perf',
          apiKey: 'sk-ant-perf-projects',
        })
      ).json().id as string;
      const at = '2026-11-08T00:00:00Z';
      const agent = f.db.prepare(
        `INSERT INTO agent(id,name,soulId,provider,providerConnectionId,model,createdAt,updatedAt)
         VALUES(?,?,'default-developer','claude',?,'claude-sonnet-5-5',?,?)`,
      );
      const project = f.db.prepare(
        `INSERT INTO project(id,name,repoFullName,repoRemoteId,baseBranch,downloadStatus,createdAt,updatedAt)
         VALUES(?,?,?,?, 'main','downloaded',?,?)`,
      );
      const member = f.db.prepare(
        'INSERT INTO team_assignment(projectId,agentId,assignedAt) VALUES(?,?,?)',
      );
      f.db.transaction(() => {
        for (let i = 0; i < 4; i++)
          agent.run(`a${i}`, `agent ${i}`, connection, at, at);
        for (let i = 0; i < 50; i++) {
          project.run(`p${i}`, `project ${i}`, `org/p${i}`, String(i), at, at);
          for (let a = 0; a < 4; a++) member.run(`p${i}`, `a${a}`, at);
        }
      })();
      const ms = await timed(() => f.call('GET', '/api/projects'));
      expect(
        ((await f.call('GET', '/api/projects')).json() as unknown[]).length,
      ).toBe(50);
      expect(ms).toBeLessThan(limits.listEndpointMs);
    } finally {
      await f.close();
    }
  });
});
