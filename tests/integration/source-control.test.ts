import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fixture, signedIn, platformFixture } from './helpers';

let f: Awaited<ReturnType<typeof platformFixture>>;
beforeEach(async () => {
  f = await platformFixture();
});
afterEach(async () => {
  await f.close();
});

const classic = (login = 'octo', scopes: string[] = ['repo']) => ({
  login,
  kind: 'classic' as const,
  scopes,
});
const add = (name: string, token: string, extra: object = {}) =>
  f.call('POST', '/api/source-control-connections', {
    name,
    platform: 'github',
    token,
    ...extra,
  });
const rows = () =>
  f.db
    .prepare('SELECT * FROM source_control_connection ORDER BY name')
    .all() as {
    id: string;
    name: string;
    tokenSealed: Buffer;
    tokenLast4: string;
    status: string;
    statusReason: string | null;
    accountName: string;
  }[];
const audit = () =>
  f.db
    .prepare(
      'SELECT action,targetName,detail FROM audit_entry ORDER BY at,rowid',
    )
    .all() as { action: string; targetName: string; detail: string }[];

describe('adding a connection', () => {
  it('verifies a fine-grained token using valid empty JSON permission probes', async () => {
    f.fake.github.setToken('github_pat_valid', {
      login: 'octo',
      kind: 'fine',
      repos: [{ id: 1, fullName: 'octo/hello', defaultBranch: 'main' }],
    });
    const reply = await add('fine-grained', 'github_pat_valid');
    expect(reply.statusCode).toBe(201);
    expect(reply.json().grantedPermissions).toEqual([
      'read_contents',
      'push',
      'create_pull_request',
    ]);
  });
  it('seals the token, shows only its last 4 characters and records an audit entry', async () => {
    const token = 'ghp_integrationTokenValue0042';
    f.fake.github.setToken(token, classic());
    const reply = await add('work', token);
    expect(reply.statusCode).toBe(201);
    const body = reply.json();
    expect(body).toMatchObject({
      name: 'work',
      platform: 'github',
      accountName: 'octo',
      tokenLast4: '0042',
      status: 'connected',
      statusReason: null,
      missingPermissions: [],
    });
    expect(body.grantedPermissions).toEqual([
      'read_contents',
      'push',
      'create_pull_request',
    ]);
    expect(reply.body).not.toContain(token);
    const [row] = rows();
    expect(row?.tokenSealed.toString('latin1')).not.toContain(token);
    expect(audit()).toEqual([
      {
        action: 'scc.added',
        targetName: 'work',
        detail: '{"platform":"github"}',
      },
    ]);
  });

  it('rejects a token missing permissions, names each one, and stores nothing', async () => {
    f.fake.github.setToken('ghp_publicOnly', classic('octo', ['public_repo']));
    const reply = await add('limited', 'ghp_publicOnly');
    expect(reply.statusCode).toBe(422);
    expect(reply.json()).toMatchObject({
      code: 'token_missing_permissions',
      details: {
        missingPermissions: ['read_contents', 'push', 'create_pull_request'],
      },
    });
    expect(reply.json().message).toMatch(/Push branches/);
    expect(reply.json().message).toMatch(/Create pull\/merge requests/);

    f.fake.github.setToken('github_pat_nowrite', {
      login: 'octo',
      kind: 'fine',
      contentsWrite: false,
      repos: [{ id: 1, fullName: 'octo/hello', defaultBranch: 'main' }],
    });
    const fine = await add('fine', 'github_pat_nowrite');
    expect(fine.statusCode).toBe(422);
    expect(fine.json().details.missingPermissions).toEqual(['push']);
    expect(rows()).toHaveLength(0);
    expect(audit()).toHaveLength(0);
  });

  it('rejects an unknown or revoked token as token_invalid and stores nothing', async () => {
    f.fake.github.setToken('ghp_revoked', { ...classic(), revoked: true });
    for (const token of ['ghp_neverSeen', 'ghp_revoked']) {
      const reply = await add('x', token);
      expect(reply.statusCode).toBe(422);
      expect(reply.json().code).toBe('token_invalid');
    }
    expect(rows()).toHaveLength(0);
  });

  it('answers 503 provider_unavailable, storing nothing, when the platform is down', async () => {
    f.fake.github.setToken('ghp_down', { ...classic(), failWith: 503 });
    const reply = await add('down', 'ghp_down');
    expect(reply.statusCode).toBe(503);
    expect(reply.json().code).toBe('provider_unavailable');
    expect(rows()).toHaveLength(0);
  });

  it('requires a name of 1–80 characters, unique ignoring case', async () => {
    f.fake.github.setToken('ghp_ok', classic());
    for (const name of ['', '   ', 'x'.repeat(81)]) {
      const reply = await add(name, 'ghp_ok');
      expect(reply.statusCode, JSON.stringify(name)).toBe(422);
      expect(reply.json().code).toBe('invalid_input');
    }
    expect((await add('x'.repeat(80), 'ghp_ok')).statusCode).toBe(201);
    expect((await add('Work', 'ghp_ok')).statusCode).toBe(201);
    const duplicate = await add('work', 'ghp_ok');
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().code).toBe('conflict');
  });

  it('rejects unknown fields, a missing token and an unknown platform', async () => {
    f.fake.github.setToken('ghp_ok', classic());
    for (const payload of [
      { name: 'a', platform: 'github', token: 'ghp_ok', admin: true },
      { name: 'a', platform: 'github' },
      { name: 'a', platform: 'bitbucket', token: 'ghp_ok' },
      { name: 'a', platform: 'github', token: '' },
    ]) {
      const reply = await f.call(
        'POST',
        '/api/source-control-connections',
        payload,
      );
      expect(reply.statusCode, JSON.stringify(payload)).toBe(422);
    }
    expect(rows()).toHaveLength(0);
  });
});

describe('GitLab instances', () => {
  const gitlab = (extra: object = {}) =>
    f.call('POST', '/api/source-control-connections', {
      name: 'gl',
      platform: 'gitlab',
      token: 'glpat-ok',
      baseUrl: f.fake.gitlabBaseUrl,
      ...extra,
    });

  it('accepts a self-hosted address and shows the account', async () => {
    f.fake.gitlab.setToken('glpat-ok', {
      username: 'gl-user',
      scopes: ['api'],
    });
    const reply = await gitlab();
    expect(reply.statusCode).toBe(201);
    expect(reply.json()).toMatchObject({
      platform: 'gitlab',
      accountName: 'gl-user',
      baseUrl: f.fake.gitlabBaseUrl,
      tokenLast4: 't-ok',
    });
  });

  it('refuses addresses that are not https (loopback http only in test mode)', async () => {
    f.fake.gitlab.setToken('glpat-ok', {
      username: 'gl-user',
      scopes: ['api'],
    });
    for (const baseUrl of [
      'http://gitlab.example.com',
      'ftp://gitlab.example.com',
      'not a url',
      'https://user:pass@gitlab.example.com',
    ]) {
      const reply = await gitlab({ baseUrl });
      expect(reply.statusCode, baseUrl).toBe(422);
      expect(reply.json().code).toBe('invalid_input');
    }
  });

  it('refuses even loopback http outside test mode', async () => {
    const live = await fixture(false, undefined, undefined, {
      env: { STAPLR_TEST_MODE: '0' },
    });
    try {
      const cookie = await signedIn(live);
      const reply = await live.app.inject({
        method: 'POST',
        url: '/api/source-control-connections',
        headers: { origin: live.config.publicUrl },
        cookies: { staplr_session: cookie },
        payload: {
          name: 'gl',
          platform: 'gitlab',
          token: 'glpat-ok',
          baseUrl: 'http://127.0.0.1:9',
        },
      });
      expect(reply.statusCode).toBe(422);
    } finally {
      await live.app.close();
      live.db.close();
    }
  });
});

describe('listing, replacing, renaming and removing', () => {
  it('lists connections by name and never returns a token', async () => {
    f.fake.github.setToken('ghp_aaaa1111', classic('a'));
    f.fake.github.setToken('ghp_bbbb2222', classic('b'));
    await add('beta', 'ghp_bbbb2222');
    await add('alpha', 'ghp_aaaa1111');
    const reply = await f.call('GET', '/api/source-control-connections');
    expect(reply.json().map((c: { name: string }) => c.name)).toEqual([
      'alpha',
      'beta',
    ]);
    expect(reply.body).not.toContain('ghp_');
  });

  it('replaces the token after validating it and keeps the old one when rejected', async () => {
    f.fake.github.setToken('ghp_old11111', classic('old-account'));
    f.fake.github.setToken('ghp_new22222', classic('new-account'));
    const id = (await add('work', 'ghp_old11111')).json().id as string;

    const rejected = await f.call(
      'PATCH',
      `/api/source-control-connections/${id}`,
      {
        token: 'ghp_unknownToken',
      },
    );
    expect(rejected.statusCode).toBe(422);
    expect(rows()[0]).toMatchObject({
      tokenLast4: '1111',
      accountName: 'old-account',
    });

    const replaced = await f.call(
      'PATCH',
      `/api/source-control-connections/${id}`,
      {
        token: 'ghp_new22222',
      },
    );
    expect(replaced.statusCode).toBe(200);
    expect(replaced.json()).toMatchObject({
      tokenLast4: '2222',
      accountName: 'new-account',
    });
    expect(audit().map((a) => a.action)).toEqual(['scc.added', 'scc.replaced']);
    expect(replaced.body).not.toContain('ghp_new22222');
  });

  it('renames without an audit entry and refuses a duplicate or empty change', async () => {
    f.fake.github.setToken('ghp_one11111', classic('one'));
    f.fake.github.setToken('ghp_two22222', classic('two'));
    const one = (await add('one', 'ghp_one11111')).json().id as string;
    await add('two', 'ghp_two22222');
    const renamed = await f.call(
      'PATCH',
      `/api/source-control-connections/${one}`,
      {
        name: 'uno',
      },
    );
    expect(renamed.statusCode).toBe(200);
    expect(audit().map((a) => a.action)).toEqual(['scc.added', 'scc.added']);
    expect(
      (
        await f.call('PATCH', `/api/source-control-connections/${one}`, {
          name: 'TWO',
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await f.call('PATCH', `/api/source-control-connections/${one}`, {}))
        .statusCode,
    ).toBe(422);
  });

  it('removes a connection with an audit entry, then answers 404', async () => {
    f.fake.github.setToken('ghp_gone1111', classic());
    const id = (await add('work', 'ghp_gone1111')).json().id as string;
    expect(
      (await f.call('DELETE', `/api/source-control-connections/${id}`))
        .statusCode,
    ).toBe(204);
    expect(rows()).toHaveLength(0);
    expect(audit().map((a) => a.action)).toEqual(['scc.added', 'scc.removed']);
    expect(
      (await f.call('DELETE', `/api/source-control-connections/${id}`))
        .statusCode,
    ).toBe(404);
  });
});

describe('checking connections', () => {
  it('Check now marks a revoked token needs_attention/revoked, then recovers', async () => {
    f.fake.github.setToken('ghp_check1111', classic());
    const id = (await add('work', 'ghp_check1111')).json().id as string;
    f.advance(60_000);
    f.fake.github.setToken('ghp_check1111', { ...classic(), revoked: true });
    const revoked = await f.call(
      'POST',
      `/api/source-control-connections/${id}/check`,
    );
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json()).toMatchObject({
      status: 'needs_attention',
      statusReason: 'revoked',
      lastCheckedAt: '2026-11-08T00:01:00.000Z',
    });
    expect(revoked.json().lastCheckResult).toMatch(/revoked/i);

    f.advance(60_000);
    f.fake.github.setToken('ghp_check1111', classic());
    const back = await f.call(
      'POST',
      `/api/source-control-connections/${id}/check`,
    );
    expect(back.json()).toMatchObject({
      status: 'connected',
      statusReason: null,
      lastCheckedAt: '2026-11-08T00:02:00.000Z',
    });
  });

  it('lists a permission that was later removed', async () => {
    f.fake.github.setToken('ghp_perm1111', classic());
    const id = (await add('work', 'ghp_perm1111')).json().id as string;
    f.fake.github.setToken('ghp_perm1111', classic('octo', ['public_repo']));
    const reply = await f.call(
      'POST',
      `/api/source-control-connections/${id}/check`,
    );
    expect(reply.json()).toMatchObject({
      status: 'needs_attention',
      statusReason: 'missing_permission',
    });
    expect(reply.json().missingPermissions).toContain('push');
  });

  it('keeps the confirmed status and explains the retry when the platform is unreachable', async () => {
    f.fake.github.setToken('ghp_flaky111', classic());
    const id = (await add('work', 'ghp_flaky111')).json().id as string;
    f.advance(120_000);
    f.fake.github.setToken('ghp_flaky111', { ...classic(), failWith: 503 });
    const reply = await f.call(
      'POST',
      `/api/source-control-connections/${id}/check`,
    );
    expect(reply.statusCode).toBe(200);
    expect(reply.json()).toMatchObject({
      status: 'connected',
      lastCheckedAt: '2026-11-08T00:02:00.000Z',
    });
    expect(reply.json().lastCheckResult).toMatch(/could not reach/i);
  });

  it('check-all answers 202 and re-checks every connection', async () => {
    f.fake.github.setToken('ghp_all11111', classic());
    f.fake.github.setToken('ghp_all22222', classic('two'));
    await add('one', 'ghp_all11111');
    await add('two', 'ghp_all22222');
    f.advance(600_000);
    f.fake.github.setToken('ghp_all22222', {
      ...classic('two'),
      revoked: true,
    });
    const reply = await f.call('POST', '/api/health/check-all');
    expect(reply.statusCode).toBe(202);
    await f.scheduler.runAll();
    const list = (
      await f.call('GET', '/api/source-control-connections')
    ).json() as {
      name: string;
      status: string;
      lastCheckedAt: string;
    }[];
    expect(list.map((c) => [c.name, c.status])).toEqual([
      ['one', 'connected'],
      ['two', 'needs_attention'],
    ]);
    for (const c of list)
      expect(c.lastCheckedAt).toBe('2026-11-08T00:10:00.000Z');
  });

  it('runs the same check when the scheduler starts', async () => {
    f.fake.github.setToken('ghp_start1111', classic());
    await add('work', 'ghp_start1111');
    f.advance(3_600_000);
    f.fake.github.setToken('ghp_start1111', { ...classic(), revoked: true });
    await f.scheduler.runAll();
    expect(rows()[0]).toMatchObject({
      status: 'needs_attention',
      statusReason: 'revoked',
    });
  });
});
