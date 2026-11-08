import { useQuery } from '@tanstack/react-query';
import type { Soul } from '../../../shared/schemas/souls';
import type { RoleType } from '../../../shared/status';
import { api } from '../../lib/api';

export const soulsKey = ['souls'] as const;
export const fetchSouls = () => api<Soul[]>('/api/souls');

export function useSouls() {
  return useQuery({ queryKey: soulsKey, queryFn: fetchSouls });
}

export const roleLabels: Record<RoleType, string> = {
  project_manager: 'Project Manager',
  business_analyst: 'Business Analyst',
  developer: 'Developer',
  qa: 'QA',
  custom: 'Custom',
};

export const roleOrder: RoleType[] = [
  'project_manager',
  'business_analyst',
  'developer',
  'qa',
  'custom',
];

/** Roles a soul created from scratch may have (never Project Manager). */
export const newSoulRoles: RoleType[] = [
  'business_analyst',
  'developer',
  'qa',
  'custom',
];
