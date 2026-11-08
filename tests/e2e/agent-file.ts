import type { Page } from '@playwright/test';
import { expect } from './fixtures';
import { setHeaderValue, type AgentFileKey } from '../../src/shared/agent-file';

/**
 * Drives the agent editor (feature 003): an agent is one Markdown file, a
 * settings header and its instructions.
 */
export const editor = (page: Page) => page.getByLabel('Agent file (Markdown)');

export async function choose(
  page: Page,
  label: string | RegExp,
  option: string | RegExp,
) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}

/** Opens a new agent from a role template, e.g. "Developer". */
export async function startAgent(page: Page, template: string) {
  await page.goto('/agents/new');
  await page
    .getByRole('button', { name: new RegExp(`^${template}`) })
    .first()
    .click();
  await expect(editor(page)).toBeVisible();
}

/** Changes header settings by editing the text, as an owner typing would. */
export async function setHeader(
  page: Page,
  changes: Partial<Record<AgentFileKey, string>>,
) {
  let text = await editor(page).inputValue();
  for (const [key, value] of Object.entries(changes))
    text = setHeaderValue(text, key as AgentFileKey, value ?? '');
  await editor(page).fill(text);
}

export async function insertConnection(page: Page, connection: string) {
  await choose(page, /^Insert connection/, connection);
}

export async function insertModel(page: Page, model: string | RegExp) {
  await choose(page, 'Insert model', model);
}

/** Creates an agent from a template on one screen and returns to the list. */
export async function createAgent(
  page: Page,
  spec: {
    template: string;
    name: string;
    provider?: 'claude' | 'codex';
    connection: string;
    model: string | RegExp;
  },
) {
  await startAgent(page, spec.template);
  await setHeader(page, {
    name: spec.name,
    ...(spec.provider ? { provider: spec.provider } : {}),
  });
  await insertConnection(page, spec.connection);
  await insertModel(page, spec.model);
  await page.getByRole('button', { name: 'Create agent' }).click();
  await expect(page).toHaveURL(/\/agents$/);
}
