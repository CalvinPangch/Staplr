import type { Page } from '@playwright/test';
import {
  test,
  expect,
  axeCheck,
  signInAsOwner,
  setFakeAnthropicKey,
} from './fixtures';
import { createAgent } from './agent-file';

/**
 * Feature 004, US2: Home lists what needs attention first, and the affected
 * cards show their status and reason without opening them. Runs on its own
 * connection and agent names so it does not depend on other specs.
 */
test.describe.configure({ mode: 'serial' });

const key = 'sk-ant-e2eAttention-0001';
const models = ['claude-sonnet-5-5'];
const card = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ hasText: name });

test('Home lists a Not ready agent and a connection that needs re-login', async ({
  page,
  request,
}, testInfo) => {
  await setFakeAnthropicKey(request, testInfo.project.name, key, { models });
  await signInAsOwner(page);
  await page.goto('/settings/providers');
  await page.getByRole('button', { name: 'Add Claude' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a Claude connection' });
  await dialog.getByLabel('Connection name').fill('Attention Claude');
  await dialog.getByLabel('Anthropic API key').fill(key);
  await dialog.getByRole('button', { name: 'Add connection' }).click();
  await expect(card(page, 'Attention Claude')).toContainText('Connected');
  await createAgent(page, {
    template: 'Developer',
    name: 'Attention Dev',
    connection: 'Attention Claude',
    model: 'Claude Sonnet 5.5',
  });

  // the provider now rejects the key
  await setFakeAnthropicKey(request, testInfo.project.name, key, {
    models,
    reject: true,
  });
  await page.goto('/settings/providers');
  await card(page, 'Attention Claude')
    .getByRole('button', { name: 'Check now' })
    .click();
  await expect(card(page, 'Attention Claude')).toContainText('Needs re-login');
  // the reason is on the card itself
  await expect(card(page, 'Attention Claude')).toContainText(
    'rejected this API key',
  );

  await page.goto('/');
  const attention = page.getByRole('region', { name: 'Needs attention' });
  const agent = attention
    .getByRole('listitem')
    .filter({ hasText: 'Attention Dev' });
  await expect(agent).toBeVisible();
  await expect(agent).toContainText(/re-login|Replace the API key/i);
  await expect(agent.getByRole('link')).toHaveAttribute('href', /\/agents\//);
  const connection = attention
    .getByRole('listitem')
    .filter({ hasText: 'Attention Claude' });
  await expect(connection).toBeVisible();
  await expect(connection.getByRole('link')).toHaveAttribute(
    'href',
    '/settings/providers',
  );
  await axeCheck(page);

  await page.goto('/agents');
  await expect(card(page, 'Attention Dev')).toContainText('Not ready');
  await expect(card(page, 'Attention Dev')).toContainText(
    /Replace the API key|re-login/i,
  );
});

test('Home says so when everything is ready', async ({ page }) => {
  await signInAsOwner(page);
  // show an installation where nothing needs attention
  for (const path of [
    '**/api/agents',
    '**/api/provider-connections',
    '**/api/source-control-connections',
    '**/api/projects',
  ])
    await page.route(path, (route) => route.fulfill({ json: [] }));
  await page.goto('/');
  await expect(page.getByText('Everything is ready.')).toBeVisible();
  await axeCheck(page);
});

test('Home shows stat tiles that lead to each place', async ({ page }) => {
  await signInAsOwner(page);
  await page.goto('/');
  const overview = page.getByRole('region', { name: 'Overview' });
  const tiles = overview.getByRole('listitem');
  await expect(tiles).toHaveCount(4);
  const expected: [string, RegExp, string | RegExp][] = [
    ['Projects', /More info about projects/, '/projects'],
    ['Agents ready', /More info about agents/, '/agents'],
    ['Connections', /More info about connections/, '/settings/providers'],
    [
      'Needs attention',
      /More info about what needs attention/,
      /#needs-attention$/,
    ],
  ];
  for (const [label, more, href] of expected) {
    const tile = tiles.filter({ hasText: label });
    await expect(tile).toHaveCount(1);
    // a large number (or "N of M"), an icon and a More info link
    await expect(tile).toContainText(/\d/);
    await expect(tile.locator('svg').first()).toBeAttached();
    await expect(tile.getByRole('link', { name: more })).toHaveAttribute(
      'href',
      href,
    );
  }
  await expect(tiles.filter({ hasText: 'Agents ready' })).toContainText(
    /\d+ of \d+/,
  );
  // the attention list the last tile points to
  await expect(page.locator('#needs-attention')).toBeVisible();
  await axeCheck(page);
});
