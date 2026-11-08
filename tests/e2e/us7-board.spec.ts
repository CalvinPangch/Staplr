import type { Locator, Page } from '@playwright/test';
import {
  test,
  expect,
  axeCheck,
  signInAsOwner,
  setFakeGithubToken,
} from './fixtures';
import { createGitRemote, type GitRemote } from '../fakes/git-remote';

test.describe.configure({ mode: 'serial' });

const token = 'ghp_e2eBoardTokenValue0001';
let remote: GitRemote;
let projectUrl = '';

test.beforeAll(async () => {
  remote = await createGitRemote(['main']);
});
test.afterAll(async () => {
  await remote.close();
});

const isMobile = (name: string) => name.startsWith('mobile');
const column = (page: Page, status: string) =>
  page.getByTestId(`column-${status}`);
const card = (page: Page, title: string) =>
  page.getByTestId('ticket-card').filter({ hasText: title });
const live = (page: Page) =>
  page.locator('[role="status"][aria-live="assertive"]');

async function titles(page: Page, status: string) {
  return column(page, status).locator('h3').allTextContents();
}

async function addTicket(page: Page, title: string, description = '') {
  await page.getByTestId('new-ticket').click();
  const dialog = page.getByRole('dialog', { name: 'New ticket' });
  await dialog.getByLabel('Title').fill(title);
  if (description) await dialog.getByLabel('Description').fill(description);
  await dialog.getByRole('button', { name: 'Create ticket' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card(page, title)).toBeVisible();
}

/** A real pointer drag: dnd-kit needs the pointer to move before it takes over. */
async function drag(page: Page, source: Locator, target: Locator) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('Both ends of the drag must be visible');
  await page.mouse.move(from.x + from.width / 2, from.y + 20);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + 30, {
    steps: 3,
  });
  await page.mouse.move(
    to.x + to.width / 2,
    to.y + Math.min(to.height / 2, 40),
    {
      steps: 12,
    },
  );
  await page.mouse.up();
}

/** Moves a card with the keyboard only: Tab to it, Space, arrows, Space. */
async function keyboardMove(page: Page, title: string, arrows: string[]) {
  const handle = card(page, title).getByTestId('drag-handle');
  await page.getByTestId('new-ticket').focus();
  for (let i = 0; i < 120; i++) {
    if (await handle.evaluate((node) => node === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(handle).toBeFocused();
  await page.keyboard.press('Space');
  await expect(handle).toHaveAttribute('aria-pressed', 'true');
  for (const arrow of arrows) {
    const before = await live(page).textContent();
    await page.keyboard.press(arrow);
    await expect(live(page)).not.toHaveText(before ?? '');
  }
  await page.keyboard.press('Space');
}

test('prepares a repository and adds a project with the wizard', async ({
  page,
  request,
}, testInfo) => {
  await setFakeGithubToken(request, testInfo.project.name, token, {
    login: 'octo',
    kind: 'classic',
    scopes: ['repo'],
    repos: [
      {
        id: 201,
        fullName: 'octo/board-app',
        defaultBranch: 'main',
        branches: ['main'],
        cloneUrl: remote.url,
      },
    ],
  });
  await signInAsOwner(page);
  await page.goto('/settings/source-control');
  await page.getByRole('button', { name: 'Add connection' }).click();
  const connection = page.getByRole('dialog', {
    name: 'Add a source control connection',
  });
  await connection.getByLabel('Name').fill('Board GH');
  await connection.getByLabel('Access token').fill(token);
  await connection.getByRole('button', { name: 'Add connection' }).click();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Board GH' }),
  ).toContainText('Connected');

  await page.goto('/projects');
  await page.getByRole('button', { name: 'Add project' }).click();
  const wizard = page.getByRole('dialog', { name: 'Add a project' });
  await page
    .getByRole('combobox', { name: 'Source control connection' })
    .click();
  await page.getByRole('option', { name: /Board GH/ }).click();
  await wizard.getByRole('combobox', { name: 'Repository' }).fill('board');
  await wizard.getByRole('option', { name: /octo\/board-app/ }).click();
  await wizard.getByRole('button', { name: 'Next' }).click();
  await wizard.getByLabel('Project name').fill('Board project');
  await wizard.getByRole('button', { name: 'Add project' }).click();

  // the project opens on its Board, empty
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  projectUrl = new URL(page.url()).pathname;
  await expect(page.getByRole('tab', { name: 'Board' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('No tickets yet.')).toBeVisible();
  const headings = await page
    .locator('[data-testid^="column-"] h2')
    .allTextContents();
  expect(headings.map((h) => h.replace(/\d+ tickets?/, '').trim())).toEqual([
    'New',
    'Review',
    'Testing',
    'End',
  ]);
  await axeCheck(page);
});

test('creates tickets at the top of New and validates the form next to each field', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto(projectUrl);
  await page.getByTestId('new-ticket').click();
  const dialog = page.getByRole('dialog', { name: 'New ticket' });
  await dialog.getByRole('button', { name: 'Create ticket' }).click();
  await expect(
    dialog.getByText('Enter a title of 1 to 200 characters.'),
  ).toBeVisible();
  await dialog.getByLabel('Description').fill('<b>not bold</b>\nsecond line');
  await expect(dialog.getByText('27 of 20000 characters')).toBeVisible();
  await axeCheck(page);
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await addTicket(page, 'Write docs', 'Explain the setup');
  await addTicket(page, 'Fix bug', '<b>not bold</b>\nsecond line');
  expect(await titles(page, 'new')).toEqual(['Fix bug', 'Write docs']);
  // text is shown as typed, never as markup
  await expect(card(page, 'Fix bug')).toContainText('<b>not bold</b>');
  await expect(page.locator('b')).toHaveCount(0);
  await expect(card(page, 'Fix bug')).toContainText(
    'In this column for Under a minute',
  );
  await axeCheck(page);
});

test('moves a ticket to Review by dragging it with the mouse', async ({
  page,
}, testInfo) => {
  test.skip(
    isMobile(testInfo.project.name),
    'Columns are stacked at 320 px; the menu is used there',
  );
  await signInAsOwner(page);
  await page.goto(projectUrl);
  await drag(page, card(page, 'Fix bug'), column(page, 'review').locator('ul'));
  await expect.poll(() => titles(page, 'review')).toEqual(['Fix bug']);
  await expect.poll(() => titles(page, 'new')).toEqual(['Write docs']);
});

test('moves a ticket with the keyboard only and announces each step', async ({
  page,
}, testInfo) => {
  test.skip(
    isMobile(testInfo.project.name),
    'Dragging across stacked columns is covered by the menu at 320 px',
  );
  await signInAsOwner(page);
  await page.goto(projectUrl);
  const response = page.waitForResponse(
    (r) =>
      /\/api\/tickets\/[^/]+\/move$/.test(r.url()) &&
      r.request().method() === 'POST',
  );
  await keyboardMove(page, 'Write docs', ['ArrowRight', 'ArrowRight']);
  await response;
  await expect(live(page)).toContainText(
    'Dropped ticket Write docs in column Testing',
  );
  await expect.poll(() => titles(page, 'testing')).toEqual(['Write docs']);
  await expect.poll(() => titles(page, 'new')).toEqual([]);
});

test('announces the pick-up with the column and position', async ({
  page,
}, testInfo) => {
  test.skip(
    isMobile(testInfo.project.name),
    'Keyboard dragging is exercised on the desktop layout',
  );
  await signInAsOwner(page);
  await page.goto(projectUrl);
  await card(page, 'Fix bug').getByTestId('drag-handle').focus();
  await page.keyboard.press('Space');
  await expect(live(page)).toContainText(
    'Picked up ticket Fix bug, column Review, position 1 of 1.',
  );
  await page.keyboard.press('Escape');
  await expect(live(page)).toContainText('Move cancelled');
  expect(await titles(page, 'review')).toEqual(['Fix bug']);
});

test('moves a ticket with the Move to menu, including up and down', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto(projectUrl);
  await page.getByRole('button', { name: 'Move Fix bug' }).click();
  // the top card of its column cannot move up
  await expect(page.getByRole('menuitem', { name: 'Move up' })).toBeDisabled();
  await page.getByRole('menuitem', { name: 'Move to End' }).click();
  await expect.poll(() => titles(page, 'end')).toEqual(['Fix bug']);

  await addTicket(page, 'Third');
  await page.getByRole('button', { name: 'Move Third' }).click();
  await page.getByRole('menuitem', { name: 'Move to End' }).click();
  await expect.poll(() => titles(page, 'end')).toEqual(['Third', 'Fix bug']);
  await page.getByRole('button', { name: 'Move Third' }).click();
  await page.getByRole('menuitem', { name: 'Move down' }).click();
  await expect.poll(() => titles(page, 'end')).toEqual(['Fix bug', 'Third']);
  await page.getByRole('button', { name: 'Move Third' }).click();
  await page.getByRole('menuitem', { name: 'Move up' }).click();
  await expect.poll(() => titles(page, 'end')).toEqual(['Third', 'Fix bug']);
});

test('edits a title, deletes after confirmation, and keeps everything after a reload', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto(projectUrl);
  await page.getByRole('button', { name: 'Edit Third' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit ticket' });
  await expect(dialog.getByLabel('Title')).toHaveValue('Third');
  await dialog.getByLabel('Title').fill('Third, renamed');
  await dialog.getByRole('button', { name: 'Save ticket' }).click();
  await expect(card(page, 'Third, renamed')).toBeVisible();

  await page.getByRole('button', { name: 'Delete Fix bug' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('Delete “Fix bug”?');
  await axeCheck(page);
  await confirm.getByRole('button', { name: 'Delete ticket' }).click();
  await expect(card(page, 'Fix bug')).toHaveCount(0);

  const snapshot = async () => ({
    new: await titles(page, 'new'),
    review: await titles(page, 'review'),
    testing: await titles(page, 'testing'),
    end: await titles(page, 'end'),
  });
  const before = await snapshot();
  expect(before.end).toEqual(['Third, renamed']);
  await page.reload();
  await expect(card(page, 'Third, renamed')).toBeVisible();
  expect(await snapshot()).toEqual(before);
});

test('a failed move puts the card back and says so', async ({
  page,
}, testInfo) => {
  await signInAsOwner(page);
  await page.goto(projectUrl);
  await page.route('**/api/tickets/*/move', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/problem+json',
      body: JSON.stringify({ code: 'internal_error', message: 'Broken.' }),
    }),
  );
  await page.getByRole('button', { name: 'Move Third, renamed' }).click();
  await page.getByRole('menuitem', { name: 'Move to Review' }).click();
  await expect(page.getByText('The move was not saved')).toBeVisible();
  await expect.poll(() => titles(page, 'end')).toEqual(['Third, renamed']);
  expect(await titles(page, 'review')).toEqual([]);
  void testInfo;
});

test('creating a ticket and moving it from New to End takes under 30 seconds, with the pointer and with the keyboard', async ({
  page,
}, testInfo) => {
  await signInAsOwner(page);
  await page.goto(projectUrl);

  // pointer only: create, then use the menu (the drag is covered above)
  let started = Date.now();
  await addTicket(page, 'Pointer ticket');
  await page.getByRole('button', { name: 'Move Pointer ticket' }).click();
  await page.getByRole('menuitem', { name: 'Move to End' }).click();
  await expect.poll(() => titles(page, 'end')).toContain('Pointer ticket');
  expect(Date.now() - started).toBeLessThan(30_000);

  // keyboard only: create, move with the keys
  started = Date.now();
  await page.getByTestId('new-ticket').focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'New ticket' });
  await expect(dialog.getByLabel('Title')).toBeFocused();
  await page.keyboard.type('Keyboard ticket');
  await page.getByRole('button', { name: 'Create ticket' }).focus();
  await page.keyboard.press('Enter');
  await expect(card(page, 'Keyboard ticket')).toBeVisible();
  if (isMobile(testInfo.project.name)) {
    // stacked columns: the same keyboard-only result through the Move to menu
    await page.getByRole('button', { name: 'Move Keyboard ticket' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: 'Move to End' }).focus();
    await page.keyboard.press('Enter');
  } else {
    await keyboardMove(page, 'Keyboard ticket', [
      'ArrowRight',
      'ArrowRight',
      'ArrowRight',
    ]);
  }
  await expect.poll(() => titles(page, 'end')).toContain('Keyboard ticket');
  expect(Date.now() - started).toBeLessThan(30_000);
});

test('stays accessible and never scrolls sideways at 320 px', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(projectUrl);
  await expect(card(page, 'Third, renamed')).toBeVisible();
  await axeCheck(page);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // columns are stacked: each starts below the previous one
  const tops = await page
    .locator('[data-testid^="column-"]')
    .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().top));
  expect([...tops].sort((a, b) => a - b)).toEqual(tops);
  expect(new Set(tops).size).toBe(4);
});

test('shows an error with Retry when the board cannot load', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.route('**/api/projects/*/board', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/problem+json',
      body: JSON.stringify({ code: 'internal_error', message: 'Broken.' }),
    }),
  );
  await page.goto(projectUrl);
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await axeCheck(page);
});
