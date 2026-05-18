import { type World } from '../core/world'
import { Building, Overlay, Zone } from '../core/tile'

export interface DisasterResult {
  type: 'none' | 'earthquake'
  destroyed: number
}

export function stepDisasters(
  world: World,
  rng: () => number = Math.random,
  chance = 0.001,
): DisasterResult {
  if (rng() >= chance) return { type: 'none', destroyed: 0 }
  return triggerEarthquake(world, rng, 12)
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

  return { type: 'earthquake', destroyed }
}
