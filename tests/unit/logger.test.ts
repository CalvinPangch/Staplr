import { describe, it, expect } from 'vitest';
import { redact, createLogger } from '../../src/server/lib/logger';
describe('structured secret redaction', () => {
  it('recursively redacts all supported credential names without altering the input', () => {
    const input = {
      token: 'a',
      password: 'b',
      credentialBundle: 'c',
      apiKey: 'd',
      api_key: 'e',
      headers: { 'x-api-key': 'f', cookie: 'g', authorization: 'h' },
      nested: [{ APIKEY: 'i', secret: 'j' }],
      message: 'safe',
    };
    const result = redact(input);
    expect(JSON.stringify(result)).not.toContain('"a"');
    expect(result).toEqual({
      token: '[REDACTED]',
      password: '[REDACTED]',
      credentialBundle: '[REDACTED]',
      apiKey: '[REDACTED]',
      api_key: '[REDACTED]',
      headers: {
        'x-api-key': '[REDACTED]',
        cookie: '[REDACTED]',
        authorization: '[REDACTED]',
      },
      nested: [{ APIKEY: '[REDACTED]', secret: '[REDACTED]' }],
      message: 'safe',
    });
    expect(input.apiKey).toBe('d');
  });
  it('emits JSON with request correlation and redacts nested logging fields', () => {
    let output = '';
    const log = createLogger(
      {
        write: (chunk: string) => {
          output += chunk;
        },
      },
      'request-1',
    );
    log.info({ body: { apiKey: 'known-key' } }, 'request');
    const parsed = JSON.parse(output);
    expect(parsed.requestId).toBe('request-1');
    expect(parsed.body.apiKey).toBe('[REDACTED]');
    expect(output).not.toContain('known-key');
  });
});
