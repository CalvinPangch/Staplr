import { it, expect } from 'vitest';
import { fixture, signedIn, credentials } from '../integration/helpers';
import { parseDocument } from 'yaml';
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
it('denies unauthenticated requests to every registered non-public API route', async () => {
  const inventory: { method: string; url: string }[] = [];
  const f = await fixture(false, inventory);
  const routes: { method: string; url: string }[] = [];
  f.app.addHook('onRoute', (route) => {
    for (const method of [route.method].flat())
      routes.push({ method, url: route.url });
  });
  f.app.get('/api/test-protected', async () => ({ private: true }));
  try {
    await f.app.ready();
    for (const url of [
      '/api/session',
      '/api/audit-entries',
      '/api/error-events',
      '/api/test-protected',
    ]) {
      const res = await f.app.inject({ url });
      expect(res.statusCode, url).toBe(401);
    }
    expect((await f.app.inject({ url: '/api/setup/status' })).json()).toEqual({
      needsSetup: true,
    });
    expect(routes.some((r) => r.url === '/api/test-protected')).toBe(true);
    const allow = new Set([
      'GET /api/setup/status',
      'HEAD /api/setup/status',
      'POST /api/setup',
      'POST /api/session',
    ]);
    expect(inventory.length).toBeGreaterThan(0);
    for (const route of inventory) {
      if (
        allow.has(`${route.method} ${route.url}`) ||
        !route.url.startsWith('/api/')
      )
        continue;
      const res = await f.app.inject({
        method: route.method as 'GET' | 'HEAD' | 'POST' | 'DELETE',
        url: route.url.replace(/:id/g, 'missing'),
      });
      expect(res.statusCode, `${route.method} ${route.url}`).toBe(401);
    }
    const document = parseDocument(
      readFileSync(
        'specs/001-agent-team-orchestration/contracts/openapi.yaml',
        'utf8',
      ),
    );
    expect(document.errors).toHaveLength(0);
  } finally {
    await f.app.close();
    f.db.close();
  }
});

it('serves the static app shell without a session, with no user data, and falls back for app routes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'staplr-shell-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><div id="root"></div><script type="module" src="/assets/app.js"></script>',
  );
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("staplr shell");');
  const f = await fixture(false, undefined, dir);
  try {
    await f.app.ready();
    const page = await f.app.inject({ url: '/' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    const bundle = await f.app.inject({ url: '/assets/app.js' });
    expect(bundle.statusCode).toBe(200);
    const route = await f.app.inject({ url: '/projects/anything' });
    expect(route.statusCode).toBe(200);
    expect(route.body).toContain('id="root"');
    for (const reply of [page, bundle, route]) {
      expect(reply.headers['x-content-type-options']).toBe('nosniff');
      expect(reply.headers['content-security-policy']).toContain(
        "frame-ancestors 'none'",
      );
    }
    const cookie = await signedIn(f);
    for (const url of ['/', '/assets/app.js', '/projects/anything']) {
      const body = (await f.app.inject({ url })).body;
      expect(body).not.toContain(credentials.username);
      expect(body).not.toContain(credentials.password);
    }
    expect((await f.app.inject({ url: '/api/nothing-here' })).statusCode).toBe(
      401,
    );
    const missing = await f.app.inject({
      url: '/api/nothing-here',
      cookies: { staplr_session: cookie },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.headers['content-type']).toContain(
      'application/problem+json',
    );
  } finally {
    await f.app.close();
    f.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
