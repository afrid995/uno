import { defineConfig } from '@playwright/test';
import crypto from 'crypto';

// Dynamically generate a strong test-helper secret for this test run unless provided externally
const testHelperSecret =
  process.env.TEST_HELPER_SECRET ||
  `e2e_${crypto.randomBytes(24).toString('hex')}`;

process.env.TEST_HELPER_SECRET = testHelperSecret;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90000,
  expect: {
    timeout: 15000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    channel: 'chrome',
  },
  webServer: [
    {
      command: 'pnpm --filter @uno-ultimate/server dev',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        ENABLE_TEST_HELPERS: 'true',
        TEST_HELPER_SECRET: testHelperSecret,
      },
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
