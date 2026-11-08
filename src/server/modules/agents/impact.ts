import type Database from 'better-sqlite3';
import type { ImpactRegistry } from '../providers/impact.js';
import type { SoulService } from '../souls/service.js';

/**
 * Tells the rest of the app who depends on what: the provider impact list and
 * hourly model checks see the agents on a connection, and a soul cannot be
 * deleted while agents use it. The provider and soul modules never read the
 * agent table themselves.
 */
export function registerAgentImpact({
  db,
  impact,
  souls,
}: {
  db: Database.Database;
  impact: ImpactRegistry;
  souls: SoulService;
}) {
  impact.registerImpactSource((connectionId) => ({
    agents: db
      .prepare(
        'SELECT id, name FROM agent WHERE providerConnectionId=? ORDER BY name',
      )
      .all(connectionId) as { id: string; name: string }[],
  }));
  impact.registerModelsInUseSource((connectionId) =>
    (
      db
        .prepare(
          'SELECT DISTINCT model FROM agent WHERE providerConnectionId=?',
        )
        .all(connectionId) as { model: string }[]
    ).map((row) => row.model),
  );
  souls.registerUsage(
    (soulId) =>
      db
        .prepare('SELECT id, name FROM agent WHERE soulId=? ORDER BY name')
        .all(soulId) as { id: string; name: string }[],
  );
}
