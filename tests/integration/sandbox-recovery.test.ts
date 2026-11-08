import { describe, it, expect } from 'vitest';
import { platformFixture } from './helpers';
import { createStartupRegistry } from '../../src/server/lib/startup';
import { createFakeSandboxDriver } from '../fakes/fake-sandbox-driver';

describe('sandbox restart recovery', () => {
  it('fails an in-progress login, removes its container and saves nothing', async () => {
    const driver = createFakeSandboxDriver();
    const startup = createStartupRegistry();
    const f = await platformFixture({ driver, startup });
    try {
      const started = await f.call('POST', '/api/sandbox-sessions', {
        provider: 'codex',
        name: 'interrupted',
      });
      const id = started.json().id as string;
      expect(driver.live()).toHaveLength(1);

      const results = await startup.runStartupTasks();
      expect(results).toContainEqual({
        name: 'recover-sandbox-sessions',
        ok: true,
      });

      const row = f.db
        .prepare(
          'SELECT status, failureReason, containerId FROM sandbox_login_session WHERE id=?',
        )
        .get(id);
      expect(row).toEqual({
        status: 'failed',
        failureReason: 'Staplr restarted',
        containerId: null,
      });
      expect(driver.live()).toHaveLength(0);
      expect((await f.call('GET', '/api/provider-connections')).json()).toEqual(
        [],
      );
    } finally {
      await f.close();
    }
  });
});
