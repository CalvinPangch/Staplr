import { useQuery } from '@tanstack/react-query';
import type { SourceControlConnection } from '../../../shared/schemas/source-control';
import { api } from '../../lib/api';

export const connectionsKey = ['source-control-connections'] as const;
export const fetchConnections = () =>
  api<SourceControlConnection[]>('/api/source-control-connections');

export function useConnections() {
  return useQuery({ queryKey: connectionsKey, queryFn: fetchConnections });
}

export function formatTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : 'Never';
}
