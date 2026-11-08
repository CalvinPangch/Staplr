import { it, expect } from 'vitest';
import { platformFixture } from '../integration/helpers';
import { validateResponse } from './harness';

it('model price responses match the contract (read-only since feature 002)', async () => {
  const f = await platformFixture();
  try {
    const before = await f.call('GET', '/api/model-prices');
    expect(before.statusCode).toBe(200);
    validateResponse('/api/model-prices', 'get', 200, before.json());

    const status = await f.call('GET', '/api/prices/status');
    expect(status.statusCode).toBe(200);
    validateResponse('/api/prices/status', 'get', 200, status.json());

    const refresh = await f.call('POST', '/api/prices/refresh');
    expect(refresh.statusCode).toBe(202);
    validateResponse('/api/prices/refresh', 'post', 202, refresh.json());
    await f.app.prices.whenIdle();

    const after = await f.call('GET', '/api/model-prices');
    validateResponse('/api/model-prices', 'get', 200, after.json());
    expect(
      (after.json() as { source: string }[]).some(
        (p) => p.source === 'official',
      ),
    ).toBe(true);
    const done = await f.call('GET', '/api/prices/status');
    validateResponse('/api/prices/status', 'get', 200, done.json());
  } finally {
    await f.close();
  }
});
