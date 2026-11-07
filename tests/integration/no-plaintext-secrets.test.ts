import { describe, it, expect } from 'vitest';
import type Database from 'better-sqlite3';
import { fixture, credentials, origin } from './helpers';

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
  it.todo('GitHub/GitLab token is sealed; only tokenLast4 is ever shown (US1)');
  it.todo('Claude API key is sealed and never returned or logged (US2)');
  it.todo('Codex bundle is sealed; no auth.json on the host disk (US2)');
  it.todo('git clones leave no token in .git/config or remote URLs (US5)');
});
