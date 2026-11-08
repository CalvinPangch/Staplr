import { z } from 'zod';

/** Same limits the server enforces on first-run setup and sign-in. */
export const credentialsSchema = z
  .object({
    username: z
      .string()
      .min(3, 'Use 3 to 64 characters for the username.')
      .max(64, 'Use 3 to 64 characters for the username.'),
    password: z
      .string()
      .min(12, 'Use at least 12 characters for the password.')
      .max(256, 'Use at most 256 characters for the password.'),
  })
  .strict();
export type Credentials = z.infer<typeof credentialsSchema>;
