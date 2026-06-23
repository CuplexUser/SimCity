import { type World } from '../core/world'
import { Zone } from '../core/tile'

/** Everything the rating needs that isn't read straight off the world grid. */
export interface RatingInputs {
  funds:      number
  burning:    number
  power:      { powered: number; unpowered: number }
  water:      { watered: number; unwatered: number }
  // 0..100 per tile (row * cols + col). Absent → treated as average value / none.
  landValue?: Uint8Array
  pollution?: Uint8Array
  crime?:     Uint8Array
}

/**
 * Overall city approval — a single 0..100 score (SC4-style mayor rating) blending
 * service coverage, the quality of developed land (value vs crime/pollution),
 * treasury health and active disasters. Recomputed once a year alongside the
 * land-value / pollution / crime grids, so it reuses them rather than re-scanning.
 */
export function computeCityRating(world: World, inp: RatingInputs): number {
  let score = 55  // neutral baseline for an empty, solvent city

  // ── Utility coverage: powered + watered zoned tiles lift approval (±6 each) ──
  const pTot = inp.power.powered + inp.power.unpowered
  const wTot = inp.water.watered + inp.water.unwatered
  if (pTot > 0) score += (inp.power.powered / pTot) * 12 - 6
  if (wTot > 0) score += (inp.water.watered / wTot) * 12 - 6

  // ── Quality of developed land: value vs crime / pollution ───────────────────
  let dev = 0, lvSum = 0, crSum = 0, poSum = 0
  world.forEach((tile, col, row) => {
    if (tile.zone === Zone.None || tile.density === 0) return
    const i = row * world.cols + col
    dev++
    lvSum += inp.landValue ? inp.landValue[i] : 50
    crSum += inp.crime     ? inp.crime[i]     : 0
    poSum += inp.pollution ? inp.pollution[i] : 0
  })
  if (dev > 0) {
    const lv = lvSum / dev, cr = crSum / dev, po = poSum / dev
    score += (lv - 50) * 0.20  // land value around the midpoint: ±10
    score -= cr * 0.18         // crime: 0..-18
    score -= po * 0.12         // pollution: 0..-12
  }

  // ── Treasury health ─────────────────────────────────────────────────────────
  if (inp.funds < 0)            score -= 18
  else if (inp.funds > 50_000)  score += 5

  // ── Active fires sap confidence fast ────────────────────────────────────────
  score -= Math.min(20, inp.burning * 4)

  return Math.max(0, Math.min(100, Math.round(score)))
}

/** Short descriptor for a rating value (shown next to the number in the UI). */
export function ratingLabel(score: number): string {
  if (score >= 85) return 'Thriving'
  if (score >= 70) return 'Prosperous'
  if (score >= 55) return 'Stable'
  if (score >= 40) return 'Struggling'
  if (score >= 25) return 'Troubled'
  return 'In Crisis'
}
