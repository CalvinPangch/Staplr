import { useQuery } from '@tanstack/react-query';
import type { ProviderConnection } from '../../../shared/schemas/providers';
import type { SandboxSession } from '../../../shared/schemas/sandbox';
import { api } from '../../lib/api';

export const providersKey = ['provider-connections'] as const;
export const fetchProviders = () =>
  api<ProviderConnection[]>('/api/provider-connections');

/** While a Codex login is discovering its models, the list refreshes every 2 s. */
export const discoveryPollMs = 2000;

export function useProviderConnections() {
  return useQuery({
    queryKey: providersKey,
    queryFn: fetchProviders,
    refetchInterval: (query) =>
      query.state.data?.some((c) => c.discoveryStatus === 'running')
        ? discoveryPollMs
        : false,
  });
}

export interface ImpactItem {
  id: string;
  name: string;
}
export interface Impact {
  agents: ImpactItem[];
  projects: ImpactItem[];
}

export const startCodexLogin = (
  body: { name: string } | { reloginOf: string },
) =>
  api<SandboxSession>('/api/sandbox-sessions', {
    method: 'POST',
    body: { provider: 'codex', ...body },
  });

export const providerName = { claude: 'Claude', codex: 'Codex' } as const;
export const authLabel = {
  api_key: 'Anthropic API key',
  codex_login: 'Codex sandbox login',
} as const;
