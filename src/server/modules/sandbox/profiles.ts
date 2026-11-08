import type { ExecResult } from './driver.js';

export type StatusVerdict = 'ok' | 'rejected' | 'unavailable';
export type ProbeVerdict = 'available' | 'denied' | 'rejected' | 'unavailable';

export const sandboxHome = '/home/agent';
export const authFile = '.codex/auth.json';

/**
 * How Staplr drives the Codex CLI inside the sandbox, and how it reads the
 * result. The `stub` profile belongs to the test image. The `real` profile's
 * commands and exit-code handling are NOT verified against a pinned CLI yet
 * (task T071), so it classifies conservatively: it only reports a login as
 * rejected when the credential file is gone, and treats every other failure as
 * "could not check", which never changes a status.
 */
export interface CodexProfile {
  name: 'real' | 'stub';
  image: string;
  loginCommand: string[];
  statusCommand: string[];
  probeCommand(model: string): string[];
  /** Prints the model catalog this login can see, as JSON (feature 002). */
  listCommand: string[];
  /** The listed models, or null when the output is not a model list. */
  parseModelList(stdout: Buffer): DiscoveredModel[] | null;
  classifyStatus(result: ExecResult): StatusVerdict;
  classifyProbe(result: ExecResult): ProbeVerdict;
  /** Reads the credential's expiry from auth.json when the format is known. */
  readExpiry(authJson: string): string | null;
  instructions: string;
}

export interface DiscoveredModel {
  id: string;
  label: string;
}

/**
 * Reads `codex debug models` output: `{ models: [{ slug, display_name, visibility }] }`.
 * Only entries with visibility "list" are offered; ids must be 1-200 characters and labels
 * 1-120 (a missing label falls back to the id).
 */
export function parseModelList(stdout: Buffer): DiscoveredModel[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.toString('utf8'));
  } catch {
    return null;
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('models' in parsed) ||
    !Array.isArray(parsed.models)
  )
    return null;
  const models: DiscoveredModel[] = [];
  for (const entry of parsed.models as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const {
      slug,
      display_name: name,
      visibility,
    } = entry as {
      slug?: unknown;
      display_name?: unknown;
      visibility?: unknown;
    };
    if (visibility !== 'list' || typeof slug !== 'string') continue;
    if (slug.length < 1 || slug.length > 200) continue;
    const label = typeof name === 'string' && name.length > 0 ? name : slug;
    if (label.length > 120) continue;
    models.push({ id: slug, label });
  }
  return models;
}

const instructions =
  'Sign in with your ChatGPT account using the device code shown in the terminal: open the link in your own browser, enter the code, and approve. If device-code sign-in is not offered, enable it in your ChatGPT security settings first. When the terminal says you are signed in, choose “I’ve finished logging in”. Codex may use your subscription’s usage allowance.';

export function stubProfile(image: string): CodexProfile {
  return {
    name: 'stub',
    image,
    loginCommand: ['stub-login'],
    statusCommand: ['stub-status'],
    probeCommand: (model) => ['stub-probe', model],
    listCommand: ['stub-models'],
    parseModelList,
    classifyStatus: (r) =>
      r.timedOut
        ? 'unavailable'
        : r.exitCode === 0
          ? 'ok'
          : r.exitCode === 75
            ? 'unavailable'
            : 'rejected',
    classifyProbe(r) {
      if (r.timedOut) return 'unavailable';
      if (r.exitCode === 0) return 'available';
      if (r.exitCode === 3) return 'denied';
      if (r.exitCode === 2 || r.exitCode === 1) return 'rejected';
      return 'unavailable';
    },
    readExpiry(authJson) {
      try {
        const parsed: unknown = JSON.parse(authJson);
        const value =
          typeof parsed === 'object' &&
          parsed !== null &&
          'expires_at' in parsed
            ? parsed.expires_at
            : null;
        return typeof value === 'string' && !Number.isNaN(Date.parse(value))
          ? new Date(value).toISOString()
          : null;
      } catch {
        return null;
      }
    },
    instructions,
  };
}

/** Keeps the login in ~/.codex/auth.json (the sandbox home) instead of an OS keyring. */
const fileStore = ['-c', 'cli_auth_credentials_store="file"'];

export function realProfile(image: string): CodexProfile {
  return {
    name: 'real',
    image,
    loginCommand: ['codex', 'login', ...fileStore, '--device-auth'],
    statusCommand: ['codex', 'login', ...fileStore, 'status'],
    listCommand: ['codex', ...fileStore, 'debug', 'models'],
    parseModelList,
    probeCommand: (model) => [
      'codex',
      ...fileStore,
      '-c',
      'model_reasoning_effort="low"',
      'exec',
      '--model',
      model,
      '--skip-git-repo-check',
      'Reply with the single word OK.',
    ],
    classifyStatus: (r) =>
      r.timedOut ? 'unavailable' : r.exitCode === 0 ? 'ok' : 'unavailable',
    classifyProbe: (r) =>
      r.timedOut
        ? 'unavailable'
        : r.exitCode === 0
          ? 'available'
          : 'unavailable',
    readExpiry: () => null,
    instructions,
  };
}
