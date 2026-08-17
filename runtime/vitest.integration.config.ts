import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**'],
    setupFiles: ['src/test-setup.ts'],
    testTimeout: 30000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } },
    fileParallelism: false,
  },
});
