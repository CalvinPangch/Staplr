import { z } from 'zod';
import {
  authTypes,
  modelAvailabilities,
  providerStatuses,
  providers,
} from '../status.js';

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name of 1 to 80 characters.')
  .max(80, 'Enter a name of 1 to 80 characters.');
const apiKeySchema = z
  .string()
  .min(1, 'Enter the API key.')
  .max(4096, 'This API key is too long.');

/** Claude connects with the owner's own API key; Codex uses a sandbox login. */
export const claudeCreateSchema = z
  .object({
    provider: z.literal('claude'),
    authType: z.literal('api_key'),
    name: nameSchema,
    apiKey: apiKeySchema,
  })
  .strict();
export type ClaudeCreate = z.infer<typeof claudeCreateSchema>;

export const apiKeyReplaceSchema = z.object({ apiKey: apiKeySchema }).strict();
export type ApiKeyReplace = z.infer<typeof apiKeyReplaceSchema>;

export const providerRenameSchema = z.object({ name: nameSchema }).strict();

/** Response shape. No credential of any kind is ever included. */
export const providerConnectionSchema = z.object({
  id: z.string(),
  provider: z.enum(providers),
  authType: z.enum(authTypes),
  credentialRevision: z.number().int().min(1),
  name: z.string(),
  status: z.enum(providerStatuses),
  credentialExpiresAt: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
  lastCheckResult: z.string().nullable(),
});
export type ProviderConnection = z.infer<typeof providerConnectionSchema>;

export const modelAccessSchema = z.object({
  providerConnectionId: z.string(),
  id: z.string(),
  label: z.string(),
  availability: z.enum(modelAvailabilities),
  credentialRevision: z.number().int().min(1),
  catalogRevision: z.string(),
  lastVerifiedAt: z.string().nullable(),
  lastAttemptAt: z.string().nullable(),
  checkError: z.string().nullable(),
});
export type ModelAccess = z.infer<typeof modelAccessSchema>;
