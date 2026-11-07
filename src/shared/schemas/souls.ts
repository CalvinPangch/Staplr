import { z } from 'zod';
import { roleTypes } from '../status.js';

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name of 1 to 80 characters.')
  .max(80, 'Enter a name of 1 to 80 characters.');
const descriptionSchema = z
  .string()
  .max(500, 'The description can be at most 500 characters.');
const instructionsSchema = z
  .string()
  .max(20_000, 'The instructions can be at most 20,000 characters.');

/** What the editor sends. The role type is fixed when a soul is created. */
export const soulInputSchema = z
  .object({
    name: nameSchema,
    roleType: z.enum(roleTypes),
    description: descriptionSchema,
    instructions: instructionsSchema,
  })
  .strict();
export type SoulInput = z.infer<typeof soulInputSchema>;

/** A soul made from scratch can never be a Project Manager (FR-018). */
export const soulCreateSchema = soulInputSchema.refine(
  (value) => value.roleType !== 'project_manager',
  {
    path: ['roleType'],
    message:
      'Project Manager souls can only come from copying the default Project Manager.',
  },
);

export const soulCopySchema = z
  .object({ name: nameSchema.optional() })
  .strict();

export const soulSchema = z.object({
  id: z.string(),
  name: z.string(),
  roleType: z.enum(roleTypes),
  description: z.string(),
  instructions: z.string(),
  isDefault: z.boolean(),
  copiedFromId: z.string().nullable(),
  usedByAgents: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type Soul = z.infer<typeof soulSchema>;
