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
      for (const path of [
        '/',
        '/audit',
        '/settings/source-control',
        '/settings/providers',
        '/agents',
        '/agents/new',
        '/projects',
      ]) {
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
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await page.getByLabel('Theme').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByLabel('Theme').selectOption('system');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
});

/**
 * Feature 004, US4: every screen in both themes, at desktop and phone width,
 * with reduced transparency, and at 200% text zoom; every control 44 × 44 px.
 */
const everyScreen = [
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

async function expectTouchTargets(page: Page) {
  const small = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        'main button, main a[href], main input, main select, main textarea, nav a[href], nav button',
      ),
    ]
      .filter((el) => {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) return false;
        // links inside running text are exempt (WCAG 2.5.8 inline exception)
        if (el.tagName === 'A' && getComputedStyle(el).display === 'inline')
          return false;
        return box.width < 44 || box.height < 44;
      })
      .map((el) => `${el.tagName} "${el.textContent?.trim().slice(0, 30)}"`),
  );
  expect(small).toEqual([]);
}

for (const theme of themes)
  for (const width of [1280, 320])
    test(`${theme} theme at ${width} px: every screen passes axe, fits and has large targets`, async ({
      page,
    }) => {
      await useTheme(page, theme);
      await page.setViewportSize({ width, height: 800 });
      await signInAsOwner(page);
      for (const path of everyScreen) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('main h1')).toBeVisible();
        await axeCheck(page);
        await expectNoHorizontalScroll(page);
        await expectTouchTargets(page);
      }
    });

test('every screen passes axe with reduced transparency', async ({ page }) => {
  await signInAsOwner(page);
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  });
  for (const path of everyScreen) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(
      await page.evaluate(
        () => matchMedia('(prefers-reduced-transparency: reduce)').matches,
      ),
    ).toBe(true);
    await axeCheck(page);
  }
});

test('content reflows at 200% text zoom without sideways scrolling', async ({
  page,
}) => {
  // 200% zoom of a 1280 px window is the same layout width as 640 px
  await page.setViewportSize({ width: 640, height: 800 });
  await signInAsOwner(page);
  for (const path of everyScreen) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expectNoHorizontalScroll(page);
  }
});
