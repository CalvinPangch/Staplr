import type { Page } from '@playwright/test';
import { test, expect, axeCheck, signInAsOwner } from './fixtures';

test.describe.configure({ mode: 'serial' });

async function openPrices(page: Page) {
  await signInAsOwner(page);
  await page.getByRole('link', { name: 'Prices' }).click();
  await expect(page).toHaveURL(/\/model-prices$/);
  await expect(
    page.getByRole('heading', { name: 'Model prices', level: 1 }),
  ).toBeVisible();
}
const card = (page: Page, model: string) =>
  page.getByRole('listitem').filter({ hasText: model });

test('shows estimated list prices with their source and date', async ({
  page,
}) => {
  await openPrices(page);
  await expect(
    page.getByText(/never an invoice or an actual provider charge/),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Claude', level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Codex', level: 2 }),
  ).toBeVisible();
  const sonnet = card(page, 'claude-sonnet-5-5');
  await expect(sonnet).toContainText('$2 per million tokens');
  await expect(sonnet).toContainText('$10 per million tokens');
  await expect(sonnet.getByText('List price used for estimates')).toBeVisible();
  await expect(sonnet).toContainText('Copied from');
  await expect(
    sonnet.getByRole('link', { name: /provider pricing page/ }),
  ).toHaveAttribute('href', /^https:\/\//);
  await expect(sonnet).toContainText('2026-11-08');
  await axeCheck(page);
});

test('shows Unknown with an Enter price action and fills it in', async ({
  page,
}) => {
  await openPrices(page);
  const haiku = card(page, 'claude-haiku-5-5');
  await expect(haiku).toContainText('Unknown');
  await haiku
    .getByRole('button', { name: 'Enter price for claude-haiku-5-5' })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Enter the price for claude-haiku-5-5');
  await axeCheck(page);
  await dialog.getByRole('button', { name: 'Save price' }).click();
  await expect(
    dialog
      .getByText(/Enter a price of 0 or more with up to 6 decimal places/)
      .first(),
  ).toBeVisible();
  await dialog.getByLabel('Input price per million tokens (USD)').fill('0.8');
  await dialog.getByLabel('Output price per million tokens (USD)').fill('4');
  await dialog.getByRole('button', { name: 'Save price' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(haiku).toContainText('$0.8 per million tokens');
  await expect(haiku).toContainText('Set by you');
});

test('edits a price, keeps the old one in the history, and refuses bad input', async ({
  page,
}) => {
  await openPrices(page);
  const sonnet = card(page, 'claude-sonnet-5-5');
  await sonnet
    .getByRole('button', { name: 'Edit price for claude-sonnet-5-5' })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Input price per million tokens (USD)').fill('-3');
  await dialog.getByRole('button', { name: 'Save price' }).click();
  await expect(
    dialog.getByText(/Enter a price of 0 or more/).first(),
  ).toBeVisible();
  await dialog.getByLabel('Input price per million tokens (USD)').fill('2.5');
  await dialog
    .getByLabel('Output price per million tokens (USD)')
    .fill('12.123456');
  await dialog.getByRole('button', { name: 'Save price' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(sonnet).toContainText('$2.5 per million tokens');
  await expect(sonnet).toContainText('$12.123456 per million tokens');
  await expect(sonnet).toContainText('Set by you');

  await sonnet.getByText('Price history (1)').click();
  await expect(sonnet).toContainText('$2 in / $10 out');
  await expect(sonnet).toContainText('default');
  await axeCheck(page);
});

test('shows an error with Retry when the prices cannot load', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.route('**/api/model-prices', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/problem+json',
      body: JSON.stringify({ code: 'internal_error', message: 'Broken.' }),
    }),
  );
  await page.goto('/model-prices');
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await axeCheck(page);
});
