import { z } from 'zod';
import { sandboxStatuses } from '../status.js';

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name of 1 to 80 characters.')
  .max(80, 'Enter a name of 1 to 80 characters.');

/** Start a Codex login: a name for a new connection, or the one to re-login. */
export const sandboxStartSchema = z
  .object({
    provider: z.literal('codex'),
    name: nameSchema.optional(),
    reloginOf: z.string().min(1).max(100).optional(),
  })
  .strict()
  .refine(
    (value) => (value.name !== undefined) !== (value.reloginOf !== undefined),
    {
      message:
        'Give either a name for a new connection or the connection to re-login, not both.',
    },
  );
export type SandboxStart = z.infer<typeof sandboxStartSchema>;

export const sandboxSessionSchema = z.object({
  id: z.string(),
  provider: z.literal('codex'),
  status: z.enum(sandboxStatuses),
  failureReason: z.string().nullable(),
  terminalUrl: z.string(),
  instructions: z.string(),
  resultConnectionId: z.string().nullable(),
  expiresAt: z.string(),
});
export type SandboxSession = z.infer<typeof sandboxSessionSchema>;

/** Messages the browser sends over the terminal WebSocket. */
export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('input'), data: z.string().max(4096) }).strict(),
  z
    .object({
      type: z.literal('resize'),
      cols: z.number().int().min(20).max(500),
      rows: z.number().int().min(5).max(200),
    })
    .strict(),
  z.object({ type: z.literal('ping') }).strict(),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

/** Messages the server sends over the terminal WebSocket. */
export type ServerMessage =
  | { type: 'output'; data: string }
  | {
      type: 'status';
      status: (typeof sandboxStatuses)[number];
      failureReason?: string | null;
      resultConnectionId?: string | null;
    }
  | { type: 'expiresAt'; at: string }
  | { type: 'error'; code: string; message: string };
