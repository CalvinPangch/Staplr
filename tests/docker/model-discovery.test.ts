import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import type { AddressInfo } from 'node:net';
import { createDockerClient } from '../../src/server/lib/docker';
import { createDockerDriver } from '../../src/server/modules/sandbox/driver';
import { platformFixture } from '../integration/helpers';

/**
 * Model discovery in real containers with the STUB image (feature 002, SC-002).
 * It proves Staplr's discovery run against Docker, not the real Codex CLI.
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

/** Signs in through the real terminal socket and completes the session. */
async function signIn(name: string, line: string): Promise<string> {
  const started = await f.call('POST', '/api/sandbox-sessions', {
    provider: 'codex',
    name,
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
  let text = '';
  socket.on('message', (raw) => {
    const message = JSON.parse(String(raw)) as { type: string; data?: string };
    if (message.type === 'output') text += message.data;
  });
  await new Promise<void>((resolve) => socket.once('open', () => resolve()));
  const seen = async (pattern: RegExp) => {
    const end = Date.now() + 20_000;
    while (!pattern.test(text)) {
      if (Date.now() > end) throw new Error('terminal output did not appear');
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  await seen(/STUB-1234/);
  socket.send(JSON.stringify({ type: 'input', data: `${line}\n` }));
  await seen(/Login complete/);
  const done = await f.call('POST', `/api/sandbox-sessions/${id}/complete`);
  expect(done.statusCode).toBe(200);
  socket.close();
  return done.json().resultConnectionId as string;
}

const models = async (id: string) =>
  Object.fromEntries(
    (
      (await f.call('GET', `/api/models?providerConnectionId=${id}`)).json()
        .models as { id: string; availability: string }[]
    ).map((m) => [m.id, m.availability]),
  );

describe('model discovery in real containers (stub image)', () => {
  it('records listed models as available or denied and removes every sandbox', async () => {
    const id = await signIn('discover', 'OK models=m1,m2,m3 denied=m2');
    await f.app.providers.whenDiscoveryIdle();
    const list = await models(id);
    expect(list).toMatchObject({
      m1: 'available',
      m2: 'unavailable',
      m3: 'available',
    });
    expect(await labeled()).toBe(0);
  }, 180_000);

  it('finishes ten models within 120 seconds of sign-in (SC-002)', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => `model-${i + 1}`);
    const id = await signIn('ten', `OK models=${ten.join(',')}`);
    const started = Date.now();
    await f.app.providers.whenDiscoveryIdle();
    expect(Date.now() - started).toBeLessThan(120_000);
    const connection = (
      (await f.call('GET', '/api/provider-connections')).json() as {
        id: string;
        discoveryStatus: string;
      }[]
    ).find((c) => c.id === id);
    expect(connection?.discoveryStatus).toBe('finished');
    const list = await models(id);
    for (const model of ten) expect(list[model]).toBe('available');
    expect(await labeled()).toBe(0);
  }, 180_000);
});
