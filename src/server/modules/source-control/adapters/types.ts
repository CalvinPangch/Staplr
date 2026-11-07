import type { PermissionId } from '../../../../shared/schemas/source-control.js';

export type { PermissionId };

export type VerifyResult =
  | {
      ok: true;
      accountName: string;
      grantedPermissions: PermissionId[];
      missingPermissions: PermissionId[];
    }
  | {
      ok: false;
      /**
       * invalid / expired / revoked: the platform refused the token.
       * unavailable: the platform could not be reached or had an outage, so
       * nothing is known about the token.
       */
      failure: 'invalid' | 'expired' | 'revoked' | 'unavailable';
    };

export interface RepositorySummary {
  /** the platform repository id, stable across renames */
  remoteId: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

export interface RepositoryDetail extends RepositorySummary {
  cloneUrl: string;
}

/** invalid: the platform refused the token. unavailable: nothing is known. */
export type RepositoryFailure = 'invalid' | 'unavailable' | 'not_found';

export type Result<T> =
  ({ ok: true } & T) | { ok: false; failure: RepositoryFailure };

/** Largest number of pages read for one listing (100 per page). */
export const maxPages = 10;
export const pageSize = 100;

export interface PlatformAdapter {
  /** Never returns or logs the token; only the verdict. */
  verifyToken(token: string): Promise<VerifyResult>;
  /** Repositories the token can push to, optionally narrowed by a name search. */
  listRepositories(
    token: string,
    query?: string,
  ): Promise<Result<{ repositories: RepositorySummary[] }>>;
  getRepository(
    token: string,
    remoteId: string,
  ): Promise<Result<{ repository: RepositoryDetail }>>;
  listBranches(
    token: string,
    remoteId: string,
  ): Promise<Result<{ branches: string[] }>>;
}
