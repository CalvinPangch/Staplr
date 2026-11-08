import {
  renderAgentFile,
  setHeaderValue,
  type AgentFileKey,
  type AgentSettings,
} from '../../src/shared/agent-file';

/** Anything that can call the API as the signed-in owner (all test fixtures can). */
interface Caller {
  call(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown,
  ): Promise<{ json(): unknown }>;
}

export interface AgentSpec {
  name: string;
  role: AgentSettings['role'];
  provider: AgentSettings['provider'];
  /** a connection id; it is written into the file by its name */
  providerConnectionId?: string | null;
  model?: string | null;
  instructions?: string;
}

async function connectionName(f: Caller, id: string | null | undefined) {
  if (!id) return '';
  const all = (await f.call('GET', '/api/provider-connections')).json() as {
    id: string;
    name: string;
  }[];
  // an unknown id is written as is, so the save reports an unknown connection
  return all.find((c) => c.id === id)?.name ?? id;
}

/** The body for POST /api/agents: an agent file built from the old-style fields. */
export async function agentBody(f: Caller, spec: AgentSpec) {
  return {
    definition: renderAgentFile(
      {
        name: spec.name,
        role: spec.role,
        provider: spec.provider,
        connection: await connectionName(f, spec.providerConnectionId),
        model: spec.model ?? '',
      },
      spec.instructions ?? 'Work in small, reviewed steps.',
    ),
  };
}

/** The body for PUT /api/agents/{id}: the saved file with some settings changed. */
export async function agentChange(
  f: Caller,
  agentId: string,
  changes: Partial<Record<AgentFileKey, string>>,
) {
  const current = (await f.call('GET', `/api/agents/${agentId}`)).json() as {
    definition: string;
    revision: number;
  };
  let definition = current.definition;
  for (const [key, value] of Object.entries(changes))
    definition = setHeaderValue(definition, key as AgentFileKey, value ?? '');
  return { definition, revision: current.revision };
}
