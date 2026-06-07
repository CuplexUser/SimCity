import { defineConfig, devices } from '@playwright/test'

// Rendering backend. CI has no GPU, so it must use software WebGL (SwiftShader),
// which is slow. Locally we default to the real GPU via headed ANGLE/D3D11 — far
// faster (PixiJS init drops from ~20s to a couple seconds) — which is why the
// suite felt quick back when a window was visible. Knobs:
//   PW_SOFTWARE=1  force software/headless even locally (e.g. background runs)
//   PW_HEADLESS=1  hardware rendering but no visible window (GPU headless)
const SOFTWARE = !!process.env.CI || !!process.env.PW_SOFTWARE
const HEADED = !SOFTWARE && !process.env.PW_HEADLESS

export default defineConfig({
  testDir: './tests',
  // PixiJS + atlas init takes ~20s under SwiftShader (software); on the GPU it's
  // a couple seconds. Keep a generous ceiling so the software path doesn't flake.
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // SwiftShader is slow and accumulates lag across a long run, occasionally
  // tipping a heavy test over its timeout; one local retry (two in CI) absorbs
  // that environmental flakiness without masking real failures.
  retries: process.env.CI ? 2 : 1,
  // Each software-rendered (SwiftShader) Chrome is very heavy on CPU; letting
  // Playwright default to ~half the cores spins up many at once and bogs the
  // machine down (and the contention then *causes* timeouts). On the GPU path
  // rendering is cheap, so a few workers are fine. Override with PW_WORKERS=N.
  workers: process.env.CI ? 1 : Number(process.env.PW_WORKERS) || (SOFTWARE ? 1 : 2),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results/playwright',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: !HEADED,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: SOFTWARE
        ? ['--use-gl=angle', '--use-angle=swiftshader']
        // Real GPU: ANGLE over D3D11, and override Chrome's headless GPU blocklist
        // so WebGL is hardware-accelerated whether headed or GPU-headless.
        : ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
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
