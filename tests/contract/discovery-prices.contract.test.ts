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
    // every model carries its list price, or nulls for Unknown
    for (const model of models.json().models as { price?: unknown }[])
      expect(model.price).toMatchObject({
        label: 'List price used for estimates',
      });
  } finally {
    await f.app.providers.whenDiscoveryIdle();
    await f.close();
  }
});

it('POST /api/provider-connections/{id}/discover matches the contract', async () => {
  const driver = createFakeSandboxDriver();
  const f = await platformFixture({ driver });
  try {
    const started = await f.call('POST', '/api/sandbox-sessions', {
      provider: 'codex',
      name: 'discover contract',
    });
    const container = [...driver.containers.keys()].at(-1) as string;
    await terminalFor(driver, container, 'OK');
    const id = (
      await f.call(
        'POST',
        `/api/sandbox-sessions/${started.json().id}/complete`,
      )
    ).json().resultConnectionId as string;
    await f.app.providers.whenDiscoveryIdle();

    const accepted = await f.call(
      'POST',
      `/api/provider-connections/${id}/discover`,
    );
    expect(accepted.statusCode).toBe(202);
    validateResponse(
      '/api/provider-connections/{id}/discover',
      'post',
      202,
      accepted.json(),
    );
    expect(accepted.json().discoveryStatus).toBe('running');
    await f.app.providers.whenDiscoveryIdle();

    const missing = await f.call(
      'POST',
      '/api/provider-connections/does-not-exist/discover',
    );
    expect(missing.statusCode).toBe(404);
    validateResponse(
      '/api/provider-connections/{id}/discover',
      'post',
      404,
      missing.json(),
    );

    f.anthropic.setKey('sk-ant-contract-discover', {
      models: ['claude-sonnet-5-5'],
    });
    const claude = (
      await f.call('POST', '/api/provider-connections', {
        provider: 'claude',
        authType: 'api_key',
        name: 'claude',
        apiKey: 'sk-ant-contract-discover',
      })
    ).json().id as string;
    const notCodex = await f.call(
      'POST',
      `/api/provider-connections/${claude}/discover`,
    );
    expect(notCodex.statusCode).toBe(409);
    validateResponse(
      '/api/provider-connections/{id}/discover',
      'post',
      409,
      notCodex.json(),
    );

    driver.revokeAll();
    await f.call('POST', `/api/provider-connections/${id}/check`);
    await f.app.providers.whenDiscoveryIdle();
    const relogin = await f.call(
      'POST',
      `/api/provider-connections/${id}/discover`,
    );
    expect(relogin.statusCode).toBe(409);
    expect(relogin.json().detail ?? relogin.json().message).toMatch(/Re-login/);
  } finally {
    await f.close();
  }
});

it('discover answers 503 when Docker is not available', async () => {
  const f = await platformFixture();
  try {
    f.db
      .prepare(
        `INSERT INTO provider_connection(id,provider,name,authType,credentialBundleSealed,credentialRevision,status,createdAt,updatedAt)
         VALUES('c1','codex','no docker','codex_login',x'00',1,'connected','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
      )
      .run();
    const reply = await f.call('POST', '/api/provider-connections/c1/discover');
    expect(reply.statusCode).toBe(503);
    validateResponse(
      '/api/provider-connections/{id}/discover',
      'post',
      503,
      reply.json(),
    );
  } finally {
    await f.close();
  }
});
