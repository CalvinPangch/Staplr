import { defineConfig, devices } from '@playwright/test';

// Two fully separate installations (API + web server + database): one for the
// desktop viewport and one for a 320 px phone viewport, so sign-up state never
// leaks between them. Inside each installation the first-run spec (auth.spec.ts)
// runs first on the fresh database, then every other spec.
const installations = [
  { id: 'desktop', api: 4310, web: 4320, viewport: undefined },
  { id: 'mobile', api: 4311, web: 4321, viewport: { width: 320, height: 640 } },
] as const;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: { trace: 'retain-on-failure' },
  projects: installations.flatMap((i) => {
    const use = {
      ...devices['Desktop Chrome'],
      baseURL: `http://localhost:${i.web}`,
      ...(i.viewport ? { viewport: i.viewport } : {}),
    };
    return [
      { name: `${i.id}-first-run`, testMatch: /auth\.spec\.ts/, use },
      {
        name: i.id,
        testIgnore: /auth\.spec\.ts/,
        dependencies: [`${i.id}-first-run`],
        use,
      },
    ];
  }),
  webServer: installations.map((i) => ({
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
});
