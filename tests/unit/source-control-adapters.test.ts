import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createGithubAdapter } from '../../src/server/modules/source-control/adapters/github';
import { createGitlabAdapter } from '../../src/server/modules/source-control/adapters/gitlab';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const gh = 'https://api.github.com';
const github = createGithubAdapter(gh);

describe('GitHub classic tokens', () => {
  it('grants every permission when the repo scope is present', async () => {
    server.use(
      http.get(`${gh}/user`, () =>
        HttpResponse.json(
          { login: 'octo' },
          { headers: { 'x-oauth-scopes': 'read:org, repo' } },
        ),
      ),
    );
    expect(await github.verifyToken('ghp_valid')).toEqual({
      ok: true,
      accountName: 'octo',
      grantedPermissions: ['read_contents', 'push', 'create_pull_request'],
      missingPermissions: [],
    });
  });

  it('names every missing permission when the repo scope is absent', async () => {
    server.use(
      http.get(`${gh}/user`, () =>
        HttpResponse.json(
          { login: 'octo' },
          { headers: { 'x-oauth-scopes': 'public_repo' } },
        ),
      ),
    );
    const result = await github.verifyToken('ghp_public');
    expect(result).toMatchObject({
      ok: true,
      grantedPermissions: [],
      missingPermissions: ['read_contents', 'push', 'create_pull_request'],
    });
  });

  it('maps a rejected token (401) to invalid', async () => {
    server.use(
      http.get(`${gh}/user`, () =>
        HttpResponse.json({ message: 'Bad credentials' }, { status: 401 }),
      ),
    );
    expect(await github.verifyToken('ghp_bad')).toEqual({
      ok: false,
      failure: 'invalid',
    });
  });

  it('reports a service error as unavailable, not as a bad token', async () => {
    server.use(
      http.get(`${gh}/user`, () => new HttpResponse(null, { status: 503 })),
    );
    expect(await github.verifyToken('ghp_any')).toEqual({
      ok: false,
      failure: 'unavailable',
      status: 503,
    });
  });

  it('reports a network failure as unavailable with no status', async () => {
    server.use(http.get(`${gh}/user`, () => HttpResponse.error()));
    expect(await github.verifyToken('ghp_any')).toEqual({
      ok: false,
      failure: 'unavailable',
    });
  });
});

describe('GitHub fine-grained tokens (permission probe)', () => {
  function fine(opts: { read?: number; write?: number; pr?: number } = {}) {
    server.use(
      http.get(`${gh}/user`, () => HttpResponse.json({ login: 'octo' })),
      http.get(`${gh}/user/repos`, () =>
        HttpResponse.json([
          { full_name: 'octo/hello', permissions: { push: true } },
        ]),
      ),
      http.get(`${gh}/repos/octo/hello/contents`, () =>
        HttpResponse.json({}, { status: opts.read ?? 200 }),
      ),
      http.put(`${gh}/repos/octo/hello/contents/:path`, () =>
        HttpResponse.json({}, { status: opts.write ?? 422 }),
      ),
      http.post(`${gh}/repos/octo/hello/pulls`, () =>
        HttpResponse.json({}, { status: opts.pr ?? 422 }),
      ),
    );
  }

  it('treats an invalid-body answer (422) as permission granted and never writes', async () => {
    fine();
    expect(await github.verifyToken('github_pat_ok')).toEqual({
      ok: true,
      accountName: 'octo',
      grantedPermissions: ['read_contents', 'push', 'create_pull_request'],
      missingPermissions: [],
    });
  });

  it('names contents write when it is denied (403)', async () => {
    fine({ write: 403 });
    expect(await github.verifyToken('github_pat_nowrite')).toMatchObject({
      ok: true,
      missingPermissions: ['push'],
    });
  });

  it('names pull request write when it is denied (403)', async () => {
    fine({ pr: 403 });
    expect(await github.verifyToken('github_pat_nopr')).toMatchObject({
      ok: true,
      missingPermissions: ['create_pull_request'],
    });
  });

  it('reports an unexpected probe answer with its status, not as unreachable', async () => {
    fine({ write: 409 });
    expect(await github.verifyToken('github_pat_odd')).toEqual({
      ok: false,
      failure: 'unavailable',
      status: 409,
    });
  });

  it('names contents read when it is denied', async () => {
    fine({ read: 403 });
    const result = await github.verifyToken('github_pat_noread');
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.missingPermissions).toContain('read_contents');
  });

  it('asks for at least one repository when the token can reach none', async () => {
    server.use(
      http.get(`${gh}/user`, () => HttpResponse.json({ login: 'octo' })),
      http.get(`${gh}/user/repos`, () => HttpResponse.json([])),
    );
    expect(await github.verifyToken('github_pat_norepo')).toMatchObject({
      ok: true,
      grantedPermissions: [],
      missingPermissions: ['read_contents', 'push', 'create_pull_request'],
    });
  });
});

describe('GitLab tokens', () => {
  const base = 'https://gitlab.example.com';
  const gitlab = createGitlabAdapter(base);
  function self(body: Record<string, unknown>, status = 200) {
    server.use(
      http.get(`${base}/api/v4/personal_access_tokens/self`, () =>
        HttpResponse.json(body, { status }),
      ),
      http.get(`${base}/api/v4/user`, () =>
        HttpResponse.json({ username: 'gl-user' }),
      ),
    );
  }

  it('grants everything for the api scope', async () => {
    self({ scopes: ['api'], active: true, revoked: false, expires_at: null });
    expect(await gitlab.verifyToken('glpat-ok')).toEqual({
      ok: true,
      accountName: 'gl-user',
      grantedPermissions: ['read_contents', 'push', 'create_pull_request'],
      missingPermissions: [],
    });
  });

  it('names merge request creation when only repository scopes are granted', async () => {
    self({
      scopes: ['read_repository', 'write_repository'],
      active: true,
      revoked: false,
      expires_at: null,
    });
    expect(await gitlab.verifyToken('glpat-repo')).toMatchObject({
      ok: true,
      grantedPermissions: ['read_contents', 'push'],
      missingPermissions: ['create_pull_request'],
    });
  });

  it('maps 401 to invalid, a revoked token to revoked, and a past expiry to expired', async () => {
    self({}, 401);
    expect(await gitlab.verifyToken('glpat-bad')).toEqual({
      ok: false,
      failure: 'invalid',
    });
    self({ scopes: ['api'], active: false, revoked: true, expires_at: null });
    expect(await gitlab.verifyToken('glpat-revoked')).toEqual({
      ok: false,
      failure: 'revoked',
    });
    self({
      scopes: ['api'],
      active: false,
      revoked: false,
      expires_at: '2020-01-01',
    });
    expect(await gitlab.verifyToken('glpat-expired')).toEqual({
      ok: false,
      failure: 'expired',
    });
  });

  it('reports an unreachable instance as unavailable', async () => {
    server.use(
      http.get(`${base}/api/v4/personal_access_tokens/self`, () =>
        HttpResponse.error(),
      ),
    );
    expect(await gitlab.verifyToken('glpat-any')).toEqual({
      ok: false,
      failure: 'unavailable',
    });
  });
});
