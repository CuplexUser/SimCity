import { type World } from '../core/world'
import { Building, Terrain, Zone } from '../core/tile'
import { clearFootprint } from '../core/footprint'
import { floodFill } from '../utils/floodfill'

const FIRE_RANGE = 20

// Per-tick fire dynamics. A burning tile either gets put out (much more likely
// where a fire station reaches) or, if left to burn, eventually flashes over and
// destroys whatever stood there — leaving a cleared lot (roads/power survive).
const EXTINGUISH_CHANCE = 0.55  // protected tile is doused this tick
const BURNOUT_CHANCE    = 0.22  // unprotected tile burns out (development lost)

export function stepFire(world: World): void {
  const sources: { col: number; row: number }[] = []

  world.forEach((tile, col, row) => {
    tile.fireProtected = false
    if (tile.building === Building.FireStation) sources.push({ col, row })
  })

  if (sources.length === 0) return

  floodFill(
    world,
    sources,
    FIRE_RANGE,
    (tile) => tile.terrain !== Terrain.Water,
    (col, row) => { world.get(col, row).fireProtected = true },
  )
}

export function stepFireSpread(world: World, rng: () => number = Math.random): number {
  const ignitions: Array<{ col: number; row: number }> = []

  world.forEach((tile, col, row) => {
    if (!tile.burning) return
    for (const { dc, dr } of DIRS) {
      const nc = col + dc
      const nr = row + dr
      if (!world.inBounds(nc, nr)) continue
      const target = world.get(nc, nr)
      if (target.burning || target.terrain === Terrain.Water || target.fireProtected) continue
      if (rng() < 0.15) ignitions.push({ col: nc, row: nr })
    }
  })

  for (const { col, row } of ignitions) world.set(col, row, { burning: true })
  return ignitions.length
}

/**
 * Resolve every burning tile for one tick: tiles a fire station reaches are
 * likely doused; the rest have a chance to burn out, destroying their
 * development (the whole footprint, so multi-tile lots clear as one). Returns
 * how many tiles were extinguished vs. destroyed.
 */
export function resolveFires(
  world: World,
  rng: () => number = Math.random,
): { extinguished: number; destroyed: number } {
  let extinguished = 0
  let destroyed = 0

  // Snapshot burning tiles first — clearFootprint mutates neighbors mid-iteration.
  const burning: Array<{ col: number; row: number }> = []
  world.forEach((tile, col, row) => { if (tile.burning) burning.push({ col, row }) })

  for (const { col, row } of burning) {
    const tile = world.get(col, row)
    if (!tile.burning) continue   // already cleared as part of another tile's footprint
    if (tile.fireProtected) {
      if (rng() < EXTINGUISH_CHANCE) { world.set(col, row, { burning: false }); extinguished++ }
      continue
    }
    if (rng() < BURNOUT_CHANCE) {
      // Flash-over: the lot (and any structure rooted on it) is lost. clearFootprint
      // resets development + clears the burning flag while preserving terrain/roads.
      clearFootprint(world, col, row)
      destroyed++
    }
  }

  return { extinguished, destroyed }
}

/** Ignite a tile if it has something to burn (a building or a developed lot).
 *  Used by the fire disaster. Returns whether a fire was started. */
export function igniteFire(world: World, col: number, row: number): boolean {
  if (!world.inBounds(col, row)) return false
  const tile = world.get(col, row)
  if (tile.burning) return false
  const burnable = tile.building !== Building.None || tile.density > 0 || tile.zone !== Zone.None
  if (!burnable) return false
  world.set(col, row, { burning: true })
  return true
}

/** Number of tiles currently on fire. */
export function countBurning(world: World): number {
  let n = 0
  world.forEach((tile) => { if (tile.burning) n++ })
  return n
}

const DIRS = [
  { dc:  0, dr:  1 },
  { dc:  0, dr: -1 },
  { dc:  1, dr:  0 },
  { dc: -1, dr:  0 },
]
