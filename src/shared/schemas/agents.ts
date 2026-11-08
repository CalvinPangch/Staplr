import { z } from 'zod';
import { providers, readinessReasonCodes, roleTypes } from '../status.js';

/**
 * An agent is saved as its whole Markdown file (feature 003). The header is
 * checked by parseAgentFile (src/shared/agent-file.ts) and the server.
 */
const definitionSchema = z
  .string()
  .min(1, 'The agent file is empty. Start from a role template.')
  .max(20_000, 'The agent file can be at most 20,000 characters.');

export const agentCreateSchema = z
  .object({ definition: definitionSchema })
  .strict();
export type AgentCreate = z.infer<typeof agentCreateSchema>;

/** `revision` is the version the editor loaded; a newer one refuses the save. */
export const agentUpdateSchema = z
  .object({ definition: definitionSchema, revision: z.number().int().min(1) })
  .strict();
export type AgentUpdate = z.infer<typeof agentUpdateSchema>;

/** One problem in an agent file, as returned in `details.problems` of a 422. */
export const fileProblemSchema = z.object({
  line: z.number().int().min(1),
  field: z.string(),
  message: z.string(),
});

export const agentTemplateSchema = z.object({
  id: z.string(),
  role: z.enum(roleTypes),
  label: z.string(),
  kind: z.enum(['shipped', 'kept']),
  definition: z.string(),
});
export type AgentTemplate = z.infer<typeof agentTemplateSchema>;

export const readinessReasonSchema = z.object({
  code: z.enum(readinessReasonCodes),
  agentId: z.string().optional(),
  message: z.string().optional(),
});
export type ReadinessReason = z.infer<typeof readinessReasonSchema>;

export const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(roleTypes),
  provider: z.enum(providers),
  providerConnectionId: z.string().nullable(),
  /** the connection name as written in the file; may name a removed connection */
  connectionName: z.string().nullable(),
  model: z.string().nullable(),
  definition: z.string(),
  revision: z.number().int().min(1),
  readiness: z.enum(['ready', 'not_ready']),
  reasons: z.array(readinessReasonSchema),
  projects: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type Agent = z.infer<typeof agentSchema>;
