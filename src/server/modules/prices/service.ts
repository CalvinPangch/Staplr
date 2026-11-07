import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { ServiceError } from '../../lib/problem.js';
import type { ModelPrice, PriceInput } from '../../../shared/schemas/prices.js';
import { recordAudit } from '../audit/service.js';
import { loadCatalog, type Catalog } from './catalog.js';
import { formatDecimal, parseDecimal, totalPerMillion } from './decimal.js';

interface PriceRow {
  id: string;
  provider: 'claude' | 'codex';
  model: string;
  inputPricePerMTok: string | null;
  outputPricePerMTok: string | null;
  priceSource: string | null;
  pricesAsOf: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  source: 'default' | 'user';
}

const toPublic = (row: PriceRow): ModelPrice => ({
  ...row,
  label: 'List price used for estimates',
});

/**
 * Brings the price table in line with the catalog shipped with this release.
 * It is safe to run on every start:
 * - a catalog model with no current price gets a default row;
 * - a current default row that no longer matches the catalog is closed now and
 *   replaced by a new default row;
 * - a current row the user set is never touched;
 * - closed rows are history and are never changed.
 */
export function mergeCatalog(
  db: Database.Database,
  now: string,
  catalog: Catalog = loadCatalog(),
): void {
  const current = db.prepare(
    'SELECT * FROM model_price WHERE provider=? AND model=? AND effectiveUntil IS NULL',
  );
  const close = db.prepare(
    'UPDATE model_price SET effectiveUntil=? WHERE id=?',
  );
  const insert = db.prepare(
    `INSERT INTO model_price(id,provider,model,inputPricePerMTok,outputPricePerMTok,priceSource,pricesAsOf,effectiveFrom,effectiveUntil,source)
     VALUES(?,?,?,?,?,?,?,?,NULL,'default')`,
  );
  db.transaction(() => {
    for (const model of catalog.models) {
      const wanted = {
        input: model.inputPricePerMTok,
        output: model.outputPricePerMTok,
        source: model.priceSource ?? null,
        asOf: model.pricesAsOf ?? null,
      };
      const row = current.get(model.provider, model.id) as PriceRow | undefined;
      if (row?.source === 'user') continue;
      if (
        row &&
        row.inputPricePerMTok === wanted.input &&
        row.outputPricePerMTok === wanted.output &&
        row.priceSource === wanted.source &&
        row.pricesAsOf === wanted.asOf
      )
        continue;
      if (row) close.run(now, row.id);
      insert.run(
        randomUUID(),
        model.provider,
        model.id,
        wanted.input,
        wanted.output,
        wanted.source,
        wanted.asOf,
        now,
      );
    }
  })();
}

export function createPriceService({
  db,
  clock,
}: {
  db: Database.Database;
  clock: () => number;
}) {
  const now = () => new Date(clock()).toISOString();

  return {
    /** Every row, current and closed, ordered by model then oldest first. */
    list(): ModelPrice[] {
      return (
        db
          .prepare(
            'SELECT * FROM model_price ORDER BY provider, model, effectiveFrom, rowid',
          )
          .all() as PriceRow[]
      ).map(toPublic);
    },

    /** The new price applies from this moment; the old row is closed, not edited. */
    setPrice(input: PriceInput): ModelPrice {
      const known = loadCatalog().models.some(
        (m) => m.provider === input.provider && m.id === input.model,
      );
      if (!known)
        throw new ServiceError(
          422,
          'invalid_input',
          'That model is not in the catalog. Choose a model from the list.',
        );
      parseDecimal(input.inputPricePerMTok);
      parseDecimal(input.outputPricePerMTok);
      const at = now();
      const id = randomUUID();
      db.transaction(() => {
        db.prepare(
          'UPDATE model_price SET effectiveUntil=? WHERE provider=? AND model=? AND effectiveUntil IS NULL',
        ).run(at, input.provider, input.model);
        db.prepare(
          `INSERT INTO model_price(id,provider,model,inputPricePerMTok,outputPricePerMTok,priceSource,pricesAsOf,effectiveFrom,effectiveUntil,source)
           VALUES(?,?,?,?,?,NULL,NULL,?,NULL,'user')`,
        ).run(
          id,
          input.provider,
          input.model,
          input.inputPricePerMTok,
          input.outputPricePerMTok,
          at,
        );
        recordAudit(db, {
          action: 'price.changed',
          targetType: 'model_price',
          targetId: id,
          targetName: input.model,
          detail: {
            provider: input.provider,
            inputPricePerMTok: input.inputPricePerMTok,
            outputPricePerMTok: input.outputPricePerMTok,
          },
          at,
        });
      })();
      return toPublic(
        db.prepare('SELECT * FROM model_price WHERE id=?').get(id) as PriceRow,
      );
    },

    /**
     * The cost estimate rule (FR-038): the list price in effect at `at`
     * multiplied by the token counts, with exact decimal arithmetic rounded
     * half up to six places. It is "unknown" whenever a price or a count is
     * missing; an unknown input never becomes zero.
     */
    estimateCost(
      provider: 'claude' | 'codex',
      model: string,
      inputTokens: number | null,
      outputTokens: number | null,
      at: string | Date,
    ): { amountUsd: string; priceId: string } | 'unknown' {
      if (inputTokens === null || outputTokens === null) return 'unknown';
      const when = new Date(at).toISOString();
      const row = db
        .prepare(
          `SELECT * FROM model_price WHERE provider=? AND model=? AND effectiveFrom<=?
             AND (effectiveUntil IS NULL OR ?<effectiveUntil)
           ORDER BY effectiveFrom DESC, rowid DESC LIMIT 1`,
        )
        .get(provider, model, when, when) as PriceRow | undefined;
      if (
        !row ||
        row.inputPricePerMTok === null ||
        row.outputPricePerMTok === null
      )
        return 'unknown';
      const total = totalPerMillion([
        { price: parseDecimal(row.inputPricePerMTok), tokens: inputTokens },
        { price: parseDecimal(row.outputPricePerMTok), tokens: outputTokens },
      ]);
      return { amountUsd: formatDecimal(total), priceId: row.id };
    },
  };
}

export type PriceService = ReturnType<typeof createPriceService>;

declare module 'fastify' {
  interface FastifyInstance {
    prices: PriceService;
  }
}
