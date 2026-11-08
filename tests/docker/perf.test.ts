import { it, expect } from 'vitest';
import WebSocket from 'ws';
import type { AddressInfo } from 'node:net';
import { createDockerClient } from '../../src/server/lib/docker';
import { createDockerDriver } from '../../src/server/modules/sandbox/driver';
import { platformFixture } from '../integration/helpers';

/** Plan performance goals, measured against the stub image (not the real CLI). */
const docker = createDockerClient();
const image = 'staplr-sandbox-stub:test';

it('shows terminal output within 10 s of starting a login', async () => {
  const f = await platformFixture({
    driver: createDockerDriver(docker, image),
  });
  try {
    await f.app.listen({ port: 0, host: '127.0.0.1' });
    const port = (f.app.server.address() as AddressInfo).port;
    const began = performance.now();
    const started = await f.call('POST', '/api/sandbox-sessions', {
      provider: 'codex',
      name: 'perf',
    });
    const id = started.json().id as string;
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/api/sandbox-sessions/${id}/terminal`,
      {
        headers: {
          origin: f.config.publicUrl,
          cookie: `staplr_session=${f.cookie}`,
        },
      },
    );
    const firstOutput = await new Promise<number>((resolve, reject) => {
      socket.on('message', (raw) => {
        if ((JSON.parse(String(raw)) as { type: string }).type === 'output')
          resolve(performance.now() - began);
      });
      setTimeout(() => reject(new Error('no output in 10 s')), 10_000);
    });
    expect(firstOutput).toBeLessThan(10_000);
    socket.close();
    await f.call('DELETE', `/api/sandbox-sessions/${id}`);
  } finally {
    await f.close();
  }
});

it('checks 20 connections (10 stub Codex + 10 fake source control) within 60 s', async () => {
  const f = await platformFixture({
    driver: createDockerDriver(docker, image),
  });
  try {
    await f.app.listen({ port: 0, host: '127.0.0.1' });
    const port = (f.app.server.address() as AddressInfo).port;
    for (let i = 0; i < 10; i++) {
      f.fake.github.setToken(`ghp_perf${i}`, {
        login: `octo${i}`,
        kind: 'classic',
        scopes: ['repo'],
      });
      const added = await f.call('POST', '/api/source-control-connections', {
        name: `gh-${i}`,
        platform: 'github',
        token: `ghp_perf${i}`,
      });
      expect(added.statusCode).toBe(201);
    }
    // Ten Codex logins: sign each in through its own terminal.
    for (let i = 0; i < 10; i++) {
      const started = await f.call('POST', '/api/sandbox-sessions', {
        provider: 'codex',
        name: `codex-${i}`,
      });
      const id = started.json().id as string;
      const socket = new WebSocket(
        `ws://127.0.0.1:${port}/api/sandbox-sessions/${id}/terminal`,
        {
          headers: {
            origin: f.config.publicUrl,
            cookie: `staplr_session=${f.cookie}`,
          },
        },
      );
      await new Promise<void>((resolve) =>
        socket.once('open', () => resolve()),
      );
      const complete = new Promise<void>((resolve) =>
        socket.on('message', (raw) => {
          if (String(raw).includes('Login complete')) resolve();
        }),
      );
      socket.send(JSON.stringify({ type: 'input', data: 'OK\n' }));
      await complete;
      const done = await f.call('POST', `/api/sandbox-sessions/${id}/complete`);
      expect(done.statusCode).toBe(200);
      socket.close();
    }
    // Model discovery after each sign-in is measured on its own (SC-002,
    // model-discovery.test.ts); this goal is about the checks.
    const discoveryBegan = performance.now();
    await f.app.providers.whenDiscoveryIdle();
    console.log(
      `sign-in discovery for 10 logins took ${Math.round(performance.now() - discoveryBegan)} ms`,
    );
    const began = performance.now();
    await f.scheduler.runAll();
    expect(performance.now() - began).toBeLessThan(60_000);
    await f.app.providers.whenDiscoveryIdle();
    const connections = (
      await f.call('GET', '/api/provider-connections')
    ).json() as { status: string }[];
    expect(connections.every((c) => c.status === 'connected')).toBe(true);
  } finally {
    await f.close();
  }
}, 180_000);
