import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { platformFixture } from './helpers';
import {
  createFakeSandboxDriver,
  terminalFor,
} from '../fakes/fake-sandbox-driver';

/**
 * Feature 002, US4: prices come only from the official pricing pages. The
 * pages are served by the fake (copies in tests/fixtures), never the live sites.
 */
const claudeUrl = 'https://platform.claude.com/docs/en/about-claude/pricing.md';
const openaiUrl = 'https://developers.openai.com/api/docs/pricing.md';
const claudePage = readFileSync('tests/fixtures/pricing-claude.md', 'utf8');

let f: Awaited<ReturnType<typeof platformFixture>>;
beforeEach(async () => {
  f = await platformFixture({ driver: createFakeSandboxDriver() });
});
afterEach(async () => {
  await f.close();
});

interface Price {
  id: string;
  provider: string;
  model: string;
  inputPricePerMTok: string | null;
  outputPricePerMTok: string | null;
  source: string;
  priceSource: string | null;
  pricesAsOf: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
}
const prices = async () =>
  (await f.call('GET', '/api/model-prices')).json() as Price[];
const current = async (model: string) =>
  (await prices()).filter((p) => p.model === model && !p.effectiveUntil);
const refresh = async () => {
  const reply = await f.call('POST', '/api/prices/refresh');
  expect(reply.statusCode).toBe(202);
  await f.app.prices.whenIdle();
};
const status = async () =>
  (
    (await f.call('GET', '/api/prices/status')).json() as {
      providers: {
        provider: string;
        lastAttemptAt: string | null;
        lastSuccessAt: string | null;
        lastError: string | null;
      }[];
    }
  ).providers;

describe('reading the official pages', () => {
  it('the start-up read creates official prices with the page and date', async () => {
    await f.scheduler.runAll();
    await f.app.prices.whenIdle();
    const [sonnet] = await current('claude-sonnet-5-5');
    expect(sonnet).toMatchObject({
      provider: 'claude',
      source: 'official',
      inputPricePerMTok: '2',
      outputPricePerMTok: '10',
      priceSource: claudeUrl,
      pricesAsOf: '2026-11-08',
    });
    const [sol] = await current('gpt-6.1-sol');
    expect(sol).toMatchObject({
      provider: 'codex',
      source: 'official',
      inputPricePerMTok: '2.00',
      outputPricePerMTok: '10.00',
      priceSource: openaiUrl,
    });
    for (const s of await status()) {
      expect(s.lastSuccessAt).not.toBeNull();
      expect(s.lastError).toBeNull();
    }
    const audit = (await f.call('GET', '/api/audit-entries')).json() as {
      action: string;
      targetId: string;
    }[];
    expect(
      audit
        .filter((a) => a.action === 'prices.refreshed')
        .map((a) => a.targetId)
        .sort(),
    ).toEqual(['claude', 'codex']);
  });

  it('a second read of unchanged pages adds nothing', async () => {
    await refresh();
    const before = (await prices()).length;
    f.advance(60_000);
    await refresh();
    expect((await prices()).length).toBe(before);
  });

  it('a changed price closes the current row at that moment; earlier estimates keep their price', async () => {
    await refresh();
    const ranAt = new Date(f.now()).toISOString();
    f.advance(3_600_000);
    f.anthropic.setPricing('claude', {
      body: claudePage.replace(
        /(\| Claude Sonnet 5\.5 +\| )\$2 \/ MTok/,
        '$1$3 / MTok',
      ),
    });
    await refresh();
    const changedAt = new Date(f.now()).toISOString();
    const rows = (await prices()).filter(
      (p) => p.model === 'claude-sonnet-5-5' && p.source === 'official',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      inputPricePerMTok: '2',
      effectiveUntil: changedAt,
    });
    expect(rows[1]).toMatchObject({
      inputPricePerMTok: '3',
      effectiveFrom: changedAt,
      effectiveUntil: null,
    });
    expect(
      f.app.prices.estimateCost(
        'claude',
        'claude-sonnet-5-5',
        1_000_000,
        0,
        ranAt,
      ),
    ).toMatchObject({ amountUsd: '2.000000' });
    expect(
      f.app.prices.estimateCost(
        'claude',
        'claude-sonnet-5-5',
        1_000_000,
        0,
        changedAt,
      ),
    ).toMatchObject({ amountUsd: '3.000000' });
  });

  it('an unreachable or unreadable page changes nothing and says why', async () => {
    await refresh();
    const before = await prices();
    const success = (await status()).find(
      (s) => s.provider === 'codex',
    )?.lastSuccessAt;
    f.advance(60_000);
    f.anthropic.setPricing('codex', { status: 503 });
    await refresh();
    let codex = (await status()).find((s) => s.provider === 'codex');
    expect(codex?.lastError).toMatch(/could not/i);
    expect(codex?.lastSuccessAt).toBe(success);
    f.anthropic.setPricing('codex', {
      body: readFileSync(
        'tests/fixtures/pricing-openai-changed-layout.md',
        'utf8',
      ),
    });
    await refresh();
    codex = (await status()).find((s) => s.provider === 'codex');
    expect(codex?.lastError).toMatch(/could not read/i);
    expect(codex?.lastSuccessAt).toBe(success);
    expect(await prices()).toEqual(before);
  });

  it('the first official read closes the prices shipped with earlier releases', async () => {
    const insert = f.db.prepare(
      `INSERT INTO model_price(id,provider,model,inputPricePerMTok,outputPricePerMTok,priceSource,pricesAsOf,effectiveFrom,effectiveUntil,source)
       VALUES(?,?,?,?,?,NULL,NULL,'2026-01-01T00:00:00.000Z',NULL,'default')`,
    );
    insert.run('d1', 'codex', 'gpt-6.1-sol', '9', '9');
    insert.run('d2', 'codex', 'gpt-not-on-page', '1', '1');
    insert.run('d3', 'claude', 'claude-sonnet-5-5', '9', '9');
    f.anthropic.setPricing('claude', { status: 503 });
    await refresh();
    const at = new Date(f.now()).toISOString();
    const all = await prices();
    const row = (id: string) => all.find((p) => p.id === id);
    expect(row('d1')?.effectiveUntil).toBe(at);
    // not on the page: closed, so the price is Unknown from now on
    expect(row('d2')?.effectiveUntil).toBe(at);
    expect(await current('gpt-not-on-page')).toEqual([]);
    expect(
      f.app.prices.estimateCost('codex', 'gpt-not-on-page', 10, 10, at),
    ).toBe('unknown');
    // the Claude page failed, so Claude's shipped price stays for now
    expect(row('d3')?.effectiveUntil).toBeNull();
  });

  it('runs one read at a time', async () => {
    const hits = f.anthropic.pricingHits.length;
    await Promise.all([
      f.call('POST', '/api/prices/refresh'),
      f.call('POST', '/api/prices/refresh'),
    ]);
    await f.app.prices.whenIdle();
    expect(f.anthropic.pricingHits.length - hits).toBe(2);
  });
});

describe('prices beside models', () => {
  it('each model in GET /api/models carries its price, the label and the Codex note', async () => {
    const driver = createFakeSandboxDriver();
    const g = await platformFixture({ driver });
    try {
      await g.call('POST', '/api/prices/refresh');
      await g.app.prices.whenIdle();
      const started = await g.call('POST', '/api/sandbox-sessions', {
        provider: 'codex',
        name: 'priced',
      });
      const container = [...driver.containers.keys()].at(-1) as string;
      await terminalFor(
        driver,
        container,
        'OK models=gpt-6.1-sol,gpt-unpriced',
      );
      const id = (
        await g.call(
          'POST',
          `/api/sandbox-sessions/${started.json().id}/complete`,
        )
      ).json().resultConnectionId as string;
      await g.app.providers.whenDiscoveryIdle();
      const models = Object.fromEntries(
        (
          (await g.call('GET', `/api/models?providerConnectionId=${id}`)).json()
            .models as { id: string; price: unknown }[]
        ).map((m) => [m.id, m.price]),
      );
      expect(models['gpt-6.1-sol']).toEqual({
        inputPricePerMTok: '2.00',
        outputPricePerMTok: '10.00',
        priceSource: openaiUrl,
        pricesAsOf: '2026-11-08',
        label: 'List price used for estimates',
        note: 'API list price; your plan may not charge per token',
      });
      expect(models['gpt-unpriced']).toMatchObject({
        inputPricePerMTok: null,
        outputPricePerMTok: null,
      });
    } finally {
      await g.close();
    }
  });
});

describe('no hand-entered prices', () => {
  it('POST /api/model-prices no longer exists', async () => {
    const reply = await f.call('POST', '/api/model-prices', {
      provider: 'claude',
      model: 'claude-sonnet-5-5',
      inputPricePerMTok: '1',
      outputPricePerMTok: '1',
    });
    expect(reply.statusCode).toBe(404);
  });

  it('price status and refresh need a session', async () => {
    expect(
      (await f.app.inject({ method: 'GET', url: '/api/prices/status' }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/prices/refresh',
          headers: { origin: f.config.publicUrl },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await f.app.inject({ method: 'GET', url: '/api/model-prices' }))
        .statusCode,
    ).toBe(401);
  });
});
