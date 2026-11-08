import { readFileSync } from 'node:fs';
import { z } from 'zod';

export const providerSchema = z.enum(['claude', 'codex']);
export type Provider = z.infer<typeof providerSchema>;

/**
 * One shipped model. Since feature 002 the catalog carries no prices: prices
 * come only from the providers' official pages, so an entry with a price is refused.
 */
const modelSchema = z
  .object({
    provider: providerSchema,
    id: z.string().min(1).max(200),
    label: z.string().min(1).max(120),
    retired: z.boolean(),
    probeModel: z.boolean(),
  })
  .strict();
export type CatalogModel = z.infer<typeof modelSchema>;

export const catalogSchema = z
  .object({
    revision: z.string().min(1).max(80),
    models: z.array(modelSchema).min(1),
  })
  .superRefine((catalog, ctx) => {
    const seen = new Set<string>();
    catalog.models.forEach((m, index) => {
      const key = `${m.provider}:${m.id}`;
      if (seen.has(key))
        ctx.addIssue({
          code: 'custom',
          path: ['models', index, 'id'],
          message: `Duplicate model ${key}`,
        });
      seen.add(key);
    });
  });
export type Catalog = z.infer<typeof catalogSchema>;

function validateProbeModels(catalog: Catalog) {
  for (const provider of providerSchema.options) {
    const probes = catalog.models.filter(
      (m) => m.provider === provider && m.probeModel && !m.retired,
    );
    if (probes.length !== 1)
      throw new Error(
        `Catalog must name exactly one non-retired probe model for ${provider}`,
      );
  }
}

let cached: Catalog | undefined;

/** Reads and validates the catalog shipped with this release (research R9, R20). */
export function loadCatalog(): Catalog {
  if (!cached) {
    const url = new URL('../../../../catalog/models.json', import.meta.url);
    const parsed = catalogSchema.parse(JSON.parse(readFileSync(url, 'utf8')));
    validateProbeModels(parsed);
    cached = parsed;
  }
  return cached;
}

export function catalogRevision(): string {
  return loadCatalog().revision;
}

/** Selectable catalog entries; a catalog entry alone is not an entitlement (R19). */
export function listModels(
  provider: Provider,
  catalog: Catalog = loadCatalog(),
): CatalogModel[] {
  return catalog.models.filter((m) => m.provider === provider && !m.retired);
}

export function probeModel(provider: Provider): string {
  const probe = loadCatalog().models.find(
    (m) => m.provider === provider && m.probeModel && !m.retired,
  );
  if (!probe) throw new Error(`No probe model for ${provider}`);
  return probe.id;
}
