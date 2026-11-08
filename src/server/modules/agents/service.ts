import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { ServiceError } from '../../lib/problem.js';
import {
  headerLineOf,
  parseAgentFile,
  setHeaderValue,
  type AgentFileKey,
  type AgentSettings,
  type FileProblem,
} from '../../../shared/agent-file.js';
import type {
  Agent,
  AgentCreate,
  AgentTemplate,
  AgentUpdate,
} from '../../../shared/schemas/agents.js';
import type { RoleType } from '../../../shared/status.js';
import { recordAudit } from '../audit/service.js';
import { loadCatalog } from '../prices/catalog.js';
import type { ProviderService } from '../providers/service.js';
import { agentReadiness } from './readiness.js';
import { listTemplates } from './templates.js';

interface AgentRow {
  id: string;
  name: string;
  role: RoleType;
  provider: 'claude' | 'codex';
  providerConnectionId: string | null;
  model: string | null;
  definition: string;
  revision: number;
  /** the linked connection's current name, or null when not linked */
  linkedName: string | null;
}

type ProjectsOfAgent = (agentId: string) => { id: string; name: string }[];

/** Returns the projects whose single-Project-Manager rule a role change would break. */
type RoleGuard = (
  agentId: string,
  from: RoleType,
  to: RoleType,
) => { id: string; name: string }[];

const selectAgents = `SELECT a.id, a.name, a.role, a.provider, a.providerConnectionId, a.model,
    a.definition, a.revision, pc.name AS linkedName
  FROM agent a LEFT JOIN provider_connection pc ON pc.id = a.providerConnectionId`;

const providerLabel = { claude: 'Claude', codex: 'Codex' } as const;

/** The connection name written in a file (it can name a removed connection). */
function writtenConnection(definition: string): string {
  const parsed = parseAgentFile(definition);
  return parsed.ok ? parsed.settings.connection : '';
}

/**
 * Agents are Markdown files (feature 003). A save parses the file, runs the
 * checks only the server can make, and copies the settings into the agent's
 * columns so readiness, teams and model checks read them as before.
 */
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
    const written = row.linkedName ?? writtenConnection(row.definition);
    const explained = reasons.map((reason) => {
      if (reason.code === 'no_provider_connection')
        return {
          ...reason,
          message: written
            ? `The connection "${written}" was not found. Set connection: in the agent file to an existing connection.`
            : 'This agent has no provider connection. Set connection: in the agent file.',
        };
      if (reason.code === 'model_unavailable' && !row.model)
        return {
          ...reason,
          message: 'This agent has no model. Set model: in the agent file.',
        };
      return reason;
    });
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      provider: row.provider,
      providerConnectionId: row.providerConnectionId,
      connectionName: written || null,
      model: row.model,
      definition: row.definition,
      revision: row.revision,
      readiness,
      reasons: explained.map((reason) => ({ ...reason, agentId: row.id })),
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

  function refuse(problems: FileProblem[]): never {
    const count =
      problems.length === 1 ? '1 problem' : `${problems.length} problems`;
    throw new ServiceError(
      422,
      'agent_file_invalid',
      `The agent file has ${count}. Fix ${problems.length === 1 ? 'it' : 'them'} and save again.`,
      { problems },
    );
  }

  /**
   * Parses the file and runs the checks only the server can make. Every
   * problem is returned together, each on the header line it concerns.
   */
  function check(
    definition: string,
    self?: AgentRow,
  ): { settings: AgentSettings; connectionId: string | null } {
    const parsed = parseAgentFile(definition);
    if (!parsed.ok) refuse(parsed.problems);
    const { settings } = parsed;
    const problems: FileProblem[] = [];
    const at = (key: AgentFileKey) => headerLineOf(definition, key);

    if (
      db
        .prepare('SELECT 1 FROM agent WHERE name=? AND id IS NOT ?')
        .get(settings.name, self?.id ?? null)
    )
      problems.push({
        line: at('name'),
        field: 'name',
        message: `Another agent is already called "${settings.name}". Choose a different name.`,
      });

    let connectionId: string | null = null;
    if (settings.connection) {
      const match = providers
        .list()
        .find(
          (c) =>
            c.provider === settings.provider &&
            c.name.toLowerCase() === settings.connection.toLowerCase(),
        );
      if (match) connectionId = match.id;
      else
        problems.push({
          line: at('connection'),
          field: 'connection',
          message: `There is no ${providerLabel[settings.provider]} connection called "${settings.connection}". Use Insert connection, or check the Providers screen.`,
        });
    }

    if (settings.model && connectionId) {
      const access = providers
        .listModelAccess(connectionId)
        .find((m) => m.id === settings.model);
      const entry =
        loadCatalog().models.find(
          (m) => m.provider === settings.provider && m.id === settings.model,
        ) ??
        (access?.discovered
          ? { label: access.label, retired: false }
          : undefined);
      const message =
        !entry || entry.retired
          ? `"${settings.model}" is not offered for ${settings.connection}. Use Insert model to choose one.`
          : access?.availability === 'unavailable'
            ? `${entry.label} is not available to ${settings.connection}. Choose a different model or connection.`
            : access?.availability !== 'available'
              ? `${entry.label} has not been checked for ${settings.connection} yet. Use Check availability, then save again.`
              : null;
      if (message)
        problems.push({ line: at('model'), field: 'model', message });
    }

    // One Project Manager per project, now on the agent's own role (US4).
    if (self && settings.role !== self.role) {
      const broken = roleGuards.flatMap((guard) =>
        guard(self.id, self.role, settings.role),
      );
      if (broken.length > 0)
        problems.push({
          line: at('role'),
          field: 'role',
          message: `Changing the role would leave ${broken.map((p) => `"${p.name}"`).join(', ')} without exactly one Project Manager. Change the team first.`,
        });
    }

    if (problems.length > 0) refuse(problems);
    return { settings, connectionId };
  }

  /** The settings that changed, and "instructions" when the text below the header did. */
  function changes(before: AgentRow, definition: string): string[] {
    const old = parseAgentFile(before.definition);
    const next = parseAgentFile(definition);
    if (!next.ok) return [];
    if (!old.ok) return ['file'];
    const changed: string[] = [];
    for (const key of Object.keys(next.settings) as (keyof AgentSettings)[])
      if (old.settings[key] !== next.settings[key]) changed.push(key);
    if (old.instructions !== next.instructions) changed.push('instructions');
    return changed;
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

    templates(): AgentTemplate[] {
      return listTemplates(db);
    },

    create(input: AgentCreate): Agent {
      const { settings, connectionId } = check(input.definition);
      const id = randomUUID();
      const at = now();
      db.transaction(() => {
        db.prepare(
          `INSERT INTO agent(id,name,role,provider,providerConnectionId,model,definition,revision,createdAt,updatedAt)
           VALUES(?,?,?,?,?,?,?,1,?,?)`,
        ).run(
          id,
          settings.name,
          settings.role,
          settings.provider,
          connectionId,
          settings.model || null,
          input.definition,
          at,
          at,
        );
        recordAudit(db, {
          action: 'agent.created',
          targetType: 'agent',
          targetId: id,
          targetName: settings.name,
          detail: { provider: settings.provider, role: settings.role },
          at,
        });
      })();
      return toPublic(mustFind(id), new Map());
    },

    update(id: string, input: AgentUpdate): Agent {
      const before = mustFind(id);
      if (input.revision !== before.revision)
        throw new ServiceError(
          409,
          'agent_changed',
          'This agent was changed somewhere else since you opened it. Reload to see the latest version; your text is kept so you can copy it.',
          { revision: before.revision },
        );
      const { settings, connectionId } = check(input.definition, before);
      const changed = changes(before, input.definition);
      const at = now();
      db.transaction(() => {
        db.prepare(
          `UPDATE agent SET name=?, role=?, provider=?, providerConnectionId=?, model=?, definition=?,
             revision=revision+1, updatedAt=? WHERE id=?`,
        ).run(
          settings.name,
          settings.role,
          settings.provider,
          connectionId,
          settings.model || null,
          input.definition,
          at,
          id,
        );
        recordAudit(db, {
          action: 'agent.updated',
          targetType: 'agent',
          targetId: id,
          targetName: settings.name,
          detail: { changed },
          at,
        });
      })();
      return toPublic(mustFind(id), new Map());
    },

    /** A renamed connection: every file that uses it names the new name (FR-004b). */
    connectionRenamed(connectionId: string, newName: string): void {
      const rows = db
        .prepare(
          'SELECT id, name, definition FROM agent WHERE providerConnectionId=?',
        )
        .all(connectionId) as {
        id: string;
        name: string;
        definition: string;
      }[];
      const at = now();
      for (const row of rows) {
        db.prepare(
          'UPDATE agent SET definition=?, revision=revision+1, updatedAt=? WHERE id=?',
        ).run(
          setHeaderValue(row.definition, 'connection', newName),
          at,
          row.id,
        );
        recordAudit(db, {
          action: 'agent.updated',
          targetType: 'agent',
          targetId: row.id,
          targetName: row.name,
          detail: { changed: ['connection'] },
          at,
        });
      }
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
      db.transaction(() => {
        db.prepare('DELETE FROM agent WHERE id=?').run(id);
        recordAudit(db, {
          action: 'agent.deleted',
          targetType: 'agent',
          targetId: id,
          targetName: row.name,
          at: now(),
        });
      })();
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
