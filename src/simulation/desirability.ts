import { type Tile, Zone } from '../core/tile'

/**
 * How attractive a zoned tile is for development, on a 0..1 scale, combining the
 * service coverage flags (police / fire / health / education), land value and
 * pollution. This is the lever that stops every zone racing to maximum density:
 * a plot with power + water but no services stays low-rise, while a fully-served,
 * high-land-value, low-pollution plot can climb to a skyscraper.
 *
 * Each zone weighs the factors differently — residents care about safety, health,
 * schools and clean air; commerce chases land value and safety; industry is the
 * least picky and tolerates its own pollution.
 */
interface Weights {
  base:      number
  police:    number
  fire:      number
  health:    number
  education: number
  landValue: number  // multiplied by landValue/100
  pollution: number  // multiplied by pollution/100 (subtracted)
  traffic:   number  // multiplied by traffic/100   (subtracted) — congestion
  crime:     number  // multiplied by crime/100     (subtracted)
}

const WEIGHTS: Record<Zone, Weights> = {
  [Zone.None]:        { base: 0, police: 0, fire: 0, health: 0, education: 0, landValue: 0, pollution: 0, traffic: 0, crime: 0 },
  [Zone.Residential]: { base: 0.12, police: 0.16, fire: 0.14, health: 0.16, education: 0.16, landValue: 0.22, pollution: 0.40, traffic: 0.18, crime: 0.28 },
  [Zone.Commercial]:  { base: 0.15, police: 0.16, fire: 0.12, health: 0.06, education: 0.10, landValue: 0.28, pollution: 0.25, traffic: 0.12, crime: 0.22 },
  [Zone.Industrial]:  { base: 0.30, police: 0.08, fire: 0.16, health: 0.00, education: 0.06, landValue: 0.20, pollution: 0.08, traffic: 0.06, crime: 0.08 },
}

export function zoneDesirability(
  tile: Tile,
  landValue: number,  // 0..100
  pollution: number,  // 0..100
  traffic = 0,        // 0..100
  crime = 0,          // 0..100
): number {
  const w = WEIGHTS[tile.zone]
  if (!w) return 0

  let d = w.base
  if (tile.policed)       d += w.police
  if (tile.fireProtected) d += w.fire
  if (tile.healthCovered) d += w.health
  if (tile.educated)      d += w.education
  d += w.landValue * (landValue / 100)
  d -= w.pollution * (pollution / 100)
  d -= w.traffic   * (traffic / 100)
  d -= w.crime     * (crime / 100)

  return Math.max(0, Math.min(1, d))
}

/** Density a tile of this desirability can sustain (0..8), independent of the
 *  city-population stage cap that zones.ts applies on top. */
export function desirabilityDensityCap(desire: number): number {
  return Math.round(desire * 8)
}
