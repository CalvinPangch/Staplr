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
const key = 'sk-ant-e2eAgentKeyValue-0001';

async function openAgents(page: Page) {
  await signInAsOwner(page);
  await page.getByRole('link', { name: 'Agents' }).click();
  await expect(page).toHaveURL(/\/agents$/);
  await expect(
    page.getByRole('heading', { name: 'Agents', level: 1 }),
  ).toBeVisible();
}

const card = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ hasText: name });

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}

async function addClaudeConnection(page: Page, name: string) {
  await page.goto('/settings/providers');
  await page.getByRole('button', { name: 'Add Claude' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a Claude connection' });
  await dialog.getByLabel('Connection name').fill(name);
  await dialog.getByLabel('Anthropic API key').fill(key);
  await dialog.getByRole('button', { name: 'Add connection' }).click();
  await expect(
    page.getByRole('listitem').filter({ hasText: name }).getByText('Connected'),
  ).toBeVisible();
}

async function addCodexConnection(page: Page, name: string, line = 'OK') {
  await page.goto('/settings/providers');
  await page.getByRole('button', { name: 'Add Codex' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a Codex connection' });
  await dialog.getByLabel('Connection name').fill(name);
  await dialog.getByRole('button', { name: 'Start sign-in' }).click();
  await page.locator('.xterm').scrollIntoViewIfNeeded();
  await expect(page.locator('.xterm-rows')).toContainText('STUB-1234', {
    timeout: 30000,
  });
  await page.locator('.xterm').click();
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
  await expect(page.locator('.xterm-rows')).toContainText('Login complete.');
  await page.getByRole('button', { name: 'I’ve finished logging in' }).click();
  await expect(
    page.getByRole('listitem').filter({ hasText: name }).getByText('Connected'),
  ).toBeVisible();
}

test('starts empty and explains what to do', async ({ page }) => {
  await openAgents(page);
  await expect(page.getByText('No agents yet.')).toBeVisible();
  await axeCheck(page);
});

test('offers to connect a provider when the selected provider has none', async ({
  page,
}) => {
  await openAgents(page);
  // Other specs share this installation and add connections, so show none here.
  await page.route('**/api/provider-connections', (route) =>
    route.fulfill({ json: [] }),
  );
  await page.getByRole('link', { name: 'New agent' }).click();
  await expect(
    page.getByRole('heading', { name: 'New agent', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('Claude connects with your own')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Connect Claude' }),
  ).toBeVisible();
  await choose(page, 'Provider', 'Codex');
  await expect(
    page.getByText('Codex connects through a sign-in'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Connect Codex' })).toBeVisible();
  await axeCheck(page);
  await page.getByRole('button', { name: 'Create agent' }).click();
  await expect(
    page.getByText('Enter a name of 1 to 80 characters.'),
  ).toBeVisible();
});

test('creates a Claude agent and sees it ready', async ({
  page,
  request,
}, testInfo) => {
  await setFakeAnthropicKey(request, testInfo.project.name, key, { models });
  await signInAsOwner(page);
  await addClaudeConnection(page, 'Agents Claude');
  await page.goto('/agents/new');
  await page.getByLabel('Name').fill('Alice');
  await choose(page, 'Soul', /Developer \(Developer\)/);
  await choose(page, 'Connection', 'Agents Claude');
  await expect(
    page.getByRole('heading', { name: 'Models for this connection' }),
  ).toBeVisible();
  await choose(page, 'Model', 'Claude Sonnet 5.5');
  await axeCheck(page);
  await page.getByRole('button', { name: 'Create agent' }).click();
  await expect(page).toHaveURL(/\/agents$/);
  const alice = card(page, 'Alice');
  await expect(alice.getByText('Ready')).toBeVisible();
  await expect(alice.getByText('claude-sonnet-5-5')).toBeVisible();
  await axeCheck(page);
});

test('creates a Codex agent only after its model is checked', async ({
  page,
}) => {
  await signInAsOwner(page);
  // The login lists no models, so discovery marks Astra unavailable and only a
  // manual check of that exact model can make it available.
  await addCodexConnection(page, 'Agents Codex', 'OK models=-');
  await expect(
    card(page, 'Agents Codex').getByText(
      'This account has no Codex models available',
    ),
  ).toBeVisible({ timeout: 60000 });
  await page.goto('/agents/new');
  await page.getByLabel('Name').fill('Bob');
  await choose(page, 'Soul', /QA \(QA\)/);
  await choose(page, 'Provider', 'Codex');
  await choose(page, 'Connection', 'Agents Codex');
  await page.getByRole('combobox', { name: 'Model' }).click();
  await expect(page.getByRole('option', { name: /Astra/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Check availability for Astra' })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Models for this connection' })
      .getByText(/^Available/)
      .first(),
  ).toBeVisible({ timeout: 30000 });
  await choose(page, 'Model', 'Astra');
  await page.getByRole('button', { name: 'Create agent' }).click();
  await expect(page).toHaveURL(/\/agents$/);
  await expect(card(page, 'Bob').getByText('Ready')).toBeVisible();
});

test('changes an agent model', async ({ page }) => {
  await openAgents(page);
  await card(page, 'Alice').getByRole('link', { name: 'Edit Alice' }).click();
  await choose(page, 'Model', 'Claude Opus 5.5');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/\/agents$/);
  await expect(card(page, 'Alice').getByText('claude-opus-5-5')).toBeVisible();
});

test('shows Not ready with the reason when a connection needs attention', async ({
  page,
  request,
}, testInfo) => {
  await setFakeAnthropicKey(request, testInfo.project.name, key, {
    models,
    reject: true,
  });
  await signInAsOwner(page);
  await page.goto('/settings/providers');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Agents Claude' })
    .getByRole('button', { name: 'Check now' })
    .click();
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'Agents Claude' })
      .getByText('Needs re-login'),
  ).toBeVisible();
  await page.goto('/agents');
  const alice = card(page, 'Alice');
  await expect(alice.getByText('Not ready')).toBeVisible();
  await expect(alice.getByText(/Replace the API key/)).toBeVisible();
  await axeCheck(page);
});

test('deletes an agent after confirmation', async ({ page }) => {
  await openAgents(page);
  await page.getByRole('button', { name: 'Delete Bob' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Delete Bob?');
  await dialog.getByRole('button', { name: 'Delete agent' }).click();
  await expect(card(page, 'Bob')).toHaveCount(0);
});

test('shows an error with Retry when the list cannot load', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.route('**/api/agents', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/problem+json',
      body: JSON.stringify({ code: 'internal_error', message: 'Broken.' }),
    }),
  );
  await page.goto('/agents');
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await axeCheck(page);
});
