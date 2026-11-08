import { z } from 'zod';
import {
  downloadStatuses,
  readinessReasonCodes,
  roleTypes,
} from '../status.js';
import { agentSchema } from './agents.js';

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name of 1 to 80 characters.')
  .max(80, 'Enter a name of 1 to 80 characters.');

export const projectCreateSchema = z
  .object({
    sourceControlConnectionId: z
      .string()
      .min(1, 'Choose a connection.')
      .max(100),
    repoRemoteId: z.string().min(1, 'Choose a repository.').max(100),
    name: nameSchema.optional(),
  })
  .strict();
export type ProjectCreate = z.infer<typeof projectCreateSchema>;

export const projectPatchSchema = z
  .object({
    name: nameSchema.optional(),
    baseBranch: z.string().min(1, 'Choose a branch.').max(250).optional(),
    relink: z
      .object({
        sourceControlConnectionId: z.string().min(1).max(100),
        repoRemoteId: z.string().min(1).max(100),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Change at least one thing: name, base branch or repository.',
  });
export type ProjectPatch = z.infer<typeof projectPatchSchema>;

export const replaceProjectManagerSchema = z
  .object({ agentId: z.string().min(1).max(100) })
  .strict();

export const projectReasonSchema = z.object({
  code: z.enum(readinessReasonCodes),
  agentId: z.string().optional(),
  message: z.string().optional(),
});

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  sourceControlConnectionId: z.string().nullable(),
  repoFullName: z.string(),
  repoRemoteId: z.string(),
  baseBranch: z.string(),
  downloadStatus: z.enum(downloadStatuses),
  downloadProgress: z.number().int().min(0).max(100).nullable(),
  downloadError: z.string().nullable(),
  lastUpdatedAt: z.string().nullable(),
  lastRefreshError: z.string().nullable(),
  readiness: z.enum(['ready', 'not_ready']),
  reasons: z.array(projectReasonSchema),
});
export type Project = z.infer<typeof projectSchema>;

export const teamSchema = z.object({
  members: z.array(agentSchema),
  projectManagerId: z.string().nullable(),
  missingRoleWarnings: z.array(
    z.enum(roleTypes).exclude(['project_manager', 'custom']),
  ),
});
export type Team = z.infer<typeof teamSchema>;

export const repositorySchema = z.object({
  remoteId: z.string(),
  fullName: z.string(),
  defaultBranch: z.string(),
  private: z.boolean(),
});
export type Repository = z.infer<typeof repositorySchema>;
