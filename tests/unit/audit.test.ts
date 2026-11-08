import Database from 'better-sqlite3';
import { it, expect } from 'vitest';
import { migrateUp } from '../../src/server/db/migrate';
import { recordAudit } from '../../src/server/modules/audit/service';
it('records append-only entries and recursively rejects sensitive audit keys', () => {
  const db = new Database(':memory:');
  try {
    migrateUp(db);
    for (const key of [
      'token',
      'password',
      'credential',
      'credentialBundle',
      'secret',
      'apiKey',
      'API_KEY',
      'x-api-key',
    ])
      expect(() =>
        recordAudit(db, {
          action: 'provider.added',
          targetType: 'provider',
          targetId: 'a',
          targetName: 'Claude',
          detail: { nested: [{ [key]: 'sensitive' }] },
        }),
      ).toThrow();
    recordAudit(db, {
      action: 'provider.added',
      targetType: 'provider',
      targetId: 'a',
      targetName: 'Claude',
      detail: { authType: 'api_key' },
    });
    expect(db.prepare('SELECT action FROM audit_entry').all()).toEqual([
      { action: 'provider.added' },
    ]);
    expect(() =>
      db.prepare("UPDATE audit_entry SET action='changed'").run(),
    ).toThrow();
    expect(() => db.prepare('DELETE FROM audit_entry').run()).toThrow();
  } finally {
    db.close();
  }
});
