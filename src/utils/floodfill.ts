import { type World } from '../core/world'
import { type Tile } from '../core/tile'

const DIRS = [
  { dc:  0, dr:  1 },
  { dc:  0, dr: -1 },
  { dc:  1, dr:  0 },
  { dc: -1, dr:  0 },
]

// BFS flood-fill from multiple source tiles.
// Uses a Uint8Array visited mask (fast for dense grids).
export function floodFill(
  world: World,
  sources:  ReadonlyArray<{ col: number; row: number }>,
  maxRange: number,
  canPass:  (tile: Tile) => boolean,
  onVisit:  (col: number, row: number, dist: number) => void,
): void {
  const visited = new Uint8Array(world.cols * world.rows)
  // Pre-allocated queue avoids GC pressure on inner-loop objects
  const colQ  = new Int16Array(world.cols * world.rows)
  const rowQ  = new Int16Array(world.cols * world.rows)
  const distQ = new Uint8Array(world.cols * world.rows)
  let head = 0
  let tail = 0

  for (const { col, row } of sources) {
    if (!world.inBounds(col, row)) continue
    const idx = row * world.cols + col
    if (visited[idx]) continue
    visited[idx] = 1
    colQ[tail] = col; rowQ[tail] = row; distQ[tail] = 0; tail++
    onVisit(col, row, 0)
  }

  while (head < tail) {
    const col  = colQ[head]
    const row  = rowQ[head]
    const dist = distQ[head]
    head++
    if (dist >= maxRange) continue

    for (const { dc, dr } of DIRS) {
      const nc = col + dc
      const nr = row + dr
      if (!world.inBounds(nc, nr)) continue
      const nidx = nr * world.cols + nc
      if (visited[nidx]) continue
      if (!canPass(world.get(nc, nr))) continue
      visited[nidx] = 1
      colQ[tail] = nc; rowQ[tail] = nr; distQ[tail] = dist + 1; tail++
      onVisit(nc, nr, dist + 1)
    }
  }
}
