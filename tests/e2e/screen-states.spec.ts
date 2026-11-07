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

test.describe('source control settings', () => {
  const path = '/settings/source-control';
  const connection = {
    id: 'c1',
    name: 'fixture connection',
    platform: 'github',
    baseUrl: 'https://api.github.com',
    accountName: 'octo',
    grantedPermissions: ['read_contents', 'push', 'create_pull_request'],
    missingPermissions: [],
    tokenLast4: '1234',
    status: 'connected',
    statusReason: null,
    lastCheckedAt: '2026-11-08T10:00:00.000Z',
    lastCheckResult: 'Connected as octo.',
  };

  test('loading, empty, error with Retry, and success states', async ({
    page,
  }) => {
    await signInAsOwner(page);
    await page.route('**/api/source-control-connections', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({ json: [] });
    });
    await page.goto(path);
    await expect(page.getByRole('status').first()).toContainText(
      'Loading source control connections',
    );
    await expect(
      page.getByText('No source control connections yet.'),
    ).toBeVisible();
    await page.unroute('**/api/source-control-connections');

    let failing = true;
    await page.route('**/api/source-control-connections', async (route) => {
      if (failing)
        await route.fulfill({
          status: 500,
          contentType: 'application/problem+json',
          body: JSON.stringify(failure),
        });
      else await route.fulfill({ json: [connection] });
    });
    await page.goto(path);
    await expect(page.getByRole('alert')).toContainText(
      'Could not load source control connections',
    );
    failing = false;
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText('fixture connection')).toBeVisible();
    await expect(page.getByText('…1234')).toBeVisible();
  });

  test('a failed Check now explains the problem and the connection stays listed', async ({
    page,
  }) => {
    await signInAsOwner(page);
    await page.route('**/api/source-control-connections', (route) =>
      route.fulfill({ json: [connection] }),
    );
    await page.route('**/api/source-control-connections/c1/check', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          code: 'provider_unavailable',
          message:
            'Could not reach GitHub to check the token. Retry in a moment.',
        }),
      }),
    );
    await page.goto(path);
    await page.getByRole('button', { name: 'Check now' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Could not reach GitHub',
    );
    await expect(page.getByText('fixture connection')).toBeVisible();
  });
});
