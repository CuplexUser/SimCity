import { type World } from '../core/world'
import { Building, Terrain } from '../core/tile'
import { floodFill } from '../utils/floodfill'

const WATER_RANGE = 20

export function stepWater(world: World): void {
  const sources: { col: number; row: number }[] = []

  world.forEach((tile, col, row) => {
    tile.watered = false
    if (tile.building === Building.WaterTower) sources.push({ col, row })
  })

  if (sources.length === 0) return

  // Water doesn't cross natural water tiles
  floodFill(
    world,
    sources,
    WATER_RANGE,
    (tile) => tile.terrain !== Terrain.Water,
    (col, row) => { world.get(col, row).watered = true },
  )
}
