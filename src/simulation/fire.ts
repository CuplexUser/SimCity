import { type World } from '../core/world'
import { Building, Terrain } from '../core/tile'
import { floodFill } from '../utils/floodfill'

const FIRE_RANGE = 20

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

const DIRS = [
  { dc:  0, dr:  1 },
  { dc:  0, dr: -1 },
  { dc:  1, dr:  0 },
  { dc: -1, dr:  0 },
]
