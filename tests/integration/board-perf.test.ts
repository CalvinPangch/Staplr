import { it, expect } from 'vitest';
import { platformFixture } from './helpers';

/**
 * Supporting diagnostics for SC-009 at the API level. The acceptance evidence
 * is the browser test tests/e2e/board-perf.spec.ts, which also covers rendering.
 */
it('serves a 200-ticket board in under 1 s and commits moves in under 500 ms (p95)', async () => {
  const f = await platformFixture();
  try {
    const at = '2026-11-08T00:00:00Z';
    f.db
      .prepare(
        `INSERT INTO project(id,name,repoFullName,repoRemoteId,baseBranch,downloadStatus,createdAt,updatedAt)
         VALUES('p1','Shop','octo/shop','1','main','downloaded',?,?)`,
      )
      .run(at, at);
    const statuses = ['new', 'review', 'testing', 'end'];
    const insert = f.db.prepare(
      `INSERT INTO ticket(id,projectId,title,description,status,position,createdAt,updatedAt,statusChangedAt)
       VALUES(?,?,?,?,?,?,?,?,?)`,
    );
    f.db.transaction(() => {
      for (let i = 0; i < 200; i++)
        insert.run(
          `t${i}`,
          'p1',
          `Ticket ${i}`,
          'x'.repeat(200),
          statuses[i % 4],
          Math.floor(i / 4),
          at,
          at,
          at,
        );
    })();

    const started = performance.now();
    const reply = await f.call('GET', '/api/projects/p1/board');
    const boardMs = performance.now() - started;
    expect(reply.statusCode).toBe(200);
    expect(
      (reply.json() as { columns: { tickets: unknown[] }[] }).columns.reduce(
        (n, c) => n + c.tickets.length,
        0,
      ),
    ).toBe(200);
    expect(boardMs).toBeLessThan(1000);

    const samples: number[] = [];
    for (let run = 0; run < 50; run++) {
      const begin = performance.now();
      const moved = await f.call('POST', `/api/tickets/t${run}/move`, {
        toStatus: statuses[(run + 1) % 4],
        toIndex: run % 7,
      });
      samples.push(performance.now() - begin);
      expect(moved.statusCode).toBe(200);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1] ?? Infinity;
    expect(p95).toBeLessThan(500);
  } finally {
    await f.close();
  }
});
