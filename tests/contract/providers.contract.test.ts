import { it, expect } from 'vitest';
import { platformFixture } from '../integration/helpers';
import { validateResponse } from './harness';

const problem = 'application/problem+json';
const models = [
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
];

it('every Claude provider response matches the contract and never contains a credential', async () => {
  const f = await platformFixture();
  const apiKey = 'sk-ant-TESTcontractKeyValue-0001';
  try {
    f.anthropic.setKey(apiKey, { models });
    const created = await f.call('POST', '/api/provider-connections', {
      provider: 'claude',
      authType: 'api_key',
      name: 'contract',
      apiKey,
    });
    expect(created.statusCode).toBe(201);
    validateResponse('/api/provider-connections', 'post', 201, created.json());
    const id = created.json().id as string;

    const list = await f.call('GET', '/api/provider-connections');
    expect(list.statusCode).toBe(200);
    validateResponse('/api/provider-connections', 'get', 200, list.json());

    const renamed = await f.call('PATCH', `/api/provider-connections/${id}`, {
      name: 'contract renamed',
    });
    validateResponse(
      '/api/provider-connections/{id}',
      'patch',
      200,
      renamed.json(),
    );

    f.anthropic.setKey('sk-ant-TESTcontractKeyValue-0002', { models });
    const replaced = await f.call(
      'PUT',
      `/api/provider-connections/${id}/api-key`,
      {
        apiKey: 'sk-ant-TESTcontractKeyValue-0002',
      },
    );
    expect(replaced.statusCode).toBe(200);
    validateResponse(
      '/api/provider-connections/{id}/api-key',
      'put',
      200,
      replaced.json(),
    );

    const checked = await f.call(
      'POST',
      `/api/provider-connections/${id}/check`,
    );
    expect(checked.statusCode).toBe(200);
    validateResponse(
      '/api/provider-connections/{id}/check',
      'post',
      200,
      checked.json(),
    );

    const model = await f.call(
      'POST',
      `/api/provider-connections/${id}/models/claude-sonnet-5-5/check`,
    );
    expect(model.statusCode).toBe(200);
    validateResponse(
      '/api/provider-connections/{id}/models/{model}/check',
      'post',
      200,
      model.json(),
    );

    const impact = await f.call(
      'GET',
      `/api/provider-connections/${id}/impact`,
    );
    validateResponse(
      '/api/provider-connections/{id}/impact',
      'get',
      200,
      impact.json(),
    );

    for (const reply of [
      created,
      list,
      renamed,
      replaced,
      checked,
      model,
      impact,
    ])
      for (const secret of [apiKey, 'sk-ant-TESTcontractKeyValue-0002'])
        expect(reply.body).not.toContain(secret);
    for (const reply of [created, list, replaced])
      expect(JSON.stringify(reply.json())).not.toMatch(/apiKey|Sealed|bundle/i);

    const invalid = await f.call('POST', '/api/provider-connections', {
      provider: 'claude',
      authType: 'api_key',
      name: 'bad',
      apiKey: 'sk-ant-unknown',
    });
    expect(invalid.statusCode).toBe(422);
    validateResponse(
      '/api/provider-connections',
      'post',
      422,
      invalid.json(),
      problem,
    );

    const duplicate = await f.call('POST', '/api/provider-connections', {
      provider: 'claude',
      authType: 'api_key',
      name: 'CONTRACT RENAMED',
      apiKey: 'sk-ant-TESTcontractKeyValue-0002',
    });
    expect(duplicate.statusCode).toBe(409);
    validateResponse(
      '/api/provider-connections',
      'post',
      409,
      duplicate.json(),
      problem,
    );

    f.anthropic.setKey('sk-ant-down', { models, failWith: 503 });
    const down = await f.call('POST', '/api/provider-connections', {
      provider: 'claude',
      authType: 'api_key',
      name: 'down',
      apiKey: 'sk-ant-down',
    });
    expect(down.statusCode).toBe(503);
    validateResponse(
      '/api/provider-connections',
      'post',
      503,
      down.json(),
      problem,
    );

    const missing = await f.call(
      'PUT',
      '/api/provider-connections/nope/api-key',
      {
        apiKey: 'x',
      },
    );
    expect(missing.statusCode).toBe(404);
    validateResponse(
      '/api/provider-connections/{id}/api-key',
      'put',
      404,
      missing.json(),
      problem,
    );
    const badModel = await f.call(
      'POST',
      `/api/provider-connections/${id}/models/not-in-catalog/check`,
    );
    expect(badModel.statusCode).toBe(422);
    validateResponse(
      '/api/provider-connections/{id}/models/{model}/check',
      'post',
      422,
      badModel.json(),
      problem,
    );

    const removed = await f.call('DELETE', `/api/provider-connections/${id}`);
    expect(removed.statusCode).toBe(204);
    validateResponse(
      '/api/provider-connections/{id}',
      'delete',
      204,
      undefined,
    );
    const gone = await f.call('DELETE', `/api/provider-connections/${id}`);
    validateResponse(
      '/api/provider-connections/{id}',
      'delete',
      404,
      gone.json(),
      problem,
    );
  } finally {
    await f.close();
  }
});

it('Codex sandbox endpoints match the contract and never expose a credential', async () => {
  const { createFakeSandboxDriver } =
    await import('../fakes/fake-sandbox-driver');
  const driver = createFakeSandboxDriver();
  const f = await platformFixture({ driver });
  try {
    const started = await f.call('POST', '/api/sandbox-sessions', {
      provider: 'codex',
      name: 'contract codex',
    });
    expect(started.statusCode).toBe(201);
    validateResponse('/api/sandbox-sessions', 'post', 201, started.json());
    const id = started.json().id as string;

    const got = await f.call('GET', `/api/sandbox-sessions/${id}`);
    validateResponse('/api/sandbox-sessions/{id}', 'get', 200, got.json());

    const early = await f.call('POST', `/api/sandbox-sessions/${id}/complete`);
    expect(early.statusCode).toBe(409);
    validateResponse(
      '/api/sandbox-sessions/{id}/complete',
      'post',
      409,
      early.json(),
      problem,
    );

    const cancelled = await f.call('DELETE', `/api/sandbox-sessions/${id}`);
    expect(cancelled.statusCode).toBe(204);
    validateResponse('/api/sandbox-sessions/{id}', 'delete', 204, undefined);

    for (const [method, url, status] of [
      ['GET', '/api/sandbox-sessions/nope', 404],
      ['DELETE', '/api/sandbox-sessions/nope', 404],
      ['POST', '/api/sandbox-sessions/nope/complete', 404],
    ] as const) {
      const reply = await f.call(method, url);
      expect(reply.statusCode).toBe(status);
      validateResponse(
        url.replace('nope', '{id}'),
        method.toLowerCase(),
        status,
        reply.json(),
        problem,
      );
    }
    const unknownField = await f.call('POST', '/api/sandbox-sessions', {
      provider: 'codex',
      name: 'x',
      extra: 1,
    });
    expect(unknownField.statusCode).toBe(422);
    validateResponse(
      '/api/sandbox-sessions',
      'post',
      422,
      unknownField.json(),
      problem,
    );
    const claude = await f.call('POST', '/api/sandbox-sessions', {
      provider: 'claude',
      name: 'x',
    });
    expect(claude.statusCode).toBe(422);
    const missingRelogin = await f.call('POST', '/api/sandbox-sessions', {
      provider: 'codex',
      reloginOf: 'nope',
    });
    expect(missingRelogin.statusCode).toBe(404);
    validateResponse(
      '/api/sandbox-sessions',
      'post',
      404,
      missingRelogin.json(),
      problem,
    );

    driver.failCreate = true;
    const down = await f.call('POST', '/api/sandbox-sessions', {
      provider: 'codex',
      name: 'down',
    });
    expect(down.statusCode).toBe(503);
    validateResponse(
      '/api/sandbox-sessions',
      'post',
      503,
      down.json(),
      problem,
    );
  } finally {
    await f.close();
  }
});
