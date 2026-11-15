import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
    fileParallelism: false, // Run integration tests sequentially to avoid DB locks
    sequence: {
      concurrent: false,
    },
  },
});
