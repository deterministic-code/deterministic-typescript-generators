import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.functional.test.ts'],
    exclude: ['**/node_modules/**'],
    setupFiles: ['src/test-setup.ts'],
    testTimeout: 600000,
    hookTimeout: 600000,
  },
});
