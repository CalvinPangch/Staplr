import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { platformFixture } from './helpers';
import { dumpPlaintext } from './no-plaintext-secrets.test';
import {
  createFakeSandboxDriver,
  terminalFor,
  type FakeSandboxDriver,
} from '../fakes/fake-sandbox-driver';
import { agentBody } from './agent-helpers';

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
    const agent = await f.call(
      'POST',
      '/api/agents',
      await agentBody(f, {
        name: 'new model agent',
        role: 'developer',
        provider: 'codex',
        providerConnectionId: id,
        model: 'gpt-brand-new',
      }),
    );
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

describe('keeping the remembered list current (US2)', () => {
  const connectionOf = async (id: string) => {
    const found = await connection(id);
    if (!found) throw new Error('connection missing');
    return found;
  };
  const availability = async (id: string) =>
    Object.fromEntries(
      (await models(id)).models.map((m) => [m.id, m.availability]),
    );
  const relogin = async (id: string, line: string) => {
    const started = await f.call('POST', '/api/sandbox-sessions', {
      provider: 'codex',
      reloginOf: id,
    });
    const container = [...driver.containers.keys()].at(-1) as string;
    await terminalFor(driver, container, line);
    const done = await f.call(
      'POST',
      `/api/sandbox-sessions/${started.json().id}/complete`,
    );
    expect(done.statusCode).toBe(200);
  };
  const agentOn = async (id: string, model: string, name: string) => {
    const reply = await f.call(
      'POST',
      '/api/agents',
      await agentBody(f, {
        name,
        role: 'developer',
        provider: 'codex',
        providerConnectionId: id,
        model,
      }),
    );
    expect(reply.statusCode).toBe(201);
    return reply.json().id as string;
  };
  const agent = async (agentId: string) => {
    const found = (
      (await f.call('GET', '/api/agents')).json() as {
        id: string;
        model: string;
        readiness: string;
        reasons: { code: string }[];
      }[]
    ).find((a) => a.id === agentId);
    if (!found) throw new Error('agent missing');
    return found;
  };

  it('a re-login replaces the list and earlier evidence counts only once confirmed', async () => {
    const id = await signIn('OK models=gpt-6-astra,gpt-brand-new');
    await f.app.providers.whenDiscoveryIdle();
    let release: () => void = () => undefined;
    driver.probeGate = new Promise<void>((resolve) => (release = resolve));
    await relogin(id, 'OK models=gpt-6-luna');
    // until the new login answers, nothing from the old login counts
    const during = byId((await models(id)).models);
    expect(during['gpt-6-astra']?.availability).not.toBe('available');
    driver.probeGate = null;
    release();
    await f.app.providers.whenDiscoveryIdle();
    const after = await availability(id);
    expect(after['gpt-6-luna']).toBe('available');
    expect(after['gpt-6-astra']).toBe('unavailable');
    expect(after['gpt-brand-new']).toBeUndefined();
  });

  it('"Check now" finds the models again', async () => {
    const id = await signIn('OK models=gpt-6-astra');
    await f.app.providers.whenDiscoveryIdle();
    driver.listedModels = ['gpt-6-astra', 'gpt-later'];
    const checked = await f.call(
      'POST',
      `/api/provider-connections/${id}/check`,
    );
    expect(checked.statusCode).toBe(200);
    await f.app.providers.whenDiscoveryIdle();
    expect((await availability(id))['gpt-later']).toBe('available');
  });

  it('a temporary failure keeps the last good list and says it will retry', async () => {
    const id = await signIn('OK models=gpt-6-astra,gpt-brand-new');
    await f.app.providers.whenDiscoveryIdle();
    const before = await availability(id);
    const listed = () =>
      f.db
        .prepare(
          'SELECT model, label, listedAt FROM discovered_model WHERE providerConnectionId=? ORDER BY model',
        )
        .all(id);
    const listedBefore = listed();
    driver.outage = true;
    const reply = await f.call(
      'POST',
      `/api/provider-connections/${id}/discover`,
    );
    expect(reply.statusCode).toBe(202);
    await f.app.providers.whenDiscoveryIdle();
    const c = await connectionOf(id);
    expect(c.status).toBe('connected');
    expect(c.discoveryStatus).toBe('failed');
    expect(c.discoveryError).toMatch(/retried at the next hourly check/);
    expect(await availability(id)).toEqual(before);
    expect(listed()).toEqual(listedBefore);
  });

  it('a model that disappears is never offered again and never replaced by another', async () => {
    const id = await signIn('OK models=gpt-6-astra,gpt-brand-new');
    await f.app.providers.whenDiscoveryIdle();
    const onNew = await agentOn(id, 'gpt-brand-new', 'on new');
    const onAstra = await agentOn(id, 'gpt-6-astra', 'on astra');
    driver.listedModels = ['gpt-6-luna'];
    await f.call('POST', `/api/provider-connections/${id}/discover`);
    await f.app.providers.whenDiscoveryIdle();
    for (const agentId of [onNew, onAstra]) {
      const a = await agent(agentId);
      expect(a.readiness).toBe('not_ready');
      expect(a.reasons.map((r) => r.code)).toContain('model_unavailable');
    }
    expect((await agent(onNew)).model).toBe('gpt-brand-new');
    expect((await agent(onAstra)).model).toBe('gpt-6-astra');
    // FR-014: no longer listed for any connection, so not offered and refused
    expect((await availability(id))['gpt-brand-new']).toBeUndefined();
    const refused = await f.call(
      'POST',
      '/api/agents',
      await agentBody(f, {
        name: 'too late',
        role: 'developer',
        provider: 'codex',
        providerConnectionId: id,
        model: 'gpt-brand-new',
      }),
    );
    expect(refused.statusCode).toBe(422);
    expect(refused.json().code).toBe('agent_file_invalid');
    expect(refused.json().details.problems[0].field).toBe('model');
  });

  it('the hourly check re-lists for free and probes only the models agents use', async () => {
    const id = await signIn('OK models=gpt-6-astra,gpt-6-luna');
    await f.app.providers.whenDiscoveryIdle();
    await agentOn(id, 'gpt-6-astra', 'hourly');
    driver.listedModels = ['gpt-6-astra', 'gpt-6-luna', 'gpt-later'];
    const probesBefore = probes().length;
    f.advance(3_600_000);
    await f.scheduler.runAll();
    await f.app.providers.whenDiscoveryIdle();
    expect(
      probes()
        .slice(probesBefore)
        .map((c) => c[1]),
    ).toEqual(['gpt-6-astra']);
    const list = byId(f.app.providers.listModelAccess(id) as Model[]);
    expect(list['gpt-later']).toMatchObject({
      availability: 'unknown',
      discovered: true,
    });
    expect(list['gpt-6-luna']?.availability).toBe('available');
  });
});
