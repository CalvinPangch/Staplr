import { it, expect } from 'vitest';
import { platformFixture } from '../integration/helpers';
import { validateResponse } from './harness';

const problem = 'application/problem+json';

it('model price responses match the contract', async () => {
  const f = await platformFixture();
  try {
    const list = await f.call('GET', '/api/model-prices');
    expect(list.statusCode).toBe(200);
    validateResponse('/api/model-prices', 'get', 200, list.json());

    const created = await f.call('POST', '/api/model-prices', {
      provider: 'claude',
      model: 'claude-sonnet-5-5',
      inputPricePerMTok: '2.5',
      outputPricePerMTok: '12',
    });
    expect(created.statusCode).toBe(201);
    validateResponse('/api/model-prices', 'post', 201, created.json());

    const after = await f.call('GET', '/api/model-prices');
    validateResponse('/api/model-prices', 'get', 200, after.json());

    for (const bad of [
      {
        provider: 'claude',
        model: 'claude-sonnet-5-5',
        inputPricePerMTok: '-1',
        outputPricePerMTok: '1',
      },
      {
        provider: 'claude',
        model: 'nope',
        inputPricePerMTok: '1',
        outputPricePerMTok: '1',
      },
      {
        provider: 'claude',
        model: 'claude-sonnet-5-5',
        inputPricePerMTok: '1',
      },
    ]) {
      const refused = await f.call('POST', '/api/model-prices', bad);
      expect(refused.statusCode).toBe(422);
      validateResponse(
        '/api/model-prices',
        'post',
        422,
        refused.json(),
        problem,
      );
    }
  } finally {
    await f.close();
  }
});
