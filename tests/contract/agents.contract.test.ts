import { it, expect } from 'vitest';
import { platformFixture } from '../integration/helpers';
import { validateResponse } from './harness';

const problem = 'application/problem+json';
const models = ['claude-sonnet-5-5', 'claude-haiku-5-5'];

it('every agent and model response matches the contract', async () => {
  const f = await platformFixture();
  try {
    f.anthropic.setKey('sk-ant-contract-agent', { models });
    const connection = (
      await f.call('POST', '/api/provider-connections', {
        provider: 'claude',
        authType: 'api_key',
        name: 'contract',
        apiKey: 'sk-ant-contract-agent',
      })
    ).json().id as string;
    const soulId = (
      (await f.call('GET', '/api/souls')).json() as {
        id: string;
        roleType: string;
        isDefault: boolean;
      }[]
    ).find((s) => s.isDefault && s.roleType === 'developer')?.id as string;

    const catalog = await f.call(
      'GET',
      `/api/models?providerConnectionId=${connection}`,
    );
    expect(catalog.statusCode).toBe(200);
    validateResponse('/api/models', 'get', 200, catalog.json());
    const missingConnection = await f.call(
      'GET',
      '/api/models?providerConnectionId=nope',
    );
    expect(missingConnection.statusCode).toBe(404);
    validateResponse(
      '/api/models',
      'get',
      404,
      missingConnection.json(),
      problem,
    );
    const noParam = await f.call('GET', '/api/models');
    expect(noParam.statusCode).toBe(422);
    validateResponse('/api/models', 'get', 422, noParam.json(), problem);

    const input = {
      name: 'Contract agent',
      soulId,
      provider: 'claude',
      providerConnectionId: connection,
      model: 'claude-sonnet-5-5',
    };
    const created = await f.call('POST', '/api/agents', input);
    expect(created.statusCode).toBe(201);
    validateResponse('/api/agents', 'post', 201, created.json());
    const id = created.json().id as string;

    const list = await f.call('GET', '/api/agents');
    validateResponse('/api/agents', 'get', 200, list.json());
    const got = await f.call('GET', `/api/agents/${id}`);
    validateResponse('/api/agents/{id}', 'get', 200, got.json());
    const updated = await f.call('PUT', `/api/agents/${id}`, {
      ...input,
      model: 'claude-haiku-5-5',
    });
    expect(updated.statusCode).toBe(200);
    validateResponse('/api/agents/{id}', 'put', 200, updated.json());

    const duplicate = await f.call('POST', '/api/agents', input);
    expect(duplicate.statusCode).toBe(409);
    validateResponse('/api/agents', 'post', 409, duplicate.json(), problem);
    const unavailable = await f.call('POST', '/api/agents', {
      ...input,
      name: 'other',
      model: 'claude-made-up',
    });
    expect(unavailable.statusCode).toBe(422);
    validateResponse('/api/agents', 'post', 422, unavailable.json(), problem);
    const missing = await f.call('GET', '/api/agents/nope');
    expect(missing.statusCode).toBe(404);
    validateResponse('/api/agents/{id}', 'get', 404, missing.json(), problem);
    const putMissing = await f.call('PUT', '/api/agents/nope', input);
    expect(putMissing.statusCode).toBe(404);
    validateResponse(
      '/api/agents/{id}',
      'put',
      404,
      putMissing.json(),
      problem,
    );
    const putInvalid = await f.call('PUT', `/api/agents/${id}`, {
      ...input,
      model: 'claude-made-up',
    });
    expect(putInvalid.statusCode).toBe(422);
    validateResponse(
      '/api/agents/{id}',
      'put',
      422,
      putInvalid.json(),
      problem,
    );

    const removed = await f.call('DELETE', `/api/agents/${id}`);
    expect(removed.statusCode).toBe(204);
    validateResponse('/api/agents/{id}', 'delete', 204, undefined);
    const deleteMissing = await f.call('DELETE', `/api/agents/${id}`);
    expect(deleteMissing.statusCode).toBe(404);
    validateResponse(
      '/api/agents/{id}',
      'delete',
      404,
      deleteMissing.json(),
      problem,
    );
  } finally {
    await f.close();
  }
});
