import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    projects: ['unit', 'integration', 'contract', 'docker'].map((name) => ({
      test: {
        name,
        include: [`tests/${name}/**/*.test.ts`],
        environment: 'node',
        testTimeout: name === 'docker' ? 60000 : 10000,
      },
    })),
  },
});
