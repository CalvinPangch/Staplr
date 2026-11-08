type Checker = () => Promise<void>;
export function createScheduler() {
  const checkers = new Map<string, Checker>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let active: Promise<{ name: string; ok: boolean }[]> | undefined;
  function runAll() {
    if (active) return active;
    const work = Promise.all(
      [...checkers].map(async ([name, fn]) => {
        try {
          await fn();
          return { name, ok: true };
        } catch {
          return { name, ok: false };
        }
      }),
    );
    active = work;
    void work.finally(() => {
      if (active === work) active = undefined;
    });
    return work;
  }
  return {
    registerChecker(name: string, fn: Checker) {
      if (checkers.has(name)) throw new Error('Checker already registered');
      checkers.set(name, fn);
    },
    runAll,
    async start() {
      if (timer) return;
      await runAll();
      timer = setInterval(() => {
        void runAll();
      }, 3600000);
      timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}
