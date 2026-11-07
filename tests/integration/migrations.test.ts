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
