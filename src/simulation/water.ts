import { type World } from '../core/world'
import { Building, Terrain, Overlay, Zone } from '../core/tile'

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

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]] as const

export function stepWater(world: World): WaterStats {
  // Collect sources grouped by range so we can run one flood per source type.
  const byRange = new Map<number, { col: number; row: number }[]>()

  world.forEach((tile, col, row) => {
    tile.watered = false
    const range = WATER_RANGE[tile.building]
    if (range !== undefined) {
      if (!byRange.has(range)) byRange.set(range, [])
      byRange.get(range)!.push({ col, row })
    }
  })

  for (const [range, sources] of byRange) {
    waterFlood(world, sources, range)
  }

  const stats: WaterStats = { watered: 0, unwatered: 0 }
  world.forEach((tile) => {
    if (tile.zone === Zone.None) return
    if (tile.watered) stats.watered++
    else stats.unwatered++
  })
  return stats
}

/**
 * Flood water out from `sources` up to `range` tiles. Pipe-overlay tiles are
 * free conduits: stepping onto a pipe costs 0 range and pipes cross natural
 * water terrain (like power lines carry power), so water travels the full
 * length of a main and then seeps up to `range` tiles into the surrounding
 * land. Ordinary land costs 1 range per tile; un-piped water terrain is
 * impassable. With no pipes laid this reduces to the original uniform BFS from
 * each source, so existing cities are unaffected.
 *
 * 0/1 edge weights → Dial's algorithm: one bucket per range value, processed in
 * ascending order, with 0-cost (pipe) relaxations appended to the current bucket.
 */
function waterFlood(
  world: World,
  sources: ReadonlyArray<{ col: number; row: number }>,
  range: number,
): void {
  const C = world.cols, N = C * world.rows
  const best = new Int32Array(N).fill(range + 1)   // best non-pipe distance; range+1 = unset
  const buckets: number[][] = Array.from({ length: range + 1 }, () => [])

  for (const { col, row } of sources) {
    if (!world.inBounds(col, row)) continue
    const idx = row * C + col
    if (best[idx] > 0) { best[idx] = 0; buckets[0].push(idx) }
  }

  for (let d = 0; d <= range; d++) {
    const b = buckets[d]
    for (let qi = 0; qi < b.length; qi++) {
      const idx = b[qi]
      if (best[idx] !== d) continue   // stale entry (relaxed to a smaller distance)
      const col = idx % C, row = (idx / C) | 0
      world.get(col, row).watered = true

      for (const [dc, dr] of DIRS) {
        const nc = col + dc, nr = row + dr
        if (!world.inBounds(nc, nr)) continue
        const nt = world.get(nc, nr)
        // Pipe → free conduit; plain land → costs 1; un-piped water → impassable.
        const isPipe = (nt.overlay & Overlay.Pipe) !== 0
        if (!isPipe && nt.terrain === Terrain.Water) continue
        const nd = d + (isPipe ? 0 : 1)
        if (nd > range) continue
        const ni = nr * C + nc
        if (nd < best[ni]) {
          best[ni] = nd
          buckets[nd].push(ni)
        }
      }
    }
  }
}
