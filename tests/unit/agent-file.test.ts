import { describe, it, expect } from 'vitest';
import {
  parseAgentFile,
  renderAgentFile,
  setHeaderValue,
  maxAgentFileLength,
  type AgentSettings,
} from '../../src/shared/agent-file';

const settings: AgentSettings = {
  name: 'Dev Agent',
  role: 'developer',
  provider: 'claude',
  connection: 'Work Claude',
  model: 'claude-sonnet-5-5',
};
const file = [
  '---',
  'name: Dev Agent',
  'role: developer',
  'provider: claude',
  'connection: Work Claude',
  'model: claude-sonnet-5-5',
  '---',
  '',
  '# Developer',
  '',
  'Write small steps.',
].join('\n');

const problems = (text: string) => {
  const result = parseAgentFile(text);
  if (result.ok) throw new Error('expected problems');
  return result.problems;
};

describe('reading an agent file', () => {
  it('returns the settings and the instructions', () => {
    expect(parseAgentFile(file)).toEqual({
      ok: true,
      settings,
      instructions: '# Developer\n\nWrite small steps.',
    });
  });

  it('accepts mixed line endings and keeps the instructions exactly', () => {
    const header = file.split('\n').slice(0, 7).join('\n');
    const body = '# Dev\r\n\r\nKeep   spacing.  \n';
    const text = `${header}\n\n${body}`;
    const result = parseAgentFile(text);
    expect(result.ok && result.instructions).toBe(body);
    expect(setHeaderValue(text, 'model', 'x')).toBe(
      text.replace('model: claude-sonnet-5-5', 'model: x'),
    );
  });

  it('accepts CRLF line endings', () => {
    const result = parseAgentFile(file.replace(/\n/g, '\r\n'));
    expect(result.ok && result.settings).toEqual(settings);
  });

  it('trims values, removes one pair of surrounding quotes, and splits at the first colon', () => {
    const text = file
      .replace('name: Dev Agent', 'name:   "Ops: Night"  ')
      .replace('connection: Work Claude', "connection: 'Work Claude'");
    const result = parseAgentFile(text);
    expect(result.ok && result.settings.name).toBe('Ops: Night');
    expect(result.ok && result.settings.connection).toBe('Work Claude');
  });

  it('ignores blank lines and # comment lines inside the header', () => {
    const text = file.replace(
      'role: developer',
      '\n# the role decides the template\nrole: developer',
    );
    expect(parseAgentFile(text).ok).toBe(true);
  });

  it('allows an empty connection and model', () => {
    const text = file
      .replace('connection: Work Claude', 'connection:')
      .replace('model: claude-sonnet-5-5', 'model: ');
    const result = parseAgentFile(text);
    expect(result.ok && result.settings).toMatchObject({
      connection: '',
      model: '',
    });
  });

  it('allows empty instructions', () => {
    const result = parseAgentFile(file.split('\n').slice(0, 7).join('\n'));
    expect(result.ok && result.instructions).toBe('');
  });
});

describe('problems in an agent file', () => {
  it('needs the header on line 1', () => {
    expect(problems('# Developer\n')).toEqual([
      expect.objectContaining({ line: 1, field: 'header' }),
    ]);
  });

  it('needs the header to be closed', () => {
    expect(problems(file.replace(/\n---\n/, '\n'))).toEqual([
      expect.objectContaining({ line: 1, field: 'header' }),
    ]);
  });

  it('lists every problem together, each with its line', () => {
    const text = file
      .replace('role: developer', 'role: dev')
      .replace('provider: claude\n', '')
      .replace(
        'model: claude-sonnet-5-5',
        'model: claude-sonnet-5-5\ncolour: blue',
      );
    const found = problems(text);
    expect(found).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ line: 3, field: 'role' }),
        expect.objectContaining({ field: 'provider' }),
        expect.objectContaining({ line: 6, field: 'colour' }),
      ]),
    );
    expect(found).toHaveLength(3);
    expect(found.find((p) => p.field === 'role')?.message).toMatch(
      /project_manager, business_analyst, developer, qa or custom/,
    );
  });

  it('reports a duplicated setting at its second line', () => {
    const text = file.replace('role: developer', 'role: developer\nrole: qa');
    expect(problems(text)).toEqual([
      expect.objectContaining({ line: 4, field: 'role' }),
    ]);
  });

  it('reports a header line without a colon', () => {
    const text = file.replace('role: developer', 'role developer');
    expect(problems(text)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ line: 3, field: 'header' }),
      ]),
    );
  });

  it('checks the provider, name and model lengths', () => {
    const text = file
      .replace('provider: claude', 'provider: gemini')
      .replace('name: Dev Agent', `name: ${'x'.repeat(81)}`)
      .replace('model: claude-sonnet-5-5', `model: ${'m'.repeat(201)}`);
    expect(
      problems(text)
        .map((p) => p.field)
        .sort(),
    ).toEqual(['model', 'name', 'provider']);
    expect(problems(file.replace('name: Dev Agent', 'name:'))).toEqual([
      expect.objectContaining({ line: 2, field: 'name' }),
    ]);
  });

  it('refuses a file over the size limit', () => {
    const text = file + 'x'.repeat(maxAgentFileLength);
    expect(problems(text)).toEqual([
      expect.objectContaining({ line: 1, field: 'file' }),
    ]);
  });
});

describe('writing an agent file', () => {
  it('renders a file that reads back to the same settings and instructions', () => {
    const text = renderAgentFile(settings, 'Write small steps.');
    expect(parseAgentFile(text)).toEqual({
      ok: true,
      settings,
      instructions: 'Write small steps.',
    });
  });

  it('round-trips values that need quotes', () => {
    for (const name of ['"Ops"', "'Ops'", ' Ops', 'A: B', '# not a comment']) {
      const tricky = { ...settings, name, connection: name };
      const result = parseAgentFile(renderAgentFile(tricky, ''));
      expect(result.ok && result.settings.name, name).toBe(name);
      expect(result.ok && result.settings.connection, name).toBe(name);
    }
  });

  it('changes one header line and nothing else', () => {
    const crlf = file.replace(/\n/g, '\r\n');
    const changed = setHeaderValue(crlf, 'model', 'claude-opus-5-5');
    expect(changed).toBe(
      crlf.replace('model: claude-sonnet-5-5', 'model: claude-opus-5-5'),
    );
  });

  it('adds a missing setting just before the end of the header', () => {
    const changed = setHeaderValue(
      file.replace('model: claude-sonnet-5-5\n', ''),
      'model',
      'claude-opus-5-5',
    );
    expect(parseAgentFile(changed).ok && changed).toContain(
      'model: claude-opus-5-5\n---',
    );
  });

  it('leaves a file without a header unchanged', () => {
    expect(setHeaderValue('# hello', 'model', 'x')).toBe('# hello');
  });
});
