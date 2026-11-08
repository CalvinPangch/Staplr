import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Config } from '../../config.js';
import { openBlob, sealToBlob } from '../../lib/crypto.js';
import { ServiceError } from '../../lib/problem.js';
import type {
  DiscoveryStatus,
  ClaudeCreate,
  ModelAccess,
  ProviderConnection,
} from '../../../shared/schemas/providers.js';
import { recordAudit } from '../audit/service.js';
import { catalogRevision, listModels, loadCatalog } from '../prices/catalog.js';
import { listAnthropicModels, type ModelList } from './anthropic.js';
import type {
  CodexDiscoveryResult,
  CodexExecutor,
  CodexVerifyResult,
} from './codex.js';
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
  discoveryStatus: DiscoveryStatus;
  discoveryError: string | null;
  modelsRefreshedAt: string | null;
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
  discoveryRetry:
    'Last refresh failed; it will be retried at the next hourly check. Use Refresh models to try now.',
  discoveryNoDocker:
    'Docker is not available, so your models could not be found. Start Docker, then use Refresh models.',
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
    discoveryStatus: row.discoveryStatus,
    discoveryError: row.discoveryError,
    modelsRefreshedAt: row.modelsRefreshedAt,
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

  /** Discovery runs in progress, with the models answered so far in each run. */
  const discoveries = new Map<
    string,
    { done: Promise<void>; answered: Set<string>; revision: number }
  >();

  function setDiscovery(
    id: string,
    status: DiscoveryStatus,
    error: string | null,
    refreshedAt?: string,
  ) {
    db.prepare(
      'UPDATE provider_connection SET discoveryStatus=?, discoveryError=?, modelsRefreshedAt=COALESCE(?, modelsRefreshedAt) WHERE id=?',
    ).run(status, error, refreshedAt ?? null, id);
  }

  /**
   * Lists the models a Codex login can see and checks each one (feature 002).
   * The answer is stored only if the login was not replaced meanwhile.
   */
  async function runDiscovery(
    row: Row,
    answered: Set<string>,
    listOnly: boolean,
  ) {
    if (!row.credentialBundleSealed) return;
    if (!codex) {
      setDiscovery(row.id, 'failed', messages.discoveryNoDocker);
      return;
    }
    const bundle = openBlob(row.credentialBundleSealed, config.masterKey);
    const stillCurrent = () =>
      find(row.id)?.credentialRevision === row.credentialRevision;
    let result: CodexDiscoveryResult;
    try {
      result = await codex.discover(bundle, {
        listOnly,
        onModel: (model, verdict) => {
          if (!stillCurrent()) return;
          writeVerdict(row, model, verdict, now());
          answered.add(model);
        },
      });
    } catch {
      result = {
        auth: 'unavailable',
        models: null,
        expiresAt: null,
        refreshedBundle: null,
      };
    }
    const at = now();
    db.transaction(() => {
      if (!stillCurrent()) return;
      if (result.auth === 'rejected') {
        db.prepare(
          "UPDATE provider_connection SET status='needs_relogin', lastCheckedAt=?, lastCheckResult=?, updatedAt=? WHERE id=?",
        ).run(at, messages.codexRejected, at, row.id);
        setDiscovery(row.id, 'failed', messages.codexRejected);
        return;
      }
      if (result.auth === 'unavailable' || !result.models) {
        // Only a clear answer changes anything; the last good list stays.
        setDiscovery(row.id, 'failed', messages.discoveryRetry);
        return;
      }
      db.prepare(
        "UPDATE provider_connection SET status='connected', credentialExpiresAt=COALESCE(?, credentialExpiresAt), updatedAt=? WHERE id=?",
      ).run(result.expiresAt, at, row.id);
      if (result.refreshedBundle)
        db.prepare(
          'UPDATE provider_connection SET credentialBundleSealed=? WHERE id=? AND credentialRevision=?',
        ).run(
          sealToBlob(result.refreshedBundle, config.masterKey),
          row.id,
          row.credentialRevision,
        );
      db.prepare(
        'DELETE FROM discovered_model WHERE providerConnectionId=?',
      ).run(row.id);
      const insert = db.prepare(
        'INSERT INTO discovered_model(providerConnectionId,model,label,listedAt) VALUES(?,?,?,?)',
      );
      const listed = new Set<string>();
      for (const model of result.models) {
        if (listed.has(model.id)) continue;
        listed.add(model.id);
        insert.run(row.id, model.id, model.label, at);
        // The hourly re-list costs nothing and so cannot confirm access.
        if (!listOnly) writeVerdict(row, model.id, model.verdict, at);
      }
      // A model the login does not list is known to be out of reach.
      for (const model of listModels(row.provider))
        if (!listed.has(model.id)) writeVerdict(row, model.id, 'denied', at);
      setDiscovery(row.id, 'finished', null, at);
      recordAudit(db, {
        action: 'models.discovered',
        targetType: 'provider_connection',
        targetId: row.id,
        targetName: row.name,
        detail: {
          listed: listed.size,
          available: result.models.filter((m) => m.verdict === 'available')
            .length,
        },
        at,
      });
    })();
  }

  /** Starts discovery unless it is already running; a second request joins the first. */
  function startDiscovery(
    id: string,
    options: { listOnly?: boolean } = {},
  ): Promise<void> {
    const row = find(id);
    if (!row || row.authType !== 'codex_login') return Promise.resolve();
    const running = discoveries.get(id);
    if (running && running.revision === row.credentialRevision)
      return running.done;
    if (running) return running.done.then(() => startDiscovery(id, options));
    setDiscovery(id, 'running', null);
    const answered = new Set<string>();
    const done = runDiscovery(row, answered, options.listOnly ?? false)
      .catch(() => {
        if (find(id)) setDiscovery(id, 'failed', messages.discoveryRetry);
      })
      .finally(() => discoveries.delete(id));
    discoveries.set(id, {
      done,
      answered,
      revision: row.credentialRevision,
    });
    return done;
  }

  /** Evidence for every selectable model, with stale results unknown. */
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
    const discovered = new Map(
      (
        db
          .prepare(
            'SELECT model, label FROM discovered_model WHERE providerConnectionId=? ORDER BY label COLLATE NOCASE',
          )
          .all(id) as { model: string; label: string }[]
      ).map((r) => [r.model, r.label]),
    );
    const catalogIds = new Set(
      loadCatalog()
        .models.filter((m) => m.provider === row.provider)
        .map((m) => m.id),
    );
    const offered = [
      ...listModels(row.provider).map((m) => ({ id: m.id, label: m.label })),
      ...[...discovered]
        .filter(([model]) => !catalogIds.has(model))
        .map(([model, label]) => ({ id: model, label })),
    ];
    const run = discoveries.get(id);
    return offered.map((model) => {
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
        discovered: discovered.has(model.id),
        checking: run !== undefined && !run.answered.has(model.id),
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
    startDiscovery,

    /** Resolves when no discovery is running (tests and shutdown). */
    async whenDiscoveryIdle(): Promise<void> {
      while (discoveries.size > 0)
        await Promise.all([...discoveries.values()].map((d) => d.done));
    },

    /** After a restart, a discovery cut short is started again. */
    async recoverDiscovery(): Promise<void> {
      const ids = (
        db
          .prepare(
            "SELECT id FROM provider_connection WHERE discoveryStatus='running'",
          )
          .all() as { id: string }[]
      ).map((r) => r.id);
      for (const id of ids) {
        setDiscovery(id, 'not_started', null);
        void startDiscovery(id);
      }
    },

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
      const row = requireRow(id);
      if (row.authType === 'codex_login' && row.status === 'connected')
        void startDiscovery(id);
      return toPublic(requireRow(id));
    },

    /** "Refresh models": find the models again now (feature 002). */
    discover(id: string): ProviderConnection {
      const row = requireRow(id);
      if (row.authType !== 'codex_login')
        throw new ServiceError(
          409,
          'conflict',
          'Only Codex connections find their models this way. Claude models come from the API key.',
        );
      if (row.status === 'needs_relogin')
        throw new ServiceError(
          409,
          'conflict',
          'This login needs Re-login before its models can be found.',
        );
      if (!codex)
        throw new ServiceError(
          503,
          'docker_unavailable',
          'Docker is not available, so your models could not be found. Start Docker, then try again.',
        );
      void startDiscovery(id);
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
            if (!row) return;
            await checkRow(row);
            // Codex: re-list for free in the background; only models agents
            // use were probed above, so the check itself stays fast.
            const after = find(id);
            if (
              after?.authType === 'codex_login' &&
              after.status === 'connected'
            )
              void startDiscovery(id, { listOnly: true });
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
