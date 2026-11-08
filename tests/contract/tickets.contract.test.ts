import { it, expect } from 'vitest';
import { platformFixture } from '../integration/helpers';
import { validateResponse } from './harness';

const problem = 'application/problem+json';

it('every board and ticket response matches the contract', async () => {
  const f = await platformFixture();
  try {
    const at = '2026-11-08T00:00:00Z';
    f.db
      .prepare(
        `INSERT INTO project(id,name,repoFullName,repoRemoteId,baseBranch,downloadStatus,createdAt,updatedAt)
         VALUES('p1','Shop','octo/shop','1','main','downloaded',?,?)`,
      )
      .run(at, at);

    const empty = await f.call('GET', '/api/projects/p1/board');
    expect(empty.statusCode).toBe(200);
    validateResponse('/api/projects/{id}/board', 'get', 200, empty.json());
    const noProject = await f.call('GET', '/api/projects/nope/board');
    expect(noProject.statusCode).toBe(404);
    validateResponse(
      '/api/projects/{id}/board',
      'get',
      404,
      noProject.json(),
      problem,
    );

    const created = await f.call('POST', '/api/projects/p1/tickets', {
      title: 'First',
      description: 'Details',
    });
    expect(created.statusCode).toBe(201);
    validateResponse('/api/projects/{id}/tickets', 'post', 201, created.json());
    const id = created.json().id as string;
    const invalid = await f.call('POST', '/api/projects/p1/tickets', {
      title: '',
    });
    expect(invalid.statusCode).toBe(422);
    validateResponse(
      '/api/projects/{id}/tickets',
      'post',
      422,
      invalid.json(),
      problem,
    );

    const patched = await f.call('PATCH', `/api/tickets/${id}`, {
      title: 'Renamed',
    });
    expect(patched.statusCode).toBe(200);
    validateResponse('/api/tickets/{id}', 'patch', 200, patched.json());
    const patchMissing = await f.call('PATCH', '/api/tickets/nope', {
      title: 'x',
    });
    expect(patchMissing.statusCode).toBe(404);
    validateResponse(
      '/api/tickets/{id}',
      'patch',
      404,
      patchMissing.json(),
      problem,
    );
    const patchInvalid = await f.call('PATCH', `/api/tickets/${id}`, {});
    expect(patchInvalid.statusCode).toBe(422);
    validateResponse(
      '/api/tickets/{id}',
      'patch',
      422,
      patchInvalid.json(),
      problem,
    );

    const moved = await f.call('POST', `/api/tickets/${id}/move`, {
      toStatus: 'review',
      toIndex: 0,
    });
    expect(moved.statusCode).toBe(200);
    validateResponse('/api/tickets/{id}/move', 'post', 200, moved.json());
    const moveBad = await f.call('POST', `/api/tickets/${id}/move`, {
      toStatus: 'nope',
      toIndex: 0,
    });
    expect(moveBad.statusCode).toBe(422);
    validateResponse(
      '/api/tickets/{id}/move',
      'post',
      422,
      moveBad.json(),
      problem,
    );
    const moveMissing = await f.call('POST', '/api/tickets/nope/move', {
      toStatus: 'end',
      toIndex: 0,
    });
    expect(moveMissing.statusCode).toBe(404);
    validateResponse(
      '/api/tickets/{id}/move',
      'post',
      404,
      moveMissing.json(),
      problem,
    );

    const filled = await f.call('GET', '/api/projects/p1/board');
    validateResponse('/api/projects/{id}/board', 'get', 200, filled.json());

    const removed = await f.call('DELETE', `/api/tickets/${id}`);
    expect(removed.statusCode).toBe(204);
    validateResponse('/api/tickets/{id}', 'delete', 204, undefined);
    const gone = await f.call('DELETE', `/api/tickets/${id}`);
    expect(gone.statusCode).toBe(404);
    validateResponse('/api/tickets/{id}', 'delete', 404, gone.json(), problem);
  } finally {
    await f.close();
  }
});
