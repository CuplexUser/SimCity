import { type World } from '../core/world'
import { Building, Terrain, Zone } from '../core/tile'
import { floodFill } from '../utils/floodfill'

/** Zone-tile water coverage after a stepWater pass — drives the UI indicator. */
export interface WaterStats {
  watered:   number  // zoned tiles receiving water
  unwatered: number  // zoned tiles without water (growth is stalled there)
}

// Range in tiles for each water-producing building
const WATER_RANGE: Partial<Record<Building, number>> = {
  [Building.WaterTower]:     20,
  [Building.WaterPump]:      12,
  [Building.PumpingStation]: 45,
}

export function stepWater(world: World): WaterStats {
  // Collect sources grouped by range so we can run one BFS per source type
  const byRange = new Map<number, { col: number; row: number }[]>()

  world.forEach((tile, col, row) => {
    tile.watered = false
    const range = WATER_RANGE[tile.building]
    if (range !== undefined) {
      if (!byRange.has(range)) byRange.set(range, [])
      byRange.get(range)!.push({ col, row })
    }
  })

  // Water doesn't cross natural water tiles
  for (const [range, sources] of byRange) {
    floodFill(
      world,
      sources,
      range,
      (tile) => tile.terrain !== Terrain.Water,
      (col, row) => { world.get(col, row).watered = true },
    )
  }

  const stats: WaterStats = { watered: 0, unwatered: 0 }
  world.forEach((tile) => {
    if (tile.zone === Zone.None) return
    if (tile.watered) stats.watered++
    else stats.unwatered++
  })
  return stats
}
