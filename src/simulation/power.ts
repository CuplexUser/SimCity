import { type World } from '../core/world'
import { Building, Terrain, Overlay, Zone } from '../core/tile'
import { floodFill } from '../utils/floodfill'

/** Zone-tile power coverage after a stepPower pass — drives the UI indicator. */
export interface PowerStats {
  powered:   number  // zoned tiles receiving power
  unpowered: number  // zoned tiles without power (growth is stalled there)
}

// Range in tiles for each power-producing building
const POWER_RANGE: Partial<Record<Building, number>> = {
  [Building.PowerPlant]: 50,
  [Building.GasTurbine]: 40,
  [Building.Nuclear]:    80,
  [Building.SolarFarm]:  30,
  [Building.WindTurbine]:25,
}

export function stepPower(world: World): PowerStats {
  // Collect sources grouped by range so we can run one BFS per plant
  const byRange = new Map<number, { col: number; row: number }[]>()

  world.forEach((tile, col, row) => {
    tile.powered = false
    const range = POWER_RANGE[tile.building]
    if (range !== undefined) {
      if (!byRange.has(range)) byRange.set(range, [])
      byRange.get(range)!.push({ col, row })
    }
  })

  const canPass = (tile: ReturnType<World['get']>) =>
    tile.terrain !== Terrain.Water || !!(tile.overlay & Overlay.PowerLine)

  for (const [range, sources] of byRange) {
    floodFill(world, sources, range, canPass, (c, r) => {
      world.get(c, r).powered = true
    })
  }

  const stats: PowerStats = { powered: 0, unpowered: 0 }
  world.forEach((tile) => {
    if (tile.zone === Zone.None) return
    if (tile.powered) stats.powered++
    else stats.unpowered++
  })
  return stats
}
