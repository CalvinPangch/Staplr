import type { FastifyInstance, FastifyReply } from 'fastify';
import { z, type ZodError } from 'zod';
import { sendProblem, ServiceError } from '../../lib/problem.js';
import {
  soulCopySchema,
  soulCreateSchema,
  soulInputSchema,
} from '../../../shared/schemas/souls.js';
import type { SoulService } from './service.js';

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

export function soulRoutes(app: FastifyInstance, service: SoulService) {
  const base = '/api/souls';

  app.get(base, () => service.list());

  app.post(base, (request, reply) => {
    const parsed = soulCreateSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.code(201).send(service.create(parsed.data));
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get(`${base}/:id`, (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      return service.get(params.data.id);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.put(`${base}/:id`, (request, reply) => {
    const params = idParams.safeParse(request.params);
    const parsed = soulInputSchema.safeParse(request.body);
    if (!params.success) return invalid(reply, params.error);
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return service.update(params.data.id, parsed.data);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.delete(`${base}/:id`, (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      service.delete(params.data.id);
      return reply.code(204).send();
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post(`${base}/:id/copy`, (request, reply) => {
    const params = idParams.safeParse(request.params);
    const parsed = soulCopySchema.safeParse(request.body ?? {});
    if (!params.success) return invalid(reply, params.error);
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply
        .code(201)
        .send(service.copy(params.data.id, parsed.data.name));
    } catch (error) {
      return fail(reply, error);
    }
  });
}
