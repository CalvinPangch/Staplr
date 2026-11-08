import { afterEach, it, expect, vi } from 'vitest';
import { createScheduler } from '../../src/server/modules/health/scheduler';
afterEach(() => vi.useRealTimers());
it('runs on startup, hourly and manually while isolating failing checkers', async () => {
  vi.useFakeTimers();
  const scheduler = createScheduler();
  const good = vi.fn(async () => {});
  const bad = vi.fn(async () => {
    throw new Error('offline');
  });
  scheduler.registerChecker('good', good);
  scheduler.registerChecker('bad', bad);
  await scheduler.start();
  expect(good).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(3600000);
  expect(good).toHaveBeenCalledTimes(2);
  await scheduler.runAll();
  expect(good).toHaveBeenCalledTimes(3);
  expect(bad).toHaveBeenCalledTimes(3);
  scheduler.stop();
  await vi.advanceTimersByTimeAsync(3600000);
  expect(good).toHaveBeenCalledTimes(3);
});
it('coalesces overlapping checks so credentials cannot refresh concurrently', async () => {
  const scheduler = createScheduler();
  let release: () => void = () => {};
  const run = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  scheduler.registerChecker('provider', run);
  const a = scheduler.runAll();
  const b = scheduler.runAll();
  expect(run).toHaveBeenCalledTimes(1);
  release();
  await Promise.all([a, b]);
});
