import { test, expect, axeCheck, owner } from './fixtures';

// Runs first on a fresh installation (see playwright.config.ts).
test.describe.configure({ mode: 'serial' });

test('shows first-run setup only while no owner exists, with field-level validation', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(
    page.getByRole('heading', { name: 'Create the owner account' }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await axeCheck(page);

  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByLabel('Username')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(
    page.getByText('Use 3 to 64 characters for the username.'),
  ).toBeVisible();
  await expect(
    page.getByText('Use at least 12 characters for the password.'),
  ).toBeVisible();
  await expect(page.getByLabel('Username')).toBeFocused();

  await page.getByLabel('Username').fill(owner.username);
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByLabel('Confirm password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(
    page.getByText('Use at least 12 characters for the password.'),
  ).toBeVisible();

  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByLabel('Confirm password').fill('another-long-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('The passwords do not match.')).toBeVisible();

  await page.getByLabel('Confirm password').fill(owner.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/setup');
  await expect(page).not.toHaveURL(/\/setup$/);
});

test('rejects a wrong password with a specific message, signs in, and signs out', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await axeCheck(page);

  await page.getByLabel('Username').fill(owner.username);
  await page.getByLabel('Password', { exact: true }).fill('wrong-wrong-wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Sign-in failed. Check your username and password.',
  );
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);

  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto('/audit');
  await expect(page).toHaveURL(/\/sign-in$/);
  const reply = await page.request.get('/api/audit-entries');
  expect(reply.status()).toBe(401);
});
