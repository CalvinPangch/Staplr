import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInstallation } from '../../src/server/main';
import { createGithubAdapter } from '../../src/server/modules/source-control/adapters/github';
import { createGitlabAdapter } from '../../src/server/modules/source-control/adapters/gitlab';

/**
 * FR-043: the Staplr process may contact only the GitHub API, a configured
 * GitLab instance, api.anthropic.com (owner key checks) and the Docker proxy.
 * No telemetry, no other third party. Each external integration adds its case
 * here BEFORE its code (research R21). Sandbox container network behavior is
 * verified separately in the Docker tests.
 */
export const allowedHosts = (extra: string[] = []) =>
  new Set(['api.github.com', 'api.anthropic.com', ...extra]);

const attempted: string[] = [];
const server = setupServer();
beforeAll(() => {
  server.events.on('request:start', ({ request }) => {
    attempted.push(new URL(request.url).host);
  });
  server.listen({ onUnhandledFrame: 'bypass' });
});
afterAll(() => server.close());

const env = {
  STAPLR_MASTER_KEY: Buffer.alloc(32, 9).toString('base64'),
  SESSION_SECRET: 'test-session-secret-at-least-32-characters',
  PUBLIC_URL: 'http://localhost:3000',
};

describe('interception control', () => {
  it('records a real outbound request, so an empty result above is meaningful', async () => {
    server.use(
      http.get('https://example.test/ping', () =>
        HttpResponse.json({ ok: true }),
      ),
    );
    attempted.length = 0;
    const reply = await fetch('https://example.test/ping');
    expect(reply.status).toBe(200);
    expect(attempted).toEqual(['example.test']);
    expect(allowedHosts().has('example.test')).toBe(false);
    server.resetHandlers();
  });
});
describe('outbound traffic from the Staplr process', () => {
  it('makes no outbound request while starting and serving its own pages and API', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'staplr-egress-'));
    attempted.length = 0;
    const installation = await createInstallation(
      { ...env, DATA_DIR: dir },
      { docker: null },
    );
    try {
      await installation.app.inject({ url: '/api/setup/status' });
      await installation.app.inject({ url: '/' });
      await installation.scheduler.runAll();
      const outside = attempted.filter((host) => !allowedHosts().has(host));
      expect(outside).toEqual([]);
      expect(attempted).toEqual([]);
    } finally {
      await installation.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('GitHub and GitLab adapters contact only their own API hosts', async () => {
    server.use(
      http.get('https://api.github.com/user', () =>
        HttpResponse.json(
          { login: 'octo' },
          { headers: { 'x-oauth-scopes': 'repo' } },
        ),
      ),
      http.get(
        'https://gitlab.example.com/api/v4/personal_access_tokens/self',
        () =>
          HttpResponse.json({ scopes: ['api'], active: true, revoked: false }),
      ),
      http.get('https://gitlab.example.com/api/v4/user', () =>
        HttpResponse.json({ username: 'gl' }),
      ),
    );
    attempted.length = 0;
    await createGithubAdapter('https://api.github.com').verifyToken('ghp_x');
    await createGitlabAdapter('https://gitlab.example.com').verifyToken(
      'glpat-x',
    );
    const hosts = new Set(attempted);
    expect([...hosts].sort()).toEqual(['api.github.com', 'gitlab.example.com']);
    const outside = [...hosts].filter(
      (host) => !allowedHosts(['gitlab.example.com']).has(host),
    );
    expect(outside).toEqual([]);
    server.resetHandlers();
  });

  it.todo('Claude key checks contact only api.anthropic.com (US2)');
  it.todo('repository clones contact only the connection host (US5)');
});
