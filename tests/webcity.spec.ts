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

  await page.evaluate(() => window.advanceTime?.(1000))

  const readCanvasStats = (node: HTMLCanvasElement): CanvasStats => {
    const ctx = node.getContext('2d')
    if (!ctx) return { nonTransparent: 0, uniqueColors: 0, greenPixels: 0 }

    const { width, height } = node
    const image = ctx.getImageData(width * 0.20, height * 0.12, width * 0.60, height * 0.62)
    const colors = new Set<string>()
    let nonTransparent = 0
    let greenPixels = 0

    for (let i = 0; i < image.data.length; i += 64) {
      const r = image.data[i]
      const g = image.data[i + 1]
      const b = image.data[i + 2]
      const a = image.data[i + 3]
      if (a === 0) continue
      nonTransparent++
      if (g > r * 1.15 && g > b * 1.15) greenPixels++
      colors.add(`${r >> 3},${g >> 3},${b >> 3}`)
    }

    return { nonTransparent, uniqueColors: colors.size, greenPixels }
  }

  await expect.poll(async () => {
    const stats = await canvas.evaluate(readCanvasStats)
    return stats.greenPixels
  }).toBeGreaterThan(3_000)

  const canvasStats = await canvas.evaluate(readCanvasStats)

  expect(canvasStats.nonTransparent).toBeGreaterThan(10_000)
  expect(canvasStats.greenPixels).toBeGreaterThan(3_000)
  expect(canvasStats.uniqueColors).toBeGreaterThan(20)
  expect(consoleErrors).toEqual([])
})
