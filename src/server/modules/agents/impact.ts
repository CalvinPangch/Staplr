import type Database from 'better-sqlite3';
import type { ImpactRegistry } from '../providers/impact.js';
import type { AgentService } from './service.js';

/**
 * Tells the rest of the app who depends on what: the provider impact list and
 * hourly model checks see the agents on a connection, and a renamed connection
 * is written into the agent files that use it. The provider module never reads
 * the agent table itself.
 */
export function registerAgentImpact({
  db,
  impact,
  agents,
}: {
  db: Database.Database;
  impact: ImpactRegistry;
  agents: AgentService;
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
          'SELECT DISTINCT model FROM agent WHERE providerConnectionId=? AND model IS NOT NULL',
        )
        .all(connectionId) as { model: string }[]
    ).map((row) => row.model),
  );
  impact.registerRenameHook((connectionId, newName) =>
    agents.connectionRenamed(connectionId, newName),
  );
}
