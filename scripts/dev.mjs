// Starts the API (PORT, default 3000) and the Vite dev server (WEB_PORT,
// default 5173) together. With STAPLR_TEST_MODE=1 (Playwright) each API port
// gets its own fresh data folder, wiped at start, and throwaway secrets.
// Otherwise secrets are generated once and kept in .dev-data/ so a
// development database survives restarts.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const testMode = process.env.STAPLR_TEST_MODE === '1';
const env = { ...process.env };
const apiPort = env.PORT ?? '3000';
const webPort = env.WEB_PORT ?? '5173';

let dataDir = env.DATA_DIR;
if (!dataDir && testMode) {
  dataDir = join(tmpdir(), `staplr-e2e-${apiPort}`);
  rmSync(dataDir, { recursive: true, force: true });
}
dataDir ??= '.dev-data';
mkdirSync(dataDir, { recursive: true });

function secret(name, make) {
  if (testMode) return make();
  const file = join(dataDir, name);
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const value = make();
  writeFileSync(file, value, { mode: 0o600 });
  return value;
}

env.STAPLR_MASTER_KEY ??= secret('dev-master.key', () =>
  randomBytes(32).toString('base64'),
);
env.SESSION_SECRET ??= secret('dev-session.secret', () =>
  randomBytes(32).toString('hex'),
);
env.DATA_DIR = dataDir;
env.PORT = apiPort;
env.PUBLIC_URL ??= `http://localhost:${webPort}`;

// Test mode also runs a fake GitHub/GitLab the app talks to instead of the real
// platforms (the app only honours this override when STAPLR_TEST_MODE=1).
const fakePort = env.FAKE_PORT ?? String(Number(apiPort) + 20);
const anthropicPort = env.FAKE_ANTHROPIC_PORT ?? String(Number(apiPort) + 40);
if (testMode) {
  env.STAPLR_TEST_GITHUB_API_URL ??= `http://127.0.0.1:${fakePort}/github`;
  env.STAPLR_TEST_ANTHROPIC_API_URL ??= `http://127.0.0.1:${anthropicPort}`;
  // Codex sign-in runs in the stub image (npm run sandbox:build -- stub), never the real CLI.
  env.STAPLR_CODEX_PROFILE ??= 'stub';
}

const children = [
  spawn(
    process.execPath,
    [
      'node_modules/tsx/dist/cli.mjs',
      ...(testMode ? [] : ['watch']),
      'src/server/main.ts',
    ],
    { stdio: 'inherit', env },
  ),
  spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--port', webPort, '--strictPort'],
    { stdio: 'inherit', env },
  ),
];

if (testMode)
  children.push(
    spawn(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'tests/fakes/run-platform-fake.ts'],
      {
        stdio: 'inherit',
        env: {
          ...env,
          FAKE_PORT: fakePort,
          FAKE_ANTHROPIC_PORT: anthropicPort,
        },
      },
    ),
  );

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exit(code);
}
for (const child of children) child.on('exit', (code) => stop(code ?? 1));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
