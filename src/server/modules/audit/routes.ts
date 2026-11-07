import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { z } from 'zod';
export function auditRoutes(app: FastifyInstance, db: Database.Database) {
  app.get('/api/audit-entries', (request, reply) => {
    const parsed = z
      .object({ before: z.string().datetime().optional() })
      .strict()
      .safeParse(request.query);
    if (!parsed.success)
      return reply.code(422).send({
        code: 'invalid_input',
        message: 'Use an ISO date-time audit cursor.',
      });
    const rows = parsed.data.before
      ? db
          .prepare(
            'SELECT * FROM audit_entry WHERE at<? ORDER BY at DESC,id DESC LIMIT 200',
          )
          .all(parsed.data.before)
      : db
          .prepare(
            'SELECT * FROM audit_entry ORDER BY at DESC,id DESC LIMIT 200',
          )
          .all();
    return rows;
  });
}
