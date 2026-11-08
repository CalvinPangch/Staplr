import { Gitlab } from '@gitbeaker/rest';
import type { PermissionId } from '../../../../shared/schemas/source-control.js';
import {
  maxPages,
  pageSize,
  type PlatformAdapter,
  type RepositoryFailure,
  type VerifyResult,
} from './types.js';

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

function repositoryFailure(error: unknown): RepositoryFailure {
  const status = statusOf(error);
  if (status === 401 || status === 403) return 'invalid';
  if (status === 404) return 'not_found';
  return 'unavailable';
}

interface GitlabProject {
  id: number;
  path_with_namespace: string;
  default_branch?: string | null;
  visibility?: string;
  http_url_to_repo?: string;
}

const summarize = (project: GitlabProject) => ({
  remoteId: String(project.id),
  fullName: project.path_with_namespace,
  defaultBranch: project.default_branch ?? 'main',
  private: project.visibility !== 'public',
});

export function createGitlabAdapter(baseUrl: string): PlatformAdapter {
  return {
    /** Member projects with at least developer access (30), searched by the GitLab server. */
    async listRepositories(token, query) {
      const api = new Gitlab({ host: baseUrl, token });
      try {
        const projects = (await api.Projects.all({
          membership: true,
          minAccessLevel: 30,
          perPage: pageSize,
          maxPages,
          ...(query?.trim() ? { search: query.trim() } : {}),
        })) as unknown as GitlabProject[];
        return { ok: true, repositories: projects.map(summarize) };
      } catch (error) {
        return { ok: false, failure: repositoryFailure(error) };
      }
    },
    async getRepository(token, remoteId) {
      const api = new Gitlab({ host: baseUrl, token });
      try {
        const project = (await api.Projects.show(
          remoteId,
        )) as unknown as GitlabProject;
        return {
          ok: true,
          repository: {
            ...summarize(project),
            cloneUrl: project.http_url_to_repo ?? '',
          },
        };
      } catch (error) {
        return { ok: false, failure: repositoryFailure(error) };
      }
    },
    async listBranches(token, remoteId) {
      const api = new Gitlab({ host: baseUrl, token });
      try {
        const branches = (await api.Branches.all(remoteId, {
          perPage: pageSize,
          maxPages,
        })) as unknown as { name: string }[];
        return { ok: true, branches: branches.map((b) => b.name) };
      } catch (error) {
        return { ok: false, failure: repositoryFailure(error) };
      }
    },
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
        return status === undefined
          ? { ok: false, failure: 'unavailable' }
          : { ok: false, failure: 'unavailable', status };
      }
    },
  };
}
