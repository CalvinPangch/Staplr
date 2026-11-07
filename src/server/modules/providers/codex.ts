import type { SandboxDriver } from '../sandbox/driver.js';
import {
  authFile,
  sandboxHome,
  type CodexProfile,
  type ProbeVerdict,
} from '../sandbox/profiles.js';
import { bundleFromAuthFile, extractAuthFile } from './credential-bundle.js';

export interface CodexVerifyResult {
  /** rejected: Codex no longer accepts the login. unavailable: nothing is known. */
  auth: 'ok' | 'rejected' | 'unavailable';
  expiresAt: string | null;
  /** one verdict per model that was probed, by exact model id */
  models: Record<string, ProbeVerdict>;
  /** the CLI may refresh its own tokens; present only when the file changed */
  refreshedBundle: Buffer | null;
}

export interface CodexExecutor {
  verify(bundle: Buffer, models: string[]): Promise<CodexVerifyResult>;
}

const unknown: CodexVerifyResult = {
  auth: 'unavailable',
  expiresAt: null,
  models: {},
  refreshedBundle: null,
};

/** Reads the credential file out of a running sandbox through exec-tar. */
export async function readAuthFile(
  driver: SandboxDriver,
  containerId: string,
): Promise<Buffer | null> {
  const result = await driver.exec(containerId, [
    'tar',
    '-c',
    '-C',
    sandboxHome,
    authFile,
  ]);
  if (result.exitCode !== 0 || result.stdout.length === 0) return null;
  return extractAuthFile(result.stdout);
}

/**
 * Checks a stored login in a throwaway sandbox: the bundle is restored into a
 * tmpfs home, the CLI's own status command and exact-model probes run, and the
 * container is destroyed. No model is ever substituted for another.
 */
export function createCodexExecutor(
  driver: SandboxDriver,
  profile: CodexProfile,
): CodexExecutor {
  return {
    async verify(bundle, models) {
      const original = extractAuthFile(bundle);
      if (!original) return { ...unknown, auth: 'rejected' };
      const id = await driver.create();
      try {
        const restore = await driver.exec(
          id,
          ['tar', '-x', '-C', sandboxHome],
          { stdin: bundleFromAuthFile(original) },
        );
        if (restore.exitCode !== 0) return unknown;
        const status = profile.classifyStatus(
          await driver.exec(id, profile.statusCommand),
        );
        if (status !== 'ok') return { ...unknown, auth: status };
        const verdicts: Record<string, ProbeVerdict> = {};
        for (const model of models) {
          const verdict = profile.classifyProbe(
            await driver.exec(id, profile.probeCommand(model), {
              timeoutMs: 120_000,
            }),
          );
          if (verdict === 'rejected') return { ...unknown, auth: 'rejected' };
          verdicts[model] = verdict;
        }
        const after = await readAuthFile(driver, id);
        const changed = after !== null && !after.equals(original);
        return {
          auth: 'ok',
          expiresAt: profile.readExpiry((after ?? original).toString('utf8')),
          models: verdicts,
          refreshedBundle: changed ? bundleFromAuthFile(after) : null,
        };
      } finally {
        await driver.remove(id).catch(() => undefined);
      }
    },
  };
}
