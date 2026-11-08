import type Database from 'better-sqlite3';
import { ServiceError } from '../../lib/problem.js';
import type { Project, Team } from '../../../shared/schemas/projects.js';
import type { AgentService } from '../agents/service.js';
import type { ProjectService } from './service.js';

const warnedRoles = ['business_analyst', 'developer', 'qa'] as const;

/**
 * Who is on a project team. Exactly one Project Manager is required to finish
 * setup (FR-033); other roles only produce a warning when they are missing.
 */
export function createTeamService({
  db,
  clock,
  agents,
  projects,
}: {
  db: Database.Database;
  clock: () => number;
  agents: AgentService;
  projects: ProjectService;
}) {
  const now = () => new Date(clock()).toISOString();

  function team(projectId: string): Team {
    projects.assertExists(projectId);
    const members = (
      db
        .prepare(
          `SELECT ta.agentId FROM team_assignment ta JOIN agent a ON a.id = ta.agentId
           WHERE ta.projectId=? ORDER BY a.name`,
        )
        .all(projectId) as { agentId: string }[]
    ).map((row) => agents.get(row.agentId));
    const managers = members.filter((m) => m.role === 'project_manager');
    return {
      members,
      projectManagerId: managers[0]?.id ?? null,
      missingRoleWarnings: warnedRoles.filter(
        (role) => !members.some((m) => m.role === role),
      ),
    };
  }

  return {
    team,

    assign(projectId: string, agentId: string): Team {
      const current = team(projectId);
      const agent = agents.get(agentId);
      if (current.members.some((m) => m.id === agentId)) return current;
      const manager = current.members.find((m) => m.role === 'project_manager');
      if (agent.role === 'project_manager' && manager)
        throw new ServiceError(
          409,
          'pm_already_assigned',
          `${manager.name} is already the Project Manager. Replace them instead of adding a second one.`,
          { projectManager: { id: manager.id, name: manager.name } },
        );
      db.prepare(
        'INSERT INTO team_assignment(projectId,agentId,assignedAt) VALUES(?,?,?)',
      ).run(projectId, agentId, now());
      return team(projectId);
    },

    remove(projectId: string, agentId: string): Team {
      projects.assertExists(projectId);
      db.prepare(
        'DELETE FROM team_assignment WHERE projectId=? AND agentId=?',
      ).run(projectId, agentId);
      return team(projectId);
    },

    /** Swaps the Project Manager in a single step so the team never has two or none. */
    replaceProjectManager(projectId: string, agentId: string): Team {
      const current = team(projectId);
      const agent = agents.get(agentId);
      if (agent.role !== 'project_manager')
        throw new ServiceError(
          422,
          'invalid_input',
          `${agent.name} is not a Project Manager. Choose an agent whose role is Project Manager.`,
        );
      db.transaction(() => {
        for (const member of current.members)
          if (member.role === 'project_manager' && member.id !== agentId)
            db.prepare(
              'DELETE FROM team_assignment WHERE projectId=? AND agentId=?',
            ).run(projectId, member.id);
        db.prepare(
          'INSERT OR IGNORE INTO team_assignment(projectId,agentId,assignedAt) VALUES(?,?,?)',
        ).run(projectId, agentId, now());
      })();
      return team(projectId);
    },

    /** "Finish setup": refused while the team has no Project Manager. */
    finalize(projectId: string): Project {
      const current = team(projectId);
      if (current.projectManagerId === null)
        throw new ServiceError(
          422,
          'no_project_manager',
          'Add a Project Manager to the team first. The Project Manager reads each ticket and assigns it to the next agent.',
        );
      return projects.get(projectId);
    },
  };
}

export type TeamService = ReturnType<typeof createTeamService>;
