import type { FastifyInstance } from 'fastify';
import type { createScheduler } from './scheduler.js';

type Scheduler = ReturnType<typeof createScheduler>;

export function healthRoutes(app: FastifyInstance, scheduler: Scheduler) {
  // "Check all connections": start the run and answer at once. Results appear
  // on each connection; a run already in progress is shared, not repeated.
  app.post('/api/health/check-all', (_request, reply) => {
    void scheduler.runAll();
    return reply.code(202).send();
  });
}
