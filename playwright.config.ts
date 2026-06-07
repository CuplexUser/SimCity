import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // PixiJS + atlas init under the SwiftShader GL backend takes ~20s and slows
  // further when several tests run back-to-back; the default 30s is too tight.
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // The SwiftShader GL backend is slow and accumulates lag across a long serial
  // run, occasionally tipping a heavy test over its timeout; one local retry (two
  // in CI) absorbs that environmental flakiness without masking real failures.
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results/playwright',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader'],
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'pnpm dev --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
