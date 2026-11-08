import type { SandboxDriver } from '../sandbox/driver.js';
import {
  authFile,
  sandboxHome,
  type CodexProfile,
  type DiscoveredModel,
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

export interface CodexDiscoveryResult {
  /** rejected: Codex no longer accepts the login. unavailable: nothing is known. */
  auth: 'ok' | 'rejected' | 'unavailable';
  /** null when the list could not be read; then no model may change state */
  models: (DiscoveredModel & { verdict: ProbeVerdict })[] | null;
  expiresAt: string | null;
  refreshedBundle: Buffer | null;
}

export interface CodexExecutor {
  verify(bundle: Buffer, models: string[]): Promise<CodexVerifyResult>;
  /**
   * Lists the models this login can see and, unless listOnly, checks each one with a
   * minimal request (feature 002). listOnly is the hourly refresh, which costs no allowance.
   */
  discover(
    bundle: Buffer,
    options?: {
      listOnly?: boolean;
      onModel?: (id: string, verdict: ProbeVerdict) => void;
    },
  ): Promise<CodexDiscoveryResult>;
}

/** Runs at most `limit` tasks at once; results keep the input order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await run(items[index] as T);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/** At most two model checks at a time, so discovery stays light on the account. */
const probeConcurrency = 2;
const probeTimeoutMs = 120_000;

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
    async discover(bundle, options = {}) {
      const failed: CodexDiscoveryResult = {
        auth: 'unavailable',
        models: null,
        expiresAt: null,
        refreshedBundle: null,
      };
      const original = extractAuthFile(bundle);
      if (!original) return { ...failed, auth: 'rejected' };
      const id = await driver.create();
      try {
        const restore = await driver.exec(
          id,
          ['tar', '-x', '-C', sandboxHome],
          {
            stdin: bundleFromAuthFile(original),
          },
        );
        if (restore.exitCode !== 0) return failed;
        const status = profile.classifyStatus(
          await driver.exec(id, profile.statusCommand),
        );
        if (status !== 'ok') return { ...failed, auth: status };
        const listing = await driver.exec(id, profile.listCommand, {
          timeoutMs: probeTimeoutMs,
        });
        const listed =
          listing.exitCode === 0 && !listing.timedOut
            ? profile.parseModelList(listing.stdout)
            : null;
        if (!listed) return { ...failed, auth: 'ok' };
        let rejected = false;
        const models = await mapLimit(
          listed,
          probeConcurrency,
          async (model) => {
            if (options.listOnly || rejected)
              return { ...model, verdict: 'unavailable' as ProbeVerdict };
            const verdict = profile.classifyProbe(
              await driver.exec(id, profile.probeCommand(model.id), {
                timeoutMs: probeTimeoutMs,
              }),
            );
            if (verdict === 'rejected') rejected = true;
            else options.onModel?.(model.id, verdict);
            return { ...model, verdict };
          },
        );
        if (rejected) return { ...failed, auth: 'rejected' };
        const after = await readAuthFile(driver, id);
        const changed = after !== null && !after.equals(original);
        return {
          auth: 'ok',
          models,
          expiresAt: profile.readExpiry((after ?? original).toString('utf8')),
          refreshedBundle: changed ? bundleFromAuthFile(after) : null,
        };
      } finally {
        await driver.remove(id).catch(() => undefined);
      }
    },
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
