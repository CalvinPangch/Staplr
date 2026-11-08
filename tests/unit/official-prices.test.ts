import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseClaudePricing,
  parseOpenAiPricing,
  officialPages,
} from '../../src/server/modules/prices/official';

const claudePage = readFileSync('tests/fixtures/pricing-claude.md', 'utf8');
const openaiPage = readFileSync('tests/fixtures/pricing-openai.md', 'utf8');
const changedLayout = readFileSync(
  'tests/fixtures/pricing-openai-changed-layout.md',
  'utf8',
);
const decimal = /^\d+(\.\d{1,6})?$/;
const byModel = <T extends { model: string }>(rows: T[]) =>
  Object.fromEntries(rows.map((r) => [r.model, r]));

describe('the official page addresses', () => {
  it('are the Markdown pages of the two providers', () => {
    expect(officialPages.claude).toBe(
      'https://platform.claude.com/docs/en/about-claude/pricing.md',
    );
    expect(officialPages.codex).toBe(
      'https://developers.openai.com/api/docs/pricing.md',
    );
  });
});

describe('reading the Claude pricing page', () => {
  const labels = new Map([
    ['Claude Fable 5.1', 'claude-fable-5-1'],
    ['Claude Opus 5.5', 'claude-opus-5-5'],
    ['Claude Sonnet 5.5', 'claude-sonnet-5-5'],
    ['Claude Haiku 5.5', 'claude-haiku-5-5'],
  ]);

  it('takes base input and output prices from the Model pricing table', () => {
    const result = parseClaudePricing(claudePage, labels);
    expect(result).not.toBeNull();
    const rows = byModel(result?.rows ?? []);
    expect(rows['claude-sonnet-5-5']).toEqual({
      model: 'claude-sonnet-5-5',
      inputPricePerMTok: '2',
      outputPricePerMTok: '10',
    });
    expect(rows['claude-opus-5-5']).toMatchObject({
      inputPricePerMTok: '4',
      outputPricePerMTok: '20',
    });
    // the first of two rows for one model is the standard price
    expect(rows['claude-haiku-5-5']).toMatchObject({
      inputPricePerMTok: '0.10',
      outputPricePerMTok: '0.50',
    });
    for (const row of result?.rows ?? []) {
      expect(row.inputPricePerMTok).toMatch(decimal);
      expect(row.outputPricePerMTok).toMatch(decimal);
    }
  });

  it('ignores names Staplr cannot map to a model id', () => {
    const result = parseClaudePricing(claudePage, labels);
    expect(result?.rows.map((r) => r.model).sort()).toEqual([
      'claude-fable-5-1',
      'claude-haiku-5-5',
      'claude-opus-5-5',
      'claude-sonnet-5-5',
    ]);
  });

  it('removes footnote markers instead of failing', () => {
    const page = claudePage.replace(
      '| Claude Sonnet 5.5 ',
      '| Claude Sonnet 5.5<sup>4</sup> ',
    );
    const rows = byModel(parseClaudePricing(page, labels)?.rows ?? []);
    expect(rows['claude-sonnet-5-5']?.inputPricePerMTok).toBe('2');
  });

  it('skips and reports a row whose price does not parse; never zero', () => {
    const page = claudePage.replace(
      /\| Claude Opus 5\.5 +\| \$4 \/ MTok/,
      '| Claude Opus 5.5 | Contact sales',
    );
    const result = parseClaudePricing(page, labels);
    expect(result?.rows.some((r) => r.model === 'claude-opus-5-5')).toBe(false);
    expect(result?.skipped).toContain('Claude Opus 5.5');
  });

  it('counts the page as unreadable when the heading is missing', () => {
    expect(
      parseClaudePricing(
        claudePage.replace('## Model pricing', '## Prices'),
        labels,
      ),
    ).toBeNull();
  });
});

describe('reading the OpenAI pricing page', () => {
  it('takes short-context input and output from the first standard table', () => {
    const result = parseOpenAiPricing(openaiPage);
    expect(result).not.toBeNull();
    const rows = byModel(result?.rows ?? []);
    expect(rows['gpt-6.1-sol']).toEqual({
      model: 'gpt-6.1-sol',
      inputPricePerMTok: '2.00',
      outputPricePerMTok: '10.00',
    });
    expect(rows['gpt-6-luna']).toMatchObject({
      inputPricePerMTok: '0.10',
      outputPricePerMTok: '0.50',
    });
    // a qualifier in brackets is removed from the id; -pro rows stay their own id
    expect(rows['gpt-5.5']).toMatchObject({ inputPricePerMTok: '5.00' });
    expect(rows['gpt-5.5-pro']).toMatchObject({ inputPricePerMTok: '30.00' });
    // only the first table under the heading is read
    expect(rows['gpt-5.4-mini']).toBeUndefined();
    expect(rows['gpt-6-cyber']).toBeUndefined();
  });

  it('counts a changed layout as unreadable', () => {
    expect(parseOpenAiPricing(changedLayout)).toBeNull();
  });

  it('counts fewer than three readable rows as unreadable', () => {
    const page = [
      '### Standard pricing data',
      '',
      '| Model | Short context input | Short context output |',
      '| --- | --- | --- |',
      '| gpt-a | $1.00 | $2.00 |',
      '| gpt-b | $1.00 | $2.00 |',
      '| gpt-c | - | - |',
    ].join('\n');
    expect(parseOpenAiPricing(page)).toBeNull();
  });

  it('skips and reports a row with a dash or a malformed price', () => {
    const page = [
      '### Standard pricing data',
      '',
      '| Model | Short context input | Short context output |',
      '| --- | --- | --- |',
      '| gpt-a | $1.00 | $2.00 |',
      '| gpt-b | $1.5 | $3 |',
      '| gpt-c | $0.25 | $0.75 |',
      '| gpt-d | - | $1.00 |',
      '| gpt-e | $1.1234567 | $1.00 |',
    ].join('\n');
    const result = parseOpenAiPricing(page);
    expect(result?.rows.map((r) => r.model)).toEqual([
      'gpt-a',
      'gpt-b',
      'gpt-c',
    ]);
    expect(result?.skipped).toEqual(['gpt-d', 'gpt-e']);
  });
});
