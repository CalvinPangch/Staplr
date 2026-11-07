import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Config } from '../../config.js';
import { openBlob, sealToBlob } from '../../lib/crypto.js';
import { ServiceError } from '../../lib/problem.js';
import type {
  ClaudeCreate,
  ModelAccess,
  ProviderConnection,
} from '../../../shared/schemas/providers.js';
import { recordAudit } from '../audit/service.js';
import { catalogRevision, listModels } from '../prices/catalog.js';
import { listAnthropicModels, type ModelList } from './anthropic.js';
import type { CodexExecutor, CodexVerifyResult } from './codex.js';
import type { ProbeVerdict } from '../sandbox/profiles.js';
import type { Impact, ImpactRegistry } from './impact.js';

interface Row {
  id: string;
  provider: 'claude' | 'codex';
  name: string;
  authType: 'api_key' | 'codex_login';
  apiKeySealed: Buffer | null;
  credentialBundleSealed: Buffer | null;
  credentialRevision: number;
  credentialExpiresAt: string | null;
  status: 'connected' | 'needs_relogin';
  lastCheckedAt: string | null;
  lastCheckResult: string | null;
}

const batchSize = 5;
const messages = {
  rejected:
    'Anthropic rejected this API key. Replace the API key to reconnect.',
  ok: 'API key verified.',
  codexOk: 'Codex login verified.',
  codexRejected: 'Codex no longer accepts this login. Re-login to reconnect.',
  codexUnavailable:
    'Could not run the Codex check right now. It will be checked again.',
  noDocker: 'Docker is not available, so this login could not be checked.',
  unavailable:
    'Could not reach Anthropic to check this API key. It will be checked again.',
};

export function createProviderService({
  db,
  config,
  clock,
  impact,
  codex,
}: {
  db: Database.Database;
  config: Config;
  clock: () => number;
  impact: ImpactRegistry;
  codex?: CodexExecutor | undefined;
}) {
  const now = () => new Date(clock()).toISOString();

  const toPublic = (row: Row): ProviderConnection => ({
    id: row.id,
    provider: row.provider,
    authType: row.authType,
    credentialRevision: row.credentialRevision,
    name: row.name,
    status: row.status,
    credentialExpiresAt: row.credentialExpiresAt,
    lastCheckedAt: row.lastCheckedAt,
    lastCheckResult: row.lastCheckResult,
  });

  const find = (id: string) =>
    db.prepare('SELECT * FROM provider_connection WHERE id=?').get(id) as
      Row | undefined;
  function requireRow(id: string): Row {
    const row = find(id);
    if (!row)
      throw new ServiceError(
        404,
        'not_found',
        'That connection does not exist.',
      );
    return row;
  }

  function assertNameFree(
    provider: string,
    name: string,
    exceptId?: string,
  ): void {
    const clash = db
      .prepare(
        'SELECT id FROM provider_connection WHERE provider=? AND name=? COLLATE NOCASE',
      )
      .get(provider, name) as { id: string } | undefined;
    if (clash && clash.id !== exceptId)
      throw new ServiceError(
        409,
        'conflict',
        'A connection with this name already exists. Choose another name.',
      );
  }

  const uniqueViolation = (error: unknown) =>
    error instanceof Error &&
    'code' in error &&
    error.code === 'SQLITE_CONSTRAINT_UNIQUE';

  function requireModelList(list: ModelList): Set<string> {
    if (list.ok) return new Set(list.modelIds);
    if (list.failure === 'rejected')
      throw new ServiceError(
        422,
        'api_key_invalid',
        'Anthropic rejected this API key. Check that you copied all of it and that it has not been deleted or disabled.',
      );
    throw new ServiceError(
      503,
      'provider_unavailable',
      'Could not reach Anthropic to check the API key. Retry in a moment.',
    );
  }

  /**
   * A complete authenticated model list is proof for every catalog model:
   * listed means available, not listed means unavailable (research R19).
   */
  function writeFullEvidence(
    id: string,
    revision: number,
    listed: Set<string>,
    at: string,
  ) {
    db.prepare('DELETE FROM model_access WHERE providerConnectionId=?').run(id);
    const insert = db.prepare(
      'INSERT INTO model_access(providerConnectionId,model,credentialRevision,catalogRevision,availability,lastVerifiedAt,lastAttemptAt,checkError) VALUES(?,?,?,?,?,?,?,NULL)',
    );
    for (const model of listModels('claude'))
      insert.run(
        id,
        model.id,
        revision,
        catalogRevision(),
        listed.has(model.id) ? 'available' : 'unavailable',
        at,
        at,
      );
  }

  /** A failed attempt keeps earlier evidence and only records the attempt. */
  function noteAttempt(row: Row, error: string, at: string) {
    db.prepare(
      'UPDATE model_access SET lastAttemptAt=?, checkError=? WHERE providerConnectionId=? AND credentialRevision=?',
    ).run(at, error, row.id, row.credentialRevision);
  }

  function record(
    row: Row,
    action:
      | 'provider.added'
      | 'provider.replaced'
      | 'provider.relogged'
      | 'provider.removed',
  ) {
    recordAudit(db, {
      action,
      targetType: 'provider_connection',
      targetId: row.id,
      targetName: row.name,
      detail: { provider: row.provider },
      at: now(),
    });
  }

  async function checkClaude(row: Row) {
    if (!row.apiKeySealed) return;
    const key = openBlob(row.apiKeySealed, config.masterKey).toString('utf8');
    const list = await listAnthropicModels(config.anthropicApiUrl, key);
    const at = now();
    db.transaction(() => {
      if (list.ok) {
        db.prepare(
          "UPDATE provider_connection SET status='connected', lastCheckedAt=?, lastCheckResult=?, updatedAt=? WHERE id=?",
        ).run(at, messages.ok, at, row.id);
        writeFullEvidence(
          row.id,
          row.credentialRevision,
          new Set(list.modelIds),
          at,
        );
      } else if (list.failure === 'rejected') {
        db.prepare(
          "UPDATE provider_connection SET status='needs_relogin', lastCheckedAt=?, lastCheckResult=?, updatedAt=? WHERE id=?",
        ).run(at, messages.rejected, at, row.id);
        noteAttempt(row, 'authentication_rejected', at);
      } else {
        db.prepare(
          'UPDATE provider_connection SET lastCheckedAt=?, lastCheckResult=?, updatedAt=? WHERE id=?',
        ).run(at, messages.unavailable, at, row.id);
        noteAttempt(row, 'service_unavailable', at);
      }
    })();
  }

  /** Records an attempt on one model without disturbing earlier evidence. */
  function noteModelAttempt(
    row: Row,
    model: string,
    error: string,
    at: string,
  ) {
    db.prepare(
      `INSERT INTO model_access(providerConnectionId,model,credentialRevision,catalogRevision,availability,lastVerifiedAt,lastAttemptAt,checkError)
       VALUES(?,?,?,?,'unknown',NULL,?,?)
       ON CONFLICT(providerConnectionId,model) DO UPDATE SET lastAttemptAt=excluded.lastAttemptAt, checkError=excluded.checkError
       WHERE credentialRevision=excluded.credentialRevision AND catalogRevision=excluded.catalogRevision`,
    ).run(row.id, model, row.credentialRevision, catalogRevision(), at, error);
  }

  function writeVerdict(
    row: Row,
    model: string,
    verdict: ProbeVerdict,
    at: string,
  ) {
    if (verdict === 'available' || verdict === 'denied') {
      db.prepare(
        `INSERT INTO model_access(providerConnectionId,model,credentialRevision,catalogRevision,availability,lastVerifiedAt,lastAttemptAt,checkError)
         VALUES(?,?,?,?,?,?,?,NULL)
         ON CONFLICT(providerConnectionId,model) DO UPDATE SET credentialRevision=excluded.credentialRevision, catalogRevision=excluded.catalogRevision,
           availability=excluded.availability, lastVerifiedAt=excluded.lastVerifiedAt, lastAttemptAt=excluded.lastAttemptAt, checkError=NULL`,
      ).run(
        row.id,
        model,
        row.credentialRevision,
        catalogRevision(),
        verdict === 'available' ? 'available' : 'unavailable',
        at,
        at,
      );
    } else noteModelAttempt(row, model, 'service_unavailable', at);
  }

  /**
   * Checks a Codex login in a throwaway sandbox. Rejected authentication sets
   * needs_relogin; denial of one model changes only that model; anything that
   * could not be determined keeps the last confirmed status (research R19).
   */
  async function checkCodex(row: Row, requestedModel?: string) {
    if (!row.credentialBundleSealed) return;
    const started = now();
    if (!codex) {
      db.prepare(
        'UPDATE provider_connection SET lastCheckedAt=?, lastCheckResult=?, updatedAt=? WHERE id=?',
      ).run(started, messages.noDocker, started, row.id);
      if (requestedModel)
        noteModelAttempt(row, requestedModel, 'docker_unavailable', started);
      return;
    }
    const bundle = openBlob(row.credentialBundleSealed, config.masterKey);
    const models = [
      ...new Set([
        ...impact.modelsInUse(row.id),
        ...(requestedModel ? [requestedModel] : []),
      ]),
    ];
    let result: CodexVerifyResult;
    try {
      result = await codex.verify(bundle, models);
    } catch {
      result = {
        auth: 'unavailable',
        expiresAt: null,
        models: {},
        refreshedBundle: null,
      };
    }
    const at = now();
    db.transaction(() => {
      if (result.auth === 'ok') {
        db.prepare(
          "UPDATE provider_connection SET status='connected', credentialExpiresAt=COALESCE(?, credentialExpiresAt), lastCheckedAt=?, lastCheckResult=?, updatedAt=? WHERE id=?",
        ).run(result.expiresAt, at, messages.codexOk, at, row.id);
        // The CLI may refresh its own tokens; keep them unless a re-login
        // replaced the credentials while this check was running.
        if (result.refreshedBundle)
          db.prepare(
            'UPDATE provider_connection SET credentialBundleSealed=? WHERE id=? AND credentialRevision=?',
          ).run(
            sealToBlob(result.refreshedBundle, config.masterKey),
            row.id,
            row.credentialRevision,
          );
        for (const [model, verdict] of Object.entries(result.models))
          writeVerdict(row, model, verdict, at);
      } else if (result.auth === 'rejected') {
        db.prepare(
          "UPDATE provider_connection SET status='needs_relogin', lastCheckedAt=?, lastCheckResult=?, updatedAt=? WHERE id=?",
        ).run(at, messages.codexRejected, at, row.id);
        for (const model of models)
          noteModelAttempt(row, model, 'authentication_rejected', at);
      } else {
        db.prepare(
          'UPDATE provider_connection SET lastCheckedAt=?, lastCheckResult=?, updatedAt=? WHERE id=?',
        ).run(at, messages.codexUnavailable, at, row.id);
        for (const model of models)
          noteModelAttempt(row, model, 'service_unavailable', at);
      }
    })();
  }
  async function checkRow(row: Row) {
    if (row.authType === 'api_key') await checkClaude(row);
    else await checkCodex(row);
  }

  /** Evidence for every selectable catalog model, with stale results unknown. */
  function listModelAccess(id: string): ModelAccess[] {
    const row = requireRow(id);
    const revision = catalogRevision();
    const stored = new Map(
      (
        db
          .prepare('SELECT * FROM model_access WHERE providerConnectionId=?')
          .all(id) as {
          model: string;
          credentialRevision: number;
          catalogRevision: string;
          availability: 'available' | 'unavailable' | 'unknown';
          lastVerifiedAt: string | null;
          lastAttemptAt: string | null;
          checkError: string | null;
        }[]
      ).map((r) => [r.model, r]),
    );
    return listModels(row.provider).map((model) => {
      const evidence = stored.get(model.id);
      const current =
        evidence !== undefined &&
        evidence.credentialRevision === row.credentialRevision &&
        evidence.catalogRevision === revision;
      return {
        providerConnectionId: id,
        id: model.id,
        label: model.label,
        availability: current ? evidence.availability : 'unknown',
        credentialRevision: row.credentialRevision,
        catalogRevision: revision,
        lastVerifiedAt: current ? evidence.lastVerifiedAt : null,
        lastAttemptAt: evidence?.lastAttemptAt ?? null,
        checkError: current ? evidence.checkError : null,
      };
    });
  }

  return {
    list(): ProviderConnection[] {
      return (
        db
          .prepare(
            'SELECT * FROM provider_connection ORDER BY provider, name COLLATE NOCASE',
          )
          .all() as Row[]
      ).map(toPublic);
    },

    get(id: string): ProviderConnection {
      return toPublic(requireRow(id));
    },

    listModelAccess,

    async createClaude(input: ClaudeCreate): Promise<ProviderConnection> {
      assertNameFree('claude', input.name);
      const listed = requireModelList(
        await listAnthropicModels(config.anthropicApiUrl, input.apiKey),
      );
      const id = randomUUID();
      const at = now();
      try {
        db.transaction(() => {
          db.prepare(
            `INSERT INTO provider_connection(id,provider,name,authType,apiKeySealed,credentialRevision,status,lastCheckedAt,lastCheckResult,createdAt,updatedAt)
             VALUES(?,?,?,'api_key',?,1,'connected',?,?,?,?)`,
          ).run(
            id,
            'claude',
            input.name,
            sealToBlob(Buffer.from(input.apiKey, 'utf8'), config.masterKey),
            at,
            messages.ok,
            at,
            at,
          );
          writeFullEvidence(id, 1, listed, at);
          record(requireRow(id), 'provider.added');
        })();
      } catch (error) {
        if (uniqueViolation(error))
          throw new ServiceError(
            409,
            'conflict',
            'A connection with this name already exists. Choose another name.',
          );
        throw error;
      }
      return toPublic(requireRow(id));
    },

    /** Validates first, then swaps the key in one step; failure keeps the old key. */
    async replaceApiKey(
      id: string,
      apiKey: string,
    ): Promise<ProviderConnection> {
      const row = requireRow(id);
      if (row.authType !== 'api_key')
        throw new ServiceError(
          422,
          'unsupported_provider',
          'This connection signs in through a sandbox login. Use Re-login instead.',
        );
      const listed = requireModelList(
        await listAnthropicModels(config.anthropicApiUrl, apiKey),
      );
      const at = now();
      const revision = row.credentialRevision + 1;
      db.transaction(() => {
        db.prepare(
          "UPDATE provider_connection SET apiKeySealed=?, credentialRevision=?, status='connected', lastCheckedAt=?, lastCheckResult=?, updatedAt=? WHERE id=?",
        ).run(
          sealToBlob(Buffer.from(apiKey, 'utf8'), config.masterKey),
          revision,
          at,
          messages.ok,
          at,
          id,
        );
        writeFullEvidence(id, revision, listed, at);
        record(requireRow(id), 'provider.replaced');
      })();
      return toPublic(requireRow(id));
    },

    rename(id: string, name: string): ProviderConnection {
      const row = requireRow(id);
      assertNameFree(row.provider, name, id);
      try {
        db.prepare(
          'UPDATE provider_connection SET name=?, updatedAt=? WHERE id=?',
        ).run(name, now(), id);
      } catch (error) {
        if (uniqueViolation(error))
          throw new ServiceError(
            409,
            'conflict',
            'A connection with this name already exists. Choose another name.',
          );
        throw error;
      }
      return toPublic(requireRow(id));
    },

    disconnect(id: string): void {
      const row = requireRow(id);
      db.transaction(() => {
        db.prepare('DELETE FROM provider_connection WHERE id=?').run(id);
        record(row, 'provider.removed');
      })();
    },

    impact(id: string): Impact {
      requireRow(id);
      return impact.getImpact(id);
    },

    /** Used by the sandbox login: a new Codex connection from a verified login. */
    createCodex(input: {
      name: string;
      bundle: Buffer;
      expiresAt: string | null;
    }): ProviderConnection {
      assertNameFree('codex', input.name);
      const id = randomUUID();
      const at = now();
      try {
        db.transaction(() => {
          db.prepare(
            `INSERT INTO provider_connection(id,provider,name,authType,credentialBundleSealed,credentialRevision,credentialExpiresAt,status,lastCheckedAt,lastCheckResult,createdAt,updatedAt)
             VALUES(?,?,?,'codex_login',?,1,?,'connected',?,?,?,?)`,
          ).run(
            id,
            'codex',
            input.name,
            sealToBlob(input.bundle, config.masterKey),
            input.expiresAt,
            at,
            messages.codexOk,
            at,
            at,
          );
          record(requireRow(id), 'provider.added');
        })();
      } catch (error) {
        if (uniqueViolation(error))
          throw new ServiceError(
            409,
            'conflict',
            'A connection with this name already exists. Choose another name.',
          );
        throw error;
      }
      return toPublic(requireRow(id));
    },

    /** Used by a finished re-login: replaces the credentials in place. */
    replaceCodex(
      id: string,
      bundle: Buffer,
      expiresAt: string | null,
    ): ProviderConnection {
      const row = requireRow(id);
      if (row.authType !== 'codex_login')
        throw new ServiceError(
          422,
          'unsupported_provider',
          'This connection uses an API key. Replace the API key instead.',
        );
      const at = now();
      db.transaction(() => {
        db.prepare(
          "UPDATE provider_connection SET credentialBundleSealed=?, credentialRevision=?, credentialExpiresAt=?, status='connected', lastCheckedAt=?, lastCheckResult=?, updatedAt=? WHERE id=?",
        ).run(
          sealToBlob(bundle, config.masterKey),
          row.credentialRevision + 1,
          expiresAt,
          at,
          messages.codexOk,
          at,
          id,
        );
        db.prepare('DELETE FROM model_access WHERE providerConnectionId=?').run(
          id,
        );
        record(requireRow(id), 'provider.relogged');
      })();
      return toPublic(requireRow(id));
    },

    /** Start-of-login checks, so a doomed sandbox is never created. */
    assertCodexLoginTarget(input: { name?: string; reloginOf?: string }) {
      if (input.name !== undefined) assertNameFree('codex', input.name);
      if (input.reloginOf !== undefined) {
        const row = requireRow(input.reloginOf);
        if (row.authType !== 'codex_login')
          throw new ServiceError(
            422,
            'unsupported_provider',
            'This connection uses an API key. Replace the API key instead.',
          );
      }
    },
    async check(id: string): Promise<ProviderConnection> {
      await checkRow(requireRow(id));
      return toPublic(requireRow(id));
    },

    async checkModel(id: string, model: string): Promise<ModelAccess> {
      const row = requireRow(id);
      if (!listModels(row.provider).some((m) => m.id === model))
        throw new ServiceError(
          422,
          'invalid_input',
          'This model is not in the catalog for this provider.',
        );
      if (row.authType === 'api_key') await checkClaude(row);
      else await checkCodex(row, model);
      const result = listModelAccess(id).find((m) => m.id === model);
      if (!result) throw new Error('Model access missing after check');
      return result;
    },

    /** Startup, hourly and "Check all connections" (FR-013). */
    async checkAll(): Promise<void> {
      const ids = (
        db.prepare('SELECT id FROM provider_connection').all() as {
          id: string;
        }[]
      ).map((r) => r.id);
      for (let i = 0; i < ids.length; i += batchSize)
        await Promise.all(
          ids.slice(i, i + batchSize).map(async (id) => {
            const row = find(id);
            if (row) await checkRow(row);
          }),
        );
    },

    /** Internal only: the plaintext Claude key for an agent run (next feature). */
    decryptApiKeyForUse(id: string): string {
      const row = requireRow(id);
      if (!row.apiKeySealed)
        throw new ServiceError(
          422,
          'unsupported_provider',
          'This connection has no API key.',
        );
      return openBlob(row.apiKeySealed, config.masterKey).toString('utf8');
    },
  };
}

export type ProviderService = ReturnType<typeof createProviderService>;

declare module 'fastify' {
  interface FastifyInstance {
    providers: ProviderService;
  }
}
