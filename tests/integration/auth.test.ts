import { afterEach, describe, it, expect } from 'vitest';
import { fixture, signedIn, credentials, origin } from './helpers';
const fixtures: Awaited<ReturnType<typeof fixture>>[] = [];
async function make(https = false) {
  const f = await fixture(https);
  fixtures.push(f);
  return f;
}
afterEach(async () => {
  for (const f of fixtures.splice(0)) {
    await f.app.close();
    f.db.close();
  }
});
describe('single owner and session boundaries', () => {
  it('creates the owner once, hashes password/session and sets cookie attributes', async () => {
    const f = await make();
    const reply = await f.app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { origin },
      payload: credentials,
    });
    expect(reply.statusCode).toBe(201);
    const cookie = reply.headers['set-cookie'] as string;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).not.toContain('Secure');
    expect(
      JSON.stringify(f.db.prepare('SELECT * FROM user').all()),
    ).not.toContain(credentials.password);
    expect(
      JSON.stringify(f.db.prepare('SELECT * FROM session').all()),
    ).not.toContain(reply.cookies[0]?.value);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/setup',
          headers: { origin },
          payload: credentials,
        })
      ).statusCode,
    ).toBe(409);
  });
  it('rejects short inputs and foreign or missing origins', async () => {
    const f = await make();
    for (const payload of [
      { ...credentials, username: 'a' },
      { ...credentials, password: 'short' },
      { ...credentials, extra: true },
    ])
      expect(
        (
          await f.app.inject({
            method: 'POST',
            url: '/api/setup',
            headers: { origin },
            payload,
          })
        ).statusCode,
      ).toBe(422);
    for (const value of ['https://evil.example', undefined])
      expect(
        (
          await f.app.inject({
            method: 'POST',
            url: '/api/setup',
            headers: value ? { origin: value } : {},
            payload: credentials,
          })
        ).statusCode,
      ).toBe(403);
  });
  it('authenticates, rejects wrong passwords, signs out and prevents session reuse', async () => {
    const f = await make();
    const cookie = await signedIn(f);
    expect(
      (
        await f.app.inject({
          url: '/api/session',
          cookies: { staplr_session: cookie },
        })
      ).json(),
    ).toEqual({ username: 'owner' });
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/session',
          headers: { origin },
          payload: { ...credentials, password: 'wrong-password' },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await f.app.inject({
          method: 'DELETE',
          url: '/api/session',
          headers: { origin },
          cookies: { staplr_session: cookie },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await f.app.inject({
          url: '/api/session',
          cookies: { staplr_session: cookie },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/session',
          headers: { origin },
          payload: credentials,
        })
      ).statusCode,
    ).toBe(204);
  });
  it('uses Secure cookies for HTTPS', async () => {
    const f = await make(true);
    const res = await f.app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { origin: f.config.publicUrl },
      payload: credentials,
    });
    expect(res.headers['set-cookie']).toContain('Secure');
  });
  it('enforces idle expiry and absolute expiry despite continued use', async () => {
    const f = await make();
    const cookie = await signedIn(f);
    f.advance(12 * 3600000 + 1);
    expect(
      (
        await f.app.inject({
          url: '/api/session',
          cookies: { staplr_session: cookie },
        })
      ).statusCode,
    ).toBe(401);
    const res = await f.app.inject({
      method: 'POST',
      url: '/api/session',
      headers: { origin },
      payload: credentials,
    });
    const fresh = res.cookies[0]?.value ?? '';
    for (let i = 0; i < 14; i++) {
      f.advance(11 * 3600000);
      expect(
        (
          await f.app.inject({
            url: '/api/session',
            cookies: { staplr_session: fresh },
          })
        ).statusCode,
      ).toBe(200);
    }
    f.advance(15 * 3600000);
    expect(
      (
        await f.app.inject({
          url: '/api/session',
          cookies: { staplr_session: fresh },
        })
      ).statusCode,
    ).toBe(401);
  });
});
