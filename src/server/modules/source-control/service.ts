import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import type { Config } from '../../config.js';
import { openBlob, sealToBlob } from '../../lib/crypto.js';
import { ServiceError } from '../../lib/problem.js';
import {
  permissionIds,
  permissionLabels,
  type PermissionId,
  type Platform,
  type SourceControlConnection,
  type SourceControlCreate,
  type SourceControlUpdate,
} from '../../../shared/schemas/source-control.js';
import { recordAudit } from '../audit/service.js';
import { createGithubAdapter } from './adapters/github.js';
import { createGitlabAdapter } from './adapters/gitlab.js';
import type { PlatformAdapter, VerifyResult } from './adapters/types.js';

interface Row {
  id: string;
  name: string;
  platform: Platform;
  baseUrl: string;
  accountName: string;
  grantedPermissions: string;
  tokenSealed: Buffer;
  tokenLast4: string;
  status: 'connected' | 'needs_attention';
  statusReason: 'invalid' | 'expired' | 'revoked' | 'missing_permission' | null;
  missingPermissions: string;
  lastCheckedAt: string | null;
  lastCheckResult: string | null;
}

const permissionList = z.array(z.enum(permissionIds));
const platformName: Record<Platform, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
};
const loopbackHosts = ['127.0.0.1', 'localhost'];
const batchSize = 5;

const names = (ids: PermissionId[]) =>
  ids.map((id) => permissionLabels[id]).join(', ');

export function createSourceControlService({
  db,
  config,
  clock,
}: {
  db: Database.Database;
  config: Config;
  clock: () => number;
}) {
  const now = () => new Date(clock()).toISOString();
  const adapterFor = (platform: Platform, baseUrl: string): PlatformAdapter =>
    platform === 'github'
      ? createGithubAdapter(baseUrl)
      : createGitlabAdapter(baseUrl);

  function toPublic(row: Row): SourceControlConnection {
    return {
      id: row.id,
      name: row.name,
      platform: row.platform,
      baseUrl: row.baseUrl,
      accountName: row.accountName,
      grantedPermissions: permissionList.parse(
        JSON.parse(row.grantedPermissions),
      ),
      missingPermissions: permissionList.parse(
        JSON.parse(row.missingPermissions),
      ),
      tokenLast4: row.tokenLast4,
      status: row.status,
      statusReason: row.statusReason,
      lastCheckedAt: row.lastCheckedAt,
      lastCheckResult: row.lastCheckResult,
    };
  }

  const find = (id: string) =>
    db.prepare('SELECT * FROM source_control_connection WHERE id=?').get(id) as
      Row | undefined;
  function require(id: string): Row {
    const row = find(id);
    if (!row)
      throw new ServiceError(
        404,
        'not_found',
        'That connection does not exist.',
      );
    return row;
  }

  function normalizeBaseUrl(platform: Platform, input?: string): string {
    if (platform === 'github') {
      if (input)
        throw new ServiceError(
          422,
          'invalid_input',
          'GitHub connections do not take an address.',
        );
      return config.githubApiUrl;
    }
    const raw = input && input.length > 0 ? input : 'https://gitlab.com';
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new ServiceError(
        422,
        'invalid_input',
        'Enter the GitLab address as a full https:// URL.',
      );
    }
    const testLoopback =
      config.testMode &&
      url.protocol === 'http:' &&
      loopbackHosts.includes(url.hostname);
    if (url.protocol !== 'https:' && !testLoopback)
      throw new ServiceError(
        422,
        'invalid_input',
        'The GitLab address must start with https://.',
      );
    if (url.username || url.password || url.search || url.hash)
      throw new ServiceError(
        422,
        'invalid_input',
        'Enter the GitLab address without credentials, a query or a fragment.',
      );
    return url.href.replace(/\/+$/, '');
  }

  function assertNameFree(name: string, exceptId?: string) {
    const clash = db
      .prepare(
        'SELECT id FROM source_control_connection WHERE name = ? COLLATE NOCASE',
      )
      .get(name) as { id: string } | undefined;
    if (clash && clash.id !== exceptId)
      throw new ServiceError(
        409,
        'conflict',
        'A connection with this name already exists. Choose another name.',
      );
  }

  /** Verifies a token before anything is stored; throws the user-facing error. */
  async function verifyOrThrow(
    adapter: PlatformAdapter,
    platform: Platform,
    token: string,
  ) {
    const result = await adapter.verifyToken(token);
    if (!result.ok) {
      if (result.failure === 'unavailable')
        throw new ServiceError(
          503,
          'provider_unavailable',
          result.status === undefined
            ? `Could not reach ${platformName[platform]} to check the token. Retry in a moment.`
            : `${platformName[platform]} answered with HTTP ${result.status} while checking the token, so it could not be checked. Retry in a moment.`,
        );
      const message = {
        invalid:
          'The platform rejected this token. Check that you copied all of it and that it has not expired or been revoked.',
        expired: 'This token has expired. Create a new token and try again.',
        revoked:
          'This token has been revoked. Create a new token and try again.',
      }[result.failure];
      throw new ServiceError(422, 'token_invalid', message);
    }
    if (result.missingPermissions.length > 0)
      throw new ServiceError(
        422,
        'token_missing_permissions',
        `This token cannot do everything agents need. Add these permissions and try again: ${names(result.missingPermissions)}.`,
        { missingPermissions: result.missingPermissions },
      );
    return result;
  }

  function record(
    row: Row,
    action: 'scc.added' | 'scc.replaced' | 'scc.removed',
  ) {
    recordAudit(db, {
      action,
      targetType: 'source_control_connection',
      targetId: row.id,
      targetName: row.name,
      detail: { platform: row.platform },
      at: now(),
    });
  }

  async function runCheck(row: Row) {
    const token = openBlob(row.tokenSealed, config.masterKey).toString('utf8');
    const result: VerifyResult = await adapterFor(
      row.platform,
      row.baseUrl,
    ).verifyToken(token);
    const at = now();
    const put = (fields: Record<string, string | null>) => {
      const keys = Object.keys(fields);
      db.prepare(
        `UPDATE source_control_connection SET ${keys.map((k) => `${k}=@${k}`).join(',')}, updatedAt=@updatedAt WHERE id=@id`,
      ).run({ ...fields, updatedAt: at, id: row.id });
    };
    if (!result.ok) {
      if (result.failure === 'unavailable') {
        put({
          lastCheckedAt: at,
          lastCheckResult:
            result.status === undefined
              ? `Could not reach ${platformName[row.platform]} to check this token. It will be checked again.`
              : `${platformName[row.platform]} answered with HTTP ${result.status} while checking this token. It will be checked again.`,
        });
        return;
      }
      // A saved token that is rejected now used to work, so it was revoked.
      const reason = result.failure === 'invalid' ? 'revoked' : result.failure;
      put({
        status: 'needs_attention',
        statusReason: reason,
        lastCheckedAt: at,
        lastCheckResult:
          reason === 'expired'
            ? 'This token has expired. Replace it with a new token.'
            : 'This token has been revoked or removed. Replace it with a new token.',
      });
      return;
    }
    const base = {
      accountName: result.accountName,
      grantedPermissions: JSON.stringify(result.grantedPermissions),
      missingPermissions: JSON.stringify(result.missingPermissions),
      lastCheckedAt: at,
    };
    if (result.missingPermissions.length > 0)
      put({
        ...base,
        status: 'needs_attention',
        statusReason: 'missing_permission',
        lastCheckResult: `This token no longer allows: ${names(result.missingPermissions)}. Add them or replace the token.`,
      });
    else
      put({
        ...base,
        status: 'connected',
        statusReason: null,
        lastCheckResult: `Connected as ${result.accountName}.`,
      });
  }

  return {
    list(): SourceControlConnection[] {
      return (
        db
          .prepare(
            'SELECT * FROM source_control_connection ORDER BY name COLLATE NOCASE',
          )
          .all() as Row[]
      ).map(toPublic);
    },

    get(id: string): SourceControlConnection {
      return toPublic(require(id));
    },

    async create(input: SourceControlCreate): Promise<SourceControlConnection> {
      const baseUrl = normalizeBaseUrl(input.platform, input.baseUrl);
      assertNameFree(input.name);
      const verified = await verifyOrThrow(
        adapterFor(input.platform, baseUrl),
        input.platform,
        input.token,
      );
      const id = randomUUID();
      const at = now();
      try {
        db.transaction(() => {
          db.prepare(
            `INSERT INTO source_control_connection(id,name,platform,baseUrl,accountName,grantedPermissions,tokenSealed,tokenLast4,status,statusReason,missingPermissions,lastCheckedAt,lastCheckResult,createdAt,updatedAt)
             VALUES(?,?,?,?,?,?,?,?,'connected',NULL,'[]',?,?,?,?)`,
          ).run(
            id,
            input.name,
            input.platform,
            baseUrl,
            verified.accountName,
            JSON.stringify(verified.grantedPermissions),
            sealToBlob(Buffer.from(input.token, 'utf8'), config.masterKey),
            input.token.slice(-4),
            at,
            `Connected as ${verified.accountName}.`,
            at,
            at,
          );
          record(require(id), 'scc.added');
        })();
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'SQLITE_CONSTRAINT_UNIQUE'
        )
          throw new ServiceError(
            409,
            'conflict',
            'A connection with this name already exists. Choose another name.',
          );
        throw error;
      }
      return toPublic(require(id));
    },

    async update(
      id: string,
      input: SourceControlUpdate,
    ): Promise<SourceControlConnection> {
      const row = require(id);
      if (input.name !== undefined) assertNameFree(input.name, id);
      const verified =
        input.token !== undefined
          ? await verifyOrThrow(
              adapterFor(row.platform, row.baseUrl),
              row.platform,
              input.token,
            )
          : undefined;
      const at = now();
      db.transaction(() => {
        if (input.name !== undefined)
          db.prepare(
            'UPDATE source_control_connection SET name=?, updatedAt=? WHERE id=?',
          ).run(input.name, at, id);
        if (verified && input.token !== undefined) {
          db.prepare(
            `UPDATE source_control_connection SET tokenSealed=?, tokenLast4=?, accountName=?, grantedPermissions=?, missingPermissions='[]',
               status='connected', statusReason=NULL, lastCheckedAt=?, lastCheckResult=?, updatedAt=? WHERE id=?`,
          ).run(
            sealToBlob(Buffer.from(input.token, 'utf8'), config.masterKey),
            input.token.slice(-4),
            verified.accountName,
            JSON.stringify(verified.grantedPermissions),
            at,
            `Connected as ${verified.accountName}.`,
            at,
            id,
          );
          record(require(id), 'scc.replaced');
        }
      })();
      return toPublic(require(id));
    },

    remove(id: string): void {
      const row = require(id);
      db.transaction(() => {
        db.prepare('DELETE FROM source_control_connection WHERE id=?').run(id);
        record(row, 'scc.removed');
      })();
    },

    async check(id: string): Promise<SourceControlConnection> {
      await runCheck(require(id));
      return toPublic(require(id));
    },

    /** Startup, hourly and "Check all connections" (FR-013). */
    async checkAll(): Promise<void> {
      const ids = (
        db.prepare('SELECT id FROM source_control_connection').all() as {
          id: string;
        }[]
      ).map((r) => r.id);
      for (let i = 0; i < ids.length; i += batchSize)
        await Promise.all(
          ids.slice(i, i + batchSize).map(async (id) => {
            const row = find(id);
            if (row) await runCheck(row);
          }),
        );
    },

    /** Repositories this connection can push to, searched by name. */
    async repositories(id: string, query?: string) {
      const row = require(id);
      return adapterFor(row.platform, row.baseUrl).listRepositories(
        openBlob(row.tokenSealed, config.masterKey).toString('utf8'),
        query,
      );
    },

    async repository(id: string, remoteId: string) {
      const row = require(id);
      return adapterFor(row.platform, row.baseUrl).getRepository(
        openBlob(row.tokenSealed, config.masterKey).toString('utf8'),
        remoteId,
      );
    },

    async branches(id: string, remoteId: string) {
      const row = require(id);
      return adapterFor(row.platform, row.baseUrl).listBranches(
        openBlob(row.tokenSealed, config.masterKey).toString('utf8'),
        remoteId,
      );
    },

    /** Internal only: the plaintext token for a git or API call. */
    decryptTokenForUse(id: string): string {
      return openBlob(require(id).tokenSealed, config.masterKey).toString(
        'utf8',
      );
    },
  };
}

export type SourceControlService = ReturnType<
  typeof createSourceControlService
>;
