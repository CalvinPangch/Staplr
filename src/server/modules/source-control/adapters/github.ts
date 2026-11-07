import { Octokit } from '@octokit/rest';
import {
  permissionIds,
  type PermissionId,
} from '../../../../shared/schemas/source-control.js';
import type { PlatformAdapter, VerifyResult } from './types.js';

const everything: PermissionId[] = [...permissionIds];
const timeoutMs = 15_000;

function statusOf(error: unknown): number | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
    ? error.status
    : undefined;
}

function rateLimited(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('response' in error))
    return false;
  const response = error.response as
    { headers?: Record<string, string | number | undefined> } | undefined;
  return String(response?.headers?.['x-ratelimit-remaining']) === '0';
}

function failure(error: unknown): VerifyResult {
  const status = statusOf(error);
  if (status === 401 || (status === 403 && !rateLimited(error)))
    return { ok: false, failure: 'invalid' };
  return { ok: false, failure: 'unavailable' };
}

/**
 * Asks one question and reads the answer from the status code. Network errors,
 * outages and rate limits are rethrown so the caller reports "unavailable".
 */
async function allowed(
  run: () => Promise<unknown>,
  grantedStatuses: number[],
  deniedStatuses: number[],
): Promise<boolean> {
  try {
    await run();
    return true;
  } catch (error) {
    const status = statusOf(error);
    if (status !== undefined && grantedStatuses.includes(status)) return true;
    if (
      status !== undefined &&
      deniedStatuses.includes(status) &&
      !rateLimited(error)
    )
      return false;
    throw error;
  }
}

export function createGithubAdapter(
  apiUrl = 'https://api.github.com',
): PlatformAdapter {
  return {
    async verifyToken(token): Promise<VerifyResult> {
      const octokit = new Octokit({
        auth: token,
        baseUrl: apiUrl,
        request: { signal: AbortSignal.timeout(timeoutMs) },
      });
      try {
        const user = await octokit.request('GET /user');
        const accountName = user.data.login;
        const scopeHeader = user.headers['x-oauth-scopes'];

        // Classic tokens list their scopes; "repo" covers everything we need.
        if (scopeHeader !== undefined) {
          const scopes = String(scopeHeader)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          const hasRepo = scopes.includes('repo');
          return {
            ok: true,
            accountName,
            grantedPermissions: hasRepo ? [...everything] : [],
            missingPermissions: hasRepo ? [] : [...everything],
          };
        }

        // Fine-grained tokens do not list permissions, so probe one repository.
        // The write probes send NO request body: GitHub rejects them with 422
        // when the permission exists (nothing is created) and 403 when it
        // does not.
        const repos = await octokit.request('GET /user/repos', {
          per_page: 1,
          sort: 'pushed',
        });
        const first = repos.data[0];
        if (!first)
          return {
            ok: true,
            accountName,
            grantedPermissions: [],
            missingPermissions: [...everything],
          };
        const base = `/repos/${first.full_name}`;
        const canRead = await allowed(
          () => octokit.request(`GET ${base}/contents`),
          [404],
          [403],
        );
        const canPush = await allowed(
          () =>
            octokit.request(`PUT ${base}/contents/.staplr-permission-probe`),
          [422],
          [403, 404],
        );
        const canPull = await allowed(
          () => octokit.request(`POST ${base}/pulls`),
          [422],
          [403, 404],
        );
        const granted: PermissionId[] = [];
        if (canRead) granted.push('read_contents');
        if (canPush) granted.push('push');
        if (canPull) granted.push('create_pull_request');
        return {
          ok: true,
          accountName,
          grantedPermissions: granted,
          missingPermissions: everything.filter((p) => !granted.includes(p)),
        };
      } catch (error) {
        return failure(error);
      }
    },
  };
}
