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

export interface PlatformAdapter {
  /** Never returns or logs the token; only the verdict. */
  verifyToken(token: string): Promise<VerifyResult>;
}
