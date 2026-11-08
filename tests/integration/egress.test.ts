import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInstallation } from '../../src/server/main';
import { listAnthropicModels } from '../../src/server/modules/providers/anthropic';
import { isAllowedCloneUrl } from '../../src/server/modules/projects/download';
import { createGithubAdapter } from '../../src/server/modules/source-control/adapters/github';
import { createGitlabAdapter } from '../../src/server/modules/source-control/adapters/gitlab';

/**
 * FR-043: the Staplr process may contact only the GitHub API, a configured
 * GitLab instance, api.anthropic.com (owner key checks), the two official
 * pricing pages (feature 002, research R7) and the Docker proxy.
 * No telemetry, no other third party. Each external integration adds its case
 * here BEFORE its code (research R21). Sandbox container network behavior is
 * verified separately in the Docker tests.
 */
export const pricingHosts = ['platform.claude.com', 'developers.openai.com'];
export const allowedHosts = (extra: string[] = []) =>
  new Set(['api.github.com', 'api.anthropic.com', ...pricingHosts, ...extra]);

/** Header names sent with each price read, to prove no credential is sent. */
const pricingHeaders: string[] = [];

/** Serves the saved copies of the official pricing pages in place of the live sites. */
const pricingHandlers = () => [
  http.get(
    'https://platform.claude.com/docs/en/about-claude/pricing.md',
    ({ request }) => {
      pricingHeaders.push(...request.headers.keys());
      return new HttpResponse(
        readFileSync('tests/fixtures/pricing-claude.md'),
        {
          headers: { 'content-type': 'text/markdown' },
        },
      );
    },
  ),
  http.get(
    'https://developers.openai.com/api/docs/pricing.md',
    ({ request }) => {
      pricingHeaders.push(...request.headers.keys());
      return new HttpResponse(
        readFileSync('tests/fixtures/pricing-openai.md'),
        {
          headers: { 'content-type': 'text/markdown' },
        },
      );
    },
  ),
];

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
  it('while starting and serving, contacts only the official pricing pages', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'staplr-egress-'));
    server.use(...pricingHandlers());
    attempted.length = 0;
    const installation = await createInstallation(
      { ...env, DATA_DIR: dir },
      { docker: null },
    );
    try {
      await installation.app.inject({ url: '/api/setup/status' });
      await installation.app.inject({ url: '/' });
      await installation.scheduler.runAll();
      await installation.app.prices.whenIdle();
      const outside = attempted.filter((host) => !allowedHosts().has(host));
      expect(outside).toEqual([]);
      expect([...new Set(attempted)].sort()).toEqual([...pricingHosts].sort());
      // the price reads carry no credentials or cookies
      expect(pricingHeaders.length).toBeGreaterThan(0);
      for (const name of pricingHeaders)
        expect(['authorization', 'cookie', 'x-api-key']).not.toContain(
          name.toLowerCase(),
        );
    } finally {
      server.resetHandlers();
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

  it('Claude key checks contact only api.anthropic.com', async () => {
    server.use(
      http.get('https://api.anthropic.com/v1/models', () =>
        HttpResponse.json({
          data: [{ id: 'claude-sonnet-5-5' }],
          has_more: false,
          last_id: 'claude-sonnet-5-5',
        }),
      ),
    );
    attempted.length = 0;
    const result = await listAnthropicModels(
      'https://api.anthropic.com',
      'sk-ant-egress',
    );
    expect(result).toEqual({ ok: true, modelIds: ['claude-sonnet-5-5'] });
    expect([...new Set(attempted)]).toEqual(['api.anthropic.com']);
    expect(
      [...new Set(attempted)].filter((host) => !allowedHosts().has(host)),
    ).toEqual([]);
    server.resetHandlers();
  });
  it('repository clones only ever go to the connection platform', () => {
    const test = { testMode: false, githubApiUrl: 'https://api.github.com' };
    const github = {
      platform: 'github' as const,
      baseUrl: 'https://api.github.com',
    };
    const gitlab = {
      platform: 'gitlab' as const,
      baseUrl: 'https://git.example.org',
    };
    expect(
      isAllowedCloneUrl('https://github.com/octo/app.git', github, test),
    ).toBe(true);
    expect(
      isAllowedCloneUrl('https://evil.example/octo/app.git', github, test),
    ).toBe(false);
    expect(
      isAllowedCloneUrl('http://github.com/octo/app.git', github, test),
    ).toBe(false);
    expect(
      isAllowedCloneUrl('https://git.example.org/team/app.git', gitlab, test),
    ).toBe(true);
    expect(
      isAllowedCloneUrl('https://github.com/octo/app.git', gitlab, test),
    ).toBe(false);
    expect(isAllowedCloneUrl('/srv/repos/app.git', github, test)).toBe(false);
    expect(isAllowedCloneUrl('file:///srv/repos/app.git', github, test)).toBe(
      false,
    );
    // test mode lets fixtures use local remotes, but still not arbitrary hosts
    const testing = {
      testMode: true,
      githubApiUrl: 'http://127.0.0.1:4330/github',
    };
    expect(isAllowedCloneUrl('/tmp/remote.git', github, testing)).toBe(true);
    expect(
      isAllowedCloneUrl('https://evil.example/octo/app.git', github, testing),
    ).toBe(false);
  });
});
