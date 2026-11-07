import { test, expect, signInAsOwner } from './fixtures';

// Grows with every screen: add loading/empty/error/success cases here before
// implementing the screen. Final complete run happens in Polish (T146).
const failure = {
  code: 'internal_error',
  message: 'Unexpected server error. Retry, or review Diagnostics.',
};

test.describe('app start', () => {
  test('loading state while the installation status is fetched', async ({
    page,
  }) => {
    await page.route('**/api/setup/status', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.goto('/');
    await expect(page.getByRole('status').first()).toContainText('Loading');
    await expect(page.locator('main')).toBeVisible();
  });

  test('error state names the problem and Retry recovers', async ({ page }) => {
    let failing = true;
    await page.route('**/api/setup/status', async (route) => {
      if (failing)
        await route.fulfill({
          status: 500,
          contentType: 'application/problem+json',
          body: JSON.stringify(failure),
        });
      else await route.continue();
    });
    await page.goto('/');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Could not start Staplr');
    await expect(alert).toContainText('Unexpected server error');
    failing = false;
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});

test.describe('audit log', () => {
  test('loading, empty, error with Retry, and success states', async ({
    page,
  }) => {
    await signInAsOwner(page);

    // loading
    await page.route('**/api/audit-entries*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({ json: [] });
    });
    await page.goto('/audit');
    await expect(page.getByRole('status').first()).toContainText(
      'Loading audit entries',
    );
    // empty
    await expect(page.getByText('No audit entries yet.')).toBeVisible();
    await page.unroute('**/api/audit-entries*');

    // error, then recovery
    let failing = true;
    await page.route('**/api/audit-entries*', async (route) => {
      if (failing)
        await route.fulfill({
          status: 500,
          contentType: 'application/problem+json',
          body: JSON.stringify(failure),
        });
      else
        await route.fulfill({
          json: [
            {
              id: 'x1',
              at: '2026-11-08T10:00:00.000Z',
              action: 'provider.added',
              targetType: 'provider_connection',
              targetId: 'p1',
              targetName: 'My Claude key',
              detail: '{}',
            },
          ],
        });
    });
    await page.goto('/audit');
    await expect(page.getByRole('alert')).toContainText(
      'Could not load audit entries',
    );
    failing = false;
    await page.getByRole('button', { name: 'Retry' }).click();
    // success
    await expect(page.getByRole('row')).toHaveCount(2);
    await expect(page.getByText('My Claude key')).toBeVisible();
  });
});
