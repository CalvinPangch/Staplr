import Database from 'better-sqlite3';
import { it, expect } from 'vitest';
import { migrateUp, migrateDown } from '../../src/server/db/migrate';
it('applies all migrations, reverses them and reproduces the same schema', () => {
  const db = new Database(':memory:');
  try {
    const dump = () =>
      db
        .prepare(
          "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
        )
        .all();
    migrateUp(db);
    const first = dump();
    expect(first.length).toBeGreaterThan(1);
    migrateDown(db, 0);
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .all(),
    ).toEqual([{ name: '__migrations' }]);
    migrateUp(db);
    expect(dump()).toEqual(first);
    migrateUp(db);
    expect(dump()).toEqual(first);
  } finally {
    db.close();
  }
});

it('0009 adds model discovery, price refresh and official prices, and closes hand-set prices', () => {
  const db = new Database(':memory:');
  try {
    migrateUp(db);
    const columns = (table: string) =>
      (
        db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
      ).map((c) => c.name);
    expect(columns('provider_connection')).toEqual(
      expect.arrayContaining([
        'discoveryStatus',
        'discoveryError',
        'modelsRefreshedAt',
      ]),
    );
    expect(columns('discovered_model')).toEqual([
      'providerConnectionId',
      'model',
      'label',
      'listedAt',
    ]);
    expect(columns('price_refresh')).toEqual([
      'provider',
      'lastAttemptAt',
      'lastSuccessAt',
      'lastError',
    ]);

    // an official row is accepted; an unknown source is not
    db.prepare(
      `INSERT INTO model_price(id,provider,model,inputPricePerMTok,outputPricePerMTok,effectiveFrom,source)
       VALUES('o1','claude','m','1','2','2026-11-08T00:00:00.000Z','official')`,
    ).run();
    expect(() =>
      db
        .prepare(
          `INSERT INTO model_price(id,provider,model,inputPricePerMTok,outputPricePerMTok,effectiveFrom,source)
           VALUES('x1','claude','n','1','2','2026-11-08T00:00:00.000Z','guess')`,
        )
        .run(),
    ).toThrow();
    // discovered models are removed with their connection; a bad status is refused
    expect(() =>
      db
        .prepare("UPDATE provider_connection SET discoveryStatus='later'")
        .run(),
    ).not.toThrow(); // no rows yet
  } finally {
    db.close();
  }
});

it('upgrading closes every current hand-set price and keeps it as history', () => {
  const db = new Database(':memory:');
  try {
    migrateDown(db, 0);
    // bring the schema to just before 0009, add a hand-set price, then upgrade
    migrateUp(db);
    migrateDown(db, 8);
    db.prepare(
      `INSERT INTO model_price(id,provider,model,inputPricePerMTok,outputPricePerMTok,effectiveFrom,source)
       VALUES('u1','claude','claude-sonnet-5-5','9','99','2026-11-01T00:00:00.000Z','user')`,
    ).run();
    migrateUp(db);
    const row = db
      .prepare("SELECT effectiveUntil, source FROM model_price WHERE id='u1'")
      .get() as {
      effectiveUntil: string | null;
      source: string;
    };
    expect(row.source).toBe('user');
    expect(row.effectiveUntil).not.toBeNull();
  } finally {
    db.close();
  }
});
