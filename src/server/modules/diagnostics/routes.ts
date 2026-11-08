import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { z } from 'zod';
export function diagnosticsRoutes(app: FastifyInstance, db: Database.Database) {
  app.get('/api/error-events', (request, reply) => {
    if (!z.object({}).strict().safeParse(request.query).success)
      return reply.code(422).send({
        code: 'invalid_input',
        message: 'This endpoint takes no query parameters.',
      });
    return db
      .prepare('SELECT * FROM error_event ORDER BY at DESC,id DESC LIMIT 200')
      .all();
  });
}
