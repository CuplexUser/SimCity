import { expect, test } from '@playwright/test'

type CanvasStats = {
  nonTransparent: number
  uniqueColors: number
  greenPixels: number
}

test('renders the city canvas and exposes game state text', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(String(error)))

  await page.goto('/')

  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible()

  const state = await page.waitForFunction(() => {
    const readState = window.render_game_to_text
    if (!readState) return null
    return JSON.parse(readState())
  })
  const payload = await state.jsonValue() as {
    coordinates?: string
    year?: number
    funds?: number
    camera?: { zoom?: number }
  }

  expect(payload.coordinates).toContain('tile origin')
  expect(payload.year).toBe(2000)
  expect(payload.funds).toBe(20_000)
  expect(payload.camera?.zoom).toBeGreaterThan(0)

  // Wait for PixiJS renderer to finish async init (__eng is set in eng.init().then())
  await page.waitForFunction(() => (window as any).__eng?.renderer != null)

  await page.evaluate(() => (window as any).advanceTime?.(1000))

  // Read pixel stats via PixiJS extract API (works with WebGL canvas, unlike getContext('2d'))
  const readStats = (): CanvasStats =>
    (window as any).__eng?.renderer?.readPixelStats?.()
    ?? { nonTransparent: 0, uniqueColors: 0, greenPixels: 0 }

  // Generous timeout: under software WebGL (SwiftShader on CI) the first frames
  // are slow, so the default 5s expect.poll window flakes. Stay under the 60s
  // test ceiling.
  await expect.poll(async () => {
    const stats = await page.evaluate(readStats)
    return stats.greenPixels
  }, { timeout: 30_000 }).toBeGreaterThan(3_000)

  const canvasStats = await page.evaluate(readStats)

  expect(canvasStats.nonTransparent).toBeGreaterThan(10_000)
  expect(canvasStats.greenPixels).toBeGreaterThan(3_000)
  expect(canvasStats.uniqueColors).toBeGreaterThan(20)
  expect(consoleErrors).toEqual([])
})
