import { test, expect, signInAsOwner, axeCheck } from './fixtures';

test('keeps projects in the sidebar and groups workspace controls in settings', async ({
  page,
}) => {
  await signInAsOwner(page);
  const navigation = page.getByRole('navigation', { name: 'Main' });
  await expect(
    navigation.getByRole('link', { name: 'Projects', exact: true }),
  ).toBeVisible();
  await expect(
    navigation.getByRole('link', { name: 'Agents', exact: true }),
  ).toHaveCount(0);
  await navigation.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Settings', exact: true }),
  ).toBeVisible();
  for (const name of [
    'Source control',
    'Providers and prices',
    'Agents',
    'Audit log',
    'Diagnostics',
  ]) {
    await expect(page.getByRole('link', { name })).toBeVisible();
  }
  await expect(page.getByLabel('Theme')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await axeCheck(page);
  await page.getByRole('link', { name: 'Agents', exact: false }).click();
  await expect(
    page.getByRole('heading', { name: 'Agents', exact: true }),
  ).toBeVisible();
});
