import { z } from 'zod';
import { providers, readinessReasonCodes, roleTypes } from '../status.js';

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name of 1 to 80 characters.')
  .max(80, 'Enter a name of 1 to 80 characters.');

export const agentInputSchema = z
  .object({
    name: nameSchema,
    soulId: z.string().min(1, 'Choose a soul.').max(100),
    provider: z.enum(providers),
    providerConnectionId: z.string().min(1, 'Choose a connection.').max(100),
    model: z.string().min(1, 'Choose a model.').max(200),
  })
  .strict();
export type AgentInput = z.infer<typeof agentInputSchema>;

export const readinessReasonSchema = z.object({
  code: z.enum(readinessReasonCodes),
  agentId: z.string().optional(),
  message: z.string().optional(),
});
export type ReadinessReason = z.infer<typeof readinessReasonSchema>;

export const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  soulId: z.string(),
  role: z.enum(roleTypes),
  provider: z.enum(providers),
  providerConnectionId: z.string().nullable(),
  model: z.string(),
  readiness: z.enum(['ready', 'not_ready']),
  reasons: z.array(readinessReasonSchema),
  projects: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type Agent = z.infer<typeof agentSchema>;
