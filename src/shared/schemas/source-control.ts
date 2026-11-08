import { z } from 'zod';

export const platforms = ['github', 'gitlab'] as const;
export type Platform = (typeof platforms)[number];

/** What an agent needs from a repository token (FR-003). */
export const permissionIds = [
  'read_contents',
  'push',
  'create_pull_request',
] as const;
export type PermissionId = (typeof permissionIds)[number];

export const permissionLabels: Record<PermissionId, string> = {
  read_contents: 'Read repository contents',
  push: 'Push branches',
  create_pull_request: 'Create pull/merge requests',
};

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name of 1 to 80 characters.')
  .max(80, 'Enter a name of 1 to 80 characters.');
const tokenSchema = z
  .string()
  .min(1, 'Enter the access token.')
  .max(4096, 'This token is too long.');

export const sourceControlCreateSchema = z
  .object({
    name: nameSchema,
    platform: z.enum(platforms),
    /** GitLab only: the instance address. Defaults to https://gitlab.com. */
    baseUrl: z.string().trim().max(2048).optional(),
    token: tokenSchema,
  })
  .strict();
export type SourceControlCreate = z.infer<typeof sourceControlCreateSchema>;

export const sourceControlUpdateSchema = z
  .object({ name: nameSchema.optional(), token: tokenSchema.optional() })
  .strict()
  .refine((value) => value.name !== undefined || value.token !== undefined, {
    message: 'Change the name or replace the token.',
  });
export type SourceControlUpdate = z.infer<typeof sourceControlUpdateSchema>;

/** Response shape. There is deliberately no token field of any kind. */
export const sourceControlConnectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  platform: z.enum(platforms),
  baseUrl: z.string(),
  accountName: z.string(),
  grantedPermissions: z.array(z.enum(permissionIds)),
  missingPermissions: z.array(z.enum(permissionIds)),
  tokenLast4: z.string(),
  status: z.enum(['connected', 'needs_attention']),
  statusReason: z
    .enum(['invalid', 'expired', 'revoked', 'missing_permission'])
    .nullable(),
  lastCheckedAt: z.string().nullable(),
  lastCheckResult: z.string().nullable(),
});
export type SourceControlConnection = z.infer<
  typeof sourceControlConnectionSchema
>;
