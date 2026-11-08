import type { FastifyInstance, FastifyReply } from 'fastify';
import { z, type ZodError } from 'zod';
import { sendProblem, ServiceError } from '../../lib/problem.js';
import {
  moveRequestSchema,
  ticketInputSchema,
  ticketPatchSchema,
} from '../../../shared/schemas/tickets.js';
import type { TicketService } from './service.js';

const idParams = z.object({ id: z.string().min(1).max(100) });

function invalid(reply: FastifyReply, error: ZodError) {
  return sendProblem(
    reply,
    422,
    'invalid_input',
    [...new Set(error.issues.map((i) => i.message))].join(' '),
  );
}

function fail(reply: FastifyReply, error: unknown) {
  if (error instanceof ServiceError)
    return sendProblem(
      reply,
      error.status,
      error.code,
      error.message,
      error.details,
    );
  throw error;
}

export function ticketRoutes(app: FastifyInstance, service: TicketService) {
  app.get('/api/projects/:id/board', (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      return service.getBoard(params.data.id);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/api/projects/:id/tickets', (request, reply) => {
    const params = idParams.safeParse(request.params);
    const parsed = ticketInputSchema.safeParse(request.body);
    if (!params.success) return invalid(reply, params.error);
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.code(201).send(service.create(params.data.id, parsed.data));
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.patch('/api/tickets/:id', (request, reply) => {
    const params = idParams.safeParse(request.params);
    const parsed = ticketPatchSchema.safeParse(request.body);
    if (!params.success) return invalid(reply, params.error);
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return service.update(params.data.id, parsed.data);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.delete('/api/tickets/:id', (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      service.remove(params.data.id);
      return reply.code(204).send();
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/api/tickets/:id/move', (request, reply) => {
    const params = idParams.safeParse(request.params);
    const parsed = moveRequestSchema.safeParse(request.body);
    if (!params.success) return invalid(reply, params.error);
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return service.move(
        params.data.id,
        parsed.data.toStatus,
        parsed.data.toIndex,
      );
    } catch (error) {
      return fail(reply, error);
    }
  });
}
