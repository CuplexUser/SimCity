import { type World } from '../core/world'
import { Building, Terrain } from '../core/tile'
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
