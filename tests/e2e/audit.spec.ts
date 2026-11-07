import Database from 'better-sqlite3';
import { join } from 'node:path';
import { test, expect, axeCheck, signInAsOwner, dataDirFor } from './fixtures';

test.describe.configure({ mode: 'serial' });

test('shows an explicit empty state before anything has been recorded', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.getByRole('link', { name: 'Audit' }).click();
  await expect(page).toHaveURL(/\/audit$/);
  await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
  await expect(page.getByText('No audit entries yet.')).toBeVisible();
  await axeCheck(page);
});

test('lists seeded entries newest first with target name and time, and no secret values', async ({
  page,
}, testInfo) => {
  const db = new Database(join(dataDirFor(testInfo.project.name), 'staplr.db'));
  try {
    const insert = db.prepare(
      'INSERT INTO audit_entry(id,at,action,targetType,targetId,targetName,detail) VALUES(?,?,?,?,?,?,?)',
    );
    insert.run(
      'e2e-a1',
      '2026-11-08T09:00:00.000Z',
      'scc.added',
      'source_control_connection',
      'c-1',
      'work-github',
      JSON.stringify({ platform: 'github' }),
    );
    insert.run(
      'e2e-a2',
      '2026-11-08T10:30:00.000Z',
      'scc.removed',
      'source_control_connection',
      'c-1',
      'work-github',
      JSON.stringify({ platform: 'github' }),
    );
  } finally {
    db.close();
  }
  await signInAsOwner(page);
  await page.goto('/audit');
  const rows = page.getByRole('row');
  // header row + 2 entries
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText('Source control connection removed');
  await expect(rows.nth(1)).toContainText('work-github');
  await expect(rows.nth(2)).toContainText('Source control connection added');
  await expect(rows.nth(1).locator('time')).toHaveAttribute(
    'datetime',
    '2026-11-08T10:30:00.000Z',
  );
  await expect(page.getByText('github', { exact: true })).toHaveCount(0);
  await axeCheck(page);
});
