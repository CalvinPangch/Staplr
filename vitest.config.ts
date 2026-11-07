import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    projects: ['unit', 'integration', 'contract', 'docker'].map((name) => ({
      test: {
        name,
        include: [`tests/${name}/**/*.test.ts`],
        environment: 'node',
        // Docker tests count containers by label, so files must not overlap.
        fileParallelism: name !== 'docker',
        testTimeout: name === 'docker' ? 60000 : 10000,
      },
    })),
  },
});
