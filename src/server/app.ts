import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Config } from './config.js';
import { problem } from '../shared/schemas/common.js';
import { registerAuth } from './modules/auth/hook.js';
import { authRoutes } from './modules/auth/routes.js';
import { auditRoutes } from './modules/audit/routes.js';
import { diagnosticsRoutes } from './modules/diagnostics/routes.js';
import { registerProviderChecker } from './modules/health/checkers/provider.js';
import { registerSourceControlChecker } from './modules/health/checkers/source-control.js';
import { healthRoutes } from './modules/health/routes.js';
import { createScheduler } from './modules/health/scheduler.js';
import {
  defaultImpactRegistry,
  type ImpactRegistry,
} from './modules/providers/impact.js';
import { providerRoutes } from './modules/providers/routes.js';
import { createProviderService } from './modules/providers/service.js';
import websocket from '@fastify/websocket';
import { defaultStartupRegistry, type StartupRegistry } from './lib/startup.js';
import { createCodexExecutor } from './modules/providers/codex.js';
import type { SandboxDriver } from './modules/sandbox/driver.js';
import { realProfile, stubProfile } from './modules/sandbox/profiles.js';
import { sandboxRoutes } from './modules/sandbox/routes.js';
import { createSandboxService } from './modules/sandbox/service.js';
import { terminalRoutes } from './modules/sandbox/terminal.js';
import { agentRoutes } from './modules/agents/routes.js';
import { registerAgentImpact } from './modules/agents/impact.js';
import { createAgentService } from './modules/agents/service.js';
import { priceRoutes } from './modules/prices/routes.js';
import { soulRoutes } from './modules/souls/routes.js';
import { createSoulService } from './modules/souls/service.js';
import { sourceControlRoutes } from './modules/source-control/routes.js';
import { createSourceControlService } from './modules/source-control/service.js';

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export function buildApp({
  db,
  config,
  clock = Date.now,
  routeInventory,
  webRoot,
  scheduler = createScheduler(),
  impactRegistry = defaultImpactRegistry,
  sandboxDriver = null,
  startup = defaultStartupRegistry,
}: {
  /** Docker (or a fake) for Codex sign-in sandboxes; null when Docker is unavailable. */
  sandboxDriver?: SandboxDriver | null;
  /** Recovery tasks run before the server listens. */
  startup?: StartupRegistry;
  db: Database.Database;
  config: Config;
  clock?: () => number;
  routeInventory?: { method: string; url: string }[];
  /** Hourly and on-demand health checks; checkers are registered below. */
  scheduler?: ReturnType<typeof createScheduler>;
  /** Who depends on a provider connection; agents and projects register here. */
  impactRegistry?: ImpactRegistry;
  /** Folder with the built web app; the app shell is served without a session. */
  webRoot?: string | undefined;
}) {
  const app = Fastify({
    logger: false,
    genReqId: () => randomUUID(),
    bodyLimit: 1024 * 1024,
    forceCloseConnections: true,
  });
  if (routeInventory)
    app.addHook('onRoute', (route) => {
      for (const method of [route.method].flat())
        routeInventory.push({ method, url: route.url });
    });
  app.register(cookie, { secret: config.sessionSecret });
  // Registered before auth so rejected upgrades are flagged and their sockets released.
  app.register(websocket, {
    options: { maxPayload: 64 * 1024 },
    // ws already answers an oversized frame with close code 1009; any other
    // socket error ends the connection without logging terminal data.
    errorHandler: (error, socket) => {
      if (
        (error as { code?: string }).code !==
        'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH'
      )
        socket.terminate();
    },
  });
  registerAuth(app, db, clock);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('content-security-policy', contentSecurityPolicy);
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
      request.headers.origin !== new URL(config.publicUrl).origin
    )
      return reply.code(403).send({
        code: 'invalid_origin',
        message: 'Use this installation in its own browser tab and retry.',
      });
  });
  app.setErrorHandler((error, request, reply) => {
    if (
      error instanceof Error &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode < 500
    )
      return reply
        .code(error.statusCode)
        .type('application/problem+json')
        .send({
          code: 'invalid_request',
          message: 'The request could not be read. Check its format and retry.',
        });
    const message = 'Unexpected server error. Retry, or review Diagnostics.';
    const stack =
      error instanceof Error && error.stack
        ? error.stack.split(error.message || '\u0000').join('[REDACTED]')
        : null;
    db.prepare(
      'INSERT INTO error_event(id,at,requestId,route,message,stack) VALUES(?,?,?,?,?,?)',
    ).run(
      randomUUID(),
      new Date(clock()).toISOString(),
      request.id,
      request.routeOptions.url ?? 'unknown',
      message,
      stack,
    );
    return reply
      .code(500)
      .type('application/problem+json')
      .send({ code: 'internal_error', message });
  });
  authRoutes(app, db, config, clock);
  auditRoutes(app, db);
  diagnosticsRoutes(app, db);
  const sourceControl = createSourceControlService({ db, config, clock });
  sourceControlRoutes(app, sourceControl);
  const profile =
    config.codexProfile === 'stub'
      ? stubProfile(config.codexImage)
      : realProfile(config.codexImage);
  const providers = createProviderService({
    db,
    config,
    clock,
    impact: impactRegistry,
    codex: sandboxDriver
      ? createCodexExecutor(sandboxDriver, profile)
      : undefined,
  });
  app.decorate('providers', providers);
  providerRoutes(app, providers);
  const sandbox = createSandboxService({
    db,
    config,
    clock,
    driver: sandboxDriver,
    providers,
    profile,
  });
  app.decorate('sandbox', sandbox);
  app.register(async (scope) => {
    sandboxRoutes(scope, sandbox);
    terminalRoutes(scope, sandbox, config);
  });
  if (!startup.hasStartupTask('recover-sandbox-sessions'))
    startup.registerStartupTask('recover-sandbox-sessions', () =>
      sandbox.recover(),
    );
  const souls = createSoulService({ db, clock });
  app.decorate('souls', souls);
  soulRoutes(app, souls);
  const agents = createAgentService({ db, clock, providers });
  app.decorate('agents', agents);
  registerAgentImpact({ db, impact: impactRegistry, souls });
  agentRoutes(app, agents);
  priceRoutes(app, providers);
  healthRoutes(app, scheduler);
  registerSourceControlChecker(scheduler, sourceControl);
  registerProviderChecker(scheduler, providers);
  if (webRoot) app.register(fastifyStatic, { root: webRoot, wildcard: false });
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    // App routes (no file extension) fall back to the shell; missing files and
    // unknown API routes stay real 404s.
    if (
      webRoot &&
      request.method === 'GET' &&
      !path.startsWith('/api/') &&
      !path.includes('.')
    )
      return reply.type('text/html; charset=utf-8').sendFile('index.html');
    return reply
      .code(404)
      .type('application/problem+json')
      .send(problem('not_found', 'That address does not exist.'));
  });
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    souls: ReturnType<typeof createSoulService>;
  }
}
