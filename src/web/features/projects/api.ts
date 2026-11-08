import { useQuery } from '@tanstack/react-query';
import type {
  Project,
  Repository,
  Team,
} from '../../../shared/schemas/projects';
import { api } from '../../lib/api';

export const projectsKey = ['projects'] as const;
export const projectKey = (id: string) => ['project', id] as const;
export const teamKey = (id: string) => ['team', id] as const;

export const fetchProjects = () => api<Project[]>('/api/projects');
export const fetchProject = (id: string) =>
  api<Project>(`/api/projects/${encodeURIComponent(id)}`);
export const fetchTeam = (id: string) =>
  api<Team>(`/api/projects/${encodeURIComponent(id)}/team`);

export const fetchRepositories = (connectionId: string, query: string) =>
  api<Repository[]>(
    `/api/source-control-connections/${encodeURIComponent(connectionId)}/repositories${
      query ? `?q=${encodeURIComponent(query)}` : ''
    }`,
  );
export const fetchBranches = (connectionId: string, remoteId: string) =>
  api<string[]>(
    `/api/source-control-connections/${encodeURIComponent(connectionId)}/repositories/${encodeURIComponent(remoteId)}/branches`,
  );

export function useProjects() {
  return useQuery({ queryKey: projectsKey, queryFn: fetchProjects });
}

/** Polls once a second while the repository is still downloading. */
export function useProject(id: string) {
  return useQuery({
    queryKey: projectKey(id),
    queryFn: () => fetchProject(id),
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.downloadStatus === 'downloading' ? 1000 : false,
  });
}

export function useTeam(id: string) {
  return useQuery({
    queryKey: teamKey(id),
    queryFn: () => fetchTeam(id),
    staleTime: 0,
  });
}
