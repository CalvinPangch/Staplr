import type { Page } from '@playwright/test';
import {
  test,
  expect,
  axeCheck,
  signInAsOwner,
  setFakeAnthropicKey,
  setFakeGithubToken,
} from './fixtures';
import { createGitRemote, type GitRemote } from '../fakes/git-remote';
import { createAgent } from './agent-file';

test.describe.configure({ mode: 'serial' });

const githubToken = 'ghp_e2eProjectsToken0001';
const claudeKey = 'sk-ant-e2eProjectsKey-0001';
const models = ['claude-sonnet-5-5', 'claude-haiku-5-5'];
let remote: GitRemote;

test.beforeAll(async () => {
  remote = await createGitRemote(['main', 'release']);
});
test.afterAll(async () => {
  await remote.close();
});

const repos = (names: { id: number; fullName: string }[]) =>
  names.map((r) => ({
    ...r,
    defaultBranch: 'main',
    branches: ['main', 'release'],
    cloneUrl: remote.url,
  }));

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}
const card = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ hasText: name });

async function addGithubConnection(page: Page) {
  await page.goto('/settings/source-control');
  await page.getByRole('button', { name: 'Add connection' }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Add a source control connection',
  });
  await dialog.getByLabel('Name').fill('Projects GH');
  await dialog.getByLabel('Access token').fill(githubToken);
  await dialog.getByRole('button', { name: 'Add connection' }).click();
  await expect(card(page, 'Projects GH')).toContainText('Connected');
}

/** Feature 003: agents are created from a role template as one Markdown file. */
async function addClaudeAgent(page: Page, name: string, template: string) {
  await createAgent(page, {
    template,
    name,
    connection: 'Projects Claude',
    model: 'Claude Sonnet 5.5',
  });
  await expect(card(page, name).getByText('Ready')).toBeVisible();
}

async function addToTeam(page: Page, agentLabel: RegExp) {
  await choose(page, 'Add an agent', agentLabel);
  await page.getByRole('button', { name: 'Add to team' }).click();
}

test('prepares a repository host, a Claude connection and agents', async ({
  page,
  request,
}, testInfo) => {
  await setFakeGithubToken(request, testInfo.project.name, githubToken, {
    login: 'octo',
    kind: 'classic',
    scopes: ['repo'],
    repos: repos([
      { id: 101, fullName: 'octo/shop' },
      { id: 102, fullName: 'octo/blog' },
    ]),
  });
  await setFakeAnthropicKey(request, testInfo.project.name, claudeKey, {
    models,
  });
  await signInAsOwner(page);
  await addGithubConnection(page);
  await page.goto('/settings/providers');
  await page.getByRole('button', { name: 'Add Claude' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a Claude connection' });
  await dialog.getByLabel('Connection name').fill('Projects Claude');
  await dialog.getByLabel('Anthropic API key').fill(claudeKey);
  await dialog.getByRole('button', { name: 'Add connection' }).click();
  await expect(card(page, 'Projects Claude')).toContainText('Connected');
  await addClaudeAgent(page, 'Project lead', 'Project Manager');
  await addClaudeAgent(page, 'Backup lead', 'Project Manager');
  await addClaudeAgent(page, 'Coder', 'Developer');
});

test('starts with an empty project list', async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole('link', { name: 'Projects' }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByText('No projects yet.')).toBeVisible();
  await axeCheck(page);
});

test('adds a project: search a repository, confirm, watch it download', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto('/projects');
  await page.getByRole('button', { name: 'Add project' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a project' });
  await choose(page, 'Source control connection', /Projects GH/);
  await dialog.getByRole('combobox', { name: 'Repository' }).fill('sho');
  await expect(
    dialog.getByRole('option', { name: /octo\/shop/ }),
  ).toBeVisible();
  await expect(dialog.getByRole('option', { name: /octo\/blog/ })).toHaveCount(
    0,
  );
  await axeCheck(page);
  await dialog.getByRole('option', { name: /octo\/shop/ }).click();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByLabel('Project name')).toHaveValue('shop');
  await dialog.getByLabel('Project name').fill('Shop');
  await dialog.getByRole('button', { name: 'Add project' }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  await expect(
    page.getByRole('heading', { name: 'Shop', level: 1 }),
  ).toBeVisible();
  // a new project opens on its Board; the download details are on the Setup tab
  await expect(page.getByRole('tab', { name: 'Board' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: 'Setup' }).click();
  await expect(page.getByText('Downloaded').first()).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByText(/Last updated/)).toBeVisible();
  await axeCheck(page);
});

test('names the permissions needed when a search finds nothing', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto('/projects');
  await page.getByRole('button', { name: 'Add project' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a project' });
  await choose(page, 'Source control connection', /Projects GH/);
  await dialog
    .getByRole('combobox', { name: 'Repository' })
    .fill('no-such-repository');
  await expect(dialog.getByText(/push to are listed/).first()).toBeVisible();
  await expect(dialog.getByText(/No repositories found/)).toBeVisible();
});

test('builds the team: PM required, second PM blocked with replace, Ready', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto('/projects');
  await page.getByRole('link', { name: 'Open Shop' }).click();
  await page.getByRole('tab', { name: 'Setup' }).click();
  await expect(
    page.getByRole('heading', { name: 'Team', level: 2 }),
  ).toBeVisible();

  // Finishing without a Project Manager is refused.
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page.getByRole('alert')).toContainText('Add a Project Manager');
  await expect(page.getByText('The team has no Project Manager')).toBeVisible();

  await addToTeam(page, /Project lead/);
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'Project lead' })
      .getByText('Ready'),
  ).toBeVisible();
  await addToTeam(page, /Coder/);
  await expect(page.getByRole('note')).toContainText('Business Analyst');

  // A second Project Manager is blocked; replacing swaps in one step.
  await addToTeam(page, /Backup lead/);
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('Replace the Project Manager?');
  await expect(confirm).toContainText('Project lead');
  await axeCheck(page);
  await confirm
    .getByRole('button', { name: 'Replace Project Manager' })
    .click();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Backup lead' }),
  ).toBeVisible();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Project lead' }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(
    page.getByText('Setup finished. This project is Ready.'),
  ).toBeVisible();
  await expect(
    page
      .getByRole('heading', { name: 'Shop', level: 1 })
      .locator('..')
      .getByText('Ready'),
  ).toBeVisible();
  await axeCheck(page);
});

test('deleting an agent on a team is blocked and names the project', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto('/agents');
  await page.getByRole('button', { name: 'Delete Coder' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete agent' })
    .click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('on a project team');
  await expect(alert.getByText('Shop')).toBeVisible();
});

test('refreshes the repository and changes the base branch', async ({
  page,
}) => {
  await remote.commit('main', 'NEWS.md', 'fresh');
  await signInAsOwner(page);
  await page.goto('/projects');
  await page.getByRole('link', { name: 'Open Shop' }).click();
  await page.getByRole('tab', { name: 'Setup' }).click();
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByText('Last updated')).toBeVisible();
  await choose(page, 'Base branch', 'release');
  await expect(
    page.getByRole('combobox', { name: 'Base branch' }),
  ).toContainText('release');
});

test('relinks a renamed repository after the old one disappears', async ({
  page,
  request,
}, testInfo) => {
  await signInAsOwner(page);
  await setFakeGithubToken(request, testInfo.project.name, githubToken, {
    login: 'octo',
    kind: 'classic',
    scopes: ['repo'],
    repos: repos([
      { id: 103, fullName: 'octo/shop-renamed' },
      { id: 102, fullName: 'octo/blog' },
    ]),
  });
  await page.goto('/settings/source-control');
  await page.getByRole('button', { name: 'Check all connections' }).click();
  await page.goto('/projects');
  await page.getByRole('link', { name: 'Open Shop' }).click();
  await page.getByRole('tab', { name: 'Setup' }).click();
  await expect(
    page.getByText('The repository can no longer be reached'),
  ).toBeVisible({ timeout: 30000 });

  await page.getByRole('button', { name: 'Relink repository' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Relink repository' });
  await choose(page, 'Source control connection', /Projects GH/);
  await dialog.getByRole('combobox', { name: 'Repository' }).fill('renamed');
  await dialog.getByRole('option', { name: /octo\/shop-renamed/ }).click();
  await dialog.getByRole('button', { name: 'Relink repository' }).click();
  await expect(
    page.locator('main').getByText('octo/shop-renamed'),
  ).toBeVisible();
  await expect(page.getByText('Downloaded').first()).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByText('The repository can no longer be reached'),
  ).toHaveCount(0);
});

test('deletes a project after a confirmation that says what goes and what stays', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto('/projects');
  await page.getByRole('link', { name: 'Open Shop' }).click();
  await page.getByRole('tab', { name: 'Setup' }).click();
  await page.getByRole('button', { name: 'Delete project' }).first().click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('This removes:');
  await expect(dialog).toContainText('the downloaded repository');
  await expect(dialog).toContainText('This keeps:');
  await expect(dialog).toContainText('your agents and provider connections');
  await axeCheck(page);
  await dialog.getByRole('button', { name: 'Delete project' }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByText('No projects yet.')).toBeVisible();
  // the agents are kept
  await page.goto('/agents');
  await expect(card(page, 'Coder')).toBeVisible();
});

test('shows an error with Retry when the list cannot load', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.route('**/api/projects', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/problem+json',
      body: JSON.stringify({ code: 'internal_error', message: 'Broken.' }),
    }),
  );
  await page.goto('/projects');
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await axeCheck(page);
});
