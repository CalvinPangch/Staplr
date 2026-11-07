import Database from 'better-sqlite3';
import { parseConfig } from '../../src/server/config';
import { migrateUp } from '../../src/server/db/migrate';
import { buildApp } from '../../src/server/app';
import { createScheduler } from '../../src/server/modules/health/scheduler';
import { startPlatformFake } from '../fakes/platform-fake';
import { startAnthropicFake } from '../fakes/anthropic-fake';
import {
  createStartupRegistry,
  type StartupRegistry,
} from '../../src/server/lib/startup';
import type { SandboxDriver } from '../../src/server/modules/sandbox/driver';
import {
  createImpactRegistry,
  type ImpactRegistry,
} from '../../src/server/modules/providers/impact';
export const origin = 'http://localhost:3000';
export async function fixture(
  https = false,
  routeInventory?: { method: string; url: string }[],
  webRoot?: string,
  options: {
    env?: Record<string, string | undefined>;
    impactRegistry?: ImpactRegistry;
    driver?: SandboxDriver | null;
    startup?: StartupRegistry;
  } = {},
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
    impactRegistry: options.impactRegistry ?? createImpactRegistry(),
    sandboxDriver: options.driver ?? null,
    startup: options.startup ?? createStartupRegistry(),
  });
  return {
    db,
    app,
    config,
    scheduler,
    now: () => time,
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

/** An installation signed in as the owner, wired to fake GitHub/GitLab and Anthropic APIs. */
export async function platformFixture(
  options: { driver?: SandboxDriver; startup?: StartupRegistry } = {},
) {
  const fake = await startPlatformFake();
  const anthropic = await startAnthropicFake();
  const impactRegistry = createImpactRegistry();
  const f = await fixture(false, undefined, undefined, {
    env: {
      STAPLR_TEST_GITHUB_API_URL: fake.githubApiUrl,
      STAPLR_TEST_ANTHROPIC_API_URL: anthropic.url,
      STAPLR_CODEX_PROFILE: 'stub',
    },
    impactRegistry,
    driver: options.driver ?? null,
    ...(options.startup ? { startup: options.startup } : {}),
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
    anthropic,
    impactRegistry,
    cookie,
    call,
    async close() {
      f.scheduler.stop();
      await f.app.close();
      f.db.close();
      await fake.close();
      await anthropic.close();
    },
  };
}
