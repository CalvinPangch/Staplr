import { writeFileSync, mkdirSync } from 'node:fs';
import { cpus, totalmem, tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { test, expect, signInAsOwner } from './fixtures';

/**
 * SC-009 in a real browser (research R22): a PRODUCTION build, Chromium, 200
 * persisted tickets and 50 samples.
 *
 *  - board open: navigation start until all 200 cards are rendered and the
 *    controls are usable, p95 under 1 s;
 *  - move saved: the drop (mouse) or the confirming key press (keyboard) until
 *    the response that acknowledges the committed move arrives, p95 under 500 ms,
 *    reported separately for each input method;
 *  - a reload, outside any timed interval, shows the same order.
 *
 * The optimistic update is not evidence of persistence, so the move is timed to
 * the server response. The environment is written to test-results/board-perf.json.
 */
const samples = 50;
const ticketCount = 200;
const dataDir = join(tmpdir(), 'staplr-e2e-4312');
const statuses = ['new', 'review', 'testing', 'end'] as const;

const p95 = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    sorted[Math.ceil(sorted.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY
  );
};

test.describe.configure({ mode: 'serial' });

let projectId = '';

test.beforeAll(() => {
  projectId = 'perf-project';
});

test('seeds 200 persisted tickets', async ({ page }) => {
  await signInAsOwner(page);
  const db = new Database(join(dataDir, 'staplr.db'));
  try {
    const at = new Date().toISOString();
    db.prepare(
      `INSERT INTO project(id,name,repoFullName,repoRemoteId,baseBranch,downloadStatus,lastUpdatedAt,createdAt,updatedAt)
       VALUES(?,?,?,?, 'main','downloaded',?,?,?)`,
    ).run(projectId, 'Perf', 'org/perf', '1', at, at, at);
    const insert = db.prepare(
      `INSERT INTO ticket(id,projectId,title,description,status,position,createdAt,updatedAt,statusChangedAt)
       VALUES(?,?,?,?,?,?,?,?,?)`,
    );
    db.transaction(() => {
      for (let i = 0; i < ticketCount; i++)
        insert.run(
          `t${i}`,
          projectId,
          `Ticket ${String(i).padStart(3, '0')}`,
          'Some description text for the card. '.repeat(3),
          statuses[i % 4],
          Math.floor(i / 4),
          at,
          at,
          at,
        );
    })();
  } finally {
    db.close();
  }
});

test('opens a 200-ticket board in under 1 s (p95 of 50)', async ({ page }) => {
  await signInAsOwner(page);
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    await page.goto('about:blank');
    const started = performance.now();
    await page.goto(`/projects/${projectId}`);
    await page.waitForFunction(
      (count) =>
        document.querySelectorAll('[data-testid="ticket-card"]').length ===
          count &&
        !document.querySelector<HTMLButtonElement>('[data-testid="new-ticket"]')
          ?.disabled,
      ticketCount,
    );
    times.push(performance.now() - started);
  }
  record('boardOpenMs', times);
  expect(p95(times)).toBeLessThan(1000);
});

test('saves a mouse drop in under 500 ms (p95 of 50)', async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(`/projects/${projectId}`);
  await page.waitForSelector('[data-testid="ticket-card"]');
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const card = page
      .locator('[data-testid="column-new"] [data-testid="ticket-card"]')
      .first();
    const target = page
      .locator('[data-testid="column-review"] [data-testid="ticket-card"]')
      .first();
    const from = await card.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error('Cards are not visible');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 12, from.y + 12, {
      steps: 4,
    });
    await page.mouse.move(to.x + to.width / 2, to.y + 8, { steps: 12 });
    const saved = page.waitForResponse(
      (response) =>
        /\/api\/tickets\/[^/]+\/move$/.test(response.url()) &&
        response.request().method() === 'POST',
    );
    const started = performance.now();
    await page.mouse.up();
    const response = await saved;
    times.push(performance.now() - started);
    expect(response.status()).toBe(200);
  }
  record('mouseMoveMs', times);
  expect(p95(times)).toBeLessThan(500);
});

test('saves a keyboard move in under 500 ms (p95 of 50)', async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(`/projects/${projectId}`);
  await page.waitForSelector('[data-testid="ticket-card"]');
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const card = page
      .locator('[data-testid="column-testing"] [data-testid="ticket-card"]')
      .first();
    await card.getByTestId('drag-handle').focus();
    const id = await card.getAttribute('data-ticket-id');
    await page.keyboard.press('Space');
    // wait until the pick-up is active, then until the card has moved over to End
    await page.waitForSelector(
      `[data-ticket-id="${id}"] [data-testid="drag-handle"][aria-pressed="true"]`,
    );
    await page.keyboard.press('ArrowRight');
    await page.waitForSelector(
      `[data-testid="column-end"] [data-ticket-id="${id}"]`,
    );
    const saved = page.waitForResponse(
      (response) =>
        /\/api\/tickets\/[^/]+\/move$/.test(response.url()) &&
        response.request().method() === 'POST',
    );
    const started = performance.now();
    await page.keyboard.press('Space');
    const response = await saved;
    times.push(performance.now() - started);
    expect(response.status()).toBe(200);
  }
  record('keyboardMoveMs', times);
  expect(p95(times)).toBeLessThan(500);
});

test('a reload shows the same order the server stored', async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(`/projects/${projectId}`);
  await page.waitForSelector('[data-testid="ticket-card"]');
  const shown = async () =>
    page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll('[data-testid^="column-"]')].map(
          (column) => [
            column.getAttribute('data-testid'),
            [...column.querySelectorAll('[data-testid="ticket-card"]')].map(
              (card) => card.getAttribute('data-ticket-id'),
            ),
          ],
        ),
      ),
    );
  const before = await shown();
  expect(Object.values(before).flat()).toHaveLength(ticketCount);
  await page.reload();
  await page.waitForFunction(
    (count) =>
      document.querySelectorAll('[data-testid="ticket-card"]').length === count,
    ticketCount,
  );
  expect(await shown()).toEqual(before);

  const db = new Database(join(dataDir, 'staplr.db'), { readonly: true });
  try {
    const rows = db
      .prepare(
        'SELECT status, position FROM ticket WHERE projectId=? ORDER BY status, position',
      )
      .all(projectId) as { status: string; position: number }[];
    for (const status of statuses) {
      const positions = rows
        .filter((r) => r.status === status)
        .map((r) => r.position);
      expect(positions).toEqual(positions.map((_, index) => index));
    }
  } finally {
    db.close();
  }
});

const results: Record<string, unknown> = {};
function record(name: string, times: number[]) {
  results[name] = {
    samples: times.length,
    p95Ms: Math.round(p95(times)),
    medianMs: Math.round(
      [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] ?? 0,
    ),
    maxMs: Math.round(Math.max(...times)),
  };
}
test.afterAll(async ({ browserName }, testInfo) => {
  void browserName;
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    join('test-results', 'board-perf.json'),
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        build:
          'production (npm run build, dist/server + dist/web, NODE_ENV=production)',
        browser: testInfo.project.use.channel ?? 'Chromium (Playwright)',
        node: process.version,
        platform: process.platform,
        cpuCores: cpus().length,
        cpuModel: cpus()[0]?.model,
        ramGiB: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
        tickets: ticketCount,
        ...results,
      },
      null,
      2,
    ),
  );
});
