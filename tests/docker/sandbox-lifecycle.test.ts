import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import type { AddressInfo } from 'node:net';
import { createDockerClient } from '../../src/server/lib/docker';
import { createDockerDriver } from '../../src/server/modules/sandbox/driver';
import { platformFixture } from '../integration/helpers';

/**
 * Runs the real Docker driver against the STUB image (a fake Codex, built with
 * `npm run sandbox:build -- stub`). It proves Staplr's container handling; it
 * proves nothing about the real Codex CLI.
 */
const docker = createDockerClient();
const image = 'staplr-sandbox-stub:test';
let f: Awaited<ReturnType<typeof platformFixture>>;
let port: number;

const labeled = async () =>
  (
    await docker.listContainers({
      all: true,
      filters: { label: ['staplr.sandbox'] },
    })
  ).length;

beforeAll(async () => {
  f = await platformFixture({ driver: createDockerDriver(docker, image) });
  await f.app.listen({ port: 0, host: '127.0.0.1' });
  port = (f.app.server.address() as AddressInfo).port;
});
afterAll(async () => {
  await f.close();
});

function terminal(id: string) {
  const socket = new WebSocket(
    `ws://127.0.0.1:${port}/api/sandbox-sessions/${id}/terminal`,
    {
      headers: {
        origin: f.config.publicUrl,
        cookie: `staplr_session=${f.cookie}`,
      },
    },
  );
  let text = '';
  socket.on('message', (raw) => {
    const message = JSON.parse(String(raw)) as { type: string; data?: string };
    if (message.type === 'output') text += message.data;
  });
  return {
    socket,
    opened: new Promise<void>((resolve) =>
      socket.once('open', () => resolve()),
    ),
    seen: async (pattern: RegExp, timeoutMs = 20_000) => {
      const end = Date.now() + timeoutMs;
      while (!pattern.test(text)) {
        if (Date.now() > end) throw new Error('terminal output did not appear');
        await new Promise((r) => setTimeout(r, 100));
      }
    },
  };
}

describe('sandbox login in real containers (stub image)', () => {
  it('refuses to complete before login, then saves the login and destroys the sandbox', async () => {
    const started = await f.call('POST', '/api/sandbox-sessions', {
      provider: 'codex',
      name: 'docker',
    });
    expect(started.statusCode).toBe(201);
    const id = started.json().id as string;
    expect(await labeled()).toBe(1);

    const early = await f.call('POST', `/api/sandbox-sessions/${id}/complete`);
    expect(early.statusCode).toBe(409);
    expect(early.json().code).toBe('login_not_complete');

    const t = terminal(id);
    await t.opened;
    await t.seen(/STUB-1234/);
    t.socket.send(JSON.stringify({ type: 'input', data: 'OK\n' }));
    await t.seen(/Login complete/);

    const done = await f.call('POST', `/api/sandbox-sessions/${id}/complete`);
    expect(done.statusCode).toBe(200);
    expect(done.json().status).toBe('succeeded');
    t.socket.close();
    expect(await labeled()).toBe(0);

    // The stored login is restored into a fresh container and checked there.
    const connectionId = done.json().resultConnectionId as string;
    const checked = await f.call(
      'POST',
      `/api/provider-connections/${connectionId}/check`,
    );
    expect(checked.statusCode).toBe(200);
    expect(checked.json().status).toBe('connected');
    expect(JSON.stringify(checked.json())).not.toContain('stub-secret');
    expect(await labeled()).toBe(0);
  });

  it('an expired login is saved, then reported as needing re-login when checked', async () => {
    const started = await f.call('POST', '/api/sandbox-sessions', {
      provider: 'codex',
      name: 'expired',
    });
    const id = started.json().id as string;
    const t = terminal(id);
    await t.opened;
    await t.seen(/STUB-1234/);
    t.socket.send(JSON.stringify({ type: 'input', data: 'OK expired=true\n' }));
    await t.seen(/Login complete/);
    const done = await f.call('POST', `/api/sandbox-sessions/${id}/complete`);
    expect(done.statusCode).toBe(200);
    t.socket.close();
    const checked = await f.call(
      'POST',
      `/api/provider-connections/${done.json().resultConnectionId}/check`,
    );
    expect(checked.json()).toMatchObject({ status: 'needs_relogin' });
  });

  it('cancelling removes the container and saves nothing', async () => {
    const before = (await f.call('GET', '/api/provider-connections')).json()
      .length as number;
    const started = await f.call('POST', '/api/sandbox-sessions', {
      provider: 'codex',
      name: 'cancel',
    });
    const id = started.json().id as string;
    expect(await labeled()).toBe(1);
    expect(
      (await f.call('DELETE', `/api/sandbox-sessions/${id}`)).statusCode,
    ).toBe(204);
    expect(await labeled()).toBe(0);
    expect(
      (await f.call('GET', '/api/provider-connections')).json(),
    ).toHaveLength(before);
  });

  it('runs concurrent logins in separate containers', async () => {
    const ids = await Promise.all(
      ['a', 'b'].map(
        async (name) =>
          (
            await f.call('POST', '/api/sandbox-sessions', {
              provider: 'codex',
              name: `concurrent-${name}`,
            })
          ).json().id as string,
      ),
    );
    expect(await labeled()).toBe(2);
    await Promise.all(
      ids.map((id) => f.call('DELETE', `/api/sandbox-sessions/${id}`)),
    );
    expect(await labeled()).toBe(0);
  });

  it('sweeps idle sessions after the idle time', async () => {
    const started = await f.call('POST', '/api/sandbox-sessions', {
      provider: 'codex',
      name: 'idle',
    });
    const id = started.json().id as string;
    f.advance(16 * 60_000);
    await f.app.sandbox.sweep();
    expect(
      (await f.call('GET', `/api/sandbox-sessions/${id}`)).json().status,
    ).toBe('expired');
    expect(await labeled()).toBe(0);
  });
});
