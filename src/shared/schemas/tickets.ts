import { z } from 'zod';

export const ticketStatuses = ['new', 'review', 'testing', 'end'] as const;
export type TicketStatus = (typeof ticketStatuses)[number];

/** Fixed column order and labels (FR-044). */
export const ticketColumns: { status: TicketStatus; label: string }[] = [
  { status: 'new', label: 'New' },
  { status: 'review', label: 'Review' },
  { status: 'testing', label: 'Testing' },
  { status: 'end', label: 'End' },
];

const titleSchema = z
  .string()
  .trim()
  .min(1, 'Enter a title of 1 to 200 characters.')
  .max(200, 'Enter a title of 1 to 200 characters.');
const descriptionSchema = z
  .string()
  .max(20_000, 'The description can be at most 20,000 characters.');

/** Unknown fields, such as an assignee, are rejected (FR-049). */
export const ticketInputSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema.optional(),
  })
  .strict();
export type TicketInput = z.infer<typeof ticketInputSchema>;

export const ticketPatchSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Change the title or the description.',
  });
export type TicketPatch = z.infer<typeof ticketPatchSchema>;

export const moveRequestSchema = z
  .object({
    toStatus: z.enum(ticketStatuses, {
      message: 'Choose one of New, Review, Testing or End.',
    }),
    toIndex: z
      .number()
      .int('Give a whole position.')
      .min(0, 'The position cannot be negative.'),
  })
  .strict();
export type MoveRequest = z.infer<typeof moveRequestSchema>;

export const ticketSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(ticketStatuses),
  position: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  statusChangedAt: z.string(),
});
export type Ticket = z.infer<typeof ticketSchema>;

export const boardSchema = z.object({
  projectId: z.string(),
  columns: z.array(
    z.object({
      status: z.enum(ticketStatuses),
      label: z.enum(['New', 'Review', 'Testing', 'End']),
      tickets: z.array(ticketSchema),
    }),
  ),
});
export type Board = z.infer<typeof boardSchema>;
