import { it, expect } from 'vitest';
import { platformFixture } from '../integration/helpers';
import {
  createFakeSandboxDriver,
  terminalFor,
} from '../fakes/fake-sandbox-driver';
import { validateResponse } from './harness';

it('connection and model-list responses include discovery and match the contract', async () => {
  const driver = createFakeSandboxDriver();
  const f = await platformFixture({ driver });
  try {
    const started = await f.call('POST', '/api/sandbox-sessions', {
      provider: 'codex',
      name: 'contract codex',
    });
    const container = [...driver.containers.keys()].at(-1) as string;
    await terminalFor(driver, container, 'OK models=gpt-6-astra,gpt-new');
    const done = await f.call(
      'POST',
      `/api/sandbox-sessions/${started.json().id}/complete`,
    );
    const id = done.json().resultConnectionId as string;
    await f.app.providers.whenDiscoveryIdle();

    const list = await f.call('GET', '/api/provider-connections');
    validateResponse('/api/provider-connections', 'get', 200, list.json());
    const models = await f.call(
      'GET',
      `/api/models?providerConnectionId=${id}`,
    );
    expect(models.statusCode).toBe(200);
    validateResponse('/api/models', 'get', 200, models.json());
    expect(models.json().discoveryStatus).toBe('finished');
  } finally {
    await f.app.providers.whenDiscoveryIdle();
    await f.close();
  }
});
