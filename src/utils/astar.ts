import { type World } from '../core/world'
import { Overlay } from '../core/tile'

const DIRS = [
  { dc:  0, dr:  1 },
  { dc:  0, dr: -1 },
  { dc:  1, dr:  0 },
  { dc: -1, dr:  0 },
]

function heuristic(col: number, row: number, gc: number, gr: number): number {
  return Math.abs(col - gc) + Math.abs(row - gr)
}

/**
 * A* shortest road path between two tiles.
 * Both endpoints must carry Road overlay; intermediate tiles must also be roads.
 * Returns null if no road path exists.
 */
export function findRoadPath(
  world: World,
  startCol: number, startRow: number,
  goalCol: number,  goalRow: number,
): Array<{ col: number; row: number }> | null {
  if (!world.inBounds(startCol, startRow) || !world.inBounds(goalCol, goalRow)) return null
  if (!(world.get(startCol, startRow).overlay & Overlay.Road)) return null
  if (!(world.get(goalCol, goalRow).overlay & Overlay.Road)) return null
  if (startCol === goalCol && startRow === goalRow) return [{ col: startCol, row: startRow }]

  const C  = world.cols
  const sk = startRow * C + startCol
  const gk = goalRow  * C + goalCol

  // Pre-allocated typed arrays — avoids GC on large searches
  const gScore = new Uint16Array(world.cols * world.rows).fill(0xFFFF)
  const prev   = new Int32Array(world.cols * world.rows).fill(-1)

  gScore[sk] = 0

  // Open set as insertion-sorted array (up to 16 K entries, fast enough)
  const openK: number[] = [sk]
  const openF: number[] = [heuristic(startCol, startRow, goalCol, goalRow)]

  const pushOpen = (k: number, f: number) => {
    let lo = 0, hi = openK.length
    while (lo < hi) { const mid = (lo + hi) >> 1; openF[mid] <= f ? (lo = mid + 1) : (hi = mid) }
    openK.splice(lo, 0, k)
    openF.splice(lo, 0, f)
  }

  while (openK.length > 0) {
    const ck = openK.shift()!; openF.shift()
    if (ck === gk) {
      const path: Array<{ col: number; row: number }> = []
      let nk = ck
      while (nk !== sk) {
        path.unshift({ col: nk % C, row: (nk / C) | 0 })
        nk = prev[nk]
      }
      path.unshift({ col: startCol, row: startRow })
      return path
    }

    const cc = ck % C, cr = (ck / C) | 0
    const cg = gScore[ck]

    for (const { dc, dr } of DIRS) {
      const nc = cc + dc, nr = cr + dr
      if (!world.inBounds(nc, nr)) continue
      if (!(world.get(nc, nr).overlay & Overlay.Road)) continue
      const nk = nr * C + nc
      const ng = cg + 1
      if (ng >= gScore[nk]) continue
      gScore[nk] = ng
      prev[nk] = ck
      pushOpen(nk, ng + heuristic(nc, nr, goalCol, goalRow))
    }
  }
  return null
}

/**
 * BFS check: is the road tile at (col, row) part of a connected road segment
 * of at least (minTiles + 1) tiles total?  minTiles=1 means the road connects
 * to at least one other road tile (not a completely isolated stub).
 */
export function isRoadConnected(
  world: World,
  col: number, row: number,
  minTiles = 1,
): boolean {
  if (!world.inBounds(col, row)) return false
  if (!(world.get(col, row).overlay & Overlay.Road)) return false

  const C       = world.cols
  const visited = new Uint8Array(world.cols * world.rows)
  const colQ    = new Int16Array(world.cols * world.rows)
  const rowQ    = new Int16Array(world.cols * world.rows)
  let head = 0, tail = 0, count = 0

  visited[row * C + col] = 1
  colQ[tail] = col; rowQ[tail] = row; tail++

  while (head < tail) {
    const c = colQ[head], r = rowQ[head]; head++
    count++
    if (count > minTiles) return true

    for (const { dc, dr } of DIRS) {
      const nc = c + dc, nr = r + dr
      if (!world.inBounds(nc, nr)) continue
      const nk = nr * C + nc
      if (visited[nk]) continue
      if (!(world.get(nc, nr).overlay & Overlay.Road)) continue
      visited[nk] = 1
      colQ[tail] = nc; rowQ[tail] = nr; tail++
    }
  }
  return count > minTiles
}
