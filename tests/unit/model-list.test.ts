import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  realProfile,
  stubProfile,
} from '../../src/server/modules/sandbox/profiles';
import { mapLimit } from '../../src/server/modules/providers/codex';

const fixture = readFileSync('tests/fixtures/codex-debug-models.json');

describe('reading the Codex model list', () => {
  const parse = realProfile('img').parseModelList;

  it('keeps listed models and ignores hidden ones', () => {
    const models = parse(fixture);
    expect(models).not.toBeNull();
    const ids = models?.map((m) => m.id) ?? [];
    expect(ids).toContain('gpt-6-astra');
    expect(ids).toContain('gpt-5.5');
    expect(ids).not.toContain('codex-auto-review');
    expect(ids).not.toContain('gpt-daybreak-blue-latest');
    expect(models?.find((m) => m.id === 'gpt-6-astra')?.label).toBe(
      'GPT-6-Astra',
    );
  });

  it('rejects output that is not a model list', () => {
    expect(parse(Buffer.from('not json'))).toBeNull();
    expect(parse(Buffer.from('{"something":"else"}'))).toBeNull();
    expect(parse(Buffer.from(''))).toBeNull();
  });

  it('skips entries whose id or name is out of bounds', () => {
    const list = {
      models: [
        { slug: '', display_name: 'Empty', visibility: 'list' },
        { slug: 'x'.repeat(201), display_name: 'Too long', visibility: 'list' },
        { slug: 'ok-model', display_name: 'n'.repeat(121), visibility: 'list' },
        { slug: 'good', display_name: 'Good', visibility: 'list' },
        { slug: 'no-name', visibility: 'list' },
      ],
    };
    expect(parse(Buffer.from(JSON.stringify(list)))).toEqual([
      { id: 'good', label: 'Good' },
      { id: 'no-name', label: 'no-name' },
    ]);
  });

  it('the stub profile reads the same format', () => {
    expect(stubProfile('img').parseModelList(fixture)?.length).toBe(
      realProfile('img').parseModelList(fixture)?.length,
    );
  });

  it('lists through the CLI with the file credential store', () => {
    expect(realProfile('img').listCommand).toEqual([
      'codex',
      '-c',
      'cli_auth_credentials_store="file"',
      'debug',
      'models',
    ]);
    expect(stubProfile('img').listCommand).toEqual(['stub-models']);
  });

  it('asks for the lowest reasoning effort when probing a real model', () => {
    expect(realProfile('img').probeCommand('m')).toContain(
      'model_reasoning_effort="low"',
    );
  });
});

describe('running probes at most two at a time', () => {
  it('never exceeds the limit and keeps the order of results', async () => {
    let running = 0;
    let peak = 0;
    const results = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5 * (6 - n)));
      running--;
      return n * 10;
    });
    expect(peak).toBe(2);
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });
});
