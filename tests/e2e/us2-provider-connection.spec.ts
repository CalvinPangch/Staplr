import type { Page } from '@playwright/test';
import {
  test,
  expect,
  axeCheck,
  signInAsOwner,
  setFakeAnthropicKey,
} from './fixtures';

test.describe.configure({ mode: 'serial' });

const models = [
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
];
const goodKey = 'sk-ant-e2eGoodKeyValue-0001';
const nextKey = 'sk-ant-e2eNextKeyValue-0002';

async function openProviders(page: Page) {
  await signInAsOwner(page);
  await page.getByRole('link', { name: 'Providers' }).click();
  await expect(page).toHaveURL(/\/settings\/providers$/);
  await expect(
    page.getByRole('heading', { name: 'Providers', level: 1 }),
  ).toBeVisible();
}

const card = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ hasText: name });

/** Types into the sign-in terminal the way a person would. */
async function typeInTerminal(page: Page, text: string) {
  await page.locator('.xterm').click();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test('starts empty and explains what to add', async ({ page }) => {
  await openProviders(page);
  await expect(page.getByText('No provider connections yet.')).toBeVisible();
  await axeCheck(page);
});

test('adds a Claude key with the billing disclosure and never echoes the key', async ({
  page,
  request,
}, testInfo) => {
  await setFakeAnthropicKey(request, testInfo.project.name, goodKey, {
    models,
  });
  await openProviders(page);
  await page.getByRole('button', { name: 'Add Claude' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a Claude connection' });
  await expect(
    dialog.getByText(/billed to the owner of this API key/),
  ).toBeVisible();
  await expect(
    dialog.getByText(/never asks for Claude\.ai subscription/),
  ).toBeVisible();
  await axeCheck(page);
  await dialog.getByLabel('Connection name').fill('Work Claude');
  await dialog.getByLabel('Anthropic API key').fill(goodKey);
  await dialog.getByRole('button', { name: 'Add connection' }).click();
  const added = card(page, 'Work Claude');
  await expect(added.getByText('Connected')).toBeVisible();
  await expect(added.getByText('Anthropic API key')).toBeVisible();
  expect(await page.content()).not.toContain(goodKey);
  await axeCheck(page);
});

test('an invalid replacement keeps the prior connection; a restart still has it', async ({
  page,
}) => {
  await openProviders(page);
  await card(page, 'Work Claude')
    .getByRole('button', { name: 'Replace API key' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Replace the API key' });
  await dialog.getByLabel('Anthropic API key').fill('sk-ant-e2eUnknownKey');
  await dialog.getByRole('button', { name: 'Replace API key' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(card(page, 'Work Claude').getByText('Connected')).toBeVisible();
  await page.reload();
  await expect(card(page, 'Work Claude').getByText('Connected')).toBeVisible();
});

test('a rejected key says Needs re-login and Replace API key fixes it', async ({
  page,
  request,
}, testInfo) => {
  await setFakeAnthropicKey(request, testInfo.project.name, goodKey, {
    models,
    reject: true,
  });
  await openProviders(page);
  const claude = card(page, 'Work Claude');
  await claude.getByRole('button', { name: 'Check now' }).click();
  await expect(claude.getByText('Needs re-login')).toBeVisible();
  await expect(claude.getByRole('button', { name: 'Re-login' })).toHaveCount(0);
  await setFakeAnthropicKey(request, testInfo.project.name, nextKey, {
    models,
  });
  await claude.getByRole('button', { name: 'Replace API key' }).click();
  const dialog = page.getByRole('dialog', { name: 'Replace the API key' });
  await dialog.getByLabel('Anthropic API key').fill(nextKey);
  await dialog.getByRole('button', { name: 'Replace API key' }).click();
  await expect(claude.getByText('Connected')).toBeVisible();
});

test('signs in to Codex through the sandbox terminal', async ({ page }) => {
  await openProviders(page);
  await page.getByRole('button', { name: 'Add Codex' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a Codex connection' });
  await dialog.getByLabel('Connection name').fill('Work Codex');
  await dialog.getByRole('button', { name: 'Start sign-in' }).click();
  await expect(
    page.getByRole('heading', { name: 'Sign in to Codex', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('STUB-1234').first()).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByText(/Time left:/)).toBeVisible();
  await axeCheck(page);

  // Finishing before signing in is refused and the session stays open.
  await page.getByRole('button', { name: 'I’ve finished logging in' }).click();
  await expect(page.getByRole('alert')).toContainText(/No sign-in was found/);

  await typeInTerminal(page, 'OK');
  await expect(page.getByText('Login complete.').first()).toBeVisible();
  await page.getByRole('button', { name: 'I’ve finished logging in' }).click();
  await expect(page).toHaveURL(/\/settings\/providers$/);
  await expect(card(page, 'Work Codex').getByText('Connected')).toBeVisible();
  await expect(
    card(page, 'Work Codex').getByText('Codex sandbox login'),
  ).toBeVisible();
});

test('cancelling a sign-in saves nothing', async ({ page }) => {
  await openProviders(page);
  await page.getByRole('button', { name: 'Add Codex' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a Codex connection' });
  await dialog.getByLabel('Connection name').fill('Never saved');
  await dialog.getByRole('button', { name: 'Start sign-in' }).click();
  await expect(page.getByText('STUB-1234').first()).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Cancel sign-in' }).click();
  await expect(page).toHaveURL(/\/settings\/providers$/);
  await expect(card(page, 'Never saved')).toHaveCount(0);
});

test('an expired Codex login says Needs re-login and Re-login fixes it', async ({
  page,
}) => {
  await openProviders(page);
  await page.getByRole('button', { name: 'Add Codex' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a Codex connection' });
  await dialog.getByLabel('Connection name').fill('Old Codex');
  await dialog.getByRole('button', { name: 'Start sign-in' }).click();
  await expect(page.getByText('STUB-1234').first()).toBeVisible({
    timeout: 30000,
  });
  await typeInTerminal(page, 'OK expired=true');
  await expect(page.getByText('Login complete.').first()).toBeVisible();
  await page.getByRole('button', { name: 'I’ve finished logging in' }).click();
  const old = card(page, 'Old Codex');
  await expect(old).toBeVisible();
  await old.getByRole('button', { name: 'Check now' }).click();
  await expect(old.getByText('Needs re-login')).toBeVisible();
  await expect(
    old.getByRole('button', { name: 'Replace API key' }),
  ).toHaveCount(0);

  await old.getByRole('button', { name: 'Re-login' }).click();
  await expect(page.getByText('STUB-1234').first()).toBeVisible({
    timeout: 30000,
  });
  await typeInTerminal(page, 'OK');
  await expect(page.getByText('Login complete.').first()).toBeVisible();
  await page.getByRole('button', { name: 'I’ve finished logging in' }).click();
  await expect(page).toHaveURL(/\/settings\/providers$/);
  await expect(card(page, 'Old Codex').getByText('Connected')).toBeVisible();
  await expect(card(page, 'Old Codex')).toHaveCount(1);
});

test('disconnecting asks for confirmation and shows what depends on it', async ({
  page,
}) => {
  await openProviders(page);
  await card(page, 'Old Codex')
    .getByRole('button', { name: 'Disconnect' })
    .click();
  const dialog = page.getByRole('alertdialog');
  await expect(
    dialog.getByText('No agents or projects use this connection.'),
  ).toBeVisible();
  await axeCheck(page);
  await dialog.getByRole('button', { name: 'Disconnect' }).click();
  await expect(card(page, 'Old Codex')).toHaveCount(0);
});

test('shows an error with Retry when the list cannot load', async ({
  page,
}) => {
  await openProviders(page);
  await page.route('**/api/provider-connections', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/problem+json',
      body: JSON.stringify({ code: 'internal_error', message: 'Broken.' }),
    }),
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await axeCheck(page);
});
