import { z } from 'zod';
import { providers } from '../status.js';

const price = z
  .string()
  .regex(
    /^\d+(\.\d{1,6})?$/,
    'Enter a price of 0 or more with up to 6 decimal places, for example 2.5.',
  );

/** A new price for one model; it takes effect from the moment it is saved. */
export const priceInputSchema = z
  .object({
    provider: z.enum(providers),
    model: z.string().min(1).max(200),
    inputPricePerMTok: price,
    outputPricePerMTok: price,
  })
  .strict();
export type PriceInput = z.infer<typeof priceInputSchema>;

export const modelPriceSchema = z.object({
  id: z.string(),
  provider: z.enum(providers),
  model: z.string(),
  inputPricePerMTok: z.string().nullable(),
  outputPricePerMTok: z.string().nullable(),
  effectiveFrom: z.string(),
  effectiveUntil: z.string().nullable(),
  source: z.enum(['default', 'user']),
  priceSource: z.string().nullable(),
  pricesAsOf: z.string().nullable(),
  label: z.literal('List price used for estimates'),
});
export type ModelPrice = z.infer<typeof modelPriceSchema>;
