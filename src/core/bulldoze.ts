import { type World } from './world'
import { Building, Terrain, Zone, type BulldozeMode } from './tile'

export function applyBulldoze(world: World, col: number, row: number, mode: BulldozeMode, targetElevation?: number): boolean {
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

    const hasStructure =
      tile.building !== Building.None ||
      tile.density > 0 ||
      tile.overlay !== 0 ||
      tile.burning

    if (hasStructure) {
      // Remove building/overlay/density but preserve zone so it can regrow
      world.set(col, row, {
        overlay: 0,
        density: 0,
        building: Building.None,
        burning: false,
      })
    } else {
      // Vacant tile with only zone marking — clear it
      world.set(col, row, { zone: Zone.None })
    }
    return true
  }

  if (mode === 'terrain') {
    const level = targetElevation ?? tile.elevation
    const changed =
      tile.terrain !== Terrain.Grass ||
      tile.elevation !== level ||
      tile.building !== Building.None ||
      tile.zone !== Zone.None ||
      tile.overlay !== 0 ||
      tile.density !== 0 ||
      tile.burning

    if (!changed) return false

    world.set(col, row, {
      terrain: Terrain.Grass,
      elevation: level,
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
