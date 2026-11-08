/**
 * Reads list prices from the providers' official pricing pages (feature 002,
 * research R3, R7). Both pages are served as Markdown. Only these two hosts are
 * contacted, with no credentials, a 15 s timeout and a 2 MB size cap.
 */
export const officialPages = {
  claude: 'https://platform.claude.com/docs/en/about-claude/pricing.md',
  codex: 'https://developers.openai.com/api/docs/pricing.md',
} as const;

export interface OfficialPrice {
  model: string;
  inputPricePerMTok: string;
  outputPricePerMTok: string;
}
export interface ParsedPage {
  rows: OfficialPrice[];
  /** rows that were found but whose price could not be read; never priced as zero */
  skipped: string[];
}

const timeoutMs = 15_000;
const maxBytes = 2 * 1024 * 1024;
/** A page with fewer readable rows than this has probably changed its layout. */
const minimumRows = 3;

export type PageRead =
  | { ok: true; text: string }
  | { ok: false; reason: 'unreachable' | 'too_large' };

export async function readOfficialPage(url: string): Promise<PageRead> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'text/markdown' },
      redirect: 'error',
      credentials: 'omit',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: false, reason: 'unreachable' };
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
  return { ok: true, text: Buffer.concat(chunks).toString('utf8') };
}

/** The first Markdown table after a heading line, as header cells and data rows. */
function tableAfter(
  page: string,
  heading: string,
): { header: string[]; rows: string[][] } | null {
  const lines = page.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return null;
  let i = start + 1;
  while (i < lines.length && !lines[i]?.trim().startsWith('|')) {
    // another heading before any table means the table is not where expected
    if (/^#{1,3}\s/.test(lines[i]?.trim() ?? '')) return null;
    i++;
  }
  const cells = (line: string) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());
  const headerLine = lines[i];
  const separator = lines[i + 1];
  if (!headerLine || !separator || !/^\|?\s*:?-{3,}/.test(separator.trim()))
    return null;
  const rows: string[][] = [];
  for (let j = i + 2; j < lines.length; j++) {
    const line = lines[j]?.trim() ?? '';
    if (!line.startsWith('|')) break;
    rows.push(cells(line));
  }
  return { header: cells(headerLine), rows };
}

const removeMarkup = (text: string) =>
  text
    .replace(/<sup>.*?<\/sup>/gi, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`/g, '');

/** "$2 / MTok", "$0.25 / MTok<sup>1</sup>" or "$2.00" become "2", "0.25", "2.00". */
function priceOf(cell: string | undefined): string | null {
  if (cell === undefined) return null;
  const text = removeMarkup(cell)
    .replace(/\s*\/\s*MTok\s*$/i, '')
    .trim();
  return /^\$\d+(\.\d{1,6})?$/.test(text) ? text.slice(1) : null;
}

/** "Claude Haiku 5.5 (for prompts up to 100,000 tokens)" becomes "Claude Haiku 5.5". */
const nameOf = (cell: string) =>
  removeMarkup(cell)
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function parseTable(
  page: string,
  heading: string,
  inputColumn: string,
  outputColumn: string,
): {
  parsed: { name: string; input: string; output: string }[];
  skipped: string[];
} | null {
  const table = tableAfter(page, heading);
  if (!table) return null;
  const input = table.header.indexOf(inputColumn);
  const output = table.header.indexOf(outputColumn);
  if (table.header[0] !== 'Model' || input < 0 || output < 0) return null;
  const parsed: { name: string; input: string; output: string }[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const row of table.rows) {
    const name = nameOf(row[0] ?? '');
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const inputPrice = priceOf(row[input]);
    const outputPrice = priceOf(row[output]);
    if (inputPrice === null || outputPrice === null) skipped.push(name);
    else parsed.push({ name, input: inputPrice, output: outputPrice });
  }
  if (parsed.length < minimumRows) return null;
  return { parsed, skipped };
}

/**
 * The Claude page: the "## Model pricing" table, "Base input tokens" and
 * "Output tokens". Names map to model ids through the catalog labels; a name
 * Staplr does not know is ignored. Returns null when the page is unreadable.
 */
export function parseClaudePricing(
  page: string,
  labelToId: Map<string, string>,
): ParsedPage | null {
  const table = parseTable(
    page,
    '## Model pricing',
    'Base input tokens',
    'Output tokens',
  );
  if (!table) return null;
  const rows: OfficialPrice[] = [];
  for (const row of table.parsed) {
    const model = labelToId.get(row.name);
    if (model)
      rows.push({
        model,
        inputPricePerMTok: row.input,
        outputPricePerMTok: row.output,
      });
  }
  return { rows, skipped: table.skipped };
}

/**
 * The OpenAI page: the first table under "### Standard pricing data",
 * "Short context input" and "Short context output", keyed by model id.
 */
export function parseOpenAiPricing(page: string): ParsedPage | null {
  const table = parseTable(
    page,
    '### Standard pricing data',
    'Short context input',
    'Short context output',
  );
  if (!table) return null;
  return {
    rows: table.parsed.map((row) => ({
      model: row.name,
      inputPricePerMTok: row.input,
      outputPricePerMTok: row.output,
    })),
    skipped: table.skipped,
  };
}
