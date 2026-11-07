import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadCatalog } from '../../src/server/modules/prices/catalog';
import { mergeCatalog } from '../../src/server/modules/prices/service';
import { platformFixture } from './helpers';

let f: Awaited<ReturnType<typeof platformFixture>>;
beforeEach(async () => {
  f = await platformFixture();
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
  effectiveFrom: string;
  effectiveUntil: string | null;
  source: 'default' | 'user';
  priceSource: string | null;
  pricesAsOf: string | null;
  label: string;
}
const list = async () =>
  (await f.call('GET', '/api/model-prices')).json() as Price[];
const current = async () =>
  (await list()).filter((p) => p.effectiveUntil === null);
const set = (extra: object = {}) =>
  f.call('POST', '/api/model-prices', {
    provider: 'claude',
    model: 'claude-sonnet-5-5',
    inputPricePerMTok: '2.5',
    outputPricePerMTok: '12',
    ...extra,
  });

describe('default prices from the catalog', () => {
  it('starts with one current default row per catalog model, copying source and date', async () => {
    const catalog = loadCatalog();
    const rows = await current();
    expect(rows).toHaveLength(catalog.models.length);
    for (const model of catalog.models) {
      const row = rows.find(
        (r) => r.provider === model.provider && r.model === model.id,
      );
      expect(row, model.id).toBeDefined();
      expect(row).toMatchObject({
        source: 'default',
        inputPricePerMTok: model.inputPricePerMTok,
        outputPricePerMTok: model.outputPricePerMTok,
        priceSource: model.priceSource ?? null,
        pricesAsOf: model.pricesAsOf ?? null,
        label: 'List price used for estimates',
      });
    }
  });

  it('keeps unverified prices as null (Unknown), never zero', async () => {
    const unknown = (await current()).filter(
      (r) => r.inputPricePerMTok === null,
    );
    expect(unknown.length).toBeGreaterThan(0);
    for (const row of unknown) {
      expect(row.outputPricePerMTok).toBeNull();
      expect(row.priceSource).toBeNull();
    }
  });

  it('does not duplicate rows when the merge runs again, as on every restart', async () => {
    const before = (await list()).length;
    mergeCatalog(f.db, new Date(Date.now()).toISOString());
    mergeCatalog(f.db, new Date(Date.now() + 1000).toISOString());
    expect((await list()).length).toBe(before);
  });
});

describe('changing a price', () => {
  it('closes the current row now and adds a user row effective now', async () => {
    const before = (await current()).find(
      (r) => r.model === 'claude-sonnet-5-5',
    );
    f.advance(60_000);
    const created = await set();
    expect(created.statusCode).toBe(201);
    const row = created.json() as Price;
    expect(row).toMatchObject({
      provider: 'claude',
      model: 'claude-sonnet-5-5',
      inputPricePerMTok: '2.5',
      outputPricePerMTok: '12',
      effectiveUntil: null,
      source: 'user',
      priceSource: null,
      pricesAsOf: null,
      label: 'List price used for estimates',
    });
    expect(row.effectiveFrom).toBe(new Date(f.now()).toISOString());
    const rows = (await list()).filter((r) => r.model === 'claude-sonnet-5-5');
    expect(rows).toHaveLength(2);
    const closed = rows.find((r) => r.id === before?.id);
    expect(closed?.effectiveUntil).toBe(row.effectiveFrom);
    expect(closed?.inputPricePerMTok).toBe(before?.inputPricePerMTok);
  });

  it('keeps at most one current row per provider and model', async () => {
    for (let i = 0; i < 4; i++) {
      f.advance(1000);
      expect((await set({ inputPricePerMTok: String(i + 1) })).statusCode).toBe(
        201,
      );
    }
    const counts = f.db
      .prepare(
        'SELECT provider, model, COUNT(*) AS n FROM model_price WHERE effectiveUntil IS NULL GROUP BY provider, model HAVING n > 1',
      )
      .all();
    expect(counts).toEqual([]);
    expect(() =>
      f.db
        .prepare(
          `INSERT INTO model_price(id,provider,model,inputPricePerMTok,outputPricePerMTok,effectiveFrom,source)
           VALUES('dup','claude','claude-sonnet-5-5','1','1','2026-11-08T00:00:00Z','user')`,
        )
        .run(),
    ).toThrow(/UNIQUE/i);
  });

  it('can price a model that had no price', async () => {
    const unknown = (await current()).find((r) => r.inputPricePerMTok === null);
    expect(unknown).toBeDefined();
    const created = await set({
      provider: unknown?.provider,
      model: unknown?.model,
      inputPricePerMTok: '1',
      outputPricePerMTok: '5',
    });
    expect(created.statusCode).toBe(201);
    expect(
      (await current()).find((r) => r.model === unknown?.model)
        ?.inputPricePerMTok,
    ).toBe('1');
  });

  it('accepts zero and six decimal places', async () => {
    expect(
      (await set({ inputPricePerMTok: '0', outputPricePerMTok: '0.000001' }))
        .statusCode,
    ).toBe(201);
  });

  it.each([
    ['negative', { inputPricePerMTok: '-1' }],
    ['seven decimal places', { outputPricePerMTok: '1.1234567' }],
    ['not a number', { inputPricePerMTok: 'abc' }],
    ['exponent', { inputPricePerMTok: '1e3' }],
    ['empty', { outputPricePerMTok: '' }],
    ['a number instead of text', { inputPricePerMTok: 2 }],
    ['an unknown model', { model: 'not-in-the-catalog' }],
    ['a model of the other provider', { provider: 'codex' }],
    ['an unknown provider', { provider: 'other' }],
    ['an extra field', { surprise: true }],
  ])('refuses %s', async (_name, extra) => {
    const reply = await set(extra);
    expect(reply.statusCode).toBe(422);
    expect(reply.json().code).toBe('invalid_input');
  });

  it('refuses a missing price field and leaves history unchanged', async () => {
    const before = await list();
    const reply = await f.call('POST', '/api/model-prices', {
      provider: 'claude',
      model: 'claude-sonnet-5-5',
      inputPricePerMTok: '1',
    });
    expect(reply.statusCode).toBe(422);
    expect(await list()).toEqual(before);
  });
});

describe('access', () => {
  it('needs a session', async () => {
    expect(
      (await f.app.inject({ method: 'GET', url: '/api/model-prices' }))
        .statusCode,
    ).toBe(401);
    expect(
      (await f.app.inject({ method: 'POST', url: '/api/model-prices' }))
        .statusCode,
    ).toBe(401);
  });
});
