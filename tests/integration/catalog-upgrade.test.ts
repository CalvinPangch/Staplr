import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Catalog } from '../../src/server/modules/prices/catalog';
import { platformFixture } from './helpers';

/**
 * A new release of the app can ship a revised catalog. These tests swap the
 * catalog the app sees to prove upgrades invalidate access evidence that was
 * gathered under the old catalog. Since feature 002 the catalog carries no
 * prices; prices come only from the official pages (official-prices.test.ts).
 */
const state = vi.hoisted(() => ({ catalog: null as Catalog | null }));
vi.mock('../../src/server/modules/prices/catalog', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('../../src/server/modules/prices/catalog')
    >();
  const active = () => state.catalog ?? original.loadCatalog();
  return {
    ...original,
    loadCatalog: active,
    catalogRevision: () => active().revision,
    listModels: (provider: 'claude' | 'codex') =>
      active().models.filter((m) => m.provider === provider && !m.retired),
  };
});

let f: Awaited<ReturnType<typeof platformFixture>>;
beforeEach(async () => {
  state.catalog = null;
  f = await platformFixture();
});
afterEach(async () => {
  state.catalog = null;
  await f.close();
});

const base = async (): Promise<Catalog> => {
  const original = await vi.importActual<
    typeof import('../../src/server/modules/prices/catalog')
  >('../../src/server/modules/prices/catalog');
  return structuredClone(original.loadCatalog());
};
describe('what an upgrade does to model access and agents', () => {
  const key = 'sk-ant-upgrade-1';
  const models = ['claude-sonnet-5-5', 'claude-opus-5-5'];

  async function agentOnSonnet() {
    f.anthropic.setKey(key, { models });
    const connection = (
      await f.call('POST', '/api/provider-connections', {
        provider: 'claude',
        authType: 'api_key',
        name: 'work',
        apiKey: key,
      })
    ).json().id as string;
    const soulId = (
      (await f.call('GET', '/api/souls')).json() as {
        id: string;
        roleType: string;
        isDefault: boolean;
      }[]
    ).find((s) => s.isDefault && s.roleType === 'developer')?.id;
    const agent = await f.call('POST', '/api/agents', {
      name: 'dev',
      soulId,
      provider: 'claude',
      providerConnectionId: connection,
      model: 'claude-sonnet-5-5',
    });
    expect(agent.statusCode).toBe(201);
    return { connection, agent: agent.json().id as string };
  }
  const access = async (connection: string) =>
    Object.fromEntries(
      (
        (
          await f.call('GET', `/api/models?providerConnectionId=${connection}`)
        ).json().models as { id: string; availability: string }[]
      ).map((m) => [m.id, m.availability]),
    );

  it('treats evidence from the old catalog as unknown until it is checked again', async () => {
    const { connection, agent } = await agentOnSonnet();
    expect((await access(connection))['claude-sonnet-5-5']).toBe('available');

    const next = await base();
    next.revision = '2026-12-01.1';
    state.catalog = next;

    expect((await access(connection))['claude-sonnet-5-5']).toBe('unknown');
    const stale = (await f.call('GET', `/api/agents/${agent}`)).json();
    expect(stale.readiness).toBe('not_ready');
    expect(stale.reasons.map((r: { code: string }) => r.code)).toEqual([
      'model_unavailable',
    ]);

    await f.call('POST', `/api/provider-connections/${connection}/check`);
    expect((await access(connection))['claude-sonnet-5-5']).toBe('available');
    expect((await f.call('GET', `/api/agents/${agent}`)).json().readiness).toBe(
      'ready',
    );
  });

  it('makes an agent not ready at once when its model is retired', async () => {
    const { agent } = await agentOnSonnet();
    const next = await base();
    const model = next.models.find((m) => m.id === 'claude-sonnet-5-5');
    if (!model) throw new Error('fixture model missing');
    model.retired = true;
    next.revision = '2026-12-01.1';
    state.catalog = next;
    const retired = (await f.call('GET', `/api/agents/${agent}`)).json();
    expect(retired.readiness).toBe('not_ready');
    expect(retired.reasons[0].message).toMatch(/retired/);
  });

  it('makes an agent not ready at once when its model is removed', async () => {
    const { agent } = await agentOnSonnet();
    const next = await base();
    next.models = next.models.filter((m) => m.id !== 'claude-sonnet-5-5');
    next.revision = '2026-12-01.1';
    state.catalog = next;
    const removed = (await f.call('GET', `/api/agents/${agent}`)).json();
    expect(removed.readiness).toBe('not_ready');
    expect(removed.reasons[0].message).toMatch(/no longer offered/);
  });
});
