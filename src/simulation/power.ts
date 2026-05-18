import { type World } from '../core/world'
import { Building, Terrain, Overlay } from '../core/tile'
import { floodFill } from '../utils/floodfill'

const POWER_RANGE = 50

export function stepPower(world: World): void {
  const sources: { col: number; row: number }[] = []

  // Single pass: clear powered flags + collect plant locations
  world.forEach((tile, col, row) => {
    tile.powered = false
    if (tile.building === Building.PowerPlant) sources.push({ col, row })
  })

  if (sources.length === 0) return

  // Power passes through any non-water tile, or water with a power line
  floodFill(
    world,
    sources,
    POWER_RANGE,
    (tile) => tile.terrain !== Terrain.Water || !!(tile.overlay & Overlay.PowerLine),
    (col, row) => { world.get(col, row).powered = true },
  )
}
