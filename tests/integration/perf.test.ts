import { describe, it, expect } from 'vitest';
import { fixture, signedIn } from './helpers';

/**
 * Plan performance goals, measured on the documented host (2 vCPU). Each list
 * or picker adds its fixture and assertion BEFORE its implementation
 * (research R21). The limits below are the contract; do not loosen them.
 */
export const limits = {
  repositorySearchMs: 300,
  listEndpointMs: 500,
} as const;

async function timed(run: () => Promise<unknown>): Promise<number> {
  const started = performance.now();
  await run();
  return performance.now() - started;
}

describe('list endpoints stay within budget', () => {
  it('serves 200 audit entries and 200 error events in under 500 ms', async () => {
    const f = await fixture();
    try {
      const cookie = await signedIn(f);
      const audit = f.db.prepare(
        'INSERT INTO audit_entry(id,at,action,targetType,targetId,targetName,detail) VALUES(?,?,?,?,?,?,?)',
      );
      const errors = f.db.prepare(
        'INSERT INTO error_event(id,at,requestId,route,message,stack) VALUES(?,?,?,?,?,?)',
      );
      f.db.transaction(() => {
        for (let i = 0; i < 400; i++) {
          const at = new Date(Date.UTC(2026, 10, 8, 0, 0, i)).toISOString();
          audit.run(
            `a${i}`,
            at,
            'scc.added',
            'source_control_connection',
            `c${i}`,
            `conn-${i}`,
            '{}',
          );
          errors.run(
            `e${i}`,
            at,
            `r${i}`,
            '/api/x',
            'Unexpected server error.',
            null,
          );
        }
      })();
      for (const url of ['/api/audit-entries', '/api/error-events']) {
        const ms = await timed(() =>
          f.app.inject({ url, cookies: { staplr_session: cookie } }),
        );
        expect(ms, url).toBeLessThan(limits.listEndpointMs);
      }
    } finally {
      await f.app.close();
      f.db.close();
    }
  });
});

describe('pickers and lists (added per story, test first)', () => {
  it.todo('repository search over 1,000 repositories under 300 ms (US5)');
  it.todo('agent list with 100 agents under 500 ms (US4)');
  it.todo('project list with 50 projects under 500 ms (US5)');
});
