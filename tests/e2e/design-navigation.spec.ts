import type { Page, TestInfo } from '@playwright/test';
import { test, expect, signInAsOwner } from './fixtures';

/**
 * Feature 004, US4: a bottom tab bar on phones, the sidebar on wider screens,
 * and frosted bars that turn solid when the system asks for less transparency.
 * Each test runs in the installation whose screen size it needs, so the page
 * never changes size under it.
 */
const destinations = ['Home', 'Projects', 'Settings'];
const only = (project: string, testInfo: TestInfo) =>
  test.skip(
    testInfo.project.name !== project,
    `runs in the ${project} installation`,
  );
const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main' });

test('phones get a bottom tab bar with the main destinations', async ({
  page,
}, testInfo) => {
  only('mobile', testInfo);
  await signInAsOwner(page);
  await page.goto('/projects');
  const nav = mainNav(page);
  await expect(nav).toBeVisible();
  const links = nav.getByRole('link');
  await expect(links).toHaveText(destinations);
  for (const link of await links.all())
    await expect(link.locator('svg')).toHaveCount(1);
  await expect(nav.locator('[aria-current="page"]')).toHaveText('Projects');
  const box = await nav.boundingBox();
  expect(box && box.y + box.height).toBeCloseTo(640, -1);
  // the end of the page can be scrolled above the tab bar
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const last = page.locator('main > *').last();
  const lastBox = await last.boundingBox();
  expect(lastBox && box && lastBox.y + lastBox.height).toBeLessThanOrEqual(
    (box?.y ?? 0) + 1,
  );
});

test('the tab bar steps aside while typing in a text field', async ({
  page,
}, testInfo) => {
  only('mobile', testInfo);
  await signInAsOwner(page);
  await page.goto('/agents/new');
  await page.getByRole('button', { name: /^Developer/ }).click();
  await page.getByLabel('Agent file (Markdown)').focus();
  await expect(mainNav(page)).toBeHidden();
});

test('wider screens use the sidebar with the same destinations', async ({
  page,
}, testInfo) => {
  only('desktop', testInfo);
  await signInAsOwner(page);
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(1);
  const nav = page
    .getByRole('complementary', { name: 'Sidebar' })
    .getByRole('navigation', { name: 'Main' });
  await expect(nav).toHaveCount(1);
  for (const name of destinations)
    await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
});

test('frosted bars turn solid when the system asks for less transparency', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto('/projects');
  // the top navigation bar is frosted on every screen size
  const header = page.getByRole('banner');
  const blur = () =>
    header.evaluate((el) => getComputedStyle(el).backdropFilter);
  expect(await blur()).toContain('blur');
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  });
  // the emulation must really apply, or this test would prove nothing
  expect(
    await page.evaluate(
      () => matchMedia('(prefers-reduced-transparency: reduce)').matches,
    ),
  ).toBe(true);
  expect(await blur()).toBe('none');
});
