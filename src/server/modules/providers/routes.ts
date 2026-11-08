import type { FastifyInstance, FastifyReply } from 'fastify';
import { z, type ZodError } from 'zod';
import { sendProblem, ServiceError } from '../../lib/problem.js';
import {
  apiKeyReplaceSchema,
  claudeCreateSchema,
  providerRenameSchema,
} from '../../../shared/schemas/providers.js';
import type { ProviderService } from './service.js';

const idParams = z.object({ id: z.string().min(1).max(100) });
const modelParams = idParams.extend({ model: z.string().min(1).max(200) });

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

export function providerRoutes(app: FastifyInstance, service: ProviderService) {
  const base = '/api/provider-connections';

  app.get(base, () => service.list());

  app.post(base, async (request, reply) => {
    const body = request.body as { provider?: unknown } | null;
    if (body && typeof body === 'object' && body.provider === 'codex')
      return sendProblem(
        reply,
        422,
        'unsupported_provider',
        'Codex connects through a sandbox login, not an API key. Start the login from the Providers screen.',
      );
    const parsed = claudeCreateSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.code(201).send(await service.createClaude(parsed.data));
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.patch(`${base}/:id`, (request, reply) => {
    const params = idParams.safeParse(request.params);
    const parsed = providerRenameSchema.safeParse(request.body);
    if (!params.success) return invalid(reply, params.error);
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return service.rename(params.data.id, parsed.data.name);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.delete(`${base}/:id`, (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      service.disconnect(params.data.id);
      return reply.code(204).send();
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.put(`${base}/:id/api-key`, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const parsed = apiKeyReplaceSchema.safeParse(request.body);
    if (!params.success) return invalid(reply, params.error);
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return await service.replaceApiKey(params.data.id, parsed.data.apiKey);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get(`${base}/:id/impact`, (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      return service.impact(params.data.id);
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

  app.post(`${base}/:id/discover`, (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      return reply.code(202).send(service.discover(params.data.id));
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post(`${base}/:id/models/:model/check`, async (request, reply) => {
    const params = modelParams.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      return await service.checkModel(params.data.id, params.data.model);
    } catch (error) {
      return fail(reply, error);
    }
  });
}
