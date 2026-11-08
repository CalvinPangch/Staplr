import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  catalogRevision,
  catalogSchema,
  listModels,
  probeModel,
  loadCatalog,
} from '../../src/server/modules/prices/catalog';

const raw = JSON.parse(readFileSync('catalog/models.json', 'utf8')) as unknown;

describe('shipped model catalog', () => {
  it('has a non-empty revision and validates against its schema', () => {
    const catalog = catalogSchema.parse(raw);
    expect(catalog.revision.length).toBeGreaterThan(0);
    expect(catalog.models.length).toBeGreaterThan(0);
    expect(catalogRevision()).toBe(catalog.revision);
  });

  it('uses only known providers and unique model ids per provider', () => {
    const { models } = catalogSchema.parse(raw);
    const seen = new Set<string>();
    for (const m of models) {
      expect(['claude', 'codex']).toContain(m.provider);
      expect(m.id.length).toBeGreaterThan(0);
      expect(m.label.length).toBeGreaterThan(0);
      expect(typeof m.retired).toBe('boolean');
      const key = `${m.provider}:${m.id}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it('carries no prices; prices come only from the official pages', () => {
    for (const m of (raw as { models: Record<string, unknown>[] }).models)
      for (const field of [
        'inputPricePerMTok',
        'outputPricePerMTok',
        'priceSource',
        'pricesAsOf',
      ])
        expect(m, `${String(m.id)} ${field}`).not.toHaveProperty(field);
  });

  it('has exactly one non-retired probeModel per provider', () => {
    const { models } = catalogSchema.parse(raw);
    for (const provider of ['claude', 'codex'] as const) {
      const probes = models.filter(
        (m) => m.provider === provider && m.probeModel && !m.retired,
      );
      expect(probes, provider).toHaveLength(1);
      expect(probeModel(provider)).toBe(probes[0]?.id);
    }
  });

  it('excludes retired models from selectable lists', () => {
    const catalog = catalogSchema.parse({
      revision: 'test',
      models: [
        ...catalogSchema.parse(raw).models,
        {
          provider: 'claude',
          id: 'retired-test-model',
          label: 'Retired',
          retired: true,
          probeModel: false,
        },
      ],
    });
    expect(
      listModels('claude', catalog).some((m) => m.id === 'retired-test-model'),
    ).toBe(false);
    expect(listModels('claude', catalog).length).toBeGreaterThan(0);
  });

  it('rejects a catalog entry that has a price', () => {
    expect(() =>
      catalogSchema.parse({
        revision: 'bad',
        models: [
          {
            provider: 'claude',
            id: 'm',
            label: 'M',
            retired: false,
            probeModel: true,
            inputPricePerMTok: '1',
            outputPricePerMTok: '2',
          },
        ],
      }),
    ).toThrow();
    expect(loadCatalog().revision).toBe(catalogRevision());
  });
});
