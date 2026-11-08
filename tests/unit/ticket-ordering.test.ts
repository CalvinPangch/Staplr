import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrateUp } from '../../src/server/db/migrate';
import {
  createTicketService,
  type TicketService,
} from '../../src/server/modules/tickets/service';

const statuses = ['new', 'review', 'testing', 'end'] as const;
type Status = (typeof statuses)[number];

/** Fails the test with a clear message instead of using a non-null assertion. */
function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null)
    throw new Error('Expected a value');
  return value;
}

let db: Database.Database;
let now: number;
let tickets: TicketService;

beforeEach(() => {
  db = new Database(':memory:');
  migrateUp(db);
  now = Date.parse('2026-11-08T00:00:00Z');
  const at = new Date(now).toISOString();
  for (const id of ['p1', 'p2'])
    db.prepare(
      `INSERT INTO project(id,name,repoFullName,repoRemoteId,baseBranch,downloadStatus,createdAt,updatedAt)
       VALUES(?,?,?,?, 'main','downloaded',?,?)`,
    ).run(id, id, `org/${id}`, id, at, at);
  tickets = createTicketService({ db, clock: () => now });
});

const column = (projectId: string, status: Status) =>
  must(
    tickets.getBoard(projectId).columns.find((c) => c.status === status),
  ).tickets.map((t) => t.title);
const make = (title: string, projectId = 'p1') =>
  tickets.create(projectId, { title });

describe('creating', () => {
  it('places a new ticket at position 0 in New and shifts the others down', () => {
    make('a');
    make('b');
    const c = make('c');
    expect(c).toMatchObject({ status: 'new', position: 0 });
    expect(column('p1', 'new')).toEqual(['c', 'b', 'a']);
    expect(
      tickets.getBoard('p1').columns[0]?.tickets.map((t) => t.position),
    ).toEqual([0, 1, 2]);
  });

  it('keeps each project board separate', () => {
    make('a');
    make('x', 'p2');
    expect(column('p1', 'new')).toEqual(['a']);
    expect(column('p2', 'new')).toEqual(['x']);
  });

  it('always has the four columns in order with their labels', () => {
    const board = tickets.getBoard('p1');
    expect(board.columns.map((c) => [c.status, c.label])).toEqual([
      ['new', 'New'],
      ['review', 'Review'],
      ['testing', 'Testing'],
      ['end', 'End'],
    ]);
  });
});

describe('moving', () => {
  it('moves within a column', () => {
    make('a');
    make('b');
    make('c'); // new: c b a
    const a = must(tickets.getBoard('p1').columns[0]?.tickets[2]);
    tickets.move(a.id, 'new', 0);
    expect(column('p1', 'new')).toEqual(['a', 'c', 'b']);
    tickets.move(a.id, 'new', 2);
    expect(column('p1', 'new')).toEqual(['c', 'b', 'a']);
  });

  it('moves across columns, closing the gap behind and opening one ahead', () => {
    make('a');
    make('b');
    make('c'); // new: c b a
    const list = must(tickets.getBoard('p1').columns[0]).tickets;
    const c = must(list[0]);
    const b = must(list[1]);
    const a = must(list[2]);
    tickets.move(a.id, 'review', 0);
    tickets.move(b.id, 'review', 0);
    tickets.move(c.id, 'review', 1);
    expect(column('p1', 'new')).toEqual([]);
    expect(column('p1', 'review')).toEqual(['b', 'c', 'a']);
  });

  it('clamps toIndex into the target column', () => {
    const a = make('a');
    const b = make('b');
    tickets.move(a.id, 'testing', 99);
    expect(column('p1', 'testing')).toEqual(['a']);
    tickets.move(b.id, 'testing', 99);
    expect(column('p1', 'testing')).toEqual(['a', 'b']);
    expect(
      tickets.getBoard('p1').columns[2]?.tickets.map((t) => t.position),
    ).toEqual([0, 1]);
  });

  it('rejects a negative toIndex', () => {
    const a = make('a');
    expect(() => tickets.move(a.id, 'review', -1)).toThrow();
  });

  it('moving to the same place changes nothing', () => {
    make('a');
    const b = make('b');
    const before = tickets.getBoard('p1');
    now += 5000;
    tickets.move(b.id, 'new', 0);
    expect(tickets.getBoard('p1')).toEqual(before);
  });

  it('changes statusChangedAt only when the column changes', () => {
    const a = make('a');
    make('b');
    const created = a.statusChangedAt;
    now += 60_000;
    tickets.move(a.id, 'new', 0); // within the column
    expect(
      tickets.getBoard('p1').columns[0]?.tickets.find((t) => t.id === a.id)
        ?.statusChangedAt,
    ).toBe(created);
    tickets.move(a.id, 'new', 1);
    expect(
      tickets.getBoard('p1').columns[0]?.tickets.find((t) => t.id === a.id)
        ?.statusChangedAt,
    ).toBe(created);
    tickets.move(a.id, 'review', 0);
    const moved = tickets.getBoard('p1').columns[1]?.tickets[0];
    expect(moved?.statusChangedAt).toBe(new Date(now).toISOString());
    expect(moved?.updatedAt).toBe(new Date(now).toISOString());
  });

  it('returns the updated board', () => {
    const a = make('a');
    const board = tickets.move(a.id, 'end', 0);
    expect(board.columns[3]?.tickets.map((t) => t.title)).toEqual(['a']);
  });
});

describe('deleting and editing', () => {
  it('closes the gap when a ticket is deleted', () => {
    make('a');
    make('b');
    make('c'); // c b a
    const b = must(tickets.getBoard('p1').columns[0]?.tickets[1]);
    tickets.remove(b.id);
    expect(column('p1', 'new')).toEqual(['c', 'a']);
    expect(
      tickets.getBoard('p1').columns[0]?.tickets.map((t) => t.position),
    ).toEqual([0, 1]);
  });

  it('edits text without moving the ticket', () => {
    const a = make('a');
    now += 1000;
    const edited = tickets.update(a.id, {
      title: 'renamed',
      description: 'more',
    });
    expect(edited).toMatchObject({
      title: 'renamed',
      description: 'more',
      status: 'new',
      position: 0,
    });
    expect(edited.statusChangedAt).toBe(a.statusChangedAt);
    expect(edited.updatedAt).toBe(new Date(now).toISOString());
  });

  it('removes every ticket of a project', () => {
    make('a');
    make('b');
    make('x', 'p2');
    tickets.removeAllForProject('p1');
    expect(column('p1', 'new')).toEqual([]);
    expect(column('p2', 'new')).toEqual(['x']);
  });
});

describe('ordering stays exact', () => {
  it('keeps positions 0-based, contiguous and unique through 200 random operations', () => {
    // a small deterministic generator so any failure can be replayed
    let seed = 20261108;
    const random = (max: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed % max;
    };
    const lastChange = new Map<string, string>();
    const lastStatus = new Map<string, Status>();

    function check() {
      const rows = db
        .prepare(
          'SELECT projectId, status, position FROM ticket ORDER BY projectId, status, position',
        )
        .all() as { projectId: string; status: string; position: number }[];
      const seen = new Map<string, number[]>();
      for (const r of rows) {
        const key = `${r.projectId}/${r.status}`;
        seen.set(key, [...(seen.get(key) ?? []), r.position]);
      }
      for (const [key, positions] of seen)
        expect(positions, key).toEqual(positions.map((_, i) => i));
    }

    const all = () =>
      db.prepare('SELECT id, status, statusChangedAt FROM ticket').all() as {
        id: string;
        status: Status;
        statusChangedAt: string;
      }[];

    for (let i = 0; i < 200; i++) {
      now += 1000;
      const existing = all();
      const roll = random(10);
      if (existing.length === 0 || roll < 3) {
        const t = make(`t${i}`, random(2) === 0 ? 'p1' : 'p2');
        lastChange.set(t.id, t.statusChangedAt);
        lastStatus.set(t.id, 'new');
      } else if (roll < 8) {
        const t = must(existing[random(existing.length)]);
        const to = must(statuses[random(4)]);
        const before = { status: t.status, changed: t.statusChangedAt };
        tickets.move(t.id, to, random(8) - 0 > 6 ? 99 : random(6));
        const after = db
          .prepare('SELECT status, statusChangedAt FROM ticket WHERE id=?')
          .get(t.id) as { status: Status; statusChangedAt: string };
        expect(after.status).toBe(to);
        if (to === before.status)
          expect(after.statusChangedAt).toBe(before.changed);
        else expect(after.statusChangedAt).toBe(new Date(now).toISOString());
      } else {
        const t = must(existing[random(existing.length)]);
        tickets.remove(t.id);
      }
      check();
    }
    expect(lastChange.size).toBeGreaterThan(0);
  });
});

describe('unknown projects and tickets', () => {
  it('throws not found', () => {
    expect(() => tickets.getBoard('nope')).toThrow(/does not exist/);
    expect(() => tickets.create('nope', { title: 'x' })).toThrow();
    expect(() => tickets.update('nope', { title: 'x' })).toThrow();
    expect(() => tickets.move('nope', 'new', 0)).toThrow();
    expect(() => tickets.remove('nope')).toThrow();
  });

  it('does not show tickets of a deleted project', () => {
    const t = make('a');
    db.prepare(
      "UPDATE project SET deletedAt='2026-11-08T00:00:00Z' WHERE id='p1'",
    ).run();
    expect(() => tickets.getBoard('p1')).toThrow();
    expect(() => tickets.update(t.id, { title: 'x' })).toThrow();
    expect(() => tickets.remove(t.id)).toThrow();
  });
});
