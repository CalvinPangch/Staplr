import { z } from 'zod';

/** Stable machine codes returned in Problem responses (contracts/openapi.yaml). */
export const errorCodes = [
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'invalid_origin',
  'invalid_request',
  'invalid_input',
  'invalid_credentials',
  'already_setup',
  'internal_error',
  'token_invalid',
  'token_missing_permissions',
  'api_key_invalid',
  'provider_unavailable',
  'docker_unavailable',
  'login_not_complete',
  'unsupported_provider',
  'model_unavailable',
  'soul_in_use',
  'agent_in_use',
  'pm_already_assigned',
  'pm_rule_violation',
  'no_project_manager',
  'history_rewritten',
  'insufficient_disk_space',
] as const;
export type ErrorCode = (typeof errorCodes)[number];

export const problemSchema = z.object({
  code: z.enum(errorCodes),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type Problem = z.infer<typeof problemSchema>;

export function problem(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): Problem {
  return details ? { code, message, details } : { code, message };
}
