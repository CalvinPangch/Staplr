import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { platformFixture } from './helpers';

let f: Awaited<ReturnType<typeof platformFixture>>;
beforeEach(async () => {
  f = await platformFixture();
  const at = '2026-11-08T00:00:00Z';
  f.db
    .prepare(
      `INSERT INTO project(id,name,repoFullName,repoRemoteId,baseBranch,downloadStatus,createdAt,updatedAt)
       VALUES('p1','Shop','octo/shop','1','main','downloaded',?,?)`,
    )
    .run(at, at);
});
afterEach(async () => {
  await f.close();
});

interface Ticket {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: string;
  position: number;
  statusChangedAt: string;
}
interface Board {
  projectId: string;
  columns: { status: string; label: string; tickets: Ticket[] }[];
}
const board = async (id = 'p1') =>
  (await f.call('GET', `/api/projects/${id}/board`)).json() as Board;
const add = (body: object = { title: 'A ticket' }, id = 'p1') =>
  f.call('POST', `/api/projects/${id}/tickets`, body);
const titles = (b: Board, status: string) =>
  b.columns.find((c) => c.status === status)?.tickets.map((t) => t.title);

describe('the board', () => {
  it('always has the four columns in order, with their labels, even when empty', async () => {
    const reply = await f.call('GET', '/api/projects/p1/board');
    expect(reply.statusCode).toBe(200);
    const b = reply.json() as Board;
    expect(b.projectId).toBe('p1');
    expect(b.columns.map((c) => [c.status, c.label, c.tickets.length])).toEqual(
      [
        ['new', 'New', 0],
        ['review', 'Review', 0],
        ['testing', 'Testing', 0],
        ['end', 'End', 0],
      ],
    );
  });

  it('is available while the project is Not ready', async () => {
    const project = (await f.call('GET', '/api/projects/p1')).json();
    expect(project.readiness).toBe('not_ready');
    expect((await f.call('GET', '/api/projects/p1/board')).statusCode).toBe(
      200,
    );
    expect((await add()).statusCode).toBe(201);
  });

  it('answers 404 for an unknown or deleted project', async () => {
    expect((await f.call('GET', '/api/projects/nope/board')).statusCode).toBe(
      404,
    );
    expect((await add({ title: 'x' }, 'nope')).statusCode).toBe(404);
  });
});

describe('creating tickets', () => {
  it('puts the ticket at the top of New', async () => {
    await add({ title: 'first' });
    const second = await add({ title: 'second', description: 'details' });
    expect(second.statusCode).toBe(201);
    expect(second.json()).toMatchObject({
      projectId: 'p1',
      title: 'second',
      description: 'details',
      status: 'new',
      position: 0,
    });
    expect(titles(await board(), 'new')).toEqual(['second', 'first']);
  });

  it('trims the title and allows an empty description', async () => {
    const reply = await add({ title: '  spaced  ' });
    expect(reply.json()).toMatchObject({ title: 'spaced', description: '' });
  });

  it('limits the title to 1-200 characters and the description to 20,000', async () => {
    const cases: [object, number][] = [
      [{ title: '' }, 422],
      [{ title: '   ' }, 422],
      [{}, 422],
      [{ title: 't'.repeat(201) }, 422],
      [{ title: 't'.repeat(200) }, 201],
      [{ title: 'ok', description: 'd'.repeat(20_001) }, 422],
      [{ title: 'ok', description: 'd'.repeat(20_000) }, 201],
    ];
    for (const [body, status] of cases)
      expect(
        (await add(body)).statusCode,
        JSON.stringify(body).slice(0, 50),
      ).toBe(status);
  });

  it('refuses unknown fields such as an assignee', async () => {
    for (const body of [
      { title: 'x', assigneeId: 'agent-1' },
      { title: 'x', status: 'end' },
      { title: 'x', position: 3 },
    ]) {
      const reply = await add(body);
      expect(reply.statusCode).toBe(422);
      expect(reply.json().code).toBe('invalid_input');
    }
    expect((await board()).columns.flatMap((c) => c.tickets)).toEqual([]);
  });

  it('returns text exactly as stored and never as markup', async () => {
    const text = '<script>alert(1)</script> & "quotes"\nline two\n\n  indented';
    const reply = await add({ title: '<b>bold</b>', description: text });
    expect(reply.json().title).toBe('<b>bold</b>');
    expect(reply.json().description).toBe(text);
    expect(reply.headers['content-type']).toMatch(/application\/json/);
    const stored = (await board()).columns[0]?.tickets[0];
    expect(stored?.description).toBe(text);
  });
});

describe('editing and deleting', () => {
  it('edits the title and/or description', async () => {
    const id = (await add({ title: 'old', description: 'd' })).json()
      .id as string;
    const both = await f.call('PATCH', `/api/tickets/${id}`, {
      title: 'new',
      description: 'e',
    });
    expect(both.statusCode).toBe(200);
    expect(both.json()).toMatchObject({ title: 'new', description: 'e' });
    const one = await f.call('PATCH', `/api/tickets/${id}`, {
      description: '',
    });
    expect(one.json()).toMatchObject({ title: 'new', description: '' });
  });

  it('refuses empty, too long, unknown or no changes', async () => {
    const id = (await add()).json().id as string;
    for (const body of [
      {},
      { title: '' },
      { title: 't'.repeat(201) },
      { description: 'd'.repeat(20_001) },
      { assigneeId: 'x' },
    ])
      expect(
        (await f.call('PATCH', `/api/tickets/${id}`, body)).statusCode,
        JSON.stringify(body).slice(0, 40),
      ).toBe(422);
  });

  it('deletes a ticket and closes the gap', async () => {
    await add({ title: 'a' });
    await add({ title: 'b' });
    await add({ title: 'c' });
    const middle = (await board()).columns[0]?.tickets[1];
    expect(
      (await f.call('DELETE', `/api/tickets/${middle?.id}`)).statusCode,
    ).toBe(204);
    const b = await board();
    expect(titles(b, 'new')).toEqual(['c', 'a']);
    expect(b.columns[0]?.tickets.map((t) => t.position)).toEqual([0, 1]);
  });

  it('answers 404 for unknown tickets', async () => {
    expect(
      (await f.call('PATCH', '/api/tickets/nope', { title: 'x' })).statusCode,
    ).toBe(404);
    expect((await f.call('DELETE', '/api/tickets/nope')).statusCode).toBe(404);
    expect(
      (
        await f.call('POST', '/api/tickets/nope/move', {
          toStatus: 'end',
          toIndex: 0,
        })
      ).statusCode,
    ).toBe(404);
  });
});

describe('moving', () => {
  it('moves to any column and position and returns the updated board', async () => {
    const a = (await add({ title: 'a' })).json().id as string;
    await add({ title: 'b' });
    const reply = await f.call('POST', `/api/tickets/${a}/move`, {
      toStatus: 'testing',
      toIndex: 0,
    });
    expect(reply.statusCode).toBe(200);
    const b = reply.json() as Board;
    expect(titles(b, 'testing')).toEqual(['a']);
    expect(titles(b, 'new')).toEqual(['b']);
    expect(titles(await board(), 'testing')).toEqual(['a']);
  });

  it('clamps toIndex and keeps positions contiguous', async () => {
    const a = (await add({ title: 'a' })).json().id as string;
    const b = (await add({ title: 'b' })).json().id as string;
    await f.call('POST', `/api/tickets/${a}/move`, {
      toStatus: 'review',
      toIndex: 50,
    });
    const reply = await f.call('POST', `/api/tickets/${b}/move`, {
      toStatus: 'review',
      toIndex: 50,
    });
    const review = (reply.json() as Board).columns[1];
    expect(review?.tickets.map((t) => [t.title, t.position])).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
  });

  it('refuses a bad status, a negative or fractional index, and unknown fields', async () => {
    const id = (await add()).json().id as string;
    for (const body of [
      { toStatus: 'done', toIndex: 0 },
      { toStatus: 'end', toIndex: -1 },
      { toStatus: 'end', toIndex: 1.5 },
      { toStatus: 'end' },
      { toIndex: 0 },
      { toStatus: 'end', toIndex: 0, assigneeId: 'x' },
    ])
      expect(
        (await f.call('POST', `/api/tickets/${id}/move`, body)).statusCode,
        JSON.stringify(body),
      ).toBe(422);
  });
});

describe('deleting the project', () => {
  it('removes its tickets, and a ticket of a deleted project is gone', async () => {
    const id = (await add({ title: 'a' })).json().id as string;
    await f.call('DELETE', '/api/projects/p1');
    const count = f.db.prepare('SELECT COUNT(*) AS n FROM ticket').get() as {
      n: number;
    };
    expect(count.n).toBe(0);
    expect((await f.call('GET', '/api/projects/p1/board')).statusCode).toBe(
      404,
    );
    expect(
      (await f.call('PATCH', `/api/tickets/${id}`, { title: 'x' })).statusCode,
    ).toBe(404);
    expect((await f.call('DELETE', `/api/tickets/${id}`)).statusCode).toBe(404);
  });
});

describe('access', () => {
  it('needs a session on every route', async () => {
    for (const [method, url] of [
      ['GET', '/api/projects/p1/board'],
      ['POST', '/api/projects/p1/tickets'],
      ['PATCH', '/api/tickets/x'],
      ['DELETE', '/api/tickets/x'],
      ['POST', '/api/tickets/x/move'],
    ] as const)
      expect(
        (await f.app.inject({ method, url })).statusCode,
        `${method} ${url}`,
      ).toBe(401);
  });
});
