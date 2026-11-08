import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { Config } from '../../config.js';
import { z } from 'zod';
import {
  findUser,
  createOwner,
  checkPassword,
  newSession,
  sessionHash,
} from './service.js';
const credentials = z
  .object({
    username: z.string().min(3).max(64),
    password: z.string().min(12).max(256),
  })
  .strict();
export function authRoutes(
  app: FastifyInstance,
  db: Database.Database,
  config: Config,
  clock: () => number,
) {
  const options = {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: config.cookieSecure,
    path: '/',
    signed: true,
  };
  app.get('/api/setup/status', () => ({ needsSetup: !findUser(db) }));
  app.post('/api/setup', async (request, reply) => {
    if (findUser(db))
      return reply.code(409).send({
        code: 'already_setup',
        message: 'The owner already exists. Sign in.',
      });
    const parsed = credentials.safeParse(request.body);
    if (!parsed.success)
      return reply.code(422).send({
        code: 'invalid_input',
        message:
          'Use a username of 3–64 characters and a password of at least 12 characters.',
      });
    if (
      !(await createOwner(
        db,
        parsed.data.username,
        parsed.data.password,
        clock(),
      ))
    )
      return reply.code(409).send({
        code: 'already_setup',
        message: 'The owner already exists. Sign in.',
      });
    const user = findUser(db);
    if (!user) throw new Error('Owner was not persisted');
    reply.setCookie(
      'staplr_session',
      newSession(db, user.id, clock()),
      options,
    );
    return reply.code(201).send();
  });
  app.post('/api/session', async (request, reply) => {
    const parsed = credentials.safeParse(request.body);
    const user = findUser(db);
    if (
      !parsed.success ||
      !(await checkPassword(user, parsed.data.username, parsed.data.password))
    )
      return reply.code(401).send({
        code: 'invalid_credentials',
        message: 'Sign-in failed. Check your username and password.',
      });
    if (!user) throw new Error('Owner missing');
    reply.setCookie(
      'staplr_session',
      newSession(db, user.id, clock()),
      options,
    );
    return reply.code(204).send();
  });
  app.get('/api/session', () => ({ username: findUser(db)?.username }));
  app.delete('/api/session', (request, reply) => {
    const cookie = request.cookies['staplr_session'];
    if (cookie) {
      const unsigned = request.unsignCookie(cookie);
      if (unsigned.valid && unsigned.value)
        db.prepare('DELETE FROM session WHERE id=?').run(
          sessionHash(unsigned.value),
        );
    }
    reply.clearCookie('staplr_session', { path: '/' });
    return reply.code(204).send();
  });
}
