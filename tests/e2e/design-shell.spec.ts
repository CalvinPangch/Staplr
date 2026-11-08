import type { Page } from '@playwright/test';
import { test, expect, axeCheck, signInAsOwner } from './fixtures';

/**
 * Feature 004, AdminLTE shell (US1, US4): the sticky frosted top navigation
 * bar, the dark sidebar that collapses to icons and remembers it, breadcrumbs
 * above every page title, and the slide-in sidebar on narrower screens.
 */
const places = ['Home', 'Projects', 'Settings'];
const routes = [
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

const topBar = (page: Page) => page.getByRole('banner');
const toggle = (page: Page) =>
  topBar(page).getByRole('button', { name: 'Menu' });
const sidebar = (page: Page) =>
  page.getByRole('complementary', { name: 'Sidebar' });
const breadcrumb = (page: Page) =>
  page.getByRole('navigation', { name: 'Breadcrumb' });

test.describe('wide screens', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop', 'needs a 1280 px screen');
  });

  test('every screen has the top bar, the dark sidebar and breadcrumbs', async ({
    page,
  }) => {
    await signInAsOwner(page);
    for (const path of routes) {
      await page.goto(path);
      const bar = topBar(page);
      await expect(bar, path).toBeVisible();
      expect(
        await bar.evaluate((el) => getComputedStyle(el).position),
        path,
      ).toBe('sticky');
      expect(
        await bar.evaluate((el) => getComputedStyle(el).backdropFilter),
        path,
      ).toContain('blur');
      const menu = toggle(page);
      await expect(menu, path).toHaveAttribute('aria-expanded', 'true');
      await expect(menu, path).toHaveAttribute('aria-controls', 'sidebar');
      await expect(bar.getByLabel('Theme'), path).toBeVisible();
      await expect(
        bar.getByRole('button', { name: 'Sign out' }),
        path,
      ).toBeVisible();

      const side = sidebar(page);
      await expect(side, path).toBeVisible();
      const nav = side.getByRole('navigation', { name: 'Main' });
      for (const name of places)
        await expect(
          nav.getByRole('link', { name, exact: true }),
          `${path} ${name}`,
        ).toBeVisible();
      await expect(
        side.getByRole('heading', { name: 'Your projects' }),
      ).toBeVisible();
      await expect(nav.locator('[aria-current="page"]'), path).toHaveCount(1);

      // breadcrumbs come before the page title; the last step is this page
      const crumbs = breadcrumb(page);
      await expect(crumbs, path).toBeVisible();
      const items = crumbs.getByRole('listitem');
      const last = items.last();
      await expect(last.locator('[aria-current="page"]'), path).toHaveCount(1);
      await expect(last, path).toHaveText(
        (await page.locator('main h1').innerText()).trim(),
      );
      const count = await items.count();
      for (let i = 0; i < count - 1; i++)
        await expect(items.nth(i).getByRole('link'), path).toHaveCount(1);
      expect(
        await page.evaluate(() => {
          const nav = document.querySelector('nav[aria-label="Breadcrumb"]');
          const h1 = document.querySelector('main h1');
          return Boolean(
            nav &&
            h1 &&
            nav.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING,
          );
        }),
        path,
      ).toBe(true);
    }
  });

  test('the current item is marked in the sidebar accent', async ({ page }) => {
    await signInAsOwner(page);
    await page.goto('/agents');
    const current = sidebar(page)
      .getByRole('navigation', { name: 'Main' })
      .locator('[aria-current="page"]');
    // Agents lives under Settings
    await expect(current).toHaveText('Settings');
    const expected = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--c-sidebar-accent')
        .trim(),
    );
    const hex = expected.replace('#', '');
    expect(await current.evaluate((el) => getComputedStyle(el).color)).toBe(
      `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`,
    );
    await expect(topBar(page)).toContainText('Agents');
  });

  test('breadcrumbs show the way back from deep pages', async ({ page }) => {
    await signInAsOwner(page);
    await page.goto('/agents');
    await expect(breadcrumb(page).getByRole('listitem')).toHaveText([
      'Home',
      'Settings',
      'Agents',
    ]);
    await breadcrumb(page).getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await page.goto('/agents/new');
    await expect(breadcrumb(page).getByRole('listitem')).toHaveText([
      'Home',
      'Settings',
      'Agents',
      'New agent',
    ]);
  });

  test('the sidebar collapses to icons and stays that way', async ({
    page,
  }) => {
    await signInAsOwner(page);
    await page.goto('/projects');
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    const box = await sidebar(page).boundingBox();
    expect(box?.width).toBeLessThanOrEqual(80);
    const nav = sidebar(page).getByRole('navigation', { name: 'Main' });
    for (const name of places) {
      const link = nav.getByRole('link', { name, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('title', name);
    }
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);

    await page.reload();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    expect(
      await page.evaluate(() => localStorage.getItem('staplr-sidebar')),
    ).toBe('collapsed');
    expect((await sidebar(page).boundingBox())?.width).toBeLessThanOrEqual(80);

    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    expect((await sidebar(page).boundingBox())?.width).toBeGreaterThan(200);
    await axeCheck(page);
  });

  test('a tablet-width screen opens the sidebar as a panel', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await signInAsOwner(page);
    await page.goto('/projects');
    await expect(sidebar(page)).toBeHidden();
    await checkPanel(page);
  });
});

test.describe('phones', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'mobile', 'needs a 320 px screen');
  });

  test('the menu opens the sidebar as an accessible panel', async ({
    page,
  }) => {
    await signInAsOwner(page);
    await page.goto('/projects');
    await expect(sidebar(page)).toBeHidden();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await checkPanel(page);
  });

  test('the panel does not animate when the system asks for less motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signInAsOwner(page);
    await page.goto('/projects');
    await toggle(page).click();
    const panel = page.getByRole('dialog', { name: 'Navigation' });
    await expect(panel).toBeVisible();
    const seconds = await panel.evaluate((el) =>
      parseFloat(getComputedStyle(el).transitionDuration),
    );
    expect(seconds).toBeLessThan(0.001);
  });
});

/** The slide-in panel's focus and closing rules (FR-015b). */
async function checkPanel(page: Page) {
  const menu = toggle(page);
  await expect(menu).toHaveAttribute('aria-controls', 'sidebar-panel');
  await menu.click();
  const panel = page.getByRole('dialog', { name: 'Navigation' });
  await expect(panel).toBeVisible();
  // the rest of the page is hidden from assistive technology while the
  // panel is open, so find the button by what it controls
  await expect(
    page.locator('header button[aria-controls="sidebar-panel"]'),
  ).toHaveAttribute('aria-expanded', 'true');
  for (const name of places)
    await expect(panel.getByRole('link', { name, exact: true })).toBeVisible();
  await expect(
    panel.getByRole('heading', { name: 'Your projects' }),
  ).toBeVisible();
  await axeCheck(page);

  // focus stays inside while it is open
  const inside = () =>
    page.evaluate(() =>
      Boolean(document.activeElement?.closest('[role="dialog"]')),
    );
  expect(await inside()).toBe(true);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await inside()).toBe(true);
  }

  // Escape closes it and gives focus back to the menu button
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(menu).toBeFocused();

  // a tap outside closes it
  await menu.click();
  await expect(panel).toBeVisible();
  const size = page.viewportSize();
  await page.mouse.click((size?.width ?? 320) - 8, (size?.height ?? 640) / 2);
  await expect(panel).toBeHidden();

  // choosing a link goes there and closes it
  await menu.click();
  await panel.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(panel).toBeHidden();
}
