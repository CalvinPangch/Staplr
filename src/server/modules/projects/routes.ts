import type { FastifyInstance, FastifyReply } from 'fastify';
import { z, type ZodError } from 'zod';
import { sendProblem, ServiceError } from '../../lib/problem.js';
import {
  projectCreateSchema,
  projectPatchSchema,
  replaceProjectManagerSchema,
} from '../../../shared/schemas/projects.js';
import type { ProjectService } from './service.js';
import type { TeamService } from './team-service.js';

const idParams = z.object({ id: z.string().min(1).max(100) });
const memberParams = idParams.extend({ agentId: z.string().min(1).max(100) });

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

export function projectRoutes(
  app: FastifyInstance,
  projects: ProjectService,
  teams: TeamService,
) {
  const base = '/api/projects';

  app.get(base, () => projects.list());

  app.post(base, async (request, reply) => {
    const parsed = projectCreateSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.code(202).send(await projects.create(parsed.data));
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get(`${base}/:id`, (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      return projects.get(params.data.id);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.patch(`${base}/:id`, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const parsed = projectPatchSchema.safeParse(request.body);
    if (!params.success) return invalid(reply, params.error);
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return await projects.patch(params.data.id, parsed.data);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.delete(`${base}/:id`, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      await projects.delete(params.data.id);
      return reply.code(204).send();
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post(`${base}/:id/download`, (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      return reply.code(202).send(projects.retryDownload(params.data.id));
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post(`${base}/:id/refresh`, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      return await projects.refresh(params.data.id);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get(`${base}/:id/team`, (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      return teams.team(params.data.id);
    } catch (error) {
      return fail(reply, error);
    }
  });

  // registered before /team/:agentId so "replace-project-manager" is not an agent id
  app.post(`${base}/:id/team/replace-project-manager`, (request, reply) => {
    const params = idParams.safeParse(request.params);
    const parsed = replaceProjectManagerSchema.safeParse(request.body);
    if (!params.success) return invalid(reply, params.error);
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return teams.replaceProjectManager(params.data.id, parsed.data.agentId);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.put(`${base}/:id/team/:agentId`, (request, reply) => {
    const params = memberParams.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      return teams.assign(params.data.id, params.data.agentId);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.delete(`${base}/:id/team/:agentId`, (request, reply) => {
    const params = memberParams.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      return teams.remove(params.data.id, params.data.agentId);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post(`${base}/:id/finalize-team`, (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      return teams.finalize(params.data.id);
    } catch (error) {
      return fail(reply, error);
    }
  });
}
