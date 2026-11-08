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

test.describe('provider settings', () => {
  const path = '/settings/providers';
  const connection = {
    id: 'p1',
    provider: 'claude',
    authType: 'api_key',
    credentialRevision: 1,
    name: 'fixture claude',
    status: 'connected',
    credentialExpiresAt: null,
    lastCheckedAt: '2026-11-08T10:00:00.000Z',
    lastCheckResult: 'API key verified.',
  };

  test('loading, empty, error with Retry, and success states', async ({
    page,
  }) => {
    await signInAsOwner(page);
    await page.route('**/api/provider-connections', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({ json: [] });
    });
    await page.goto(path);
    await expect(page.getByRole('status').first()).toContainText(
      'Loading provider connections',
    );
    await expect(page.getByText('No provider connections yet.')).toBeVisible();
    await page.unroute('**/api/provider-connections');

    let failing = true;
    await page.route('**/api/provider-connections', async (route) => {
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
      'Could not load provider connections',
    );
    failing = false;
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText('fixture claude')).toBeVisible();
  });

  test('a failed Check now explains the problem and the connection stays listed', async ({
    page,
  }) => {
    await signInAsOwner(page);
    await page.route('**/api/provider-connections', (route) =>
      route.fulfill({ json: [connection] }),
    );
    await page.route('**/api/provider-connections/p1/check', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          code: 'provider_unavailable',
          message:
            'Could not reach Anthropic to check the key. Retry in a moment.',
        }),
      }),
    );
    await page.goto(path);
    await page.getByRole('button', { name: 'Check now' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Could not reach Anthropic',
    );
    await expect(page.getByText('fixture claude')).toBeVisible();
  });
});

/**
 * Feature 004, US3: every list screen shows the same empty, error and loading
 * layout, each with a next step.
 */
test.describe('shared states on every list screen', () => {
  const screens = [
    { path: '/projects', api: '**/api/projects', what: 'projects' },
    { path: '/agents', api: '**/api/agents', what: 'agents' },
    {
      path: '/settings/providers',
      api: '**/api/provider-connections',
      what: 'provider connections',
    },
    {
      path: '/settings/source-control',
      api: '**/api/source-control-connections',
      what: 'source control connections',
    },
  ];

  for (const screen of screens)
    test(`${screen.path}: empty, error with Retry, and loading look the same`, async ({
      page,
    }) => {
      await signInAsOwner(page);

      await page.route(screen.api, (route) =>
        route.request().method() === 'GET'
          ? route.fulfill({ json: [] })
          : route.continue(),
      );
      await page.goto(screen.path);
      const empty = page.locator('main [data-state="empty"]');
      await expect(empty).toBeVisible();
      await expect(empty.locator('svg').first()).toBeVisible();
      // the empty state offers the next step
      await expect(
        empty.getByRole('button').or(empty.getByRole('link')).first(),
      ).toBeVisible();
      await page.unroute(screen.api);

      let failing = true;
      await page.route(screen.api, async (route) => {
        if (route.request().method() !== 'GET' || !failing)
          return route.continue();
        await route.fulfill({
          status: 500,
          contentType: 'application/problem+json',
          body: JSON.stringify(failure),
        });
      });
      await page.goto(screen.path);
      const alert = page.locator('main [data-state="error"]');
      await expect(alert).toHaveAttribute('role', 'alert');
      await expect(alert).toContainText(`Could not load ${screen.what}`);
      failing = false;
      await alert.getByRole('button', { name: 'Retry' }).click();
      await expect(alert).toBeHidden();
      await page.unroute(screen.api);

      await page.route(screen.api, async (route) => {
        if (route.request().method() === 'GET')
          await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.continue();
      });
      await page.goto(screen.path);
      await expect(
        page.getByRole('status').filter({ hasText: `Loading ${screen.what}` }),
      ).toBeVisible();
      await page.unroute(screen.api);
    });
});
