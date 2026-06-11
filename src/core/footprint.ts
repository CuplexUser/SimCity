/**
 * footprint.ts — multi-tile structure helpers.
 *
 * A structure occupies an `footW × footH` plot rooted at its NW/top "origin"
 * tile (lowest col+row). The origin tile carries the building/density/footprint
 * size; every other covered tile stores `rootCol/rootRow` pointing back to the
 * origin and is otherwise empty (zone/density/building cleared) so simulation
 * subsystems only ever "see" the structure once, at its origin.
 *
 * A plain 1×1 tile has footW=1, footH=1, rootCol=-1, rootRow=-1.
 */

import { type World } from './world'
import { Building, Terrain, Zone, defaultTile, type Tile } from './tile'

/** Is this tile the origin of its structure (or a plain unrooted tile)? */
export function isFootprintOrigin(tile: Tile): boolean {
  return tile.rootCol === -1 && tile.rootRow === -1
}

/** Does this tile belong to a multi-tile structure (origin OR covered)? */
export function isCovered(tile: Tile): boolean {
  return tile.rootCol !== -1 || tile.rootRow !== -1
}

/** Resolve the origin (NW) tile coords of the structure covering (col,row). */
export function findRoot(world: World, col: number, row: number): { col: number; row: number } {
  const tile = world.get(col, row)
  if (tile.rootCol === -1 && tile.rootRow === -1) return { col, row }
  return { col: tile.rootCol, row: tile.rootRow }
}

/**
 * Every tile of the structure that (col,row) belongs to, including the origin.
 * For a plain 1×1 tile this is just [[col,row]].
 */
export function footprintTiles(world: World, col: number, row: number): Array<[number, number]> {
  const root = findRoot(world, col, row)
  const o = world.get(root.col, root.row)
  const tiles: Array<[number, number]> = []
  for (let r = root.row; r < root.row + o.footH; r++) {
    for (let c = root.col; c < root.col + o.footW; c++) {
      if (world.inBounds(c, r)) tiles.push([c, r])
    }
  }
  return tiles
}

/**
 * Can a fresh `w×h` plot be placed with its origin at (col,row)?
 * Every covered tile must be in-bounds, on land (not Water), and empty:
 * no building, no density, no existing footprint root, and no road.
 *
 * `allowRoadUnder` (utility structures like power plants / water sources) lets the
 * plot sit on top of existing road/power-line overlays — they stay under the
 * building so the grid keeps connecting through them.
 */
export function canPlaceFootprint(
  world: World, col: number, row: number, w: number, h: number,
  allowRoadUnder = false,
): boolean {
  for (let r = row; r < row + h; r++) {
    for (let c = col; c < col + w; c++) {
      if (!world.inBounds(c, r)) return false
      const t = world.get(c, r)
      if (t.terrain === Terrain.Water) return false
      if (t.building !== Building.None) return false
      if (t.density > 0) return false
      if (t.rootCol !== -1 || t.rootRow !== -1) return false
      // Roads/power overlays block plopping (structures need their own ground),
      // unless this is a utility that explicitly allows roads to run underneath.
      if (t.overlay !== 0 && !allowRoadUnder) return false
    }
  }
  return true
}

/**
 * Place an `w×h` structure with origin at (col,row). The origin tile receives
 * `originPatch` plus the footprint size; covered tiles are marked with the
 * origin coords and have their zone/density/building cleared.
 *
 * Caller is responsible for having checked `canPlaceFootprint` first.
 */
export function placeFootprint(
  world: World,
  col: number,
  row: number,
  w: number,
  h: number,
  originPatch: Partial<Tile>,
): void {
  world.set(col, row, {
    ...originPatch,
    footW: w,
    footH: h,
    rootCol: -1,
    rootRow: -1,
  })

  for (let r = row; r < row + h; r++) {
    for (let c = col; c < col + w; c++) {
      if (c === col && r === row) continue
      if (!world.inBounds(c, r)) continue
      world.set(c, r, {
        zone: Zone.None,
        density: 0,
        building: Building.None,
        footW: 1,
        footH: 1,
        rootCol: col,
        rootRow: row,
      })
    }
  }
}

/**
 * Clear the entire structure that (col,row) belongs to, resetting every covered
 * tile to defaults while preserving terrain/elevation/overlay. Returns the list
 * of cleared tiles (origin first) for callers that need to react.
 */
export function clearFootprint(world: World, col: number, row: number): Array<[number, number]> {
  const tiles = footprintTiles(world, col, row)
  for (const [c, r] of tiles) {
    const t = world.get(c, r)
    const fresh = defaultTile()
    world.set(c, r, {
      zone: fresh.zone,
      density: fresh.density,
      building: fresh.building,
      burning: fresh.burning,
      footW: 1,
      footH: 1,
      rootCol: -1,
      rootRow: -1,
      // preserve: terrain, elevation, overlay, powered/watered/coverage flags
    })
  }
  return tiles
}
