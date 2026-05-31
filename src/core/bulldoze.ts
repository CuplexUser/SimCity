import { type World } from './world'
import { Building, Terrain, Zone, type BulldozeMode } from './tile'
import { findRoot, clearFootprint, footprintTiles, isCovered } from './footprint'

export function applyBulldoze(world: World, col: number, row: number, mode: BulldozeMode, targetElevation?: number): boolean {
  if (!world.inBounds(col, row)) return false
  const tile = world.get(col, row)

  // A genuinely multi-tile structure: footprint bigger than 1×1, or a covered
  // (non-origin) tile. Plain single tiles keep the original surgical semantics.
  const root = findRoot(world, col, row)
  const origin = world.get(root.col, root.row)
  const isMultiTile = origin.footW > 1 || origin.footH > 1 || isCovered(tile)

  if (mode === 'normal') {
    if (isMultiTile) {
      // Demolish the whole plot. Grown lots keep their zoning so the area regrows;
      // plopped buildings (zone None) leave bare land.
      const zone = origin.zone
      const tiles = footprintTiles(world, root.col, root.row)
      clearFootprint(world, root.col, root.row)
      if (zone !== Zone.None) {
        for (const [c, r] of tiles) world.set(c, r, { zone })
      }
      return true
    }

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

    // Demolish any multi-tile structure overlapping this tile before terraforming.
    if (isMultiTile) clearFootprint(world, root.col, root.row)

    const t = world.get(col, row)
    const changed =
      t.terrain !== Terrain.Grass ||
      t.elevation !== level ||
      t.building !== Building.None ||
      t.zone !== Zone.None ||
      t.overlay !== 0 ||
      t.density !== 0 ||
      t.burning

    if (!changed) return false

    world.set(col, row, {
      terrain: Terrain.Grass,
      elevation: level,
      zone: Zone.None,
      overlay: 0,
      density: 0,
      building: Building.None,
      burning: false,
      footW: 1,
      footH: 1,
      rootCol: -1,
      rootRow: -1,
    })
    return true
  }

  // ── zoning mode ─────────────────────────────────────────────────────────────
  if (isMultiTile) {
    // Only de-zone grown lots; leave multi-tile plopped buildings (zone None) alone.
    if (origin.zone === Zone.None && origin.density === 0) return false
    clearFootprint(world, root.col, root.row)
    return true
  }

  if (tile.zone === Zone.None && tile.density === 0) return false
  world.set(col, row, { zone: Zone.None, density: 0 })
  return true
}
