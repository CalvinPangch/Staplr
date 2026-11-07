import { useQuery } from '@tanstack/react-query';
import type { Agent } from '../../../shared/schemas/agents';
import type { ModelAccess } from '../../../shared/schemas/providers';
import { api } from '../../lib/api';

export const agentsKey = ['agents'] as const;
export const fetchAgents = () => api<Agent[]>('/api/agents');

export function useAgents() {
  return useQuery({ queryKey: agentsKey, queryFn: fetchAgents });
}

export interface ModelCandidates {
  catalogRevision: string;
  models: ModelAccess[];
}
export const modelsKey = (connectionId: string) =>
  ['models', connectionId] as const;
export const fetchModels = (connectionId: string) =>
  api<ModelCandidates>(
    `/api/models?providerConnectionId=${encodeURIComponent(connectionId)}`,
  );

export const availabilityText = {
  available: 'Available',
  unavailable: 'Not available to this connection',
  unknown: 'Not checked yet',
} as const;
