// Starts the PRODUCTION build (dist/server + dist/web, one process) on its own
// port with a fresh data folder, for the browser performance test (research R22).
// Run `npm run build` first. Used by playwright.config.ts.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = process.env.PORT ?? '4312';
const dataDir = join(tmpdir(), `staplr-e2e-${port}`);
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: port,
  DATA_DIR: dataDir,
  PUBLIC_URL: `http://localhost:${port}`,
  STAPLR_MASTER_KEY: randomBytes(32).toString('base64'),
  SESSION_SECRET: randomBytes(32).toString('hex'),
};

const child = spawn(process.execPath, ['dist/server/main.js'], {
  stdio: 'inherit',
  env,
});
child.on('exit', (code) => process.exit(code ?? 1));
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    child.kill();
    process.exit(0);
  });
