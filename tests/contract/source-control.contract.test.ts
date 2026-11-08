import { it, expect } from 'vitest';
import { platformFixture } from '../integration/helpers';
import { validateResponse } from './harness';

const problem = 'application/problem+json';

it('every source control response matches the contract and never contains a token', async () => {
  const f = await platformFixture();
  const token = 'ghp_contractTokenValue0001';
  try {
    f.fake.github.setToken(token, {
      login: 'octo',
      kind: 'classic',
      scopes: ['repo'],
    });
    const created = await f.call('POST', '/api/source-control-connections', {
      name: 'work',
      platform: 'github',
      token,
    });
    expect(created.statusCode).toBe(201);
    validateResponse(
      '/api/source-control-connections',
      'post',
      201,
      created.json(),
    );
    const id = created.json().id as string;
    for (const reply of [created]) {
      expect(reply.body).not.toContain(token);
      expect(reply.json()).not.toHaveProperty('token');
      expect(reply.json()).not.toHaveProperty('tokenSealed');
    }

    const list = await f.call('GET', '/api/source-control-connections');
    expect(list.statusCode).toBe(200);
    validateResponse(
      '/api/source-control-connections',
      'get',
      200,
      list.json(),
    );
    expect(list.body).not.toContain(token);

    const renamed = await f.call(
      'PATCH',
      `/api/source-control-connections/${id}`,
      {
        name: 'work renamed',
      },
    );
    expect(renamed.statusCode).toBe(200);
    validateResponse(
      '/api/source-control-connections/{id}',
      'patch',
      200,
      renamed.json(),
    );

    const checked = await f.call(
      'POST',
      `/api/source-control-connections/${id}/check`,
    );
    expect(checked.statusCode).toBe(200);
    validateResponse(
      '/api/source-control-connections/{id}/check',
      'post',
      200,
      checked.json(),
    );

    const all = await f.call('POST', '/api/health/check-all');
    expect(all.statusCode).toBe(202);
    validateResponse('/api/health/check-all', 'post', 202, undefined);

    const invalid = await f.call('POST', '/api/source-control-connections', {
      name: 'bad',
      platform: 'github',
      token: 'ghp_unknown',
    });
    expect(invalid.statusCode).toBe(422);
    validateResponse(
      '/api/source-control-connections',
      'post',
      422,
      invalid.json(),
      problem,
    );

    const duplicate = await f.call('POST', '/api/source-control-connections', {
      name: 'WORK RENAMED',
      platform: 'github',
      token,
    });
    expect(duplicate.statusCode).toBe(409);
    validateResponse(
      '/api/source-control-connections',
      'post',
      409,
      duplicate.json(),
      problem,
    );

    f.fake.github.setToken('ghp_down', {
      login: 'x',
      kind: 'classic',
      failWith: 503,
    });
    const down = await f.call('POST', '/api/source-control-connections', {
      name: 'down',
      platform: 'github',
      token: 'ghp_down',
    });
    expect(down.statusCode).toBe(503);
    validateResponse(
      '/api/source-control-connections',
      'post',
      503,
      down.json(),
      problem,
    );

    const missing = await f.call(
      'PATCH',
      '/api/source-control-connections/nope',
      {
        name: 'x',
      },
    );
    expect(missing.statusCode).toBe(404);
    validateResponse(
      '/api/source-control-connections/{id}',
      'patch',
      404,
      missing.json(),
      problem,
    );

    const removed = await f.call(
      'DELETE',
      `/api/source-control-connections/${id}`,
    );
    expect(removed.statusCode).toBe(204);
    validateResponse(
      '/api/source-control-connections/{id}',
      'delete',
      204,
      undefined,
    );
    const gone = await f.call(
      'DELETE',
      `/api/source-control-connections/${id}`,
    );
    expect(gone.statusCode).toBe(404);
    validateResponse(
      '/api/source-control-connections/{id}',
      'delete',
      404,
      gone.json(),
      problem,
    );
  } finally {
    await f.close();
  }
});
