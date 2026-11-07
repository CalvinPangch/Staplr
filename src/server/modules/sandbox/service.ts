import { randomUUID } from 'node:crypto';
import type { Duplex } from 'node:stream';
import type Database from 'better-sqlite3';
import type { Config } from '../../config.js';
import { ServiceError } from '../../lib/problem.js';
import type {
  SandboxSession,
  SandboxStart,
} from '../../../shared/schemas/sandbox.js';
import {
  BundleError,
  bundleFromAuthFile,
} from '../providers/credential-bundle.js';
import { readAuthFile } from '../providers/codex.js';
import type { ProviderService } from '../providers/service.js';
import type { SandboxDriver, TerminalHandle } from './driver.js';
import type { CodexProfile } from './profiles.js';

interface SessionRow {
  id: string;
  name: string | null;
  reloginOf: string | null;
  containerId: string | null;
  status: SandboxSession['status'];
  failureReason: string | null;
  lastActivityAt: string;
  resultConnectionId: string | null;
}

/** What a terminal needs to hear about: the deadline moving, or the end. */
export type SessionEvent =
  | { type: 'expiresAt'; at: string }
  | {
      type: 'ended';
      status: SandboxSession['status'];
      failureReason: string | null;
      resultConnectionId: string | null;
    };

export function createSandboxService({
  db,
  config,
  clock,
  driver,
  providers,
  profile,
}: {
  db: Database.Database;
  config: Config;
  clock: () => number;
  driver: SandboxDriver | null;
  providers: ProviderService;
  profile: CodexProfile;
}) {
  const now = () => new Date(clock()).toISOString();
  const listeners = new Map<string, Set<(event: SessionEvent) => void>>();
  const terminals = new Map<string, TerminalHandle>();

  const dockerUnavailable = () =>
    new ServiceError(
      503,
      'docker_unavailable',
      'Docker is not available, so the sign-in sandbox could not be started. Check that Docker is running and retry.',
    );

  const expiresAt = (row: SessionRow) =>
    new Date(
      Date.parse(row.lastActivityAt) + config.sandboxIdleMs,
    ).toISOString();

  function toPublic(row: SessionRow): SandboxSession {
    return {
      id: row.id,
      provider: 'codex',
      status: row.status,
      failureReason: row.failureReason,
      terminalUrl: `/api/sandbox-sessions/${row.id}/terminal`,
      instructions: profile.instructions,
      resultConnectionId: row.resultConnectionId,
      expiresAt: expiresAt(row),
    };
  }

  const find = (id: string) =>
    db.prepare('SELECT * FROM sandbox_login_session WHERE id=?').get(id) as
      SessionRow | undefined;
  function requireRow(id: string): SessionRow {
    const row = find(id);
    if (!row)
      throw new ServiceError(
        404,
        'not_found',
        'That login session does not exist.',
      );
    return row;
  }
  function requireOpen(id: string): SessionRow {
    const row = requireRow(id);
    if (row.status !== 'in_progress')
      throw new ServiceError(
        409,
        'conflict',
        'This login session has ended. Start a new one.',
      );
    return row;
  }

  function emit(id: string, event: SessionEvent) {
    for (const listener of listeners.get(id) ?? []) listener(event);
  }

  /** Every way a session ends: record it, destroy the sandbox, tell the terminal. */
  async function end(
    row: SessionRow,
    status: Exclude<SandboxSession['status'], 'in_progress'>,
    failureReason: string | null,
    resultConnectionId: string | null = null,
  ) {
    db.prepare(
      'UPDATE sandbox_login_session SET status=?, failureReason=?, endedAt=?, containerId=NULL, resultConnectionId=? WHERE id=?',
    ).run(status, failureReason, now(), resultConnectionId, row.id);
    terminals.delete(row.id);
    try {
      if (driver && row.containerId) await driver.remove(row.containerId);
    } catch {
      // the container is also removed by the startup sweep if this fails
    }
    emit(row.id, { type: 'ended', status, failureReason, resultConnectionId });
  }

  return {
    async start(input: SandboxStart): Promise<SandboxSession> {
      if (!driver) throw dockerUnavailable();
      providers.assertCodexLoginTarget({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.reloginOf !== undefined
          ? { reloginOf: input.reloginOf }
          : {}),
      });
      let containerId: string;
      try {
        containerId = await driver.create();
      } catch {
        throw dockerUnavailable();
      }
      const id = randomUUID();
      const at = now();
      db.prepare(
        `INSERT INTO sandbox_login_session(id,provider,name,reloginOf,containerId,status,lastActivityAt,startedAt)
         VALUES(?,'codex',?,?,?,'in_progress',?,?)`,
      ).run(
        id,
        input.name ?? null,
        input.reloginOf ?? null,
        containerId,
        at,
        at,
      );
      return toPublic(requireRow(id));
    },

    get(id: string): SandboxSession {
      return toPublic(requireRow(id));
    },

    /**
     * The user says the login is finished. Reads the CLI's credential file out
     * of the sandbox, confirms the CLI accepts it, saves it encrypted, and
     * destroys the sandbox. Until all of that succeeds nothing is saved and the
     * session stays open.
     */
    async complete(id: string): Promise<SandboxSession> {
      const row = requireOpen(id);
      if (!driver || !row.containerId) throw dockerUnavailable();
      const notDone = (message: string) =>
        new ServiceError(409, 'login_not_complete', message);
      let content: Buffer | null;
      try {
        content = await readAuthFile(driver, row.containerId);
      } catch (error) {
        if (error instanceof BundleError)
          throw notDone(
            'The sandbox produced something that is not a Codex login. Cancel and start again.',
          );
        throw dockerUnavailable();
      }
      if (!content)
        throw notDone(
          'No sign-in was found yet. Finish the login in the terminal, then try again.',
        );
      const status = profile.classifyStatus(
        await driver.exec(row.containerId, profile.statusCommand),
      );
      if (status !== 'ok')
        throw notDone(
          'Codex has not confirmed the sign-in yet. Finish signing in, then try again.',
        );
      const bundle = bundleFromAuthFile(content);
      const expires = profile.readExpiry(content.toString('utf8'));
      const connection = row.reloginOf
        ? providers.replaceCodex(row.reloginOf, bundle, expires)
        : providers.createCodex({
            name: row.name ?? 'Codex',
            bundle,
            expiresAt: expires,
          });
      await end(row, 'succeeded', null, connection.id);
      return toPublic(requireRow(id));
    },

    /** Cancelling a session that already ended is harmless. */
    async cancel(id: string): Promise<void> {
      const row = requireRow(id);
      if (row.status === 'in_progress') await end(row, 'cancelled', null);
    },

    /** Ends sessions that have been idle for the configured time (15 minutes). */
    async sweep(): Promise<void> {
      const rows = db
        .prepare(
          "SELECT * FROM sandbox_login_session WHERE status='in_progress'",
        )
        .all() as SessionRow[];
      for (const row of rows)
        if (clock() - Date.parse(row.lastActivityAt) > config.sandboxIdleMs)
          await end(row, 'expired', 'No activity for too long.');
    },

    /** Any terminal activity moves the idle deadline forward. */
    touch(id: string): void {
      const at = now();
      const result = db
        .prepare(
          "UPDATE sandbox_login_session SET lastActivityAt=? WHERE id=? AND status='in_progress'",
        )
        .run(at, id);
      if (result.changes > 0)
        emit(id, {
          type: 'expiresAt',
          at: new Date(clock() + config.sandboxIdleMs).toISOString(),
        });
    },

    /** Opens the login in a TTY. One terminal at a time per session. */
    async attach(
      id: string,
    ): Promise<{ stream: Duplex; resize: TerminalHandle['resize'] }> {
      const row = requireOpen(id);
      if (!driver || !row.containerId) throw dockerUnavailable();
      if (terminals.has(id))
        throw new ServiceError(
          409,
          'conflict',
          'This session already has a terminal open.',
        );
      let handle: TerminalHandle;
      try {
        handle = await driver.terminal(row.containerId, profile.loginCommand);
      } catch {
        throw dockerUnavailable();
      }
      // Destroying the stream (or the sandbox going away) must never crash the server.
      handle.stream.on('error', () => undefined);
      terminals.set(id, handle);
      return handle;
    },

    /** Called when the browser's terminal closes: the next one may attach. */
    detach(id: string): void {
      const handle = terminals.get(id);
      terminals.delete(id);
      handle?.stream.destroy();
    },

    subscribe(id: string, listener: (event: SessionEvent) => void): () => void {
      const set = listeners.get(id) ?? new Set();
      set.add(listener);
      listeners.set(id, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(id);
      };
    },

    /** Start-up: a session cannot survive a restart; its sandbox is destroyed and nothing is saved. */
    async recover(): Promise<void> {
      const rows = db
        .prepare(
          "SELECT id, containerId FROM sandbox_login_session WHERE status='in_progress'",
        )
        .all() as { id: string; containerId: string | null }[];
      for (const row of rows) {
        db.prepare(
          "UPDATE sandbox_login_session SET status='failed', failureReason='Staplr restarted', endedAt=?, containerId=NULL WHERE id=?",
        ).run(now(), row.id);
        try {
          if (driver && row.containerId) await driver.remove(row.containerId);
        } catch {
          // already gone; the label sweep also removes leftovers
        }
      }
    },
  };
}

export type SandboxService = ReturnType<typeof createSandboxService>;

declare module 'fastify' {
  interface FastifyInstance {
    sandbox: SandboxService;
  }
}
