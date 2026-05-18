import { type World } from './world'
import { Building, Terrain, Zone, type BulldozeMode } from './tile'

const LEVEL_ELEVATION = 2

export function applyBulldoze(world: World, col: number, row: number, mode: BulldozeMode): boolean {
  if (!world.inBounds(col, row)) return false
  const tile = world.get(col, row)

  if (mode === 'normal') {
    if (
      tile.building === Building.None &&
      tile.zone === Zone.None &&
      tile.overlay === 0 &&
      tile.density === 0 &&
      !tile.burning
    ) return false

    world.set(col, row, {
      zone: Zone.None,
      overlay: 0,
      density: 0,
      building: Building.None,
      burning: false,
    })
    return true
  }

  if (mode === 'terrain') {
    const changed =
      tile.terrain !== Terrain.Grass ||
      tile.elevation !== LEVEL_ELEVATION ||
      tile.building !== Building.None ||
      tile.zone !== Zone.None ||
      tile.overlay !== 0 ||
      tile.density !== 0 ||
      tile.burning

    if (!changed) return false

    world.set(col, row, {
      terrain: Terrain.Grass,
      elevation: LEVEL_ELEVATION,
      zone: Zone.None,
      overlay: 0,
      density: 0,
      building: Building.None,
      burning: false,
    })
    return true
  }

  if (tile.zone === Zone.None && tile.density === 0) return false
  world.set(col, row, { zone: Zone.None, density: 0 })
  return true
}
