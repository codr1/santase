import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    actionTimeout: 10_000,
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'bun run src/index.ts',
    port: 3001,
    env: {
      BUN_PORT: '3001',
    },
    reuseExistingServer: !process.env.CI,
  },
});
