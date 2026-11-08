import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { platformFixture } from './helpers';
import {
  createFakeSandboxDriver,
  terminalFor,
  type FakeSandboxDriver,
} from '../fakes/fake-sandbox-driver';

const allModels = [
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
];

let driver: FakeSandboxDriver;
let f: Awaited<ReturnType<typeof platformFixture>>;
beforeEach(async () => {
  driver = createFakeSandboxDriver();
  f = await platformFixture({ driver });
});
afterEach(async () => {
  await f.close();
});

interface Agent {
  id: string;
  name: string;
  soulId: string;
  role: string;
  provider: string;
  providerConnectionId: string | null;
  model: string;
  readiness: 'ready' | 'not_ready';
  reasons: { code: string; message?: string }[];
  projects: { id: string; name: string }[];
}

const claude = async (name: string, key: string, models = allModels) => {
  f.anthropic.setKey(key, { models });
  const reply = await f.call('POST', '/api/provider-connections', {
    provider: 'claude',
    authType: 'api_key',
    name,
    apiKey: key,
  });
  expect(reply.statusCode).toBe(201);
  return reply.json().id as string;
};

/** A Codex connection signed in through the fake terminal; no model is verified yet. */
const codex = async (name: string, line = 'OK') => {
  const started = await f.call('POST', '/api/sandbox-sessions', {
    provider: 'codex',
    name,
  });
  const id = started.json().id as string;
  const container = [...driver.containers.keys()].at(-1) as string;
  await terminalFor(driver, container, line);
  const done = await f.call('POST', `/api/sandbox-sessions/${id}/complete`);
  expect(done.statusCode).toBe(200);
  return done.json().resultConnectionId as string;
};

const soulOf = async (roleType: string) =>
  (
    (await f.call('GET', '/api/souls')).json() as {
      id: string;
      roleType: string;
      isDefault: boolean;
    }[]
  ).find((s) => s.isDefault && s.roleType === roleType)?.id as string;

const body = async (connectionId: string, extra: object = {}) => ({
  name: 'Dev agent',
  soulId: await soulOf('developer'),
  provider: 'claude',
  providerConnectionId: connectionId,
  model: 'claude-sonnet-5-5',
  ...extra,
});
const create = async (connectionId: string, extra: object = {}) =>
  f.call('POST', '/api/agents', await body(connectionId, extra));
const agents = async () =>
  (await f.call('GET', '/api/agents')).json() as Agent[];

describe('creating agents', () => {
  it('creates a ready agent whose role comes from its soul', async () => {
    const connection = await claude('work', 'sk-ant-agent-1');
    const reply = await create(connection);
    expect(reply.statusCode).toBe(201);
    expect(reply.json()).toMatchObject({
      name: 'Dev agent',
      role: 'developer',
      provider: 'claude',
      providerConnectionId: connection,
      model: 'claude-sonnet-5-5',
      readiness: 'ready',
      reasons: [],
      projects: [],
    });
    expect(await agents()).toHaveLength(1);
    const audit = (await f.call('GET', '/api/audit-entries')).json() as {
      action: string;
    }[];
    expect(audit.map((a) => a.action)).toContain('agent.created');
  });

  it('keeps names unique regardless of case and limits them to 80 characters', async () => {
    const connection = await claude('work', 'sk-ant-agent-1');
    expect((await create(connection)).statusCode).toBe(201);
    const clash = await create(connection, { name: 'DEV AGENT' });
    expect(clash.statusCode).toBe(409);
    expect(clash.json().code).toBe('conflict');
    expect((await create(connection, { name: '' })).statusCode).toBe(422);
    expect(
      (await create(connection, { name: 'n'.repeat(81) })).statusCode,
    ).toBe(422);
    expect(
      (await create(connection, { name: 'n'.repeat(80) })).statusCode,
    ).toBe(201);
    expect((await create(connection, { surprise: 1 })).statusCode).toBe(422);
  });

  it('requires the provider to match the connection', async () => {
    const connection = await claude('work', 'sk-ant-agent-1');
    const reply = await create(connection, { provider: 'codex' });
    expect(reply.statusCode).toBe(422);
    expect(reply.json().code).toBe('invalid_input');
    expect(reply.json().message).toMatch(/provider/i);
  });

  it('refuses an unknown connection or soul', async () => {
    const connection = await claude('work', 'sk-ant-agent-1');
    expect((await create('missing')).statusCode).toBe(422);
    expect((await create(connection, { soulId: 'missing' })).statusCode).toBe(
      422,
    );
  });

  it('refuses a model outside the catalog and never substitutes another', async () => {
    const connection = await claude('work', 'sk-ant-agent-1');
    const reply = await create(connection, { model: 'claude-made-up' });
    expect(reply.statusCode).toBe(422);
    expect(reply.json().code).toBe('model_unavailable');
    expect(await agents()).toEqual([]);
  });

  it('refuses a model the key cannot use and keeps connections isolated', async () => {
    const full = await claude('full', 'sk-ant-agent-full');
    const small = await claude('small', 'sk-ant-agent-small', [
      'claude-haiku-5-5',
    ]);
    const denied = await create(small, { name: 'on small' });
    expect(denied.statusCode).toBe(422);
    expect(denied.json().code).toBe('model_unavailable');
    expect((await create(full, { name: 'on full' })).statusCode).toBe(201);
    expect(
      (await create(small, { name: 'haiku', model: 'claude-haiku-5-5' }))
        .statusCode,
    ).toBe(201);
  });

  it('refuses a Codex model until it is verified for that connection, then accepts it', async () => {
    // hold the discovery that follows sign-in so the model is not yet verified
    let release: () => void = () => undefined;
    driver.probeGate = new Promise<void>((resolve) => (release = resolve));
    const connection = await codex('work codex');
    const input = {
      name: 'codex agent',
      provider: 'codex',
      model: 'gpt-6-astra',
    };
    const before = await create(connection, input);
    expect(before.statusCode).toBe(422);
    expect(before.json().code).toBe('model_unavailable');
    expect(before.json().message).toMatch(/Check availability/);
    driver.probeGate = null;
    release();
    await f.app.providers.whenDiscoveryIdle();
    const checked = await f.call(
      'POST',
      `/api/provider-connections/${connection}/models/gpt-6-astra/check`,
    );
    expect(checked.json().availability).toBe('available');
    const after = await create(connection, input);
    expect(after.statusCode).toBe(201);
    expect(after.json().readiness).toBe('ready');
  });

  it('refuses a Codex model that the account was denied', async () => {
    const connection = await codex('denied codex', 'OK denied=gpt-6-astra');
    await f.call(
      'POST',
      `/api/provider-connections/${connection}/models/gpt-6-astra/check`,
    );
    const reply = await create(connection, {
      name: 'codex agent',
      provider: 'codex',
      model: 'gpt-6-astra',
    });
    expect(reply.statusCode).toBe(422);
    expect(reply.json().code).toBe('model_unavailable');
  });
});

describe('model candidates', () => {
  it('lists catalog candidates with availability and the catalog revision', async () => {
    let release: () => void = () => undefined;
    driver.probeGate = new Promise<void>((resolve) => (release = resolve));
    const connection = await codex('work codex');
    const reply = await f.call(
      'GET',
      `/api/models?providerConnectionId=${connection}`,
    );
    driver.probeGate = null;
    release();
    expect(reply.statusCode).toBe(200);
    const result = reply.json() as {
      catalogRevision: string;
      models: {
        id: string;
        availability: string;
        providerConnectionId: string;
      }[];
    };
    expect(result.catalogRevision).toMatch(/\d/);
    expect(result.models.length).toBeGreaterThan(0);
    expect(result.models.every((m) => m.availability === 'unknown')).toBe(true);
    expect(
      result.models.every((m) => m.providerConnectionId === connection),
    ).toBe(true);
  });

  it('shows Claude availability from the key and keeps denied entries listed', async () => {
    const small = await claude('small', 'sk-ant-agent-small', [
      'claude-haiku-5-5',
    ]);
    const reply = await f.call(
      'GET',
      `/api/models?providerConnectionId=${small}`,
    );
    const byId = Object.fromEntries(
      (reply.json().models as { id: string; availability: string }[]).map(
        (m) => [m.id, m.availability],
      ),
    );
    expect(byId['claude-haiku-5-5']).toBe('available');
    expect(byId['claude-sonnet-5-5']).toBe('unavailable');
  });

  it('answers 404 for an unknown connection and 422 without one', async () => {
    expect(
      (await f.call('GET', '/api/models?providerConnectionId=nope')).statusCode,
    ).toBe(404);
    expect((await f.call('GET', '/api/models')).statusCode).toBe(422);
  });
});

describe('readiness follows the connection', () => {
  it('goes not ready when the key is replaced by one without the model', async () => {
    const connection = await claude('work', 'sk-ant-agent-1');
    const agent = (await create(connection)).json() as Agent;
    f.anthropic.setKey('sk-ant-agent-2', { models: ['claude-haiku-5-5'] });
    const replaced = await f.call(
      'PUT',
      `/api/provider-connections/${connection}/api-key`,
      { apiKey: 'sk-ant-agent-2' },
    );
    expect(replaced.statusCode).toBe(200);
    const now = (await agents()).find((a) => a.id === agent.id);
    expect(now?.readiness).toBe('not_ready');
    expect(now?.reasons.map((r) => r.code)).toEqual(['model_unavailable']);
  });

  it('goes not ready with needs_relogin when the key is rejected', async () => {
    const connection = await claude('work', 'sk-ant-agent-1');
    const agent = (await create(connection)).json() as Agent;
    f.anthropic.setKey('sk-ant-agent-1', { models: [], reject: true });
    await f.call('POST', `/api/provider-connections/${connection}/check`);
    const now = (
      await f.call('GET', `/api/agents/${agent.id}`)
    ).json() as Agent;
    expect(now.readiness).toBe('not_ready');
    expect(now.reasons.map((r) => r.code)).toContain('needs_relogin');
  });

  it('keeps a ready agent ready through a transient provider error', async () => {
    const connection = await claude('work', 'sk-ant-agent-1');
    const agent = (await create(connection)).json() as Agent;
    f.anthropic.setKey('sk-ant-agent-1', { models: [], failWith: 503 });
    await f.call('POST', `/api/provider-connections/${connection}/check`);
    const now = (
      await f.call('GET', `/api/agents/${agent.id}`)
    ).json() as Agent;
    expect(now.readiness).toBe('ready');
  });

  it('survives a disconnect with a cleared link and the right reason', async () => {
    const connection = await claude('work', 'sk-ant-agent-1');
    const agent = (await create(connection)).json() as Agent;
    const impact = await f.call(
      'GET',
      `/api/provider-connections/${connection}/impact`,
    );
    expect(impact.json().agents).toEqual([{ id: agent.id, name: 'Dev agent' }]);
    expect(
      (await f.call('DELETE', `/api/provider-connections/${connection}`))
        .statusCode,
    ).toBe(204);
    const now = (
      await f.call('GET', `/api/agents/${agent.id}`)
    ).json() as Agent;
    expect(now.providerConnectionId).toBeNull();
    expect(now.readiness).toBe('not_ready');
    expect(now.reasons.map((r) => r.code)).toEqual(['no_provider_connection']);
  });

  it('is repaired by choosing another connection', async () => {
    const connection = await claude('work', 'sk-ant-agent-1');
    const agent = (await create(connection)).json() as Agent;
    await f.call('DELETE', `/api/provider-connections/${connection}`);
    const other = await claude('other', 'sk-ant-agent-2');
    const fixed = await f.call('PUT', `/api/agents/${agent.id}`, {
      ...(await body(other)),
    });
    expect(fixed.statusCode).toBe(200);
    expect(fixed.json()).toMatchObject({
      providerConnectionId: other,
      readiness: 'ready',
    });
  });

  it('reports the models agents use so they are re-checked', async () => {
    const connection = await codex('work codex');
    await f.call(
      'POST',
      `/api/provider-connections/${connection}/models/gpt-6-astra/check`,
    );
    await create(connection, {
      name: 'codex agent',
      provider: 'codex',
      model: 'gpt-6-astra',
    });
    expect(f.impactRegistry.modelsInUse(connection)).toEqual(['gpt-6-astra']);
  });
});

describe('editing and deleting agents', () => {
  it('edits an agent and keeps it unchanged when the new model is refused', async () => {
    const connection = await claude('work', 'sk-ant-agent-1');
    const agent = (await create(connection)).json() as Agent;
    const changed = await f.call('PUT', `/api/agents/${agent.id}`, {
      ...(await body(connection, { model: 'claude-opus-5-5' })),
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().model).toBe('claude-opus-5-5');
    const refused = await f.call('PUT', `/api/agents/${agent.id}`, {
      ...(await body(connection, { model: 'claude-made-up' })),
    });
    expect(refused.statusCode).toBe(422);
    expect(
      ((await f.call('GET', `/api/agents/${agent.id}`)).json() as Agent).model,
    ).toBe('claude-opus-5-5');
    const audit = (await f.call('GET', '/api/audit-entries')).json() as {
      action: string;
    }[];
    expect(audit.map((a) => a.action)).toContain('agent.updated');
  });

  it('lets the same name stay on the same agent', async () => {
    const connection = await claude('work', 'sk-ant-agent-1');
    const agent = (await create(connection)).json() as Agent;
    const same = await f.call('PUT', `/api/agents/${agent.id}`, {
      ...(await body(connection)),
    });
    expect(same.statusCode).toBe(200);
  });

  it('deletes an agent that is on no team', async () => {
    const connection = await claude('work', 'sk-ant-agent-1');
    const agent = (await create(connection)).json() as Agent;
    expect((await f.call('DELETE', `/api/agents/${agent.id}`)).statusCode).toBe(
      204,
    );
    expect((await f.call('GET', `/api/agents/${agent.id}`)).statusCode).toBe(
      404,
    );
    const audit = (await f.call('GET', '/api/audit-entries')).json() as {
      action: string;
    }[];
    expect(audit.map((a) => a.action)).toContain('agent.deleted');
  });

  it('answers 404 for unknown agents', async () => {
    expect((await f.call('GET', '/api/agents/nope')).statusCode).toBe(404);
    expect((await f.call('DELETE', '/api/agents/nope')).statusCode).toBe(404);
  });
});

describe('souls in use', () => {
  it('blocks deleting a soul agents use and names them', async () => {
    const connection = await claude('work', 'sk-ant-agent-1');
    const soul = (
      await f.call('POST', '/api/souls', {
        name: 'Special dev',
        roleType: 'developer',
        description: '',
        instructions: 'x',
      })
    ).json().id as string;
    const agent = (await create(connection, { soulId: soul })).json() as Agent;
    const blocked = await f.call('DELETE', `/api/souls/${soul}`);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().code).toBe('soul_in_use');
    expect(blocked.json().details.agents).toEqual([
      { id: agent.id, name: 'Dev agent' },
    ]);
    const listed = (await f.call('GET', `/api/souls/${soul}`)).json();
    expect(listed.usedByAgents).toEqual([{ id: agent.id, name: 'Dev agent' }]);
    await f.call('DELETE', `/api/agents/${agent.id}`);
    expect((await f.call('DELETE', `/api/souls/${soul}`)).statusCode).toBe(204);
  });
});

describe('access', () => {
  it('needs a session', async () => {
    expect(
      (await f.app.inject({ method: 'GET', url: '/api/agents' })).statusCode,
    ).toBe(401);
    expect(
      (await f.app.inject({ method: 'GET', url: '/api/models' })).statusCode,
    ).toBe(401);
  });
});
