import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function axeCheck(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
}

export const owner = {
  username: 'owner',
  password: 'e2e-only-long-password',
};

/** Playwright project name ("desktop-first-run", "mobile", …) → API port. */
const apiPorts: Record<string, number> = { desktop: 4310, mobile: 4311 };

/** The installation's data folder, wiped by scripts/dev.mjs at start. */
export function dataDirFor(projectName: string) {
  const id = projectName.replace(/-first-run$/, '');
  return join(tmpdir(), `staplr-e2e-${apiPorts[id] ?? 3000}`);
}

/** The fake GitHub/GitLab for this project's installation (scripts/dev.mjs). */
export function fakePlatformUrl(projectName: string) {
  const id = projectName.replace(/-first-run$/, '');
  return `http://127.0.0.1:${(apiPorts[id] ?? 4310) + 20}`;
}

/** The fake Anthropic Models API for this project's installation. */
export function fakeAnthropicUrl(projectName: string) {
  const id = projectName.replace(/-first-run$/, '');
  return `http://127.0.0.1:${(apiPorts[id] ?? 4310) + 40}`;
}

export async function setFakeAnthropicKey(
  request: APIRequestContext,
  projectName: string,
  key: string,
  profile: { models: string[]; reject?: boolean; failWith?: number },
) {
  const reply = await request.post(
    `${fakeAnthropicUrl(projectName)}/__control/key`,
    { data: { key, profile } },
  );
  expect(reply.ok()).toBe(true);
}

export interface FakeGithubProfile {
  login: string;
  kind: 'classic' | 'fine';
  scopes?: string[];
  revoked?: boolean;
  failWith?: number;
  repos?: {
    id: number;
    fullName: string;
    defaultBranch: string;
    branches?: string[];
    push?: boolean;
    cloneUrl?: string;
  }[];
}

export async function setFakeGithubToken(
  request: APIRequestContext,
  projectName: string,
  token: string,
  profile: FakeGithubProfile,
) {
  const reply = await request.post(
    `${fakePlatformUrl(projectName)}/__control/github/token`,
    { data: { token, profile } },
  );
  expect(reply.ok()).toBe(true);
}

export async function createOwner(page: Page) {
  await page.getByLabel('Username').fill(owner.username);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByLabel('Confirm password').fill(owner.password);
  await page.getByRole('button', { name: 'Create account' }).click();
}

/** Signs in, creating the owner first if this installation has none yet. */
export async function signInAsOwner(page: Page) {
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  const path = new URL(page.url()).pathname;
  if (path === '/setup') await createOwner(page);
  else if (path === '/sign-in') {
    await page.getByLabel('Username').fill(owner.username);
    await page.getByLabel('Password', { exact: true }).fill(owner.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
  }
  // signed in: the top navigation bar's menu button is there at every width
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'Menu' }),
  ).toBeVisible();
}

export { test, expect } from '@playwright/test';
