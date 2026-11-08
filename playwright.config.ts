import { defineConfig, devices } from '@playwright/test';

// Two fully separate installations (API + web server + database): one for the
// desktop viewport and one for a 320 px phone viewport, so sign-up state never
// leaks between them. Inside each installation the first-run spec (auth.spec.ts)
// runs first on the fresh database, then every other spec.
const installations = [
  { id: 'desktop', api: 4310, web: 4320, viewport: undefined },
  { id: 'mobile', api: 4311, web: 4321, viewport: { width: 320, height: 640 } },
] as const;

// A third installation runs the production build (one process serves the API and
// the built web app) for the board performance test, which must not measure the
// development server (research R22). It only runs board-perf.spec.ts.
const production = { id: 'perf', port: 4312 } as const;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: { trace: 'retain-on-failure' },
  projects: [
    ...installations.flatMap((i) => {
      const use = {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${i.web}`,
        ...(i.viewport ? { viewport: i.viewport } : {}),
      };
      return [
        { name: `${i.id}-first-run`, testMatch: /auth\.spec\.ts/, use },
        {
          name: i.id,
          testIgnore: [/auth\.spec\.ts/, /board-perf\.spec\.ts/],
          dependencies: [`${i.id}-first-run`],
          use,
        },
      ];
    }),
    {
      name: production.id,
      testMatch: /board-perf\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${production.port}`,
      },
    },
  ],
  webServer: [
    {
      command: 'npm run build && node scripts/e2e-production.mjs',
      url: `http://localhost:${production.port}`,
      reuseExistingServer: false,
      timeout: 240000,
      env: { PORT: String(production.port) },
    },
    ...installations.map((i) => ({
      command: 'npm run dev',
      url: `http://localhost:${i.web}`,
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        STAPLR_TEST_MODE: '1',
        PORT: String(i.api),
        WEB_PORT: String(i.web),
      },
    })),
  ],
});
