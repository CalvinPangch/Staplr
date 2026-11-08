import type { Page } from '@playwright/test';
import {
  test,
  expect,
  axeCheck,
  signInAsOwner,
  setFakeAnthropicKey,
} from './fixtures';
import {
  editor,
  insertConnection,
  insertModel,
  setHeader,
  startAgent,
} from './agent-file';

/**
 * Feature 003: an agent is one Markdown file, edited in Staplr's own editor.
 * Runs after us4-agents.spec.ts, which expects an empty agent list.
 */
test.describe.configure({ mode: 'serial' });

const key = 'sk-ant-e2eAgentFiles-0001';
const models = ['claude-sonnet-5-5', 'claude-haiku-5-5'];
const card = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ hasText: name });
const problems = (page: Page) =>
  page.getByRole('list', { name: 'Problems in the agent file' });

async function openAgent(page: Page, name: string) {
  await page.goto('/agents');
  await card(page, name)
    .getByRole('link', { name: `Edit ${name}` })
    .click();
  await expect(editor(page)).toBeVisible();
}

test('creates an agent from a role template on one screen', async ({
  page,
  request,
}, testInfo) => {
  await setFakeAnthropicKey(request, testInfo.project.name, key, { models });
  await signInAsOwner(page);
  await page.goto('/settings/providers');
  await page.getByRole('button', { name: 'Add Claude' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a Claude connection' });
  await dialog.getByLabel('Connection name').fill('Files Claude');
  await dialog.getByLabel('Anthropic API key').fill(key);
  await dialog.getByRole('button', { name: 'Add connection' }).click();
  await expect(card(page, 'Files Claude')).toContainText('Connected');

  // there is no separate soul library any more
  await page.goto('/settings');
  await expect(page.getByRole('link', { name: 'Souls' })).toHaveCount(0);

  await page.goto('/agents/new');
  await axeCheck(page);
  await startAgent(page, 'Developer');
  await expect(editor(page)).toHaveValue(/role: developer/);
  await expect(editor(page)).toHaveValue(/# Developer/);
  await setHeader(page, { name: 'File Dev' });
  await insertConnection(page, 'Files Claude');
  await insertModel(page, 'Claude Sonnet 5.5');
  await expect(editor(page)).toHaveValue(/connection: Files Claude/);
  await expect(editor(page)).toHaveValue(/model: claude-sonnet-5-5/);
  await axeCheck(page);
  await page.getByRole('button', { name: 'Create agent' }).click();
  await expect(page).toHaveURL(/\/agents$/);
  await expect(card(page, 'File Dev').getByText('Ready')).toBeVisible();
});

test('edits the file, previews it and gets back exactly what was saved', async ({
  page,
}) => {
  await signInAsOwner(page);
  await openAgent(page, 'File Dev');
  const before = await editor(page).inputValue();
  const edited = `${before}\n## Extra rule\n\nNever skip review.  \n<script>alert(1)</script>\n`;
  await editor(page).fill(edited);
  await page.getByRole('tab', { name: 'Preview' }).click();
  const preview = page.getByRole('tabpanel', { name: 'Preview' });
  await expect(
    preview.getByRole('heading', { name: 'Extra rule' }),
  ).toBeVisible();
  // raw HTML in the instructions is never turned into page elements
  await expect(preview.locator('script')).toHaveCount(0);
  await axeCheck(page);
  await page.getByRole('tab', { name: 'Edit' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/\/agents$/);
  await openAgent(page, 'File Dev');
  await expect(editor(page)).toHaveValue(edited);
});

test('lists every problem with its line and keeps the last saved version', async ({
  page,
}) => {
  await signInAsOwner(page);
  await openAgent(page, 'File Dev');
  const saved = await editor(page).inputValue();
  await editor(page).fill(
    saved
      .replace('role: developer', 'role: dev')
      .replace('provider: claude\n', ''),
  );
  await expect(problems(page)).toContainText('Line 3:');
  await expect(problems(page)).toContainText('provider');
  await expect(problems(page).getByRole('listitem')).toHaveCount(2);
  await axeCheck(page);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/\/agents\/.+/);
  await page.goto('/agents');
  await openAgent(page, 'File Dev');
  await expect(editor(page)).toHaveValue(saved);
});

test('warns before leaving with unsaved changes', async ({ page }) => {
  await signInAsOwner(page);
  await openAgent(page, 'File Dev');
  await editor(page).fill(`${await editor(page).inputValue()}\nunsaved line`);
  await page.getByRole('link', { name: 'Cancel' }).click();
  const leave = page.getByRole('alertdialog', {
    name: 'Leave without saving?',
  });
  await expect(leave).toBeVisible();
  await leave.getByRole('button', { name: 'Keep editing' }).click();
  await expect(editor(page)).toHaveValue(/unsaved line/);
});

test('refuses a save from a tab that is out of date and keeps its text', async ({
  page,
  context,
}) => {
  await signInAsOwner(page);
  await openAgent(page, 'File Dev');
  const other = await context.newPage();
  await openAgent(other, 'File Dev');

  await editor(page).fill(`${await editor(page).inputValue()}\nfirst tab`);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/\/agents$/);

  await editor(other).fill(`${await editor(other).inputValue()}\nsecond tab`);
  await other.getByRole('button', { name: 'Save changes' }).click();
  await expect(other.getByRole('alert')).toContainText(
    'changed somewhere else',
  );
  await expect(
    other.getByLabel('Your unsaved text (copy it before or after reloading)'),
  ).toHaveValue(/second tab/);
  await axeCheck(other);
  await other.getByRole('button', { name: 'Reload' }).click();
  await expect(editor(other)).toHaveValue(/first tab/);
  await other.close();
});
