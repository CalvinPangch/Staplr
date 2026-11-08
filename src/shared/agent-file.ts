import { providers, roleTypes, type RoleType } from './status.js';

/**
 * An agent is one Markdown file: a settings header between two `---` lines,
 * then the agent's instructions (feature 003, research R2). The same parser
 * runs in the browser while the owner types and on the server when saving.
 */
export const agentFileKeys = [
  'name',
  'role',
  'provider',
  'connection',
  'model',
] as const;
export type AgentFileKey = (typeof agentFileKeys)[number];

export interface AgentSettings {
  name: string;
  role: RoleType;
  provider: (typeof providers)[number];
  /** a connection name of that provider; empty means none chosen yet */
  connection: string;
  /** a model id; empty means none chosen yet */
  model: string;
}

export interface FileProblem {
  /** 1-based line the problem concerns */
  line: number;
  /** the setting name, or "header" / "file" */
  field: string;
  message: string;
}

export type ParseResult =
  | { ok: true; settings: AgentSettings; instructions: string }
  | { ok: false; problems: FileProblem[] };

export const maxAgentFileLength = 20_000;
const fence = '---';

const unquote = (value: string) =>
  value.length >= 2 &&
  (value[0] === '"' || value[0] === "'") &&
  value.at(-1) === value[0]
    ? value.slice(1, -1)
    : value;

/** A value that would change when read back is written inside double quotes. */
const quote = (value: string) =>
  value !== value.trim() || unquote(value) !== value ? `"${value}"` : value;

const headerLine = (key: AgentFileKey, value: string) =>
  value === '' ? `${key}:` : `${key}: ${quote(value)}`;

/** Where the header is: index of the closing fence, or -1. */
function closingIndex(lines: string[]): number {
  if (lines[0] !== fence) return -1;
  return lines.indexOf(fence, 1);
}

/**
 * Lines plus the line break that followed each (LF, CRLF or none), so a file
 * with mixed line endings is read correctly and rebuilt character for character.
 */
function splitLines(text: string): { lines: string[]; breaks: string[] } {
  const parts = text.split(/(\r?\n)/);
  const lines: string[] = [];
  const breaks: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    lines.push(parts[i] ?? '');
    breaks.push(parts[i + 1] ?? '');
  }
  return { lines, breaks };
}
const joinLines = (lines: string[], breaks: string[]) =>
  lines.map((line, i) => line + (breaks[i] ?? '')).join('');

/** Everything after the closing --- line; one blank line there is layout. */
function instructionsAfter(
  lines: string[],
  breaks: string[],
  close: number,
): string {
  const body = joinLines(lines.slice(close + 1), breaks.slice(close + 1));
  return body.replace(/^\r?\n/, '');
}

export function parseAgentFile(text: string): ParseResult {
  if (text.length > maxAgentFileLength)
    return {
      ok: false,
      problems: [
        {
          line: 1,
          field: 'file',
          message: `The file is ${text.length.toLocaleString('en')} characters long; the limit is ${maxAgentFileLength.toLocaleString('en')}. Shorten the instructions.`,
        },
      ],
    };
  const { lines, breaks } = splitLines(text);
  if (lines[0] !== fence)
    return {
      ok: false,
      problems: [
        {
          line: 1,
          field: 'header',
          message:
            'The file must start with a settings header: a line with three dashes (---), the settings, then another line with three dashes.',
        },
      ],
    };
  const close = closingIndex(lines);
  if (close < 0)
    return {
      ok: false,
      problems: [
        {
          line: 1,
          field: 'header',
          message:
            'The settings header is not closed. Add a line with three dashes (---) after the last setting.',
        },
      ],
    };

  const problems: FileProblem[] = [];
  const found = new Map<AgentFileKey, string>();
  for (let i = 1; i < close; i++) {
    const line = i + 1;
    const raw = lines[i] ?? '';
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const colon = raw.indexOf(':');
    if (colon < 0) {
      problems.push({
        line,
        field: 'header',
        message: `"${trimmed}" is not a setting. Write each setting as "name: value".`,
      });
      continue;
    }
    const key = raw.slice(0, colon).trim();
    const value = unquote(raw.slice(colon + 1).trim());
    if (!(agentFileKeys as readonly string[]).includes(key)) {
      problems.push({
        line,
        field: key || 'header',
        message: `"${key}" is not a setting. The header takes only name, role, provider, connection and model.`,
      });
      continue;
    }
    const known = key as AgentFileKey;
    if (found.has(known)) {
      problems.push({
        line,
        field: known,
        message: `${known} is set twice. Keep one ${known} line.`,
      });
      continue;
    }
    found.set(known, value);
    const issue = checkValue(known, value);
    if (issue) problems.push({ line, field: known, message: issue });
  }
  for (const key of agentFileKeys)
    if (!found.has(key))
      problems.push({
        line: close + 1,
        field: key,
        message: `The header has no ${key} line. Add "${key}:" before the closing ---${key === 'connection' || key === 'model' ? ' (it may be left empty)' : ''}.`,
      });
  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    settings: {
      name: found.get('name') ?? '',
      role: found.get('role') as RoleType,
      provider: found.get('provider') as AgentSettings['provider'],
      connection: found.get('connection') ?? '',
      model: found.get('model') ?? '',
    },
    instructions: instructionsAfter(lines, breaks, close),
  };
}

function checkValue(key: AgentFileKey, value: string): string | null {
  switch (key) {
    case 'name':
      return value.length >= 1 && value.length <= 80
        ? null
        : 'Enter a name of 1 to 80 characters.';
    case 'role':
      return (roleTypes as readonly string[]).includes(value)
        ? null
        : `Unknown role "${value}". Use project_manager, business_analyst, developer, qa or custom.`;
    case 'provider':
      return (providers as readonly string[]).includes(value)
        ? null
        : `Unknown provider "${value}". Use claude or codex.`;
    case 'connection':
      return value.length <= 80
        ? null
        : 'A connection name is at most 80 characters.';
    case 'model':
      return value.length <= 200
        ? null
        : 'A model id is at most 200 characters.';
  }
}

/** A complete file from settings and instructions. */
export function renderAgentFile(
  settings: AgentSettings,
  instructions: string,
): string {
  return [
    fence,
    ...agentFileKeys.map((key) => headerLine(key, settings[key])),
    fence,
    '',
    instructions,
  ].join('\n');
}

/**
 * Changes one setting and leaves every other character as it was. A missing
 * setting is added just before the closing ---. A file without a header is
 * returned unchanged.
 */
export function setHeaderValue(
  text: string,
  key: AgentFileKey,
  value: string,
): string {
  const { lines, breaks } = splitLines(text);
  const close = closingIndex(lines);
  if (close < 0) return text;
  const index = settingIndex(lines, close, key);
  if (index >= 0) lines[index] = headerLine(key, value);
  else {
    lines.splice(close, 0, headerLine(key, value));
    breaks.splice(close, 0, breaks[close - 1] || '\n');
  }
  return joinLines(lines, breaks);
}

function settingIndex(lines: string[], close: number, key: AgentFileKey) {
  return lines.findIndex(
    (line, i) =>
      i > 0 &&
      i < close &&
      line.includes(':') &&
      line.slice(0, line.indexOf(':')).trim() === key,
  );
}

/**
 * The 1-based line of a setting in the header; the closing --- line when the
 * setting is missing, or 1 when there is no header.
 */
export function headerLineOf(text: string, key: AgentFileKey): number {
  const { lines } = splitLines(text);
  const close = closingIndex(lines);
  if (close < 0) return 1;
  const index = settingIndex(lines, close, key);
  return (index >= 0 ? index : close) + 1;
}

/** One setting as written, even while other parts of the file have problems. */
export function headerValue(text: string, key: AgentFileKey): string {
  const { lines } = splitLines(text);
  const close = closingIndex(lines);
  if (close < 0) return '';
  const line = lines[settingIndex(lines, close, key)];
  return line === undefined
    ? ''
    : unquote(line.slice(line.indexOf(':') + 1).trim());
}

/** The instructions part of a file, or null when the header cannot be found. */
export function instructionsOf(text: string): string | null {
  const { lines, breaks } = splitLines(text);
  const close = closingIndex(lines);
  if (close < 0) return null;
  return instructionsAfter(lines, breaks, close);
}

/** Replaces the instructions and keeps the header exactly as written. */
export function replaceInstructions(
  text: string,
  instructions: string,
): string {
  const { lines, breaks } = splitLines(text);
  const close = closingIndex(lines);
  if (close < 0) return text;
  const lineBreak = breaks[0] || '\n';
  const header = joinLines(lines.slice(0, close), breaks.slice(0, close));
  return `${header}${fence}${lineBreak}${lineBreak}${instructions}`;
}
