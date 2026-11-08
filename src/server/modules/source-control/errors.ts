import { ServiceError } from '../../lib/problem.js';
import type { RepositoryFailure } from './adapters/types.js';

/** What a person should hear when the platform cannot answer a repository question. */
export function repositoryError(failure: RepositoryFailure): ServiceError {
  if (failure === 'invalid')
    return new ServiceError(
      422,
      'token_invalid',
      'The platform rejected this connection token. Replace it on the Source control screen.',
    );
  if (failure === 'not_found')
    return new ServiceError(
      404,
      'not_found',
      'That repository was not found, or this connection cannot reach it.',
    );
  return new ServiceError(
    503,
    'provider_unavailable',
    'Could not reach the platform. Retry in a moment.',
  );
}
