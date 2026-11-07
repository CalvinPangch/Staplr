import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sendProblem, ServiceError } from '../../lib/problem.js';
import type { ProviderService } from '../providers/service.js';
import { priceInputSchema } from '../../../shared/schemas/prices.js';
import { catalogRevision } from './catalog.js';
import type { PriceService } from './service.js';

const modelsQuery = z.object({
  providerConnectionId: z.string().min(1).max(100),
});

/**
 * Catalog candidates for one connection, each with that connection's own
 * availability evidence. Unknown entries stay listed so they can be checked.
 */
export function priceRoutes(
  app: FastifyInstance,
  providers: ProviderService,
  prices: PriceService,
) {
  app.get('/api/model-prices', () => prices.list());

  app.post('/api/model-prices', (request, reply) => {
    const parsed = priceInputSchema.safeParse(request.body);
    if (!parsed.success)
      return sendProblem(
        reply,
        422,
        'invalid_input',
        [...new Set(parsed.error.issues.map((i) => i.message))].join(' '),
      );
    try {
      return reply.code(201).send(prices.setPrice(parsed.data));
    } catch (error) {
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
  });

  app.get('/api/models', (request, reply) => {
    const query = modelsQuery.safeParse(request.query);
    if (!query.success)
      return sendProblem(
        reply,
        422,
        'invalid_input',
        'Choose a provider connection to list its models.',
      );
    try {
      return {
        catalogRevision: catalogRevision(),
        models: providers.listModelAccess(query.data.providerConnectionId),
      };
    } catch (error) {
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
  });
}
