import type { FastifyInstance, FastifyReply } from 'fastify';
import { z, type ZodError } from 'zod';
import { sendProblem, ServiceError } from '../../lib/problem.js';
import { sandboxStartSchema } from '../../../shared/schemas/sandbox.js';
import type { SandboxService } from './service.js';

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

export function sandboxRoutes(app: FastifyInstance, service: SandboxService) {
  const base = '/api/sandbox-sessions';

  app.post(base, async (request, reply) => {
    const body = request.body as { provider?: unknown } | null;
    if (body && typeof body === 'object' && body.provider === 'claude')
      return sendProblem(
        reply,
        422,
        'unsupported_provider',
        'Claude connects with an API key, not a sandbox login. Add the key from the Providers screen.',
      );
    const parsed = sandboxStartSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.code(201).send(await service.start(parsed.data));
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

  app.delete(`${base}/:id`, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      await service.cancel(params.data.id);
      return reply.code(204).send();
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post(`${base}/:id/complete`, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      return await service.complete(params.data.id);
    } catch (error) {
      return fail(reply, error);
    }
  });
}
