import { test, expect, signInAsOwner } from './fixtures';

/**
 * Feature 004, US1: every signed-in screen shares the page title row, status
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

const rgb = (hex: string) =>
  `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;

test('every screen starts with the shared page title row', async ({ page }) => {
  await signInAsOwner(page);
  for (const path of screens) {
    await page.goto(path);
    const header = page.locator('main > header').first();
    await expect(header, path).toBeVisible();
    // the title row is the first thing in the main area and holds the only h1
    expect(
      await page.evaluate(
        () => document.querySelector('main')?.firstElementChild?.tagName,
      ),
      path,
    ).toBe('HEADER');
    await expect(page.locator('main h1'), path).toHaveCount(1);
    await expect(header.locator('h1'), path).toHaveCount(1);
    // solid and in the page flow: only the top navigation bar stays put
    expect(
      await header.evaluate((el) => getComputedStyle(el).position),
      path,
    ).not.toBe('sticky');
    expect(
      await header.evaluate((el) => getComputedStyle(el).backdropFilter),
      path,
    ).toBe('none');
    expect(
      await header
        .locator('h1')
        .evaluate((el) => getComputedStyle(el).fontFamily),
      path,
    ).toMatch(/^"?Inter Variable"?/);
  }
});

test('titled cards have a header bar with the title on the left', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto('/settings');
  const account = page.locator('[data-card]').filter({
    has: page.getByRole('heading', { name: 'Preferences and account' }),
  });
  await expect(account.locator('[data-card-header]')).toHaveCount(1);
  for (const path of screens) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    for (const bar of await page.locator('[data-card-header]').all()) {
      // a heading comes first, any tools follow it
      expect(
        await bar.evaluate((el) =>
          /^H[2-4]$/.test(el.firstElementChild?.tagName ?? ''),
        ),
        path,
      ).toBe(true);
      expect(
        await bar.evaluate((el) => getComputedStyle(el).borderBottomWidth),
        path,
      ).toBe('1px');
    }
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

test('the current place is marked in the accent', async ({ page }) => {
  await signInAsOwner(page);
  await page.goto('/projects');
  const nav = page.getByRole('navigation', { name: 'Main' });
  const current = nav.locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toContainText('Projects');
  // the dark sidebar has its own accent; the phone tab bar uses the main one
  const inSidebar = await current.evaluate((el) =>
    Boolean(el.closest('aside')),
  );
  const token = inSidebar ? '--c-sidebar-accent' : '--c-accent';
  const value = await page.evaluate(
    (name) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    token,
  );
  expect(await current.evaluate((el) => getComputedStyle(el).color)).toBe(
    rgb(value),
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
