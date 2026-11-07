export interface StartupResult {
  name: string;
  ok: boolean;
}

export interface StartupRegistry {
  registerStartupTask(name: string, task: () => Promise<void>): void;
  hasStartupTask(name: string): boolean;
  runStartupTasks(): Promise<StartupResult[]>;
}

/**
 * Recovery work that must finish before the server starts listening, for
 * example marking interrupted downloads and sandbox logins as failed.
 * A failing task is reported but never stops the others or the server, and
 * the error text is not kept because it could contain provider output.
 */
export function createStartupRegistry(): StartupRegistry {
  const tasks = new Map<string, () => Promise<void>>();
  return {
    registerStartupTask(name, task) {
      if (tasks.has(name))
        throw new Error(`Startup task "${name}" is already registered`);
      tasks.set(name, task);
    },
    hasStartupTask(name) {
      return tasks.has(name);
    },
    async runStartupTasks() {
      const results: StartupResult[] = [];
      for (const [name, task] of tasks) {
        try {
          await task();
          results.push({ name, ok: true });
        } catch {
          results.push({ name, ok: false });
        }
      }
      return results;
    },
  };
}

/** Registry that feature modules add their recovery tasks to. */
export const defaultStartupRegistry = createStartupRegistry();
export const registerStartupTask =
  defaultStartupRegistry.registerStartupTask.bind(defaultStartupRegistry);
export const runStartupTasks = defaultStartupRegistry.runStartupTasks.bind(
  defaultStartupRegistry,
);
