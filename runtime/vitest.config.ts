import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'src/**/*.integration.test.ts', 'src/**/*.functional.test.ts'],
    setupFiles: ['src/test-setup.ts'],
    pool: 'threads',
    testTimeout: 5000,
  },
});
