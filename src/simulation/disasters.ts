import { type World } from '../core/world'
import { Building, Overlay, Zone } from '../core/tile'
import { igniteFire } from './fire'

export interface DisasterResult {
  type: 'none' | 'earthquake' | 'fire'
  /** Tiles destroyed outright (earthquake) — fires destroy over time, not here. */
  destroyed: number
  /** Tiles set alight (fire) — they spread and burn out over subsequent ticks. */
  ignited: number
}

export function stepDisasters(
  world: World,
  rng: () => number = Math.random,
  chance = 0.0008,
): DisasterResult {
  if (rng() >= chance) return { type: 'none', destroyed: 0, ignited: 0 }
  // Fires are the more common (and recoverable) disaster; earthquakes are rarer
  // and strike instantly. Roughly 2:1 in favor of fire.
  return rng() < 0.66 ? triggerFire(world, rng) : triggerEarthquake(world, rng, 12)
}

/**
 * Start a fire at a random developed tile. The blaze then spreads / burns out
 * over the following ticks (see simulation/fire.ts). Returns how many tiles were
 * ignited (0 if the city has nothing flammable yet).
 */
export function triggerFire(
  world: World,
  rng: () => number = Math.random,
): DisasterResult {
  // Collect flammable tiles (buildings or developed lots) and pick one at random.
  const flammable: Array<{ col: number; row: number }> = []
  world.forEach((tile, col, row) => {
    if (tile.burning) return
    if (tile.building !== Building.None || tile.density > 0) flammable.push({ col, row })
  })
  if (flammable.length === 0) return { type: 'fire', destroyed: 0, ignited: 0 }

  const { col, row } = flammable[Math.floor(rng() * flammable.length)]
  const ignited = igniteFire(world, col, row) ? 1 : 0
  return { type: 'fire', destroyed: 0, ignited }
}

export function triggerEarthquake(
  world: World,
  rng: () => number = Math.random,
  strikes = 12,
): DisasterResult {
  let destroyed = 0

  for (let i = 0; i < strikes; i++) {
    const col = Math.floor(rng() * world.cols)
    const row = Math.floor(rng() * world.rows)
    const tile = world.get(col, row)
    const hadDevelopment =
      tile.zone !== Zone.None ||
      tile.overlay !== 0 ||
      tile.building !== Building.None ||
      tile.density > 0
    if (!hadDevelopment) continue

    world.set(col, row, {
      zone: Zone.None,
      overlay: tile.overlay & Overlay.PowerLine,
      building: Building.None,
      density: 0,
      burning: false,
    })
    destroyed++
  }

  return { type: 'earthquake', destroyed, ignited: 0 }
}
