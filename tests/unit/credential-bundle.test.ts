import { describe, it, expect } from 'vitest';
import {
  BundleError,
  authFileFromBundle,
  buildTar,
  bundleFromAuthFile,
  extractAuthFile,
  parseTar,
} from '../../src/server/modules/providers/credential-bundle';
import { openBlob, sealToBlob } from '../../src/server/lib/crypto';

const key = Buffer.alloc(32, 3);
const secret = 'codex-TESTbundleSecret-00000000000000000001';
const authJson = Buffer.from(
  JSON.stringify({ tokens: { access_token: secret } }),
  'utf8',
);

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof BundleError ? error.code : 'other';
  }
  return undefined;
}

/** Rewrites one header byte and fixes the checksum, to craft hostile entries. */
function withType(tar: Buffer, type: string): Buffer {
  const copy = Buffer.from(tar);
  copy.write(type, 156, 1, 'latin1');
  copy.fill(' ', 148, 156);
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += copy[i] ?? 0;
  copy.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'latin1');
  return copy;
}

describe('Codex credential bundle', () => {
  it('seals and restores the credential file byte for byte, with no plaintext in the blob', () => {
    const bundle = bundleFromAuthFile(authJson);
    const blob = sealToBlob(bundle, key);
    expect(blob.toString('latin1')).not.toContain(secret);
    const restored = openBlob(blob, key);
    expect(restored.equals(bundle)).toBe(true);
    expect(authFileFromBundle(restored).equals(authJson)).toBe(true);
  });

  it('builds the same archive for the same content (deterministic, clean headers)', () => {
    expect(
      bundleFromAuthFile(authJson).equals(bundleFromAuthFile(authJson)),
    ).toBe(true);
    const [entry] = parseTar(bundleFromAuthFile(authJson));
    expect(entry?.name).toBe('.codex/auth.json');
  });

  it('reports login_not_complete when the credential file is absent', () => {
    expect(extractAuthFile(buildTar([]))).toBeNull();
    expect(extractAuthFile(Buffer.alloc(0))).toBeNull();
    expect(codeOf(() => authFileFromBundle(buildTar([])))).toBe(
      'login_not_complete',
    );
  });

  it('rejects Claude subscription files and every other path', () => {
    for (const name of [
      '.claude/.credentials.json',
      '.claude.json',
      '../.codex/auth.json',
      '/etc/passwd',
      '.codex/config.toml',
    ])
      expect(
        codeOf(() => extractAuthFile(buildTar([{ name, content: authJson }]))),
        name,
      ).toBe('unsupported_credential_file');
    expect(
      codeOf(() =>
        extractAuthFile(
          buildTar([
            { name: '.codex/auth.json', content: authJson },
            { name: '.claude.json', content: authJson },
          ]),
        ),
      ),
    ).toBe('unsupported_credential_file');
  });

  it('rejects links, directories, corrupt headers, truncation and oversize files', () => {
    const good = bundleFromAuthFile(authJson);
    for (const type of ['1', '2', '5', 'x', 'L'])
      expect(
        codeOf(() => extractAuthFile(withType(good, type))),
        type,
      ).toBe('invalid_bundle');
    const corrupt = Buffer.from(good);
    corrupt[10] = (corrupt[10] ?? 0) ^ 0x01;
    expect(codeOf(() => extractAuthFile(corrupt))).toBe('invalid_bundle');
    expect(codeOf(() => extractAuthFile(good.subarray(0, 540)))).toBe(
      'invalid_bundle',
    );
    expect(
      codeOf(() =>
        extractAuthFile(
          buildTar([
            {
              name: '.codex/auth.json',
              content: Buffer.alloc(1024 * 1024 + 1),
            },
          ]),
        ),
      ),
    ).toBe('invalid_bundle');
  });
});
