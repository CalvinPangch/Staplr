import type { Page } from '@playwright/test';
import { test, expect, axeCheck, signInAsOwner } from './fixtures';

// Grows with every screen: add a case here before implementing the screen.
// Final complete sweep runs in Polish (T145).
const themes = ['light', 'dark'] as const;

async function useTheme(page: Page, theme: (typeof themes)[number]) {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem('staplr-theme', value);
    } catch {
      /* storage may be unavailable */
    }
  }, theme);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const theme of themes) {
  test.describe(`${theme} theme`, () => {
    test('sign-in screen: axe, keyboard order, focus ring, no horizontal scroll', async ({
      page,
    }) => {
      await useTheme(page, theme);
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto('/sign-in');
      await expect(
        page.getByRole('heading', { name: 'Sign in' }),
      ).toBeVisible();
      await axeCheck(page);
      await expectNoHorizontalScroll(page);

      // Keyboard only: skip link, the header's theme control, then the form.
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('link', { name: 'Skip to main content' }),
      ).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('Theme')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('Username')).toBeFocused();
      const outline = await page.getByLabel('Username').evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          style: style.outlineStyle,
          width: parseFloat(style.outlineWidth),
        };
      });
      expect(outline.style).not.toBe('none');
      expect(outline.width).toBeGreaterThanOrEqual(2);
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeFocused();
    });

    test('home and audit screens: axe and no horizontal scroll at 320 px', async ({
      page,
    }) => {
      await useTheme(page, theme);
      await page.setViewportSize({ width: 320, height: 640 });
      await signInAsOwner(page);
      for (const path of ['/', '/audit']) {
        await page.goto(path);
        await expect(page.locator('main')).toBeVisible();
        await axeCheck(page);
        await expectNoHorizontalScroll(page);
      }
    });
  });
}

test('the theme can be changed and is remembered', async ({ page }) => {
  await signInAsOwner(page);
  await page.getByLabel('Theme').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByLabel('Theme').selectOption('system');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
});
