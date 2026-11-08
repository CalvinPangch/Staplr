import { it, expect } from 'vitest';
import { fixture, signedIn } from './helpers';
it('captures unhandled errors locally with correlation and no raw error secret', async () => {
  const f = await fixture();
  f.app.get('/api/test-failure', async () => {
    throw new Error('known-private-secret');
  });
  try {
    const cookie = await signedIn(f);
    const fail = await f.app.inject({
      url: '/api/test-failure',
      cookies: { staplr_session: cookie },
    });
    expect(fail.statusCode).toBe(500);
    expect(fail.headers['content-type']).toContain('application/problem+json');
    const events = await f.app.inject({
      url: '/api/error-events',
      cookies: { staplr_session: cookie },
    });
    expect(events.json()).toHaveLength(1);
    expect(events.json()[0]).toMatchObject({ route: '/api/test-failure' });
    expect(events.json()[0].requestId).toBeTruthy();
    expect(events.json()[0].stack).toContain('diagnostics.test.ts');
    expect(events.body).not.toContain('known-private-secret');
    expect((await f.app.inject({ url: '/api/error-events' })).statusCode).toBe(
      401,
    );
  } finally {
    await f.app.close();
    f.db.close();
  }
});
it('lists error events newest first and returns at most 200', async () => {
  const f = await fixture();
  try {
    const cookie = await signedIn(f);
    const insert = f.db.prepare(
      'INSERT INTO error_event(id,at,requestId,route,message,stack) VALUES(?,?,?,?,?,?)',
    );
    for (let i = 0; i < 205; i++)
      insert.run(
        `id-${String(i).padStart(3, '0')}`,
        new Date(Date.UTC(2026, 10, 8, 0, 0, i)).toISOString(),
        `req-${i}`,
        '/api/x',
        'Unexpected server error. Retry, or review Diagnostics.',
        null,
      );
    const reply = await f.app.inject({
      url: '/api/error-events',
      cookies: { staplr_session: cookie },
    });
    const events = reply.json() as { id: string; at: string }[];
    expect(events).toHaveLength(200);
    expect(events[0]?.id).toBe('id-204');
    expect(events[199]?.id).toBe('id-005');
    const times = events.map((e) => e.at);
    expect(times).toEqual([...times].sort().reverse());
  } finally {
    await f.app.close();
    f.db.close();
  }
});
