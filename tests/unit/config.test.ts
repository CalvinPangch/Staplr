import { describe, it, expect } from 'vitest';
import { parseConfig } from '../../src/server/config';
const valid = {
  STAPLR_MASTER_KEY: Buffer.alloc(32, 1).toString('base64'),
  SESSION_SECRET: 'test-session-secret-at-least-32-characters',
};
describe('installation configuration', () => {
  it('requires a canonical base64 32-byte master key and a session secret', () => {
    for (const value of ['', 'not base64', Buffer.alloc(31).toString('base64')])
      expect(() => parseConfig({ ...valid, STAPLR_MASTER_KEY: value })).toThrow(
        /STAPLR_MASTER_KEY/,
      );
    expect(() =>
      parseConfig({ STAPLR_MASTER_KEY: valid.STAPLR_MASTER_KEY }),
    ).toThrow(/SESSION_SECRET/);
  });
  it('allows local HTTP and requires HTTPS elsewhere', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]'])
      expect(
        parseConfig({ ...valid, PUBLIC_URL: `http://${host}:3000` })
          .cookieSecure,
      ).toBe(false);
    for (const url of [
      'http://server:3000',
      'http://localhost.evil:3000',
      'ftp://localhost',
    ])
      expect(() => parseConfig({ ...valid, PUBLIC_URL: url })).toThrow(/HTTPS/);
    expect(
      parseConfig({ ...valid, PUBLIC_URL: 'https://staplr.example' })
        .cookieSecure,
    ).toBe(true);
  });
  it('supports an explicit insecure override without setting secure cookies', () => {
    expect(
      parseConfig({
        ...valid,
        PUBLIC_URL: 'http://server:3000',
        STAPLR_ALLOW_INSECURE_HTTP: '1',
      }).cookieSecure,
    ).toBe(false);
  });
  it('rejects invalid ports and preserves the 15-minute idle default', () => {
    expect(() => parseConfig({ ...valid, PORT: '0' })).toThrow();
    expect(parseConfig(valid).sandboxIdleMs).toBe(900000);
  });
});
