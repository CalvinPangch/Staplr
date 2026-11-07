import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { platformFixture } from './helpers';
import {
  createFakeSandboxDriver,
  type FakeSandboxDriver,
} from '../fakes/fake-sandbox-driver';

/**
 * Codex sandbox login, service level, with an in-memory driver. The real
 * Docker behaviour (hardening, tmpfs, exec-tar) is covered by the Docker tests.
 */
let driver: FakeSandboxDriver;
let f: Awaited<ReturnType<typeof platformFixture>>;
beforeEach(async () => {
  driver = createFakeSandboxDriver();
  f = await platformFixture({ driver });
});
afterEach(async () => {
  await f.close();
});

const start = (payload: object) =>
  f.call('POST', '/api/sandbox-sessions', { provider: 'codex', ...payload });
const complete = (id: string) =>
  f.call('POST', `/api/sandbox-sessions/${id}/complete`);

/** Opens the terminal as the browser would, signs in, and waits for the CLI. */
async function signIn(id: string, line = 'OK') {
  const { stream } = await f.app.sandbox.attach(id);
  let output = '';
  const finished = new Promise<void>((resolve) => {
    stream.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
      if (output.includes('Login complete.')) resolve();
    });
  });
  stream.write(`${line}\n`);
  await finished;
}

interface Connection {
  id: string;
  provider: string;
  authType: string;
  status: string;
  credentialRevision: number;
  lastCheckResult: string | null;
  credentialExpiresAt: string | null;
}
const connections = async () =>
  (await f.call('GET', '/api/provider-connections')).json() as Connection[];
const sessionRow = (id: string) =>
  f.db.prepare('SELECT * FROM sandbox_login_session WHERE id=?').get(id) as {
    status: string;
    failureReason: string | null;
    containerId: string | null;
    endedAt: string | null;
    resultConnectionId: string | null;
  };
const audit = () =>
  (
    f.db
      .prepare('SELECT action,targetName FROM audit_entry ORDER BY rowid')
      .all() as {
      action: string;
      targetName: string;
    }[]
  ).map((a) => `${a.action}:${a.targetName}`);

async function connect(name: string, line = 'OK') {
  const session = (await start({ name })).json();
  await signIn(session.id, line);
  const done = await complete(session.id);
  expect(done.statusCode).toBe(200);
  return done.json().resultConnectionId as string;
}

describe('starting and completing a login', () => {
  it('starts a session, refuses completion before sign-in, then saves an encrypted connection and destroys the sandbox', async () => {
    const reply = await start({ name: 'my codex' });
    expect(reply.statusCode).toBe(201);
    const session = reply.json();
    expect(session).toMatchObject({
      provider: 'codex',
      status: 'in_progress',
      failureReason: null,
      resultConnectionId: null,
      terminalUrl: `/api/sandbox-sessions/${session.id}/terminal`,
      expiresAt: '2026-11-08T00:15:00.000Z',
    });
    expect(session.instructions.length).toBeGreaterThan(40);
    expect(driver.live()).toHaveLength(1);

    const early = await complete(session.id);
    expect(early.statusCode).toBe(409);
    expect(early.json().code).toBe('login_not_complete');
    expect(sessionRow(session.id).status).toBe('in_progress');
    expect(await connections()).toHaveLength(0);

    await signIn(session.id);
    const done = await complete(session.id);
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({
      status: 'succeeded',
      failureReason: null,
    });
    const connection = (await connections())[0];
    expect(connection).toMatchObject({
      id: done.json().resultConnectionId,
      provider: 'codex',
      authType: 'codex_login',
      status: 'connected',
      credentialRevision: 1,
    });
    const row = f.db
      .prepare(
        'SELECT credentialBundleSealed,apiKeySealed FROM provider_connection',
      )
      .get() as { credentialBundleSealed: Buffer; apiKeySealed: Buffer | null };
    expect(row.apiKeySealed).toBeNull();
    expect(row.credentialBundleSealed.toString('latin1')).not.toContain(
      'fake-secret',
    );
    expect(done.body).not.toContain('fake-secret');
    expect(driver.live()).toHaveLength(0);
    expect(sessionRow(session.id)).toMatchObject({
      status: 'succeeded',
      containerId: null,
    });
    expect(sessionRow(session.id).endedAt).not.toBeNull();
    expect(audit()).toEqual(['provider.added:my codex']);
  });

  it('records the credential expiry when the CLI reports one', async () => {
    const id = await connect(
      'expiring',
      'OK expires_at=2027-01-01T00:00:00.000Z',
    );
    expect(
      (await connections()).find((c) => c.id === id)?.credentialExpiresAt,
    ).toBe('2027-01-01T00:00:00.000Z');
  });

  it('validates the request: a name or a connection to re-login, never both, and never Claude', async () => {
    for (const payload of [
      {},
      { name: '' },
      { name: 'a', reloginOf: 'b' },
      { name: 'x'.repeat(81) },
      { name: 'a', extra: true },
    ])
      expect((await start(payload)).statusCode, JSON.stringify(payload)).toBe(
        422,
      );
    const claude = await f.call('POST', '/api/sandbox-sessions', {
      provider: 'claude',
      name: 'nope',
    });
    expect(claude.statusCode).toBe(422);
    expect(claude.json().code).toBe('unsupported_provider');
    expect(driver.containers.size).toBe(0);
    expect((await start({ reloginOf: 'missing' })).statusCode).toBe(404);
  });

  it('refuses a name that is already taken, and a re-login of a Claude connection', async () => {
    await connect('taken');
    const clash = await start({ name: 'TAKEN' });
    expect(clash.statusCode).toBe(409);
    f.anthropic.setKey('sk-ant-x', { models: ['claude-sonnet-5-5'] });
    const claude = (
      await f.call('POST', '/api/provider-connections', {
        provider: 'claude',
        authType: 'api_key',
        name: 'claude',
        apiKey: 'sk-ant-x',
      })
    ).json();
    const relogin = await start({ reloginOf: claude.id });
    expect(relogin.statusCode).toBe(422);
    expect(relogin.json().code).toBe('unsupported_provider');
  });

  it('reports docker_unavailable when no sandbox can be created, and leaves nothing running', async () => {
    driver.failCreate = true;
    const reply = await start({ name: 'x' });
    expect(reply.statusCode).toBe(503);
    expect(reply.json().code).toBe('docker_unavailable');
    expect(
      f.db
        .prepare(
          "SELECT COUNT(*) AS n FROM sandbox_login_session WHERE status='in_progress'",
        )
        .get(),
    ).toEqual({ n: 0 });
  });

  it('lets two logins run at once, each creating its own connection', async () => {
    const a = (await start({ name: 'one' })).json().id as string;
    const b = (await start({ name: 'two' })).json().id as string;
    await Promise.all([signIn(a), signIn(b)]);
    expect((await complete(a)).statusCode).toBe(200);
    expect((await complete(b)).statusCode).toBe(200);
    expect((await connections()).map((c) => c.id)).toHaveLength(2);
    expect(driver.live()).toHaveLength(0);
  });
});

describe('cancelling, timing out and ending sessions', () => {
  it('cancel destroys the sandbox and saves nothing; ending twice is harmless', async () => {
    const id = (await start({ name: 'x' })).json().id as string;
    await signIn(id);
    expect(
      (await f.call('DELETE', `/api/sandbox-sessions/${id}`)).statusCode,
    ).toBe(204);
    expect(sessionRow(id).status).toBe('cancelled');
    expect(driver.live()).toHaveLength(0);
    expect(await connections()).toHaveLength(0);
    expect(
      (await f.call('DELETE', `/api/sandbox-sessions/${id}`)).statusCode,
    ).toBe(204);
    expect(
      (await f.call('DELETE', '/api/sandbox-sessions/nope')).statusCode,
    ).toBe(404);
    expect((await complete(id)).statusCode).toBe(409);
    expect((await f.call('GET', '/api/sandbox-sessions/nope')).statusCode).toBe(
      404,
    );
    expect(
      (await f.call('GET', `/api/sandbox-sessions/${id}`)).json().status,
    ).toBe('cancelled');
  });

  it('expires after 15 minutes without activity, and activity resets the clock', async () => {
    const id = (await start({ name: 'x' })).json().id as string;
    f.advance(14 * 60_000);
    await f.app.sandbox.sweep();
    expect(sessionRow(id).status).toBe('in_progress');
    f.app.sandbox.touch(id);
    f.advance(14 * 60_000);
    await f.app.sandbox.sweep();
    expect(sessionRow(id).status).toBe('in_progress');
    f.advance(61_000);
    await f.app.sandbox.sweep();
    expect(sessionRow(id)).toMatchObject({
      status: 'expired',
      containerId: null,
    });
    expect(driver.live()).toHaveLength(0);
    expect((await complete(id)).statusCode).toBe(409);
    expect(await connections()).toHaveLength(0);
  });

  it('reports an ended session as such when the user tries to complete it', async () => {
    const id = (await start({ name: 'x' })).json().id as string;
    await signIn(id);
    await complete(id);
    const again = await complete(id);
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe('conflict');
  });
});

describe('re-login', () => {
  it('replaces the credentials in place, keeps the id, bumps the revision and audits it', async () => {
    const id = await connect('work');
    const before = f.db
      .prepare(
        'SELECT credentialBundleSealed AS b FROM provider_connection WHERE id=?',
      )
      .get(id) as { b: Buffer };
    const session = (await start({ reloginOf: id })).json();
    expect(session.status).toBe('in_progress');
    await signIn(session.id);
    const done = await complete(session.id);
    expect(done.json()).toMatchObject({
      status: 'succeeded',
      resultConnectionId: id,
    });
    const connection = (await connections()).find((c) => c.id === id);
    expect(connection).toMatchObject({
      status: 'connected',
      credentialRevision: 2,
    });
    const after = f.db
      .prepare(
        'SELECT credentialBundleSealed AS b FROM provider_connection WHERE id=?',
      )
      .get(id) as { b: Buffer };
    expect(after.b.equals(before.b)).toBe(false);
    expect(await connections()).toHaveLength(1);
    expect(audit()).toEqual(['provider.added:work', 'provider.relogged:work']);
  });

  it('keeps the old credentials when the re-login is cancelled, expires, or is not finished', async () => {
    const id = await connect('work');
    const read = () =>
      f.db
        .prepare(
          'SELECT credentialBundleSealed AS b, credentialRevision AS r FROM provider_connection WHERE id=?',
        )
        .get(id) as { b: Buffer; r: number };
    const before = read();
    const unfinished = (await start({ reloginOf: id })).json().id as string;
    expect((await complete(unfinished)).statusCode).toBe(409);
    await f.call('DELETE', `/api/sandbox-sessions/${unfinished}`);
    const idle = (await start({ reloginOf: id })).json().id as string;
    f.advance(16 * 60_000);
    await f.app.sandbox.sweep();
    expect(sessionRow(idle).status).toBe('expired');
    const after = read();
    expect(after.r).toBe(1);
    expect(after.b.equals(before.b)).toBe(true);
    expect(audit()).toEqual(['provider.added:work']);
  });

  it('a re-login that finishes clears an expired state', async () => {
    const id = await connect('work', 'OK expired=true');
    await f.call('POST', `/api/provider-connections/${id}/check`);
    expect((await connections())[0]?.status).toBe('needs_relogin');
    const session = (await start({ reloginOf: id })).json();
    await signIn(session.id);
    await complete(session.id);
    expect((await connections())[0]).toMatchObject({
      status: 'connected',
      credentialRevision: 2,
    });
  });
});

describe('Codex health and exact-model checks', () => {
  it('a valid login stays connected; the stored login is restored into a fresh sandbox for each check', async () => {
    const id = await connect('work');
    const checked = await f.call(
      'POST',
      `/api/provider-connections/${id}/check`,
    );
    expect(checked.statusCode).toBe(200);
    expect(checked.json()).toMatchObject({ status: 'connected' });
    expect(checked.json().lastCheckResult).toMatch(/verified/i);
    const status = driver.commands.filter((c) => c[0] === 'stub-status');
    expect(status.length).toBeGreaterThan(0);
    expect(driver.live()).toHaveLength(0);
    expect(JSON.stringify(driver.commands)).not.toContain('fake-secret');
  });

  it('an expired login becomes needs_relogin and says Re-login', async () => {
    const id = await connect('work', 'OK expired=true');
    const checked = await f.call(
      'POST',
      `/api/provider-connections/${id}/check`,
    );
    expect(checked.json()).toMatchObject({ status: 'needs_relogin' });
    expect(checked.json().lastCheckResult).toMatch(/re-login/i);
  });

  it('model denial changes only that pair; the probe checks exactly the model asked for', async () => {
    const id = await connect('work', 'OK denied=gpt-6-astra');
    const denied = await f.call(
      'POST',
      `/api/provider-connections/${id}/models/gpt-6-astra/check`,
    );
    expect(denied.json()).toMatchObject({
      id: 'gpt-6-astra',
      availability: 'unavailable',
      checkError: null,
    });
    const allowed = await f.call(
      'POST',
      `/api/provider-connections/${id}/models/gpt-6-luna/check`,
    );
    expect(allowed.json()).toMatchObject({
      id: 'gpt-6-luna',
      availability: 'available',
    });
    expect((await connections())[0]?.status).toBe('connected');
    const probes = driver.commands
      .filter((c) => c[0] === 'stub-probe')
      .map((c) => c[1]);
    expect(probes).toEqual(['gpt-6-astra', 'gpt-6-luna']);
    const unchecked = f.app.providers
      .listModelAccess(id)
      .find((m) => m.id === 'gpt-6.1-sol');
    expect(unchecked).toMatchObject({
      availability: 'unknown',
      lastVerifiedAt: null,
    });
  });

  it('a transient failure keeps the confirmed status and evidence and explains the retry', async () => {
    const id = await connect('work', 'OK transient=1');
    const checked = await f.call(
      'POST',
      `/api/provider-connections/${id}/check`,
    );
    expect(checked.json()).toMatchObject({ status: 'connected' });
    expect(checked.json().lastCheckResult).toMatch(/could not run|again/i);
    const model = await f.call(
      'POST',
      `/api/provider-connections/${id}/models/gpt-6-luna/check`,
    );
    expect(model.json()).toMatchObject({
      availability: 'unknown',
      checkError: 'service_unavailable',
    });
  });

  it('keeps 720 hourly checks green, flips on revocation, and ignores outages', async () => {
    const id = await connect('work');
    f.anthropic.setKey('sk-ant-long', { models: ['claude-sonnet-5-5'] });
    const claude = (
      await f.call('POST', '/api/provider-connections', {
        provider: 'claude',
        authType: 'api_key',
        name: 'claude',
        apiKey: 'sk-ant-long',
      })
    ).json().id as string;
    // Checks run on a timer, not through the browser session; keep the owner's
    // session alive so this test can read the results over the API.
    const keepSignedIn = () =>
      f.db
        .prepare('UPDATE session SET expiresAt=?, lastSeenAt=?')
        .run(
          new Date(f.now() + 8.64e9).toISOString(),
          new Date(f.now()).toISOString(),
        );
    const statusOf = async (connectionId: string) =>
      (await connections()).find((c) => c.id === connectionId)?.status;
    for (let hour = 0; hour < 720; hour++) {
      f.advance(3_600_000);
      await f.scheduler.runAll();
      keepSignedIn();
    }
    expect(await statusOf(id)).toBe('connected');
    expect(await statusOf(claude)).toBe('connected');

    f.advance(3_600_000);
    keepSignedIn();
    f.anthropic.setKey('sk-ant-long', { models: [], failWith: 503 });
    await f.scheduler.runAll();
    expect(await statusOf(claude)).toBe('connected');

    f.advance(3_600_000);
    keepSignedIn();
    driver.revokeAll();
    f.anthropic.setKey('sk-ant-long', { models: [], reject: true });
    await f.scheduler.runAll();
    expect(await statusOf(id)).toBe('needs_relogin');
    expect(await statusOf(claude)).toBe('needs_relogin');
  });
});
