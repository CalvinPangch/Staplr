import { authFile } from '../sandbox/profiles.js';

/**
 * Credential bundles are tar archives of the Codex CLI's own credential file,
 * read out of a sandbox by running `tar` through `docker exec` (never the
 * Docker archive API, research R5). Whatever a container hands back is parsed
 * strictly here and re-built before it is stored or restored, so a container
 * can never smuggle other files, paths or links into another container.
 * Claude subscription files are deliberately not on the allow-list.
 */
export type BundleErrorCode =
  'login_not_complete' | 'unsupported_credential_file' | 'invalid_bundle';

export class BundleError extends Error {
  readonly code: BundleErrorCode;
  constructor(code: BundleErrorCode, message: string) {
    super(message);
    this.name = 'BundleError';
    this.code = code;
  }
}

const allowed = new Set([authFile]);
const block = 512;
const maxFileBytes = 1024 * 1024;

function octal(buffer: Buffer): number {
  const text = buffer.toString('latin1').replace(/\0.*$/s, '').trim();
  if (!/^[0-7]*$/.test(text))
    throw new BundleError('invalid_bundle', 'Malformed archive.');
  return text === '' ? 0 : Number.parseInt(text, 8);
}

function field(buffer: Buffer): string {
  return buffer.toString('utf8').replace(/\0.*$/s, '');
}

export interface TarEntry {
  name: string;
  content: Buffer;
}

/** Parses an archive that contains only regular files; anything else is invalid. */
export function parseTar(tar: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  while (offset + block <= tar.length) {
    const header = tar.subarray(offset, offset + block);
    if (header.every((byte) => byte === 0)) break;
    const checksum = octal(header.subarray(148, 156));
    let sum = 0;
    for (let i = 0; i < block; i++)
      sum += i >= 148 && i < 156 ? 32 : (header[i] ?? 0);
    if (sum !== checksum)
      throw new BundleError('invalid_bundle', 'Corrupt archive header.');
    const type = String.fromCharCode(header[156] ?? 0);
    if (type !== '0' && type !== '\0')
      throw new BundleError(
        'invalid_bundle',
        'Only regular files are accepted.',
      );
    const prefix = field(header.subarray(345, 500));
    const name = (prefix ? `${prefix}/` : '') + field(header.subarray(0, 100));
    const size = octal(header.subarray(124, 136));
    if (size > maxFileBytes)
      throw new BundleError(
        'invalid_bundle',
        'A file in the archive is too large.',
      );
    const start = offset + block;
    if (start + size > tar.length)
      throw new BundleError('invalid_bundle', 'The archive is truncated.');
    entries.push({
      name,
      content: Buffer.from(tar.subarray(start, start + size)),
    });
    offset = start + Math.ceil(size / block) * block;
  }
  return entries;
}

/** Builds a minimal, clean ustar archive. */
export function buildTar(files: TarEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const file of files) {
    const header = Buffer.alloc(block);
    header.write(file.name, 0, 100, 'utf8');
    header.write('0000600\0', 100, 8, 'latin1');
    header.write('0001750\0', 108, 8, 'latin1'); // uid 1000
    header.write('0001750\0', 116, 8, 'latin1'); // gid 1000
    header.write(
      `${file.content.length.toString(8).padStart(11, '0')}\0`,
      124,
      12,
      'latin1',
    );
    header.write('00000000000\0', 136, 12, 'latin1'); // mtime 0: deterministic
    header.fill(' ', 148, 156);
    header.write('0', 156, 1, 'latin1');
    header.write('ustar\0', 257, 6, 'latin1');
    header.write('00', 263, 2, 'latin1');
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'latin1');
    parts.push(header, file.content);
    const pad = (block - (file.content.length % block)) % block;
    if (pad) parts.push(Buffer.alloc(pad));
  }
  parts.push(Buffer.alloc(block * 2));
  return Buffer.concat(parts);
}

/**
 * The CLI's credential file from an archive the sandbox produced, or null when
 * the archive holds no entries (nothing to read: the login is not finished).
 */
export function extractAuthFile(tar: Buffer): Buffer | null {
  const entries = parseTar(tar);
  for (const entry of entries)
    if (!allowed.has(entry.name))
      throw new BundleError(
        'unsupported_credential_file',
        'Only the Codex credential file can be saved.',
      );
  return entries.find((e) => e.name === authFile)?.content ?? null;
}

/** A clean bundle for storage or restore, rebuilt from validated content. */
export function bundleFromAuthFile(content: Buffer): Buffer {
  return buildTar([{ name: authFile, content }]);
}

export function authFileFromBundle(bundle: Buffer): Buffer {
  const content = extractAuthFile(bundle);
  if (!content)
    throw new BundleError(
      'login_not_complete',
      'The credential file is missing.',
    );
  return content;
}
