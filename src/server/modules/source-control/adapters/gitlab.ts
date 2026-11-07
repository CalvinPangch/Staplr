import { Gitlab } from '@gitbeaker/rest';
import type { PermissionId } from '../../../../shared/schemas/source-control.js';
import type { PlatformAdapter, VerifyResult } from './types.js';

/** `api` covers everything; the repository scopes cover cloning and pushing only. */
function permissionsFor(scopes: string[]): PermissionId[] {
  if (scopes.includes('api'))
    return ['read_contents', 'push', 'create_pull_request'];
  const granted: PermissionId[] = [];
  if (scopes.includes('read_repository') || scopes.includes('write_repository'))
    granted.push('read_contents');
  if (scopes.includes('write_repository')) granted.push('push');
  return granted;
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const cause = 'cause' in error ? error.cause : undefined;
  if (typeof cause === 'object' && cause !== null && 'response' in cause) {
    const response = cause.response as { status?: unknown } | undefined;
    if (typeof response?.status === 'number') return response.status;
  }
  return undefined;
}

export function createGitlabAdapter(baseUrl: string): PlatformAdapter {
  return {
    async verifyToken(token): Promise<VerifyResult> {
      const api = new Gitlab({ host: baseUrl, token });
      try {
        const self = await api.PersonalAccessTokens.show({ tokenId: 'self' });
        if (self.revoked) return { ok: false, failure: 'revoked' };
        const expires = self.expires_at
          ? Date.parse(String(self.expires_at))
          : NaN;
        if (
          self.active === false ||
          (!Number.isNaN(expires) && expires < Date.now())
        )
          return { ok: false, failure: 'expired' };
        const user = await api.Users.showCurrentUser();
        const scopes = Array.isArray(self.scopes)
          ? self.scopes.map(String)
          : [];
        const granted = permissionsFor(scopes);
        const all: PermissionId[] = [
          'read_contents',
          'push',
          'create_pull_request',
        ];
        return {
          ok: true,
          accountName: String(user.username),
          grantedPermissions: granted,
          missingPermissions: all.filter((p) => !granted.includes(p)),
        };
      } catch (error) {
        const status = statusOf(error);
        if (status === 401 || status === 403)
          return { ok: false, failure: 'invalid' };
        return { ok: false, failure: 'unavailable' };
      }
    },
  };
}
