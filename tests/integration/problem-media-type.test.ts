import { it, expect } from 'vitest';
import { fixture, signedIn } from './helpers';

it('answers errors from auth, audit and diagnostics routes as application/problem+json', async () => {
  const f = await fixture();
  try {
    const anonymous = await f.app.inject({ url: '/api/audit-entries' });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.headers['content-type']).toContain(
      'application/problem+json',
    );
    const cookie = await signedIn(f);
    for (const url of ['/api/error-events?x=1', '/api/audit-entries?before=']) {
      const reply = await f.app.inject({
        url,
        cookies: { staplr_session: cookie },
      });
      if (reply.statusCode >= 400)
        expect(reply.headers['content-type']).toContain(
          'application/problem+json',
        );
    }
    const wrongOrigin = await f.app.inject({
      method: 'POST',
      url: '/api/session',
      headers: { origin: 'https://evil.example' },
      payload: {},
    });
    expect(wrongOrigin.statusCode).toBe(403);
    expect(wrongOrigin.headers['content-type']).toContain(
      'application/problem+json',
    );
  } finally {
    await f.app.close();
    f.db.close();
  }
});
