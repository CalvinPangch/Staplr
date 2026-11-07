import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrateUp } from '../../src/server/db/migrate';
import {
  formatDecimal,
  multiplyPerMillion,
  parseDecimal,
} from '../../src/server/modules/prices/decimal';
import {
  createPriceService,
  type PriceService,
} from '../../src/server/modules/prices/service';

describe('decimal arithmetic (SC-007: no floating point)', () => {
  it('parses only plain decimals of up to six places', () => {
    expect(parseDecimal('0')).toBe(0n);
    expect(parseDecimal('3')).toBe(3_000_000n);
    expect(parseDecimal('0.000001')).toBe(1n);
    expect(parseDecimal('12.5')).toBe(12_500_000n);
    for (const bad of [
      '',
      '-1',
      '1e3',
      '1.',
      '.5',
      '1.1234567',
      'abc',
      ' 1',
      '1 ',
      '1,5',
    ])
      expect(() => parseDecimal(bad), bad).toThrow();
  });

  it('formats with exactly six places', () => {
    expect(formatDecimal(0n)).toBe('0.000000');
    expect(formatDecimal(1n)).toBe('0.000001');
    expect(formatDecimal(18_518_505n)).toBe('18.518505');
    expect(formatDecimal(123_000_000n)).toBe('123.000000');
  });

  it('multiplies a per-million price by a token count exactly', () => {
    // 15 USD per million tokens x 1,234,567 tokens = 18.518505 USD
    expect(
      formatDecimal(multiplyPerMillion(parseDecimal('15'), 1_234_567)),
    ).toBe('18.518505');
    // classic float trap: 0.1 x 3 is exactly 0.3 per million
    expect(
      formatDecimal(multiplyPerMillion(parseDecimal('0.1'), 3_000_000)),
    ).toBe('0.300000');
  });

  it('rounds half up at the sixth place', () => {
    // 0.5 USD per million x 1 token = 0.0000005 -> 0.000001
    expect(formatDecimal(multiplyPerMillion(parseDecimal('0.5'), 1))).toBe(
      '0.000001',
    );
    // 0.4 USD per million x 1 token = 0.0000004 -> 0.000000
    expect(formatDecimal(multiplyPerMillion(parseDecimal('0.4'), 1))).toBe(
      '0.000000',
    );
    // 1.5 USD per million x 1 token = 0.0000015 -> 0.000002
    expect(formatDecimal(multiplyPerMillion(parseDecimal('1.5'), 1))).toBe(
      '0.000002',
    );
  });
});

describe('estimateCost', () => {
  let db: Database.Database;
  let now: number;
  let prices: PriceService;
  const iso = (offsetMs = 0) =>
    new Date(Date.parse('2026-11-08T00:00:00Z') + offsetMs).toISOString();

  beforeEach(() => {
    db = new Database(':memory:');
    migrateUp(db);
    now = Date.parse('2026-11-08T00:00:00Z');
    prices = createPriceService({ db, clock: () => now });
  });

  const put = (input: string, output: string) =>
    prices.setPrice({
      provider: 'claude',
      model: 'claude-sonnet-5-5',
      inputPricePerMTok: input,
      outputPricePerMTok: output,
    });

  it('uses the list price in effect at the run time', () => {
    put('2', '10');
    expect(
      prices.estimateCost(
        'claude',
        'claude-sonnet-5-5',
        1_000_000,
        500_000,
        iso(),
      ),
    ).toMatchObject({ amountUsd: '7.000000' });
  });

  it('returns Unknown when there is no price at all', () => {
    expect(
      prices.estimateCost('claude', 'claude-sonnet-5-5', 100, 100, iso()),
    ).toBe('unknown');
    expect(prices.estimateCost('claude', 'no-such-model', 1, 1, iso())).toBe(
      'unknown',
    );
  });

  it('never turns an unknown price or an unknown count into zero', () => {
    // a catalog model whose price is not verified has a row with null prices
    db.prepare(
      `INSERT INTO model_price(id,provider,model,inputPricePerMTok,outputPricePerMTok,effectiveFrom,source)
       VALUES('null-row','claude','claude-haiku-5-5',NULL,NULL,'2026-01-01T00:00:00.000Z','default')`,
    ).run();
    expect(
      prices.estimateCost('claude', 'claude-haiku-5-5', 10, 10, iso()),
    ).toBe('unknown');
    put('2', '10');
    expect(
      prices.estimateCost('claude', 'claude-sonnet-5-5', null, 5, iso()),
    ).toBe('unknown');
    expect(
      prices.estimateCost('claude', 'claude-sonnet-5-5', 5, null, iso()),
    ).toBe('unknown');
  });

  it('is zero only when the prices really are zero', () => {
    put('0', '0');
    expect(
      prices.estimateCost('claude', 'claude-sonnet-5-5', 1000, 1000, iso()),
    ).toMatchObject({ amountUsd: '0.000000' });
  });

  it('rounds the total once, not each part', () => {
    put('0.5', '0.5');
    expect(
      prices.estimateCost('claude', 'claude-sonnet-5-5', 1, 1, iso()),
    ).toMatchObject({ amountUsd: '0.000001' });
  });

  it('uses the old price before a change and the new price after it', () => {
    put('2', '10');
    const first = prices.estimateCost(
      'claude',
      'claude-sonnet-5-5',
      1_000_000,
      0,
      iso(),
    );
    now += 3_600_000;
    put('4', '20');
    const before = prices.estimateCost(
      'claude',
      'claude-sonnet-5-5',
      1_000_000,
      0,
      iso(1_000),
    );
    const exactlyAtChange = prices.estimateCost(
      'claude',
      'claude-sonnet-5-5',
      1_000_000,
      0,
      iso(3_600_000),
    );
    const after = prices.estimateCost(
      'claude',
      'claude-sonnet-5-5',
      1_000_000,
      0,
      iso(7_200_000),
    );
    expect(first).toMatchObject({ amountUsd: '2.000000' });
    expect(before).toMatchObject({ amountUsd: '2.000000' });
    expect(exactlyAtChange).toMatchObject({ amountUsd: '4.000000' });
    expect(after).toMatchObject({ amountUsd: '4.000000' });
    if (before === 'unknown' || after === 'unknown')
      throw new Error('unreachable');
    expect(before.priceId).not.toBe(after.priceId);
  });

  it('is Unknown for a run before any price existed', () => {
    put('2', '10');
    expect(
      prices.estimateCost(
        'claude',
        'claude-sonnet-5-5',
        1,
        1,
        iso(-86_400_000),
      ),
    ).toBe('unknown');
  });
});
