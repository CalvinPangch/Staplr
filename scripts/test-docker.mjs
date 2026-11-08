// Runs the Docker sandbox tests against the same socket proxy production uses
// (compose.yaml), published on 127.0.0.1:23750 by compose.test.yaml. Starts the
// proxy if it is not already running and removes it afterwards when this
// script started it.
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

const compose = ['compose', '-f', 'compose.yaml', '-f', 'compose.test.yaml'];
// compose.yaml requires these for the staplr service; the proxy never reads
// them, so placeholders are enough to start only the proxy.
const env = {
  ...process.env,
  SESSION_SECRET: process.env.SESSION_SECRET || 'unused-by-docker-tests',
  STAPLR_MASTER_KEY: process.env.STAPLR_MASTER_KEY || 'unused-by-docker-tests',
};
const shell = process.platform === 'win32';

function run(command, args) {
  return spawnSync(command, args, { stdio: 'inherit', env, shell }).status ?? 1;
}

function proxyUp() {
  return new Promise((resolve) => {
    const socket = net.connect(23750, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitForProxy() {
  for (let i = 0; i < 30; i++) {
    if (await proxyUp()) return true;
    await sleep(500);
  }
  return false;
}

const alreadyRunning = await proxyUp();
if (!alreadyRunning) {
  if (run('docker', [...compose, 'up', '-d', 'docker-proxy']) !== 0) {
    console.error(
      'Could not start the Docker socket proxy. Is Docker running?',
    );
    process.exit(1);
  }
  if (!(await waitForProxy())) {
    console.error('The Docker socket proxy did not open port 23750.');
    run('docker', [...compose, 'rm', '-sf', 'docker-proxy']);
    process.exit(1);
  }
}

const status = run('npx', ['vitest', 'run', '--project', 'docker']);
if (!alreadyRunning) run('docker', [...compose, 'rm', '-sf', 'docker-proxy']);
process.exit(status);
