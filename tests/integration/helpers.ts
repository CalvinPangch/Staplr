import Database from 'better-sqlite3';
import { parseConfig } from '../../src/server/config';
import { migrateUp } from '../../src/server/db/migrate';
import { buildApp } from '../../src/server/app';
export const origin = 'http://localhost:3000';
export async function fixture(
  https = false,
  routeInventory?: { method: string; url: string }[],
  webRoot?: string,
) {
  const db = new Database(':memory:');
  migrateUp(db);
  let time = Date.parse('2026-11-08T00:00:00Z');
  const config = parseConfig({
    STAPLR_MASTER_KEY: Buffer.alloc(32, 1).toString('base64'),
    SESSION_SECRET: 'test-session-secret-at-least-32-characters',
    PUBLIC_URL: https ? 'https://localhost:3000' : origin,
    STAPLR_TEST_MODE: '1',
  });
  const app = buildApp({
    db,
    config,
    clock: () => time,
    routeInventory,
    webRoot,
  });
  return {
    db,
    app,
    config,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
export const credentials = {
  username: 'owner',
  password: 'test-only-long-password',
};
export async function signedIn(f: Awaited<ReturnType<typeof fixture>>) {
  const reply = await f.app.inject({
    method: 'POST',
    url: '/api/setup',
    headers: { origin: f.config.publicUrl },
    payload: credentials,
  });
  if (reply.statusCode !== 201) throw new Error('Fixture setup failed');
  return reply.cookies[0]?.value ?? '';
}
