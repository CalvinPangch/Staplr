import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { z } from 'zod';
import { sendProblem, ServiceError } from '../../lib/problem.js';
import {
  sourceControlCreateSchema,
  sourceControlUpdateSchema,
} from '../../../shared/schemas/source-control.js';
import { repositoryError } from './errors.js';
import type { SourceControlService } from './service.js';

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

export function sourceControlRoutes(
  app: FastifyInstance,
  service: SourceControlService,
) {
  const base = '/api/source-control-connections';

  app.get(base, () => service.list());

  app.post(base, async (request, reply) => {
    const parsed = sourceControlCreateSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.code(201).send(await service.create(parsed.data));
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.patch(`${base}/:id`, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const parsed = sourceControlUpdateSchema.safeParse(request.body);
    if (!params.success) return invalid(reply, params.error);
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return await service.update(params.data.id, parsed.data);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.delete(`${base}/:id`, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      service.remove(params.data.id);
      return reply.code(204).send();
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post(`${base}/:id/check`, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      return await service.check(params.data.id);
    } catch (error) {
      return fail(reply, error);
    }
  });

  const queryParams = z.object({ q: z.string().max(200).optional() });
  const branchParams = idParams.extend({
    repoRemoteId: z.string().min(1).max(100),
  });

  app.get(`${base}/:id/repositories`, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const query = queryParams.safeParse(request.query);
    if (!params.success) return invalid(reply, params.error);
    if (!query.success) return invalid(reply, query.error);
    try {
      const result = await service.repositories(params.data.id, query.data.q);
      if (!result.ok) throw repositoryError(result.failure);
      return result.repositories;
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get(
    `${base}/:id/repositories/:repoRemoteId/branches`,
    async (request, reply) => {
      const params = branchParams.safeParse(request.params);
      if (!params.success) return invalid(reply, params.error);
      try {
        const result = await service.branches(
          params.data.id,
          params.data.repoRemoteId,
        );
        if (!result.ok) throw repositoryError(result.failure);
        return result.branches;
      } catch (error) {
        return fail(reply, error);
      }
    },
  );
}
