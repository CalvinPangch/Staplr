import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { platformFixture } from '../integration/helpers';
import { agentBody } from '../integration/agent-helpers';
import { setHeaderValue } from '../../src/shared/agent-file';
import { validateResponse } from './harness';

const problem = 'application/problem+json';
const models = ['claude-sonnet-5-5', 'claude-haiku-5-5'];

it('every agent, template and model response matches the contract', async () => {
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

    const templates = await f.call('GET', '/api/agent-templates');
    expect(templates.statusCode).toBe(200);
    validateResponse('/api/agent-templates', 'get', 200, templates.json());

    const input = await agentBody(f, {
      name: 'Contract agent',
      role: 'developer',
      provider: 'claude',
      providerConnectionId: connection,
      model: 'claude-sonnet-5-5',
    });
    const created = await f.call('POST', '/api/agents', input);
    expect(created.statusCode).toBe(201);
    validateResponse('/api/agents', 'post', 201, created.json());
    const id = created.json().id as string;

    const list = await f.call('GET', '/api/agents');
    validateResponse('/api/agents', 'get', 200, list.json());
    const got = await f.call('GET', `/api/agents/${id}`);
    validateResponse('/api/agents/{id}', 'get', 200, got.json());
    const change = (model: string, revision: number) => ({
      definition: setHeaderValue(input.definition, 'model', model),
      revision,
    });
    const updated = await f.call(
      'PUT',
      `/api/agents/${id}`,
      change('claude-haiku-5-5', 1),
    );
    expect(updated.statusCode).toBe(200);
    validateResponse('/api/agents/{id}', 'put', 200, updated.json());
    const stale = await f.call(
      'PUT',
      `/api/agents/${id}`,
      change('claude-sonnet-5-5', 1),
    );
    expect(stale.statusCode).toBe(409);
    validateResponse('/api/agents/{id}', 'put', 409, stale.json(), problem);

    const duplicate = await f.call('POST', '/api/agents', input);
    expect(duplicate.statusCode).toBe(422);
    validateResponse('/api/agents', 'post', 422, duplicate.json(), problem);
    const unavailable = await f.call('POST', '/api/agents', {
      definition: setHeaderValue(
        setHeaderValue(input.definition, 'name', 'other'),
        'model',
        'claude-made-up',
      ),
    });
    expect(unavailable.statusCode).toBe(422);
    validateResponse('/api/agents', 'post', 422, unavailable.json(), problem);
    const missing = await f.call('GET', '/api/agents/nope');
    expect(missing.statusCode).toBe(404);
    validateResponse('/api/agents/{id}', 'get', 404, missing.json(), problem);
    const putMissing = await f.call('PUT', '/api/agents/nope', {
      ...input,
      revision: 1,
    });
    expect(putMissing.statusCode).toBe(404);
    validateResponse(
      '/api/agents/{id}',
      'put',
      404,
      putMissing.json(),
      problem,
    );
    const putInvalid = await f.call(
      'PUT',
      `/api/agents/${id}`,
      change('claude-made-up', 2),
    );
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

it('the contract has no soul endpoints any more', () => {
  const spec = readFileSync(
    'specs/001-agent-team-orchestration/contracts/openapi.yaml',
    'utf8',
  );
  expect(spec).not.toMatch(/\/api\/souls/);
  expect(spec).not.toMatch(/^ {4}Soul(Input)?:/m);
});
