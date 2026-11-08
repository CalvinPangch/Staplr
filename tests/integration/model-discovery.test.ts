import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { platformFixture } from './helpers';
import { dumpPlaintext } from './no-plaintext-secrets.test';
import {
  createFakeSandboxDriver,
  terminalFor,
  type FakeSandboxDriver,
} from '../fakes/fake-sandbox-driver';

let driver: FakeSandboxDriver;
let f: Awaited<ReturnType<typeof platformFixture>>;
beforeEach(async () => {
  driver = createFakeSandboxDriver();
  f = await platformFixture({ driver });
});
afterEach(async () => {
  driver.probeGate = null;
  await f.app.providers.whenDiscoveryIdle();
  await f.close();
});

interface Model {
  id: string;
  label: string;
  availability: string;
  discovered?: boolean;
  checking?: boolean;
}

/** Signs in to Codex through the fake terminal with the given login options. */
async function signIn(line: string, name = 'codex') {
  const started = await f.call('POST', '/api/sandbox-sessions', {
    provider: 'codex',
    name,
  });
  const session = started.json().id as string;
  const container = [...driver.containers.keys()].at(-1) as string;
  await terminalFor(driver, container, line);
  const done = await f.call(
    'POST',
    `/api/sandbox-sessions/${session}/complete`,
  );
  expect(done.statusCode).toBe(200);
  return done.json().resultConnectionId as string;
}
const connection = async (id: string) =>
  (
    (await f.call('GET', '/api/provider-connections')).json() as {
      id: string;
      status: string;
      discoveryStatus: string;
      discoveryError: string | null;
      modelsRefreshedAt: string | null;
    }[]
  ).find((c) => c.id === id);
const models = async (id: string) =>
  (await f.call('GET', `/api/models?providerConnectionId=${id}`)).json() as {
    discoveryStatus: string;
    models: Model[];
  };
const byId = (list: Model[]) => Object.fromEntries(list.map((m) => [m.id, m]));
const probes = () => driver.commands.filter((c) => c[0] === 'stub-probe');

describe('after a Codex sign-in', () => {
  it('discovers the models the login can use without any action', async () => {
    const id = await signIn(
      'OK models=gpt-6-astra,gpt-6.1-sol denied=gpt-6.1-sol',
    );
    await f.app.providers.whenDiscoveryIdle();
    const c = await connection(id);
    expect(c?.discoveryStatus).toBe('finished');
    expect(c?.modelsRefreshedAt).toMatch(/^2026-/);
    const list = byId((await models(id)).models);
    expect(list['gpt-6-astra']).toMatchObject({
      availability: 'available',
      discovered: true,
    });
    expect(list['gpt-6.1-sol']).toMatchObject({
      availability: 'unavailable',
      discovered: true,
    });
    // a shipped catalog model the login did not list is known to be unavailable, not "not checked"
    expect(list['gpt-6-luna']).toMatchObject({
      availability: 'unavailable',
      discovered: false,
    });
    expect(Object.values(list).some((m) => m.availability === 'unknown')).toBe(
      false,
    );
    // hidden entries are never offered
    expect(list['stub-hidden']).toBeUndefined();
  });

  it('checks each listed model exactly once', async () => {
    await signIn('OK models=gpt-6-astra,gpt-6.1-sol,gpt-6-luna');
    await f.app.providers.whenDiscoveryIdle();
    expect(
      probes()
        .map((c) => c[1])
        .sort(),
    ).toEqual(['gpt-6-astra', 'gpt-6-luna', 'gpt-6.1-sol']);
  });

  it('remembers and offers a model Staplr has never heard of', async () => {
    const id = await signIn('OK models=gpt-brand-new');
    await f.app.providers.whenDiscoveryIdle();
    const list = byId((await models(id)).models);
    expect(list['gpt-brand-new']).toMatchObject({
      availability: 'available',
      discovered: true,
      label: 'Stub gpt-brand-new',
    });
    const souls = (await f.call('GET', '/api/souls')).json() as {
      id: string;
      roleType: string;
      isDefault: boolean;
    }[];
    const agent = await f.call('POST', '/api/agents', {
      name: 'new model agent',
      soulId: souls.find((s) => s.isDefault && s.roleType === 'developer')?.id,
      provider: 'codex',
      providerConnectionId: id,
      model: 'gpt-brand-new',
    });
    expect(agent.statusCode).toBe(201);
    expect(agent.json().readiness).toBe('ready');
  });

  it('shows checking while discovery runs, then the answer', async () => {
    let release: () => void = () => undefined;
    driver.probeGate = new Promise<void>((resolve) => (release = resolve));
    const id = await signIn('OK models=gpt-6-astra');
    await vi.waitFor(async () =>
      expect((await connection(id))?.discoveryStatus).toBe('running'),
    );
    const during = await models(id);
    expect(during.discoveryStatus).toBe('running');
    expect(byId(during.models)['gpt-6-astra']).toMatchObject({
      checking: true,
    });
    release();
    await f.app.providers.whenDiscoveryIdle();
    expect(byId((await models(id)).models)['gpt-6-astra']).toMatchObject({
      checking: false,
      availability: 'available',
    });
  });

  it('finishes with no models when the account can use none', async () => {
    const id = await signIn('OK models=-');
    await f.app.providers.whenDiscoveryIdle();
    expect((await connection(id))?.discoveryStatus).toBe('finished');
    expect(
      (await models(id)).models.filter((m) => m.availability === 'available'),
    ).toEqual([]);
  });

  it('marks the connection needs re-login if the login is rejected during discovery', async () => {
    driver.revokeAll();
    const id = await signIn('OK models=gpt-6-astra');
    await f.app.providers.whenDiscoveryIdle();
    const c = await connection(id);
    expect(c?.status).toBe('needs_relogin');
    expect(
      (await models(id)).models.filter((m) => m.availability === 'available'),
    ).toEqual([]);
  });

  it('never reveals the login', async () => {
    const id = await signIn('OK models=gpt-6-astra');
    await f.app.providers.whenDiscoveryIdle();
    const replies = [
      await f.call('GET', '/api/provider-connections'),
      await f.call('GET', `/api/models?providerConnectionId=${id}`),
      await f.call('GET', '/api/audit-entries'),
      await f.call('GET', '/api/error-events'),
    ];
    for (const reply of replies)
      expect(reply.body).not.toContain('fake-secret');
    expect(dumpPlaintext(f.db)).not.toContain('fake-secret');
    const audit = (await f.call('GET', '/api/audit-entries')).json() as {
      action: string;
    }[];
    expect(audit.map((a) => a.action)).toContain('models.discovered');
  });

  it('leaves Claude connections alone', async () => {
    f.anthropic.setKey('sk-ant-discovery', { models: ['claude-sonnet-5-5'] });
    const claude = (
      await f.call('POST', '/api/provider-connections', {
        provider: 'claude',
        authType: 'api_key',
        name: 'claude',
        apiKey: 'sk-ant-discovery',
      })
    ).json().id as string;
    await f.app.providers.whenDiscoveryIdle();
    expect((await connection(claude))?.discoveryStatus).toBe('not_started');
  });
});
