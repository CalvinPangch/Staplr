import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sendProblem, ServiceError } from '../../lib/problem.js';
import type { ProviderService } from '../providers/service.js';
import { catalogRevision } from './catalog.js';
import type { PriceService } from './service.js';

const modelsQuery = z.object({
  providerConnectionId: z.string().min(1).max(100),
});

/**
 * Prices are read-only: they come from the providers' official pages
 * (feature 002). The model list for one connection carries each model's
 * availability for that connection and its current list price.
 */
export function priceRoutes(
  app: FastifyInstance,
  providers: ProviderService,
  prices: PriceService,
) {
  app.get('/api/model-prices', () => prices.list());

  app.get('/api/prices/status', () => prices.status());

  /** "Refresh prices": starts a read now; a request while one runs joins it. */
  app.post('/api/prices/refresh', (_request, reply) => {
    void prices.refresh();
    return reply.code(202).send(prices.status());
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
      const connection = providers.get(query.data.providerConnectionId);
      return {
        catalogRevision: catalogRevision(),
        discoveryStatus: connection.discoveryStatus,
        modelsRefreshedAt: connection.modelsRefreshedAt,
        models: providers
          .listModelAccess(query.data.providerConnectionId)
          .map((model) => ({
            ...model,
            price: prices.priceFor(connection.provider, model.id),
          })),
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
