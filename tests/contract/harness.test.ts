import { it, expect } from 'vitest';
import { validateResponse } from './harness';
it('validates actual response schemas and rejects mismatches', () => {
  expect(() =>
    validateResponse('/api/setup/status', 'GET', 200, { needsSetup: true }),
  ).not.toThrow();
  expect(() =>
    validateResponse('/api/setup/status', 'GET', 200, { needsSetup: 'yes' }),
  ).toThrow();
  expect(() =>
    validateResponse('/api/models', 'GET', 200, {
      catalogRevision: 'one',
      models: [],
    }),
  ).not.toThrow();
  expect(() => validateResponse('/api/setup/status', 'GET', 503, {})).toThrow();
});
