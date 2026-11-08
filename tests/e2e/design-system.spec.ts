import type { Page } from '@playwright/test';
import { test, expect, signInAsOwner } from './fixtures';

/**
 * Feature 004, US1: every signed-in screen shares the page header, status
 * labels, buttons and fonts; the green accent marks only what can be acted on.
 */
const screens = [
  '/',
  '/projects',
  '/agents',
  '/agents/new',
  '/settings',
  '/settings/providers',
  '/settings/source-control',
  '/audit',
  '/diagnostics',
];

const accent = (page: Page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--c-accent')
      .trim(),
  );
const rgb = (hex: string) =>
  `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;

test('every screen starts with the shared page header', async ({ page }) => {
  await signInAsOwner(page);
  for (const path of screens) {
    await page.goto(path);
    const header = page.locator('main > header').first();
    await expect(header, path).toBeVisible();
    // the header is the first thing in the main area and holds the only h1
    expect(
      await page.evaluate(
        () => document.querySelector('main')?.firstElementChild?.tagName,
      ),
      path,
    ).toBe('HEADER');
    await expect(page.locator('main h1'), path).toHaveCount(1);
    await expect(header.locator('h1'), path).toHaveCount(1);
    expect(
      await header.evaluate((el) => getComputedStyle(el).position),
      path,
    ).toBe('sticky');
    expect(
      await header
        .locator('h1')
        .evaluate((el) => getComputedStyle(el).fontFamily),
      path,
    ).toMatch(/^"?Inter Variable"?/);
  }
});

test('status labels always show an icon and words', async ({ page }) => {
  await signInAsOwner(page);
  for (const path of screens) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    for (const badge of await page.locator('[data-status-badge]').all()) {
      await expect(badge.locator('svg'), path).toHaveCount(1);
      expect((await badge.innerText()).trim().length, path).toBeGreaterThan(0);
    }
  }
});

test('each card has at most one primary button', async ({ page }) => {
  await signInAsOwner(page);
  for (const path of screens) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    for (const card of await page.locator('[data-card]').all())
      expect(
        await card.locator('[data-variant="primary"]').count(),
        path,
      ).toBeLessThanOrEqual(1);
  }
});

test('the current place is marked in the green accent', async ({ page }) => {
  await signInAsOwner(page);
  await page.goto('/projects');
  const nav = page.getByRole('navigation', { name: 'Main' });
  const current = nav.locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toContainText('Projects');
  expect(await current.evaluate((el) => getComputedStyle(el).color)).toBe(
    rgb(await accent(page)),
  );
});

test('fonts, icons and images all come from Staplr itself (SC-007)', async ({
  page,
}) => {
  const outside: string[] = [];
  const fonts: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      outside.push(url.href);
    if (url.pathname.endsWith('.woff2')) fonts.push(url.href);
  });
  await signInAsOwner(page);
  for (const path of screens) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  expect(outside).toEqual([]);
  // Inter was loaded, from Staplr
  expect(fonts.some((f) => /inter/i.test(f))).toBe(true);
});
