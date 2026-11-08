import { describe, it, expect } from 'vitest';
import { createStartupRegistry } from '../../src/server/lib/startup';

describe('startup task registry', () => {
  it('runs tasks in registration order and reports each result', async () => {
    const registry = createStartupRegistry();
    const order: string[] = [];
    registry.registerStartupTask('first', async () => {
      order.push('first');
    });
    registry.registerStartupTask('second', async () => {
      order.push('second');
    });
    const results = await registry.runStartupTasks();
    expect(order).toEqual(['first', 'second']);
    expect(results).toEqual([
      { name: 'first', ok: true },
      { name: 'second', ok: true },
    ]);
  });

  it('keeps running after a failure and reports it without leaking the error text', async () => {
    const registry = createStartupRegistry();
    registry.registerStartupTask('broken', async () => {
      throw new Error('secret-detail');
    });
    registry.registerStartupTask('after', async () => undefined);
    const results = await registry.runStartupTasks();
    expect(results).toEqual([
      { name: 'broken', ok: false },
      { name: 'after', ok: true },
    ]);
    expect(JSON.stringify(results)).not.toContain('secret-detail');
  });

  it('rejects a duplicate task name', () => {
    const registry = createStartupRegistry();
    registry.registerStartupTask('once', async () => undefined);
    expect(() =>
      registry.registerStartupTask('once', async () => undefined),
    ).toThrow(/already registered/);
  });

  it('runs a task again on a later call', async () => {
    const registry = createStartupRegistry();
    let count = 0;
    registry.registerStartupTask('counter', async () => {
      count += 1;
    });
    await registry.runStartupTasks();
    await registry.runStartupTasks();
    expect(count).toBe(2);
  });
});
