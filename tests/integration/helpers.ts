import Database from 'better-sqlite3';
import { parseConfig } from '../../src/server/config';
import { migrateUp } from '../../src/server/db/migrate';
import { buildApp } from '../../src/server/app';
import { createScheduler } from '../../src/server/modules/health/scheduler';
import { startPlatformFake } from '../fakes/platform-fake';
export const origin = 'http://localhost:3000';
export async function fixture(
  https = false,
  routeInventory?: { method: string; url: string }[],
  webRoot?: string,
  options: { env?: Record<string, string | undefined> } = {},
) {
  const db = new Database(':memory:');
  migrateUp(db);
  let time = Date.parse('2026-11-08T00:00:00Z');
  const config = parseConfig({
    STAPLR_MASTER_KEY: Buffer.alloc(32, 1).toString('base64'),
    SESSION_SECRET: 'test-session-secret-at-least-32-characters',
    PUBLIC_URL: https ? 'https://localhost:3000' : origin,
    STAPLR_TEST_MODE: '1',
    ...options.env,
  });
  const scheduler = createScheduler();
  const app = buildApp({
    db,
    config,
    clock: () => time,
    routeInventory,
    webRoot,
    scheduler,
  });
  return {
    db,
    app,
    config,
    scheduler,
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

/** An installation signed in as the owner, wired to a fake GitHub/GitLab. */
export async function platformFixture() {
  const fake = await startPlatformFake();
  const f = await fixture(false, undefined, undefined, {
    env: { STAPLR_TEST_GITHUB_API_URL: fake.githubApiUrl },
  });
  const cookie = await signedIn(f);
  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    payload?: unknown,
  ) =>
    f.app.inject({
      method,
      url,
      headers: { origin: f.config.publicUrl },
      cookies: { staplr_session: cookie },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
  return {
    ...f,
    fake,
    cookie,
    call,
    async close() {
      f.scheduler.stop();
      await f.app.close();
      f.db.close();
      await fake.close();
    },
  };
}
