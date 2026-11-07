import { describe, it, expect } from 'vitest';
import type Database from 'better-sqlite3';
import { fixture, credentials, origin, platformFixture } from './helpers';

/**
 * SC-004: a known secret must never appear in plaintext in the database
 * (outside sealed columns), API responses, logs, error and audit records.
 * Every story that handles a credential adds its fixture and cases here
 * BEFORE the implementation (research R21); Polish reruns the full flow.
 */
export const secretFixtures = {
  ownerPassword: credentials.password,
  githubToken: 'ghp_TESTknownTokenValue000000000000000001',
  claudeApiKey: 'sk-ant-TESTknownKeyValue-000000000000000001',
  codexSecret: 'codex-TESTknownBundleSecret-0000000000000001',
} as const;

/** Every text/blob column of every table, joined, minus sealed columns. */
export function dumpPlaintext(db: Database.Database): string {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all() as { name: string }[];
  const parts: string[] = [];
  for (const { name } of tables) {
    const columns = (
      db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string }[]
    )
      .map((c) => c.name)
      // sealed columns hold AES-GCM ciphertext by design
      .filter((c) => !/Sealed$/.test(c));
    if (columns.length === 0) continue;
    const rows = db
      .prepare(
        `SELECT ${columns.map((c) => `CAST("${c}" AS TEXT) AS "${c}"`).join(',')} FROM "${name}"`,
      )
      .all();
    parts.push(JSON.stringify(rows));
  }
  return parts.join('\n');
}

describe('no plaintext secrets (owner account and session)', () => {
  it('stores only hashes of the password and the session id, and never echoes them', async () => {
    const f = await fixture();
    try {
      const setup = await f.app.inject({
        method: 'POST',
        url: '/api/setup',
        headers: { origin },
        payload: credentials,
      });
      expect(setup.statusCode).toBe(201);
      const signedCookie = setup.cookies[0]?.value ?? '';
      const unsigned = f.app.unsignCookie(signedCookie);
      expect(unsigned.valid).toBe(true);
      const rawSession = unsigned.value ?? '';
      expect(rawSession.length).toBeGreaterThan(20);

      const dump = dumpPlaintext(f.db);
      expect(dump).not.toContain(secretFixtures.ownerPassword);
      expect(dump).not.toContain(rawSession);

      const responses = [
        setup,
        await f.app.inject({
          url: '/api/audit-entries',
          cookies: { staplr_session: signedCookie },
        }),
        await f.app.inject({
          url: '/api/error-events',
          cookies: { staplr_session: signedCookie },
        }),
        await f.app.inject({
          url: '/api/session',
          cookies: { staplr_session: signedCookie },
        }),
      ];
      for (const reply of responses) {
        expect(reply.body).not.toContain(secretFixtures.ownerPassword);
        expect(reply.body).not.toContain(rawSession);
      }
    } finally {
      await f.app.close();
      f.db.close();
    }
  });

  it('records a server error without leaking the secret that caused it', async () => {
    const f = await fixture();
    try {
      f.app.post('/api/test-secret-failure', async () => {
        throw new Error(`failed with ${secretFixtures.githubToken}`);
      });
      const reply = await f.app.inject({
        method: 'POST',
        url: '/api/setup',
        headers: { origin },
        payload: credentials,
      });
      const cookie = reply.cookies[0]?.value ?? '';
      const failure = await f.app.inject({
        method: 'POST',
        url: '/api/test-secret-failure',
        headers: { origin },
        cookies: { staplr_session: cookie },
      });
      expect(failure.statusCode).toBe(500);
      expect(failure.body).not.toContain(secretFixtures.githubToken);
      expect(dumpPlaintext(f.db)).not.toContain(secretFixtures.githubToken);
    } finally {
      await f.app.close();
      f.db.close();
    }
  });

  // Added by the story that introduces each credential, before its code:
  it('seals a GitHub token; only tokenLast4 is ever shown', async () => {
    const f = await platformFixture();
    try {
      const token = secretFixtures.githubToken;
      f.fake.github.setToken(token, {
        login: 'octo',
        kind: 'classic',
        scopes: ['repo'],
      });
      const created = await f.call('POST', '/api/source-control-connections', {
        name: 'work',
        platform: 'github',
        token,
      });
      expect(created.statusCode).toBe(201);
      expect(created.json().tokenLast4).toBe(token.slice(-4));
      const id = created.json().id as string;
      const replies = [
        created,
        await f.call('GET', '/api/source-control-connections'),
        await f.call('POST', `/api/source-control-connections/${id}/check`),
        await f.call('GET', '/api/audit-entries'),
        await f.call('GET', '/api/error-events'),
      ];
      for (const reply of replies) expect(reply.body).not.toContain(token);
      expect(dumpPlaintext(f.db)).not.toContain(token);
      // a rejected token must not leak into errors or the audit trail either
      const rejected = await f.call('POST', '/api/source-control-connections', {
        name: 'bad',
        platform: 'github',
        token: 'ghp_rejectedSecretValue99',
      });
      expect(rejected.statusCode).toBe(422);
      expect(rejected.body).not.toContain('ghp_rejectedSecretValue99');
      expect(dumpPlaintext(f.db)).not.toContain('ghp_rejectedSecretValue99');
    } finally {
      await f.close();
    }
  });
  it('seals a Claude API key; it is never returned, stored in plaintext or audited', async () => {
    const f = await platformFixture();
    try {
      const apiKey = secretFixtures.claudeApiKey;
      const replacement = `${apiKey}-replacement`;
      const models = ['claude-sonnet-5-5'];
      f.anthropic.setKey(apiKey, { models });
      f.anthropic.setKey(replacement, { models });
      const created = await f.call('POST', '/api/provider-connections', {
        provider: 'claude',
        authType: 'api_key',
        name: 'work',
        apiKey,
      });
      expect(created.statusCode).toBe(201);
      const id = created.json().id as string;
      const replies = [
        created,
        await f.call('GET', '/api/provider-connections'),
        await f.call('PUT', `/api/provider-connections/${id}/api-key`, {
          apiKey: replacement,
        }),
        await f.call('POST', `/api/provider-connections/${id}/check`),
        await f.call('GET', `/api/provider-connections/${id}/impact`),
        await f.call('GET', '/api/audit-entries'),
        await f.call('GET', '/api/error-events'),
      ];
      for (const reply of replies)
        for (const secret of [apiKey, replacement])
          expect(reply.body).not.toContain(secret);
      const dump = dumpPlaintext(f.db);
      expect(dump).not.toContain(apiKey);
      expect(dump).not.toContain(replacement);
      // a rejected key must not leak into the error or the audit trail either
      const rejected = await f.call('POST', '/api/provider-connections', {
        provider: 'claude',
        authType: 'api_key',
        name: 'bad',
        apiKey: 'sk-ant-rejectedSecretValue-99',
      });
      expect(rejected.statusCode).toBe(422);
      expect(rejected.body).not.toContain('sk-ant-rejectedSecretValue-99');
      expect(dumpPlaintext(f.db)).not.toContain(
        'sk-ant-rejectedSecretValue-99',
      );
    } finally {
      await f.close();
    }
  });
  it('seals a Codex login bundle; its token is never returned, stored in plaintext, audited or logged', async () => {
    const { createFakeSandboxDriver, terminalFor } =
      await import('../fakes/fake-sandbox-driver');
    const driver = createFakeSandboxDriver();
    const f = await platformFixture({ driver });
    try {
      const secret = 'fake-secret-fake-1'; // what the fake driver writes as the token
      const started = await f.call('POST', '/api/sandbox-sessions', {
        provider: 'codex',
        name: 'codex',
      });
      const id = started.json().id as string;
      // sign in the way the terminal does, then finish
      await terminalFor(driver, 'fake-1');
      const done = await f.call('POST', `/api/sandbox-sessions/${id}/complete`);
      expect(done.statusCode).toBe(200);
      const connectionId = done.json().resultConnectionId as string;
      const replies = [
        started,
        done,
        await f.call('GET', `/api/sandbox-sessions/${id}`),
        await f.call('GET', '/api/provider-connections'),
        await f.call('POST', `/api/provider-connections/${connectionId}/check`),
        await f.call('GET', '/api/audit-entries'),
        await f.call('GET', '/api/error-events'),
      ];
      for (const reply of replies) expect(reply.body).not.toContain(secret);
      expect(dumpPlaintext(f.db)).not.toContain(secret);
      const sealed = f.db
        .prepare(
          'SELECT credentialBundleSealed AS blob FROM provider_connection WHERE id=?',
        )
        .get(connectionId) as { blob: Buffer };
      expect(sealed.blob.length).toBeGreaterThan(0);
      expect(sealed.blob.toString('latin1')).not.toContain(secret);
      expect(sealed.blob.toString('latin1')).not.toContain('auth.json');
    } finally {
      await f.close();
    }
  });
  it.todo('git clones leave no token in .git/config or remote URLs (US5)');
});
