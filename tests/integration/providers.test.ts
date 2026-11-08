import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { platformFixture } from './helpers';
import { catalogRevision } from '../../src/server/modules/prices/catalog';

let f: Awaited<ReturnType<typeof platformFixture>>;
beforeEach(async () => {
  f = await platformFixture();
});
afterEach(async () => {
  await f.close();
});

const catalogModels = [
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
];
const key = (suffix: string) => `sk-ant-TESTintegrationKey-${suffix}`;
const create = (name: string, apiKey: string, extra: object = {}) =>
  f.call('POST', '/api/provider-connections', {
    provider: 'claude',
    authType: 'api_key',
    name,
    apiKey,
    ...extra,
  });
interface Row {
  id: string;
  name: string;
  status: string;
  credentialRevision: number;
  apiKeySealed: Buffer | null;
  lastCheckResult: string | null;
  lastCheckedAt: string | null;
}
const rows = () =>
  f.db
    .prepare('SELECT * FROM provider_connection ORDER BY name')
    .all() as Row[];
const access = (id: string) =>
  f.db
    .prepare(
      'SELECT model,availability,credentialRevision,catalogRevision,lastVerifiedAt,lastAttemptAt,checkError FROM model_access WHERE providerConnectionId=? ORDER BY model',
    )
    .all(id) as {
    model: string;
    availability: string;
    credentialRevision: number;
    catalogRevision: string;
    lastVerifiedAt: string | null;
    lastAttemptAt: string | null;
    checkError: string | null;
  }[];
const audit = () =>
  f.db
    .prepare('SELECT action,targetName,detail FROM audit_entry ORDER BY rowid')
    .all() as { action: string; targetName: string; detail: string }[];

describe('adding a Claude connection with an owner API key', () => {
  it('verifies the key through every page, seals it, and records per-model evidence', async () => {
    const apiKey = key('0001');
    f.anthropic.setKey(apiKey, {
      models: [...catalogModels, 'claude-not-in-catalog'],
      pageSize: 2,
    });
    const reply = await create('My Claude key', apiKey);
    expect(reply.statusCode).toBe(201);
    expect(reply.json()).toMatchObject({
      provider: 'claude',
      authType: 'api_key',
      name: 'My Claude key',
      status: 'connected',
      credentialRevision: 1,
      credentialExpiresAt: null,
    });
    expect(reply.body).not.toContain(apiKey);
    expect(reply.json()).not.toHaveProperty('apiKey');
    expect(reply.json()).not.toHaveProperty('apiKeySealed');
    // 5 models, 2 per page: three pages were read, none skipped
    expect(f.anthropic.pages).toEqual([
      '',
      'claude-opus-5-5',
      'claude-haiku-5-5',
    ]);

    const [row] = rows();
    expect(row?.apiKeySealed?.toString('latin1')).not.toContain(apiKey);
    const evidence = access(reply.json().id);
    expect(evidence.map((e) => e.model)).toEqual([...catalogModels].sort());
    for (const e of evidence)
      expect(e).toMatchObject({
        availability: 'available',
        credentialRevision: 1,
        catalogRevision: catalogRevision(),
        checkError: null,
      });
    expect(evidence[0]?.lastVerifiedAt).toBe('2026-11-08T00:00:00.000Z');
    expect(audit()).toEqual([
      {
        action: 'provider.added',
        targetName: 'My Claude key',
        detail: '{"provider":"claude"}',
      },
    ]);
  });

  it('keeps models one key cannot see unavailable, isolated from other connections', async () => {
    f.anthropic.setKey(key('narrow'), { models: ['claude-sonnet-5-5'] });
    f.anthropic.setKey(key('wide'), { models: catalogModels });
    const narrow = (await create('narrow', key('narrow'))).json().id as string;
    const wide = (await create('wide', key('wide'))).json().id as string;
    const byModel = (id: string) =>
      Object.fromEntries(access(id).map((e) => [e.model, e.availability]));
    expect(byModel(narrow)).toEqual({
      'claude-fable-5-1': 'unavailable',
      'claude-haiku-5-5': 'unavailable',
      'claude-opus-5-5': 'unavailable',
      'claude-sonnet-5-5': 'available',
    });
    expect(Object.values(byModel(wide))).toEqual(Array(4).fill('available'));
  });

  it('rejects a bad key or an unreachable service and saves nothing', async () => {
    f.anthropic.setKey(key('rejected'), { models: [], reject: true });
    for (const apiKey of [key('neverSeen'), key('rejected')]) {
      const reply = await create('x', apiKey);
      expect(reply.statusCode).toBe(422);
      expect(reply.json().code).toBe('api_key_invalid');
      expect(reply.body).not.toContain(apiKey);
    }
    for (const failWith of [429, 503]) {
      f.anthropic.setKey(key(`down${failWith}`), { models: [], failWith });
      const reply = await create('x', key(`down${failWith}`));
      expect(reply.statusCode, String(failWith)).toBe(503);
      expect(reply.json().code).toBe('provider_unavailable');
    }
    expect(rows()).toHaveLength(0);
    expect(f.db.prepare('SELECT * FROM model_access').all()).toHaveLength(0);
    expect(audit()).toHaveLength(0);
  });

  it('validates the request and refuses Codex, which connects through a sandbox login', async () => {
    f.anthropic.setKey(key('ok'), { models: catalogModels });
    for (const name of ['', '   ', 'x'.repeat(81)])
      expect(
        (await create(name, key('ok'))).statusCode,
        JSON.stringify(name),
      ).toBe(422);
    for (const payload of [
      {
        provider: 'claude',
        authType: 'api_key',
        name: 'a',
        apiKey: key('ok'),
        extra: 1,
      },
      { provider: 'claude', authType: 'api_key', name: 'a' },
      {
        provider: 'claude',
        authType: 'codex_login',
        name: 'a',
        apiKey: key('ok'),
      },
      { provider: 'claude', authType: 'api_key', name: 'a', apiKey: '' },
    ])
      expect(
        (await f.call('POST', '/api/provider-connections', payload)).statusCode,
        JSON.stringify(payload),
      ).toBe(422);
    const codex = await f.call('POST', '/api/provider-connections', {
      provider: 'codex',
      authType: 'api_key',
      name: 'codex',
      apiKey: 'x',
    });
    expect(codex.statusCode).toBe(422);
    expect(codex.json().code).toBe('unsupported_provider');
    expect(rows()).toHaveLength(0);
  });

  it('keeps names unique per provider ignoring case, even for simultaneous requests', async () => {
    f.anthropic.setKey(key('ok'), { models: catalogModels });
    const [a, b] = await Promise.all([
      create('Same Name', key('ok')),
      create('same name', key('ok')),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    expect(rows()).toHaveLength(1);
    const clash = await create('SAME NAME', key('ok'));
    expect(clash.statusCode).toBe(409);
    expect(clash.json().code).toBe('conflict');
  });
});

describe('replacing a key', () => {
  it('replaces in place, bumps the revision and resets evidence to the new key', async () => {
    f.anthropic.setKey(key('old'), { models: catalogModels });
    f.anthropic.setKey(key('new'), { models: ['claude-opus-5-5'] });
    const id = (await create('work', key('old'))).json().id as string;
    f.advance(120_000);
    const reply = await f.call(
      'PUT',
      `/api/provider-connections/${id}/api-key`,
      {
        apiKey: key('new'),
      },
    );
    expect(reply.statusCode).toBe(200);
    expect(reply.json()).toMatchObject({
      id,
      credentialRevision: 2,
      status: 'connected',
    });
    expect(reply.body).not.toContain(key('new'));
    const evidence = access(id);
    expect(evidence.every((e) => e.credentialRevision === 2)).toBe(true);
    expect(
      evidence
        .filter((e) => e.availability === 'available')
        .map((e) => e.model),
    ).toEqual(['claude-opus-5-5']);
    expect(evidence[0]?.lastVerifiedAt).toBe('2026-11-08T00:02:00.000Z');
    expect(audit().map((a) => a.action)).toEqual([
      'provider.added',
      'provider.replaced',
    ]);
  });

  it('keeps the old key, revision and evidence when the new key is rejected or the service is down', async () => {
    f.anthropic.setKey(key('old'), { models: catalogModels });
    const id = (await create('work', key('old'))).json().id as string;
    const before = rows()[0];
    const evidenceBefore = JSON.stringify(access(id));
    for (const [candidate, status] of [
      [key('neverSeen'), 422],
      [key('down'), 503],
    ] as const) {
      if (status === 503)
        f.anthropic.setKey(candidate, { models: [], failWith: 503 });
      const reply = await f.call(
        'PUT',
        `/api/provider-connections/${id}/api-key`,
        {
          apiKey: candidate,
        },
      );
      expect(reply.statusCode).toBe(status);
    }
    const after = rows()[0];
    expect(after?.credentialRevision).toBe(1);
    expect(
      after?.apiKeySealed?.equals(before?.apiKeySealed ?? Buffer.alloc(0)),
    ).toBe(true);
    expect(JSON.stringify(access(id))).toBe(evidenceBefore);
    expect(audit().map((a) => a.action)).toEqual(['provider.added']);
    expect(
      (
        await f.call('PUT', '/api/provider-connections/nope/api-key', {
          apiKey: key('old'),
        })
      ).statusCode,
    ).toBe(404);
  });
});

describe('renaming, disconnecting and impact', () => {
  it('renames with the same uniqueness rule and no audit entry', async () => {
    f.anthropic.setKey(key('ok'), { models: catalogModels });
    const one = (await create('one', key('ok'))).json().id as string;
    await create('two', key('ok'));
    expect(
      (
        await f.call('PATCH', `/api/provider-connections/${one}`, {
          name: 'uno',
        })
      ).json().name,
    ).toBe('uno');
    expect(
      (
        await f.call('PATCH', `/api/provider-connections/${one}`, {
          name: 'TWO',
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await f.call('PATCH', `/api/provider-connections/${one}`, { name: '' }))
        .statusCode,
    ).toBe(422);
    expect(
      (await f.call('PATCH', '/api/provider-connections/nope', { name: 'x' }))
        .statusCode,
    ).toBe(404);
    expect(audit().map((a) => a.action)).toEqual([
      'provider.added',
      'provider.added',
    ]);
  });

  it('disconnects: deletes the key and evidence, audits, and impact comes from registered sources', async () => {
    f.anthropic.setKey(key('ok'), { models: catalogModels });
    const id = (await create('work', key('ok'))).json().id as string;
    expect(
      (await f.call('GET', `/api/provider-connections/${id}/impact`)).json(),
    ).toEqual({
      agents: [],
      projects: [],
    });
    f.impactRegistry.registerImpactSource(() => ({
      agents: [{ id: 'a1', name: 'Dev agent' }],
      projects: [],
    }));
    f.impactRegistry.registerImpactSource(() => ({
      agents: [],
      projects: [{ id: 'p1', name: 'Shop' }],
    }));
    expect(
      (await f.call('GET', `/api/provider-connections/${id}/impact`)).json(),
    ).toEqual({
      agents: [{ id: 'a1', name: 'Dev agent' }],
      projects: [{ id: 'p1', name: 'Shop' }],
    });
    expect(
      (await f.call('DELETE', `/api/provider-connections/${id}`)).statusCode,
    ).toBe(204);
    expect(rows()).toHaveLength(0);
    expect(access(id)).toHaveLength(0);
    expect(audit().map((a) => a.action)).toEqual([
      'provider.added',
      'provider.removed',
    ]);
    expect(
      (await f.call('DELETE', `/api/provider-connections/${id}`)).statusCode,
    ).toBe(404);
    expect(
      (await f.call('GET', `/api/provider-connections/${id}/impact`))
        .statusCode,
    ).toBe(404);
  });
});

describe('checking authentication and model access', () => {
  it('a rejected key sets needs_relogin; an outage keeps the confirmed status; recovery refreshes evidence', async () => {
    f.anthropic.setKey(key('ok'), { models: catalogModels });
    const id = (await create('work', key('ok'))).json().id as string;

    f.advance(60_000);
    f.anthropic.setKey(key('ok'), { models: catalogModels, failWith: 503 });
    const outage = await f.call(
      'POST',
      `/api/provider-connections/${id}/check`,
    );
    expect(outage.statusCode).toBe(200);
    expect(outage.json()).toMatchObject({
      status: 'connected',
      lastCheckedAt: '2026-11-08T00:01:00.000Z',
    });
    expect(outage.json().lastCheckResult).toMatch(/could not reach/i);
    expect(access(id).every((e) => e.availability === 'available')).toBe(true);
    expect(access(id)[0]?.lastVerifiedAt).toBe('2026-11-08T00:00:00.000Z');
    expect(access(id)[0]?.lastAttemptAt).toBe('2026-11-08T00:01:00.000Z');

    f.advance(60_000);
    f.anthropic.setKey(key('ok'), { models: catalogModels, reject: true });
    const rejected = await f.call(
      'POST',
      `/api/provider-connections/${id}/check`,
    );
    expect(rejected.json()).toMatchObject({ status: 'needs_relogin' });
    expect(rejected.json().lastCheckResult).toMatch(/replace the api key/i);

    f.advance(60_000);
    f.anthropic.setKey(key('ok'), { models: ['claude-haiku-5-5'] });
    const recovered = await f.call(
      'POST',
      `/api/provider-connections/${id}/check`,
    );
    expect(recovered.json()).toMatchObject({
      status: 'connected',
      lastCheckedAt: '2026-11-08T00:03:00.000Z',
    });
    expect(
      access(id)
        .filter((e) => e.availability === 'available')
        .map((e) => e.model),
    ).toEqual(['claude-haiku-5-5']);
  });

  it('the hourly run checks Claude connections too', async () => {
    f.anthropic.setKey(key('ok'), { models: catalogModels });
    const id = (await create('work', key('ok'))).json().id as string;
    f.advance(3_600_000);
    f.anthropic.setKey(key('ok'), { models: [], reject: true });
    await f.scheduler.runAll();
    expect(rows().find((r) => r.id === id)?.status).toBe('needs_relogin');
  });

  it('checks one exact model: denial changes only that pair, an auth rejection is not a denial', async () => {
    f.anthropic.setKey(key('ok'), { models: catalogModels });
    const id = (await create('work', key('ok'))).json().id as string;
    f.advance(60_000);
    f.anthropic.setKey(key('ok'), {
      models: catalogModels.filter((m) => m !== 'claude-opus-5-5'),
    });
    const denied = await f.call(
      'POST',
      `/api/provider-connections/${id}/models/claude-opus-5-5/check`,
    );
    expect(denied.statusCode).toBe(200);
    expect(denied.json()).toMatchObject({
      providerConnectionId: id,
      id: 'claude-opus-5-5',
      availability: 'unavailable',
      credentialRevision: 1,
      catalogRevision: catalogRevision(),
      lastVerifiedAt: '2026-11-08T00:01:00.000Z',
      checkError: null,
    });
    expect(rows()[0]?.status).toBe('connected');

    f.advance(60_000);
    f.anthropic.setKey(key('ok'), { models: [], reject: true });
    const rejected = await f.call(
      'POST',
      `/api/provider-connections/${id}/models/claude-sonnet-5-5/check`,
    );
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json()).toMatchObject({
      availability: 'available',
      checkError: 'authentication_rejected',
    });
    expect(rows()[0]?.status).toBe('needs_relogin');

    expect(
      (
        await f.call(
          'POST',
          `/api/provider-connections/${id}/models/not-in-catalog/check`,
        )
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await f.call(
          'POST',
          '/api/provider-connections/nope/models/claude-opus-5-5/check',
        )
      ).statusCode,
    ).toBe(404);
  });

  it('treats evidence from an older credential or catalog revision as unknown', async () => {
    f.anthropic.setKey(key('ok'), { models: catalogModels });
    const id = (await create('work', key('ok'))).json().id as string;
    const providers = f.app.providers;
    expect(
      providers
        .listModelAccess(id)
        .every((m) => m.availability === 'available'),
    ).toBe(true);
    f.db
      .prepare(
        "UPDATE model_access SET catalogRevision='older' WHERE model='claude-opus-5-5'",
      )
      .run();
    f.db
      .prepare('UPDATE provider_connection SET credentialRevision=2 WHERE id=?')
      .run(id);
    const now = providers.listModelAccess(id);
    expect(now.every((m) => m.availability === 'unknown')).toBe(true);
    expect(now.every((m) => m.credentialRevision === 2)).toBe(true);
    expect(now.every((m) => m.catalogRevision === catalogRevision())).toBe(
      true,
    );
  });
});
