import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { ServiceError } from '../../lib/problem.js';
import type { Agent, AgentInput } from '../../../shared/schemas/agents.js';
import type { RoleType } from '../../../shared/status.js';
import { recordAudit } from '../audit/service.js';
import { loadCatalog } from '../prices/catalog.js';
import type { ProviderService } from '../providers/service.js';
import { agentReadiness } from './readiness.js';

interface AgentRow {
  id: string;
  name: string;
  soulId: string;
  roleType: RoleType;
  provider: 'claude' | 'codex';
  providerConnectionId: string | null;
  model: string;
}

type ProjectsOfAgent = (agentId: string) => { id: string; name: string }[];

/** Returns the projects whose single-Project-Manager rule a role change would break. */
type RoleGuard = (
  agentId: string,
  from: RoleType,
  to: RoleType,
) => { id: string; name: string }[];

const selectAgents = `SELECT a.id, a.name, a.soulId, s.roleType, a.provider, a.providerConnectionId, a.model
  FROM agent a JOIN soul s ON s.id = a.soulId`;

export function createAgentService({
  db,
  clock,
  providers,
}: {
  db: Database.Database;
  clock: () => number;
  providers: ProviderService;
}) {
  const now = () => new Date(clock()).toISOString();
  const projectSources: ProjectsOfAgent[] = [];
  const roleGuards: RoleGuard[] = [];
  const projectsOf = (agentId: string) =>
    projectSources
      .flatMap((source) => source(agentId))
      .sort((a, b) => a.name.localeCompare(b.name));

  /** Readiness is recomputed on every read from the connection and its evidence. */
  function toPublic(
    row: AgentRow,
    cache: Map<string, ReturnType<ProviderService['listModelAccess']>>,
  ): Agent {
    let connection: { status: 'connected' | 'needs_relogin' } | null = null;
    let availability: 'available' | 'unavailable' | 'unknown' = 'unknown';
    let discoveredLabel: string | null = null;
    if (row.providerConnectionId) {
      try {
        connection = providers.get(row.providerConnectionId);
        let access = cache.get(row.providerConnectionId);
        if (!access) {
          access = providers.listModelAccess(row.providerConnectionId);
          cache.set(row.providerConnectionId, access);
        }
        const listed = access.find((m) => m.id === row.model);
        availability = listed?.availability ?? 'unknown';
        if (listed?.discovered) discoveredLabel = listed.label;
      } catch {
        connection = null;
      }
    }
    const entry =
      loadCatalog().models.find(
        (m) => m.provider === row.provider && m.id === row.model,
      ) ??
      (discoveredLabel
        ? { label: discoveredLabel, retired: false }
        : undefined);
    const { readiness, reasons } = agentReadiness({
      connection,
      model: entry
        ? { label: entry.label, retired: entry.retired, availability }
        : null,
    });
    return {
      id: row.id,
      name: row.name,
      soulId: row.soulId,
      role: row.roleType,
      provider: row.provider,
      providerConnectionId: row.providerConnectionId,
      model: row.model,
      readiness,
      reasons: reasons.map((reason) => ({ ...reason, agentId: row.id })),
      projects: projectsOf(row.id),
    };
  }

  const find = (id: string) =>
    db.prepare(`${selectAgents} WHERE a.id=?`).get(id) as AgentRow | undefined;
  function mustFind(id: string): AgentRow {
    const row = find(id);
    if (!row)
      throw new ServiceError(404, 'not_found', 'That agent does not exist.');
    return row;
  }
  const nameTaken = (name: string, exceptId?: string) =>
    Boolean(
      db
        .prepare('SELECT 1 FROM agent WHERE name=? AND id IS NOT ?')
        .get(name, exceptId ?? null),
    );

  /**
   * An agent can only be saved with a model that is current and verified for
   * the chosen connection. No other model is ever substituted.
   */
  function validate(input: AgentInput, exceptId?: string) {
    if (nameTaken(input.name, exceptId))
      throw new ServiceError(
        409,
        'conflict',
        'An agent with that name already exists. Choose a different name.',
      );
    const soul = db.prepare('SELECT 1 FROM soul WHERE id=?').get(input.soulId);
    if (!soul)
      throw new ServiceError(
        422,
        'invalid_input',
        'That soul does not exist. Choose another soul.',
      );
    let connection;
    try {
      connection = providers.get(input.providerConnectionId);
    } catch {
      throw new ServiceError(
        422,
        'invalid_input',
        'That provider connection does not exist. Choose another connection.',
      );
    }
    if (connection.provider !== input.provider)
      throw new ServiceError(
        422,
        'invalid_input',
        `The provider must match the connection: ${connection.name} is a ${connection.provider} connection.`,
      );
    const access = providers
      .listModelAccess(input.providerConnectionId)
      .find((m) => m.id === input.model);
    const entry =
      loadCatalog().models.find(
        (m) => m.provider === input.provider && m.id === input.model,
      ) ??
      (access?.discovered
        ? { label: access.label, retired: false }
        : undefined);
    if (!entry || entry.retired)
      throw new ServiceError(
        422,
        'model_unavailable',
        'That model is not offered. Choose another model.',
      );
    if (access?.availability === 'unavailable')
      throw new ServiceError(
        422,
        'model_unavailable',
        `${entry.label} is not available to this connection. Choose a different model or connection.`,
      );
    if (access?.availability !== 'available')
      throw new ServiceError(
        422,
        'model_unavailable',
        `${entry.label} has not been checked for this connection yet. Use Check availability, then save again.`,
      );
  }

  return {
    list(): Agent[] {
      const cache = new Map();
      return (
        db.prepare(`${selectAgents} ORDER BY a.name`).all() as AgentRow[]
      ).map((row) => toPublic(row, cache));
    },

    get(id: string): Agent {
      return toPublic(mustFind(id), new Map());
    },

    create(input: AgentInput): Agent {
      validate(input);
      const id = randomUUID();
      const at = now();
      db.prepare(
        `INSERT INTO agent(id,name,soulId,provider,providerConnectionId,model,createdAt,updatedAt)
         VALUES(?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        input.name,
        input.soulId,
        input.provider,
        input.providerConnectionId,
        input.model,
        at,
        at,
      );
      recordAudit(db, {
        action: 'agent.created',
        targetType: 'agent',
        targetId: id,
        targetName: input.name,
        detail: { provider: input.provider, model: input.model },
        at,
      });
      return toPublic(mustFind(id), new Map());
    },

    update(id: string, input: AgentInput): Agent {
      const before = mustFind(id);
      validate(input, id);
      if (input.soulId !== before.soulId) {
        const to = (
          db
            .prepare('SELECT roleType FROM soul WHERE id=?')
            .get(input.soulId) as { roleType: RoleType }
        ).roleType;
        const broken = roleGuards.flatMap((guard) =>
          guard(id, before.roleType, to),
        );
        if (broken.length > 0)
          throw new ServiceError(
            409,
            'pm_rule_violation',
            'Changing this soul would leave a project without exactly one Project Manager. Change the team first.',
            { projects: broken },
          );
      }
      const at = now();
      db.prepare(
        `UPDATE agent SET name=?, soulId=?, provider=?, providerConnectionId=?, model=?, updatedAt=? WHERE id=?`,
      ).run(
        input.name,
        input.soulId,
        input.provider,
        input.providerConnectionId,
        input.model,
        at,
        id,
      );
      recordAudit(db, {
        action: 'agent.updated',
        targetType: 'agent',
        targetId: id,
        targetName: input.name,
        detail: { provider: input.provider, model: input.model },
        at,
      });
      return toPublic(mustFind(id), new Map());
    },

    delete(id: string): void {
      const row = mustFind(id);
      const projects = projectsOf(id);
      if (projects.length > 0)
        throw new ServiceError(
          409,
          'agent_in_use',
          'This agent is on a project team. Remove it from those teams first.',
          { projects },
        );
      db.prepare('DELETE FROM agent WHERE id=?').run(id);
      recordAudit(db, {
        action: 'agent.deleted',
        targetType: 'agent',
        targetId: id,
        targetName: row.name,
        at: now(),
      });
    },

    /** Projects register which teams each agent is on. */
    registerProjects(source: ProjectsOfAgent): void {
      projectSources.push(source);
    },

    registerRoleGuard(guard: RoleGuard): void {
      roleGuards.push(guard);
    },
  };
}

export type AgentService = ReturnType<typeof createAgentService>;

declare module 'fastify' {
  interface FastifyInstance {
    agents: AgentService;
  }
}
