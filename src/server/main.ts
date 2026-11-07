import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type Docker from 'dockerode';
import { buildApp } from './app.js';
import { parseConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { migrateUp } from './db/migrate.js';
import { cleanupOrphans, createDockerClient } from './lib/docker.js';
import { createLogger } from './lib/logger.js';
import { defaultStartupRegistry, type StartupRegistry } from './lib/startup.js';
import { createScheduler } from './modules/health/scheduler.js';

const cleanupTask = 'cleanup-sandbox-containers';

export interface InstallationOptions {
  /** Folder with the built web app. Defaults to ./dist/web when it exists. */
  webRoot?: string;
  /** Docker client, or null to run without Docker (tests, tooling). */
  docker?: Docker | null;
  /** Registry of startup recovery tasks. Defaults to the shared one. */
  startup?: StartupRegistry;
}

/**
 * Builds a ready installation without listening: validated configuration,
 * migrated database, startup recovery finished, health scheduler created.
 */
export async function createInstallation(
  env: Record<string, string | undefined>,
  options: InstallationOptions = {},
) {
  const config = parseConfig(env);
  const logger = createLogger();
  if (config.allowInsecureHttp && !config.cookieSecure)
    logger.warn(
      'Plain HTTP is allowed for a non-local address. Passwords and tokens cross the network unencrypted.',
    );
  const { raw: db } = createDatabase(join(config.dataDir, 'staplr.db'));
  migrateUp(db);

  const startup = options.startup ?? defaultStartupRegistry;
  const docker =
    options.docker === undefined
      ? createDockerClient(config.dockerHost)
      : options.docker;
  if (docker && !startup.hasStartupTask(cleanupTask))
    startup.registerStartupTask(cleanupTask, async () => {
      await cleanupOrphans(docker, 'staplr.sandbox');
    });
  const startupResults = await startup.runStartupTasks();
  for (const result of startupResults)
    if (!result.ok)
      logger.warn({ task: result.name }, 'A startup recovery task failed');

  const defaultWeb = resolve(process.cwd(), 'dist/web');
  const webRoot =
    options.webRoot ?? (existsSync(defaultWeb) ? defaultWeb : undefined);
  const app = buildApp({ db, config, webRoot });
  const scheduler = createScheduler();
  return {
    app,
    db,
    config,
    scheduler,
    startupResults,
    async close() {
      scheduler.stop();
      await app.close();
      db.close();
    },
  };
}

export async function startServer(
  env: Record<string, string | undefined> = process.env,
  options: InstallationOptions = {},
) {
  const installation = await createInstallation(env, options);
  await installation.app.listen({
    port: installation.config.port,
    host: installation.config.host,
  });
  // Checks run after listening so a slow provider never blocks sign-in.
  void installation.scheduler.start();
  createLogger().info(
    { port: installation.config.port },
    'Staplr is listening',
  );
  return installation;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href)
  startServer().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Staplr failed');
    process.exit(1);
  });
