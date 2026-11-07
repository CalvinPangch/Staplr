import { describe, it, expect, vi, afterEach } from 'vitest';
import { createScheduler } from '../../src/server/modules/health/scheduler';

/**
 * SC-006 / FR-013 / FR-014. Each checker or readiness behavior adds its cases
 * here BEFORE its implementation (research R21); Polish reruns the combined set.
 */
afterEach(() => {
  vi.useRealTimers();
});

describe('hourly visibility of a failure (fake clock)', () => {
  it('shows an authentication failure within 70 minutes in the worst case', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-08T00:00:00Z'));
    let broken = false;
    let visibleAt: number | undefined;
    const scheduler = createScheduler();
    scheduler.registerChecker('credential', async () => {
      // each run takes up to a minute (plan: 20 connections in under 60 s)
      await new Promise((resolve) => setTimeout(resolve, 60_000));
      if (broken && visibleAt === undefined) visibleAt = Date.now();
    });
    const start = scheduler.start();
    await vi.advanceTimersByTimeAsync(60_000);
    await start;
    // the credential breaks one second after a check began: worst case
    await vi.advanceTimersByTimeAsync(1_000);
    broken = true;
    const brokeAt = Date.now();
    await vi.advanceTimersByTimeAsync(3_600_000 + 60_000);
    scheduler.stop();
    expect(visibleAt).toBeDefined();
    expect((visibleAt as number) - brokeAt).toBeLessThan(70 * 60_000);
  });

  it('does not stop other checkers when one fails, and reports each result', async () => {
    const scheduler = createScheduler();
    scheduler.registerChecker('a', async () => {
      throw new Error('provider unreachable');
    });
    scheduler.registerChecker('b', async () => undefined);
    const results = await scheduler.runAll();
    expect(results).toEqual([
      { name: 'a', ok: false },
      { name: 'b', ok: true },
    ]);
  });
});

describe('connection and readiness behavior (added per story, test first)', () => {
  it.todo(
    'GitHub/GitLab token rejection marks the connection and its projects (US1, US5)',
  );
  it.todo(
    'Claude key rejection and Codex expiry set needs_relogin; model denial does not (US2)',
  );
  it.todo(
    'network, rate-limit and service errors preserve the last confirmed status with retry info (US2)',
  );
  it.todo(
    'credential replacement and catalog revision change invalidate model access (US2, US4)',
  );
  it.todo(
    'status changes reach agent and project readiness in the same read cycle (US4, US5)',
  );
});
