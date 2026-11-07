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
}: {
  db: Database.Database;
  config: Config;
  clock?: () => number;
  routeInventory?: { method: string; url: string }[];
  /** Folder with the built web app; the app shell is served without a session. */
  webRoot?: string | undefined;
}) {
  const app = Fastify({
    logger: false,
    genReqId: () => randomUUID(),
    bodyLimit: 1024 * 1024,
  });
  if (routeInventory)
    app.addHook('onRoute', (route) => {
      for (const method of [route.method].flat())
        routeInventory.push({ method, url: route.url });
    });
  app.register(cookie, { secret: config.sessionSecret });
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
