import { describe, it, expect } from 'vitest';
import { seal, open } from '../../src/server/lib/crypto';
const key = Buffer.alloc(32, 7);
describe('authenticated secret storage', () => {
  it('round trips arbitrary bytes without plaintext in the envelope', () => {
    const bytes = Buffer.from([0, 255, 12, 77]);
    const env = seal(bytes, key);
    expect(open(env, key)).toEqual(bytes);
    expect(Object.keys(env).sort()).toEqual([
      'authTag',
      'ciphertext',
      'keyVersion',
      'nonce',
    ]);
    expect(Buffer.from(env.nonce, 'base64')).toHaveLength(12);
  });
  it('uses a fresh nonce and ciphertext for every call', () => {
    const a = seal(Buffer.from('token'), key);
    const b = seal(Buffer.from('token'), key);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
  it('rejects ciphertext or authentication tag tampering and a different key', () => {
    const env = seal(Buffer.from('secret'), key);
    for (const field of ['ciphertext', 'authTag'] as const) {
      const data = Buffer.from(env[field], 'base64');
      data[0] = (data[0] ?? 0) ^ 1;
      expect(() =>
        open({ ...env, [field]: data.toString('base64') }, key),
      ).toThrow();
    }
    expect(() => open(env, Buffer.alloc(32, 8))).toThrow();
  });
  it('rejects invalid keys and unsupported envelope versions', () => {
    expect(() => seal(Buffer.from('a'), Buffer.alloc(31))).toThrow();
    expect(() =>
      open({ ...seal(Buffer.from('a'), key), keyVersion: 2 }, key),
    ).toThrow();
  });
});
