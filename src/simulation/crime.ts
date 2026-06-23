import { type World } from '../core/world'
import { Building, Terrain, Zone } from '../core/tile'
import { floodFill } from '../utils/floodfill'

const POLICE_RANGE = 25

export function stepCrime(world: World): void {
  const sources: { col: number; row: number }[] = []

  world.forEach((tile, col, row) => {
    tile.policed = false
    if (tile.building === Building.PoliceStation) sources.push({ col, row })
  })

  if (sources.length === 0) return

  floodFill(
    world,
    sources,
    POLICE_RANGE,
    (tile) => tile.terrain !== Terrain.Water,
    (col, row) => { world.get(col, row).policed = true },
  )
}

// How much "crime pressure" each developed zone radiates per density level. More
// activity (people, money, goods) means more opportunity for crime.
const CRIME_SOURCE: Partial<Record<Zone, number>> = {
  [Zone.Residential]: 3,
  [Zone.Commercial]:  4,
  [Zone.Industrial]:  2,
}
const CRIME_RADIUS = 4
// Police coverage knocks crime down to this fraction on a covered tile.
const POLICED_FACTOR = 0.25

/**
 * Graded crime level (0..100) per tile: developed zones radiate crime pressure
 * that diffuses into the surrounding neighborhood; police coverage suppresses it.
 * Read by the crime overlay and folded into zone desirability — high crime makes
 * a neighborhood undesirable, so policing a busy district lets it keep growing.
 * (`stepCrime` must run first so `tile.policed` is current.)
 */
export function computeCrime(world: World): Uint8Array {
  const raw = new Float32Array(world.cols * world.rows)

  world.forEach((tile, col, row) => {
    if (tile.density === 0) return
    const strength = CRIME_SOURCE[tile.zone]
    if (!strength) return
    const source = strength * tile.density

    for (let dr = -CRIME_RADIUS; dr <= CRIME_RADIUS; dr++) {
      for (let dc = -CRIME_RADIUS; dc <= CRIME_RADIUS; dc++) {
        const dist = Math.abs(dc) + Math.abs(dr)
        if (dist > CRIME_RADIUS) continue
        const nc = col + dc, nr = row + dr
        if (!world.inBounds(nc, nr)) continue
        raw[nr * world.cols + nc] += source * (CRIME_RADIUS + 1 - dist)
      }
    }
  })

  // Suppress crime where police reach, then normalize to 0..100.
  let max = 0
  world.forEach((tile, col, row) => {
    const idx = row * world.cols + col
    if (tile.policed) raw[idx] *= POLICED_FACTOR
    if (raw[idx] > max) max = raw[idx]
  })

  const out = new Uint8Array(raw.length)
  if (max === 0) return out
  for (let i = 0; i < raw.length; i++) out[i] = Math.min(100, Math.round((raw[i] / max) * 100))
  return out
}
