import { test, expect, axeCheck, signInAsOwner } from './fixtures';

test.describe.configure({ mode: 'serial' });

test('is empty until something fails', async ({ page }) => {
  await signInAsOwner(page);
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await page.getByRole('link', { name: 'Diagnostics' }).click();
  await expect(page).toHaveURL(/\/diagnostics$/);
  await expect(page.getByText('No errors recorded.')).toBeVisible();
  await axeCheck(page);
});

test('lists a captured error with time, route, request ID and message, and no secret', async ({
  page,
}) => {
  await signInAsOwner(page);
  // a test-only route that throws an error containing a secret-looking value
  const failed = await page.evaluate(async () => {
    const response = await fetch('/api/__test/fail', {
      credentials: 'same-origin',
    });
    return response.status;
  });
  expect(failed).toBe(500);
  await page.goto('/diagnostics');
  const item = page.getByRole('main').getByRole('listitem').first();
  await expect(item).toContainText('Unexpected server error');
  await expect(item).toContainText('/api/__test/fail');
  await expect(item.getByText('Request ID')).toBeVisible();
  await expect(item.getByRole('time')).toBeVisible();
  await item.getByText('Stack trace').click();
  expect(await page.content()).not.toContain('e2e-private-secret');
  await axeCheck(page);
});

test('shows an error with Retry when the list cannot load', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.route('**/api/error-events', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/problem+json',
      body: JSON.stringify({ code: 'internal_error', message: 'Broken.' }),
    }),
  );
  await page.goto('/diagnostics');
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await axeCheck(page);
});
