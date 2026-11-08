import type { Page } from '@playwright/test';
import { test, expect, axeCheck, signInAsOwner } from './fixtures';

/**
 * Feature 002: after a Codex sign-in Staplr finds the models the login can use
 * on its own. Runs against the stub Codex image; the stub lists the models
 * given after "models=" and grants every one of them.
 */
test.describe.configure({ mode: 'serial' });

const card = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ hasText: name });

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}

test('finds the models after a Codex sign-in and offers them without a manual check', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto('/settings/providers');
  await page.getByRole('button', { name: 'Add Codex' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a Codex connection' });
  await dialog.getByLabel('Connection name').fill('Discovery Codex');
  await dialog.getByRole('button', { name: 'Start sign-in' }).click();
  await expect(
    page.getByText('Finding your models sends one very short request'),
  ).toBeVisible();
  await page.locator('.xterm').scrollIntoViewIfNeeded();
  await expect(page.locator('.xterm-rows')).toContainText('STUB-1234', {
    timeout: 30000,
  });
  await page.locator('.xterm').click();
  await page.keyboard.type('OK models=gpt-6-astra,gpt-e2e-new');
  await page.keyboard.press('Enter');
  await expect(page.locator('.xterm-rows')).toContainText('Login complete.');
  await page.getByRole('button', { name: 'I’ve finished logging in' }).click();

  const codex = card(page, 'Discovery Codex');
  await expect(codex.getByText('Connected')).toBeVisible();
  await expect(codex.getByText('2 models available')).toBeVisible({
    timeout: 60000,
  });
  await axeCheck(page);

  await page.goto('/agents/new');
  await page.getByLabel('Name').fill('Discovered');
  await choose(page, 'Soul', /QA \(QA\)/);
  await choose(page, 'Provider', 'Codex');
  await choose(page, 'Connection', 'Discovery Codex');
  // A model Staplr's catalog has never heard of is offered with the name Codex gave it.
  await choose(page, 'Model', 'Stub gpt-e2e-new');
  await page.getByRole('button', { name: 'Create agent' }).click();
  await expect(page).toHaveURL(/\/agents$/);
  await expect(card(page, 'Discovered').getByText('Ready')).toBeVisible();
  await axeCheck(page);
});

test('lists what was found and refreshes it on request', async ({ page }) => {
  await signInAsOwner(page);
  await page.goto('/settings/providers');
  const codex = card(page, 'Discovery Codex');
  await expect(codex.getByText('Models last refreshed:')).toBeVisible();
  await codex.getByRole('button', { name: 'Show models' }).click();
  const list = codex.getByRole('list', { name: 'Models for Discovery Codex' });
  await expect(list.getByText('Stub gpt-e2e-new')).toBeVisible();
  // the shipped catalog model the login did not list is shown as not available
  await expect(
    list.getByRole('listitem').filter({ hasText: 'Luna' }),
  ).toContainText('Not available to this connection');
  await axeCheck(page);

  await codex.getByRole('button', { name: 'Refresh models' }).click();
  await expect(page.getByRole('status')).toContainText(
    'models refreshed, 0 changes',
    { timeout: 60000 },
  );
  await expect(codex.getByText('2 models available')).toBeVisible();
});

test('shows an error with Retry when the model list cannot load', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.route('**/api/models?*', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/problem+json',
      json: { code: 'internal', message: 'Something went wrong.' },
    }),
  );
  await page.goto('/settings/providers');
  const codex = card(page, 'Discovery Codex');
  await codex.getByRole('button', { name: 'Show models' }).click();
  await expect(codex.getByRole('alert')).toBeVisible();
  await expect(codex.getByRole('button', { name: /Retry/ })).toBeVisible();
  await axeCheck(page);
});
