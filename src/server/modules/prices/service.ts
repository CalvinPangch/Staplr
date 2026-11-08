import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  ModelPrice,
  PriceStatus,
} from '../../../shared/schemas/prices.js';
import { recordAudit } from '../audit/service.js';
import { loadCatalog, type Provider } from './catalog.js';
import { formatDecimal, parseDecimal, totalPerMillion } from './decimal.js';
import {
  officialPages,
  parseClaudePricing,
  parseOpenAiPricing,
  readOfficialPage,
  type OfficialPrice,
} from './official.js';

interface PriceRow {
  id: string;
  provider: Provider;
  model: string;
  inputPricePerMTok: string | null;
  outputPricePerMTok: string | null;
  priceSource: string | null;
  pricesAsOf: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  source: 'default' | 'user' | 'official';
}

interface RefreshRow {
  provider: Provider;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
}

const label = 'List price used for estimates' as const;
const codexNote = 'API list price; your plan may not charge per token';
const providers: Provider[] = ['claude', 'codex'];
/** Prices are read at start-up and then once a day (FR-018). */
const readEveryMs = 24 * 3_600_000;
const messages = {
  unreachable:
    'Could not reach the official pricing page. The last prices found are kept.',
  unreadable:
    'Could not read the official pricing page; its layout may have changed. The last prices found are kept.',
};

const toPublic = (row: PriceRow): ModelPrice => ({ ...row, label });

/** The price shown beside a model: its current list price, or nulls for "Unknown". */
export interface ModelPriceView {
  inputPricePerMTok: string | null;
  outputPricePerMTok: string | null;
  priceSource: string | null;
  pricesAsOf: string | null;
  label: typeof label;
  note: string | null;
}

const samePrice = (a: string | null, b: string) =>
  a !== null && parseDecimal(a) === parseDecimal(b);

export function createPriceService({
  db,
  clock,
  pricingUrls = officialPages,
}: {
  db: Database.Database;
  clock: () => number;
  /** where the pages are read from; tests point these at a fake */
  pricingUrls?: { claude: string; codex: string };
}) {
  const now = () => new Date(clock()).toISOString();
  let running: Promise<void> | null = null;

  const currentRow = db.prepare(
    'SELECT * FROM model_price WHERE provider=? AND model=? AND effectiveUntil IS NULL',
  );
  const refreshRow = (provider: Provider) =>
    db.prepare('SELECT * FROM price_refresh WHERE provider=?').get(provider) as
      RefreshRow | undefined;

  function note(
    provider: Provider,
    fields: Omit<RefreshRow, 'provider'>,
  ): void {
    db.prepare(
      `INSERT INTO price_refresh(provider,lastAttemptAt,lastSuccessAt,lastError) VALUES(?,?,?,?)
       ON CONFLICT(provider) DO UPDATE SET lastAttemptAt=excluded.lastAttemptAt,
         lastSuccessAt=excluded.lastSuccessAt, lastError=excluded.lastError`,
    ).run(
      provider,
      fields.lastAttemptAt,
      fields.lastSuccessAt,
      fields.lastError,
    );
  }

  /**
   * Applies one successful read. A changed or new price closes the current row
   * at this moment and opens an official one; an unchanged price adds nothing.
   * The first successful read for a provider closes the prices shipped with
   * earlier releases, so a model the page does not list becomes "Unknown".
   */
  function applyOfficialPrices(
    provider: Provider,
    rows: OfficialPrice[],
    at: string,
  ): number {
    let changes = 0;
    db.transaction(() => {
      if (!refreshRow(provider)?.lastSuccessAt)
        db.prepare(
          "UPDATE model_price SET effectiveUntil=? WHERE provider=? AND source='default' AND effectiveUntil IS NULL",
        ).run(at, provider);
      const close = db.prepare(
        'UPDATE model_price SET effectiveUntil=? WHERE id=?',
      );
      const insert = db.prepare(
        `INSERT INTO model_price(id,provider,model,inputPricePerMTok,outputPricePerMTok,priceSource,pricesAsOf,effectiveFrom,effectiveUntil,source)
         VALUES(?,?,?,?,?,?,?,?,NULL,'official')`,
      );
      for (const row of rows) {
        const current = currentRow.get(provider, row.model) as
          PriceRow | undefined;
        if (
          current?.source === 'official' &&
          samePrice(current.inputPricePerMTok, row.inputPricePerMTok) &&
          samePrice(current.outputPricePerMTok, row.outputPricePerMTok)
        )
          continue;
        if (current) close.run(at, current.id);
        insert.run(
          randomUUID(),
          provider,
          row.model,
          row.inputPricePerMTok,
          row.outputPricePerMTok,
          officialPages[provider],
          at.slice(0, 10),
          at,
        );
        changes++;
      }
    })();
    return changes;
  }

  async function readProvider(provider: Provider): Promise<void> {
    const before = refreshRow(provider);
    const page = await readOfficialPage(pricingUrls[provider]);
    const at = now();
    const failed = (error: string) =>
      note(provider, {
        lastAttemptAt: at,
        lastSuccessAt: before?.lastSuccessAt ?? null,
        lastError: error,
      });
    if (!page.ok) return failed(messages.unreachable);
    const parsed =
      provider === 'claude'
        ? parseClaudePricing(
            page.text,
            new Map(
              loadCatalog()
                .models.filter((m) => m.provider === 'claude')
                .map((m) => [m.label, m.id]),
            ),
          )
        : parseOpenAiPricing(page.text);
    if (!parsed) return failed(messages.unreadable);
    const changes = applyOfficialPrices(provider, parsed.rows, at);
    db.transaction(() => {
      note(provider, { lastAttemptAt: at, lastSuccessAt: at, lastError: null });
      recordAudit(db, {
        action: 'prices.refreshed',
        targetType: 'model_price',
        targetId: provider,
        targetName: provider === 'claude' ? 'Claude prices' : 'Codex prices',
        detail: { provider, changes, skipped: parsed.skipped.length },
        at,
      });
    })();
  }

  /** Reads the pages for these providers; a request while a read runs joins it. */
  function refresh(which: Provider[] = providers): Promise<void> {
    if (running) return running;
    const work = Promise.all(
      which.map((p) => readProvider(p).catch(() => undefined)),
    ).then(() => undefined);
    running = work.finally(() => {
      running = null;
    });
    return running;
  }

  function status(): PriceStatus {
    return {
      providers: providers.map((provider) => {
        const row = refreshRow(provider);
        return {
          provider,
          lastAttemptAt: row?.lastAttemptAt ?? null,
          lastSuccessAt: row?.lastSuccessAt ?? null,
          lastError: row?.lastError ?? null,
        };
      }),
    };
  }

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

    applyOfficialPrices,
    refresh,
    status,

    /** Start-up and hourly: reads a provider whose last good read is a day old (FR-018). */
    refreshIfDue(): Promise<void> {
      const due = providers.filter((provider) => {
        const success = refreshRow(provider)?.lastSuccessAt;
        return !success || clock() - Date.parse(success) >= readEveryMs;
      });
      return due.length > 0 ? refresh(due) : Promise.resolve();
    },

    /** Resolves when no read is running (tests and shutdown). */
    async whenIdle(): Promise<void> {
      while (running) await running;
    },

    /** The price shown beside a model, or nulls for "Unknown" (FR-019). */
    priceFor(provider: Provider, model: string): ModelPriceView {
      const row = currentRow.get(provider, model) as PriceRow | undefined;
      return {
        inputPricePerMTok: row?.inputPricePerMTok ?? null,
        outputPricePerMTok: row?.outputPricePerMTok ?? null,
        priceSource: row?.priceSource ?? null,
        pricesAsOf: row?.pricesAsOf ?? null,
        label,
        note: provider === 'codex' ? codexNote : null,
      };
    },

    /**
     * The cost estimate rule (FR-038): the list price in effect at `at`
     * multiplied by the token counts, with exact decimal arithmetic rounded
     * half up to six places. It is "unknown" whenever a price or a count is
     * missing; an unknown input never becomes zero.
     */
    estimateCost(
      provider: Provider,
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
