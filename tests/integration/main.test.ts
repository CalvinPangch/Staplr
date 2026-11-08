import { it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInstallation } from '../../src/server/main';
import { createStartupRegistry } from '../../src/server/lib/startup';

const env = {
  STAPLR_MASTER_KEY: Buffer.alloc(32, 7).toString('base64'),
  SESSION_SECRET: 'test-session-secret-at-least-32-characters',
  PUBLIC_URL: 'http://localhost:3000',
};

it('migrates, runs startup tasks before serving, and starts nothing it was not asked to', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'staplr-main-'));
  const startup = createStartupRegistry();
  const seen: string[] = [];
  startup.registerStartupTask('probe', async () => {
    seen.push('probe');
  });
  const installation = await createInstallation(
    { ...env, DATA_DIR: dir },
    { startup, docker: null },
  );
  try {
    expect(seen).toEqual(['probe']);
    expect(installation.startupResults).toContainEqual({
      name: 'probe',
      ok: true,
    });
    const status = await installation.app.inject({
      url: '/api/setup/status',
    });
    expect(status.json()).toEqual({ needsSetup: true });
    expect(
      installation.db
        .prepare("SELECT name FROM sqlite_master WHERE name='user'")
        .get(),
    ).toBeTruthy();
  } finally {
    await installation.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('refuses to start with an insecure remote PUBLIC_URL', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'staplr-main-'));
  try {
    await expect(
      createInstallation(
        { ...env, DATA_DIR: dir, PUBLIC_URL: 'http://192.168.1.20:3000' },
        { docker: null },
      ),
    ).rejects.toThrow(/HTTPS/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('serves the built web app when a web root exists', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'staplr-main-'));
  const web = join(dir, 'web');
  mkdirSync(web);
  writeFileSync(
    join(web, 'index.html'),
    '<!doctype html><div id="root"></div>',
  );
  const installation = await createInstallation(
    { ...env, DATA_DIR: join(dir, 'data') },
    { webRoot: web, docker: null },
  );
  try {
    const page = await installation.app.inject({ url: '/' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('id="root"');
  } finally {
    await installation.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
