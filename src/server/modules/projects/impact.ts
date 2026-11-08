import type Database from 'better-sqlite3';
import type { AgentService } from '../agents/service.js';
import type { ImpactRegistry } from '../providers/impact.js';

/**
 * Connects projects to the rest of the app without the other modules reading
 * project tables: provider impact lists the projects reached through agents,
 * agents report their teams, and a role change that would break the
 * exactly-one-Project-Manager rule is refused.
 */
export function registerProjectImpact({
  db,
  impact,
  agents,
}: {
  db: Database.Database;
  impact: ImpactRegistry;
  agents: AgentService;
}) {
  impact.registerImpactSource((connectionId) => ({
    projects: db
      .prepare(
        `SELECT DISTINCT p.id, p.name FROM project p
         JOIN team_assignment ta ON ta.projectId = p.id
         JOIN agent a ON a.id = ta.agentId
         WHERE a.providerConnectionId=? AND p.deletedAt IS NULL ORDER BY p.name`,
      )
      .all(connectionId) as { id: string; name: string }[],
  }));

  agents.registerProjects(
    (agentId) =>
      db
        .prepare(
          `SELECT p.id, p.name FROM project p JOIN team_assignment ta ON ta.projectId = p.id
           WHERE ta.agentId=? AND p.deletedAt IS NULL ORDER BY p.name`,
        )
        .all(agentId) as { id: string; name: string }[],
  );

  agents.registerRoleGuard((agentId, from, to) => {
    if (from === to || (from !== 'project_manager' && to !== 'project_manager'))
      return [];
    const teams = db
      .prepare(
        `SELECT p.id, p.name,
           (SELECT COUNT(*) FROM team_assignment t JOIN agent a ON a.id = t.agentId
              JOIN soul s ON s.id = a.soulId
              WHERE t.projectId = p.id AND s.roleType = 'project_manager') AS managers
         FROM project p JOIN team_assignment ta ON ta.projectId = p.id
         WHERE ta.agentId=? AND p.deletedAt IS NULL ORDER BY p.name`,
      )
      .all(agentId) as { id: string; name: string; managers: number }[];
    return teams
      .filter((team) => {
        const after =
          team.managers -
          (from === 'project_manager' ? 1 : 0) +
          (to === 'project_manager' ? 1 : 0);
        return after !== 1;
      })
      .map(({ id, name }) => ({ id, name }));
  });
}
