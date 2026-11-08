import { useQuery } from '@tanstack/react-query';
import type { Board, Ticket } from '../../../shared/schemas/tickets';
import { api } from '../../lib/api';

export const boardKey = (projectId: string) => ['board', projectId] as const;
export const fetchBoard = (projectId: string) =>
  api<Board>(`/api/projects/${encodeURIComponent(projectId)}/board`);

export function useBoard(projectId: string) {
  return useQuery({
    queryKey: boardKey(projectId),
    queryFn: () => fetchBoard(projectId),
    staleTime: 0,
  });
}

export const moveTicket = (
  ticketId: string,
  toStatus: Ticket['status'],
  toIndex: number,
) =>
  api<Board>(`/api/tickets/${encodeURIComponent(ticketId)}/move`, {
    method: 'POST',
    body: { toStatus, toIndex },
  });

/** "Under a minute", "5 minutes", "3 hours", "2 days". */
export function timeInColumn(since: string, now: number = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(since)) / 60_000);
  if (Number.isNaN(minutes) || minutes < 1) return 'Under a minute';
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
