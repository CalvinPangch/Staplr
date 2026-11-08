import type Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const directory = fileURLToPath(new URL('./migrations/', import.meta.url));
function journal(db: Database.Database) {
  db.pragma('foreign_keys = ON');
  db.exec(
    'CREATE TABLE IF NOT EXISTS __migrations(version TEXT PRIMARY KEY NOT NULL)',
  );
}
export function migrateUp(db: Database.Database) {
  journal(db);
  for (const file of readdirSync(directory)
    .filter((f) => /^\d+_.+\.sql$/.test(f) && !f.endsWith('.down.sql'))
    .sort()) {
    if (
      db.prepare('SELECT version FROM __migrations WHERE version=?').get(file)
    )
      continue;
    db.transaction(() => {
      db.exec(readFileSync(join(directory, file), 'utf8'));
      db.prepare('INSERT INTO __migrations(version) VALUES(?)').run(file);
    })();
  }
}
export function migrateDown(db: Database.Database, toVersion: number) {
  journal(db);
  const applied = db
    .prepare('SELECT version FROM __migrations ORDER BY version DESC')
    .all() as { version: string }[];
  for (const { version } of applied) {
    if (Number.parseInt(version, 10) <= toVersion) continue;
    db.transaction(() => {
      db.exec(
        readFileSync(
          join(directory, version.replace(/\.sql$/, '.down.sql')),
          'utf8',
        ),
      );
      db.prepare('DELETE FROM __migrations WHERE version=?').run(version);
    })();
  }
}
