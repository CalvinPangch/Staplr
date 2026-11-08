import {
  test,
  expect,
  axeCheck,
  signInAsOwner,
  setFakeGithubToken,
} from './fixtures';

test.describe.configure({ mode: 'serial' });

const valid = 'ghp_e2eValidTokenValue0001';
const publicOnly = 'ghp_e2ePublicOnlyToken0002';
const second = 'ghp_e2eSecondTokenValue0003';

async function openSettings(page: import('@playwright/test').Page) {
  await signInAsOwner(page);
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await page.getByRole('link', { name: 'Source control' }).click();
  await expect(page).toHaveURL(/\/settings\/source-control$/);
  await expect(
    page.getByRole('heading', { name: 'Source control', level: 1 }),
  ).toBeVisible();
}

async function addConnection(
  page: import('@playwright/test').Page,
  name: string,
  token: string,
) {
  await page.getByRole('button', { name: 'Add connection' }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Add a source control connection',
  });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel('Access token').fill(token);
  await dialog.getByRole('button', { name: 'Add connection' }).click();
  return dialog;
}

test('starts with an empty state that says what to do', async ({ page }) => {
  await openSettings(page);
  await expect(
    page.getByText('No source control connections yet.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Add connection' }),
  ).toBeVisible();
  await axeCheck(page);
});

test('rejects a token without the needed permissions and names each one', async ({
  page,
  request,
}, testInfo) => {
  await setFakeGithubToken(request, testInfo.project.name, publicOnly, {
    login: 'octo',
    kind: 'classic',
    scopes: ['public_repo'],
  });
  await openSettings(page);
  const dialog = await addConnection(page, 'limited', publicOnly);
  const error = dialog.getByRole('alert');
  await expect(error).toContainText('Read repository contents');
  await expect(error).toContainText('Push branches');
  await expect(error).toContainText('Create pull/merge requests');
  await expect(
    page.getByRole('listitem').filter({ hasText: 'limited' }),
  ).toHaveCount(0);
  await axeCheck(page);
});

test('adds a connection, shows the token only as its last four characters, and keeps the page accessible', async ({
  page,
  request,
}, testInfo) => {
  await setFakeGithubToken(request, testInfo.project.name, valid, {
    login: 'octo',
    kind: 'classic',
    scopes: ['repo'],
  });
  await openSettings(page);
  await addConnection(page, 'work github', valid);
  const card = page.getByRole('listitem').filter({ hasText: 'work github' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('octo');
  await expect(card).toContainText('…0001');
  await expect(card).toContainText('Connected');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.content()).not.toContain(valid);
  await axeCheck(page);
  await page.setViewportSize({ width: 320, height: 640 });
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await axeCheck(page);
});

test('the add dialog is accessible and validates the form next to each field', async ({
  page,
}) => {
  await openSettings(page);
  await page.getByRole('button', { name: 'Add connection' }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Add a source control connection',
  });
  await axeCheck(page);
  await dialog.getByRole('button', { name: 'Add connection' }).click();
  await expect(dialog.getByLabel('Name')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(
    dialog.getByText('Enter a name of 1 to 80 characters.'),
  ).toBeVisible();
  await expect(dialog.getByText('Enter the access token.')).toBeVisible();
  await dialog.getByLabel('Platform').click();
  await page.getByRole('option', { name: 'GitLab' }).click();
  await expect(dialog.getByLabel('GitLab address')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Check now shows a revoked token as needing attention, then recovers', async ({
  page,
  request,
}, testInfo) => {
  await openSettings(page);
  const card = page.getByRole('listitem').filter({ hasText: 'work github' });
  await setFakeGithubToken(request, testInfo.project.name, valid, {
    login: 'octo',
    kind: 'classic',
    scopes: ['repo'],
    revoked: true,
  });
  await card.getByRole('button', { name: 'Check now' }).click();
  await expect(card).toContainText('Needs attention: revoked');
  await expect(card).toContainText('revoked or removed');
  await setFakeGithubToken(request, testInfo.project.name, valid, {
    login: 'octo',
    kind: 'classic',
    scopes: ['repo'],
  });
  await card.getByRole('button', { name: 'Check now' }).click();
  await expect(card).toContainText('Connected');
  await expect(card).not.toContainText('Needs attention');
});

test('Check all connections re-checks every connection', async ({
  page,
  request,
}, testInfo) => {
  await setFakeGithubToken(request, testInfo.project.name, second, {
    login: 'second-account',
    kind: 'classic',
    scopes: ['repo'],
  });
  await openSettings(page);
  await addConnection(page, 'second', second);
  const first = page.getByRole('listitem').filter({ hasText: 'work github' });
  const other = page.getByRole('listitem').filter({ hasText: 'second' });
  await expect(other).toContainText('Connected');
  await setFakeGithubToken(request, testInfo.project.name, second, {
    login: 'second-account',
    kind: 'classic',
    scopes: ['repo'],
    revoked: true,
  });
  await page.getByRole('button', { name: 'Check all connections' }).click();
  await expect(other).toContainText('Needs attention: revoked');
  await expect(first).toContainText('Connected');
});

test('deleting asks for confirmation, explains the effect, and removes the connection', async ({
  page,
}) => {
  await openSettings(page);
  const card = page.getByRole('listitem').filter({ hasText: 'second' });
  await card.getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText(
    'Projects that use it will show Not ready',
  );
  await axeCheck(page);
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Delete' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete connection' })
    .click();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'second' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('listitem').filter({ hasText: 'work github' }),
  ).toBeVisible();
});

test('replacing a token validates it and keeps the old one when rejected', async ({
  page,
}) => {
  await openSettings(page);
  const card = page.getByRole('listitem').filter({ hasText: 'work github' });
  await card.getByRole('button', { name: 'Replace token' }).click();
  const dialog = page.getByRole('dialog', { name: 'Replace the access token' });
  await dialog
    .getByLabel('New access token')
    .fill('ghp_neverSeenByTheFake9999');
  await dialog.getByRole('button', { name: 'Replace token' }).click();
  await expect(dialog.getByRole('alert')).toContainText('rejected this token');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(card).toContainText('…0001');
});
