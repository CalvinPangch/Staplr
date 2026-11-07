import { it, expect } from 'vitest';
import { platformFixture } from '../integration/helpers';
import { validateResponse } from './harness';

const problem = 'application/problem+json';

it('every soul response matches the contract', async () => {
  const f = await platformFixture();
  try {
    const list = await f.call('GET', '/api/souls');
    expect(list.statusCode).toBe(200);
    validateResponse('/api/souls', 'get', 200, list.json());
    const developer = (
      list.json() as { id: string; roleType: string; isDefault: boolean }[]
    ).find((s) => s.isDefault && s.roleType === 'developer');
    if (!developer) throw new Error('The Developer default is missing');

    const body = {
      name: 'Contract soul',
      roleType: 'custom',
      description: 'd',
      instructions: 'i',
    };
    const created = await f.call('POST', '/api/souls', body);
    expect(created.statusCode).toBe(201);
    validateResponse('/api/souls', 'post', 201, created.json());
    const id = created.json().id as string;

    const got = await f.call('GET', `/api/souls/${id}`);
    validateResponse('/api/souls/{id}', 'get', 200, got.json());

    const updated = await f.call('PUT', `/api/souls/${id}`, {
      ...body,
      description: 'changed',
    });
    expect(updated.statusCode).toBe(200);
    validateResponse('/api/souls/{id}', 'put', 200, updated.json());

    const copied = await f.call('POST', `/api/souls/${developer.id}/copy`, {
      name: 'Dev copy',
    });
    expect(copied.statusCode).toBe(201);
    validateResponse('/api/souls/{id}/copy', 'post', 201, copied.json());

    const pmScratch = await f.call('POST', '/api/souls', {
      ...body,
      name: 'pm',
      roleType: 'project_manager',
    });
    expect(pmScratch.statusCode).toBe(422);
    validateResponse('/api/souls', 'post', 422, pmScratch.json(), problem);

    const defaultEdit = await f.call('PUT', `/api/souls/${developer.id}`, {
      ...body,
      name: 'x',
      roleType: 'developer',
    });
    expect(defaultEdit.statusCode).toBe(403);
    validateResponse(
      '/api/souls/{id}',
      'put',
      403,
      defaultEdit.json(),
      problem,
    );

    const defaultDelete = await f.call('DELETE', `/api/souls/${developer.id}`);
    expect(defaultDelete.statusCode).toBe(403);
    validateResponse(
      '/api/souls/{id}',
      'delete',
      403,
      defaultDelete.json(),
      problem,
    );

    const duplicate = await f.call('POST', '/api/souls', body);
    expect(duplicate.statusCode).toBe(409);
    validateResponse('/api/souls', 'post', 409, duplicate.json(), problem);

    const missing = await f.call('GET', '/api/souls/nope');
    expect(missing.statusCode).toBe(404);
    validateResponse('/api/souls/{id}', 'get', 404, missing.json(), problem);

    const removed = await f.call('DELETE', `/api/souls/${id}`);
    expect(removed.statusCode).toBe(204);
    validateResponse('/api/souls/{id}', 'delete', 204, undefined);
  } finally {
    await f.close();
  }
});
