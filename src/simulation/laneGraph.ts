/**
 * laneGraph.ts — drivable road network for the animated traffic layer.
 *
 * Builds a tile-to-tile adjacency over every road tile (orthogonal *and* 45°
 * diagonal roads) so the car system can route vehicles continuously along the
 * carriageway. This is pure data (tile indices only, no PixiJS) so it stays
 * unit-testable; the renderer's car layer turns indices into world positions.
 *
 * Connection rules (mirrors how the asphalt is drawn so cars stay on the road):
 *  - Orthogonal neighbor that is any road  → connected. This is the only way an
 *    orthogonal road links up, and it also lets a diagonal road hand off to an
 *    orthogonal road where they meet at a shared edge.
 *  - Diagonal neighbor that is any road → connected ONLY when this tile or that
 *    neighbor is a diagonal road. That keeps cars from cutting across the empty
 *    corner between two merely-orthogonal roads, while letting diagonal runs
 *    (and diagonal↔orthogonal junctions) flow.
 */

import { type World } from '../core/world'
import { Overlay } from '../core/tile'

const ROAD_BITS = Overlay.Road | Overlay.RoadDiag

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
const DIAG  = [[1, 1], [-1, -1], [1, -1], [-1, 1]] as const

export interface RoadNetwork {
  cols: number
  rows: number
  /** Road tile index → connected road tile indices. */
  adj: Map<number, number[]>
  /** All road tile indices that have at least one connection (spawn candidates). */
  tiles: number[]
}

export function buildRoadNetwork(world: World): RoadNetwork {
  const C = world.cols, R = world.rows
  const adj = new Map<number, number[]>()
  const tiles: number[] = []

  const roadAt = (c: number, r: number): number =>
    world.inBounds(c, r) ? (world.get(c, r).overlay & ROAD_BITS) : 0

  world.forEach((tile, col, row) => {
    const here = tile.overlay & ROAD_BITS
    if (!here) return
    const hereDiag = here & Overlay.RoadDiag
    const neighbors: number[] = []

    for (const [dc, dr] of ORTHO) {
      if (roadAt(col + dc, row + dr)) neighbors.push((row + dr) * C + (col + dc))
    }
    for (const [dc, dr] of DIAG) {
      const nb = roadAt(col + dc, row + dr)
      if (nb && (hereDiag || (nb & Overlay.RoadDiag))) neighbors.push((row + dr) * C + (col + dc))
    }

    if (neighbors.length) {
      const idx = row * C + col
      adj.set(idx, neighbors)
      tiles.push(idx)
    }
  })

  return { cols: C, rows: R, adj, tiles }
}
