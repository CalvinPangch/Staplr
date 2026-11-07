import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { getSession } from './service.js';
export function registerAuth(
  app: FastifyInstance,
  db: Database.Database,
  clock: () => number,
) {
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (!path.startsWith('/api/')) return;
    const publicRoute =
      (request.method === 'GET' && path === '/api/setup/status') ||
      (request.method === 'POST' &&
        (path === '/api/setup' || path === '/api/session'));
    if (publicRoute) return;
    const raw = request.cookies['staplr_session'];
    const cookie = raw ? request.unsignCookie(raw) : undefined;
    if (
      !cookie?.valid ||
      !cookie.value ||
      !getSession(db, cookie.value, clock())
    )
      return reply
        .code(401)
        .send({ code: 'unauthorized', message: 'Sign in to continue.' });
  });
}
