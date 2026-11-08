import type { Page } from '@playwright/test';
import { test, expect, axeCheck, signInAsOwner } from './fixtures';

test.describe.configure({ mode: 'serial' });

async function openSouls(page: Page) {
  await signInAsOwner(page);
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await page.getByRole('link', { name: 'Souls' }).click();
  await expect(page).toHaveURL(/\/souls$/);
  await expect(
    page.getByRole('heading', { name: 'Souls', level: 1 }),
  ).toBeVisible();
}

test('shows the four read-only defaults grouped by role', async ({ page }) => {
  await openSouls(page);
  for (const role of ['Project Manager', 'Business Analyst', 'Developer', 'QA'])
    await expect(
      page.getByRole('heading', { name: role, level: 2 }),
    ).toBeVisible();
  await expect(page.getByText('Default', { exact: true })).toHaveCount(4);
  await axeCheck(page);

  await page.getByRole('link', { name: 'View Developer' }).click();
  await expect(
    page.getByText('Default souls are read-only. Copy this soul'),
  ).toBeVisible();
  await expect(page.getByLabel('Name')).toHaveAttribute('readonly', '');
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(
    0,
  );
  await axeCheck(page);
});

test('creates a custom soul and shows field errors first', async ({ page }) => {
  await openSouls(page);
  await page.getByRole('link', { name: 'New soul' }).click();
  await expect(
    page.getByRole('heading', { name: 'New soul', level: 1 }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create soul' }).click();
  await expect(
    page.getByText('Enter a name of 1 to 80 characters.'),
  ).toBeVisible();

  await page.getByRole('combobox', { name: 'Role' }).click();
  await expect(
    page.getByRole('option', { name: 'Project Manager' }),
  ).toHaveCount(0);
  await page.getByRole('option', { name: 'Custom' }).click();
  await page.getByLabel('Name').fill('Release manager');
  await page.getByLabel('Description').fill('Coordinates releases');
  await page
    .getByLabel('Working instructions')
    .fill('# Release manager\nShip carefully.');
  await axeCheck(page);
  await page.getByRole('button', { name: 'Create soul' }).click();
  await expect(page).toHaveURL(/\/souls$/);
  await expect(
    page.getByRole('heading', { name: 'Custom', level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Release manager', level: 3 }),
  ).toBeVisible();
});

test('copies the Developer default and edits the copy', async ({ page }) => {
  await openSouls(page);
  await page.getByRole('button', { name: 'Copy Developer' }).click();
  await expect(page).toHaveURL(/\/souls\/(?!new)[^/]+$/);
  await expect(page.getByLabel('Name')).toHaveValue('Copy of Developer');
  await expect(page.getByRole('combobox', { name: 'Role' })).toBeDisabled();
  await page.getByLabel('Name').fill('Careful developer');
  await page.getByLabel('Description').fill('Tests first, always');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/\/souls$/);
  await expect(
    page.getByRole('heading', { name: 'Careful developer', level: 3 }),
  ).toBeVisible();
  await expect(page.getByText('Tests first, always')).toBeVisible();
});

test('a name that is already taken is refused with a clear message', async ({
  page,
}) => {
  await openSouls(page);
  await page.getByRole('link', { name: 'New soul' }).click();
  await page.getByLabel('Name').fill('careful DEVELOPER');
  await page.getByLabel('Working instructions').fill('x');
  await page.getByRole('button', { name: 'Create soul' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'A soul with that name already exists',
  );
});

test('shows the agents a soul affects before it is edited', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.route('**/api/souls/used', (route) =>
    route.fulfill({
      json: {
        id: 'used',
        name: 'Used soul',
        roleType: 'custom',
        description: '',
        instructions: 'text',
        isDefault: false,
        copiedFromId: null,
        usedByAgents: [
          { id: 'a1', name: 'Alice agent' },
          { id: 'a2', name: 'Bob agent' },
        ],
      },
    }),
  );
  await page.goto('/souls/used');
  const note = page.getByRole('note');
  await expect(note).toContainText('Changes apply to every agent');
  await expect(note.getByText('Alice agent')).toBeVisible();
  await expect(note.getByText('Bob agent')).toBeVisible();
  await axeCheck(page);
});

test('deletes a custom soul after confirmation', async ({ page }) => {
  await openSouls(page);
  await page.getByRole('button', { name: 'Delete Release manager' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Delete Release manager?');
  await axeCheck(page);
  await dialog.getByRole('button', { name: 'Delete soul' }).click();
  await expect(
    page.getByRole('heading', { name: 'Release manager', level: 3 }),
  ).toHaveCount(0);
});

test('shows loading, error with Retry, and a refused delete naming the agents', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.route('**/api/souls', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.fulfill({
      status: 500,
      json: { code: 'internal_error', message: 'Broken.' },
    });
  });
  await page.goto('/souls');
  await expect(page.getByRole('status').first()).toContainText('Loading souls');
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await page.unroute('**/api/souls');

  const used = {
    id: 'u1',
    name: 'Busy soul',
    roleType: 'custom',
    description: '',
    instructions: 'x',
    isDefault: false,
    copiedFromId: null,
    usedByAgents: [{ id: 'a1', name: 'Alice agent' }],
  };
  await page.route('**/api/souls', (route) => route.fulfill({ json: [used] }));
  await page.route('**/api/souls/u1', (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        code: 'soul_in_use',
        message: 'Agents still use this soul. Change or delete them first.',
        details: { agents: [{ id: 'a1', name: 'Alice agent' }] },
      }),
    }),
  );
  await page.getByRole('button', { name: 'Retry' }).click();
  await page.getByRole('button', { name: 'Delete Busy soul' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete soul' })
    .click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Agents still use this soul');
  await expect(alert.getByText('Alice agent')).toBeVisible();
});
