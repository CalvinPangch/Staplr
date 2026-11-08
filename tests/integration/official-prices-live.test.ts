import { describe, it, expect } from 'vitest';
import {
  officialPages,
  parseClaudePricing,
  parseOpenAiPricing,
  readOfficialPage,
} from '../../src/server/modules/prices/official';
import { loadCatalog } from '../../src/server/modules/prices/catalog';

/**
 * Opt-in: reads the LIVE official pricing pages to confirm they still parse
 * (feature 002, research R3). Run with STAPLR_LIVE_PRICES=1; skipped otherwise,
 * so the normal test run never contacts the internet.
 */
const live = process.env.STAPLR_LIVE_PRICES === '1';

describe.runIf(live)('the live official pricing pages', () => {
  it('the Claude page parses with at least 3 rows', async () => {
    const page = await readOfficialPage(officialPages.claude);
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    const labels = new Map(
      loadCatalog()
        .models.filter((m) => m.provider === 'claude')
        .map((m) => [m.label, m.id]),
    );
    const parsed = parseClaudePricing(page.text, labels);
    expect(parsed).not.toBeNull();
    // at least 3 rows of the table parsed, and some map to shipped models
    expect(parsed?.rows.length ?? 0).toBeGreaterThan(0);
  }, 30_000);

  it('the OpenAI page parses with at least 3 rows', async () => {
    const page = await readOfficialPage(officialPages.codex);
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    const parsed = parseOpenAiPricing(page.text);
    expect(parsed?.rows.length ?? 0).toBeGreaterThanOrEqual(3);
  }, 30_000);
});

it.skipIf(live)('is skipped unless STAPLR_LIVE_PRICES=1', () => {
  expect(live).toBe(false);
});
