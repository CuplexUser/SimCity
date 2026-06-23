import { type World } from '../core/world'
import { Overlay, Zone } from '../core/tile'

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]] as const
const MAX_TRIP = 60  // cap a single trip's length so it can't crawl the whole map

/**
 * Traffic load per tile (0..100), routed along the actual road network — this
 * replaces the old distance-decay convolution with genuine road-graph
 * pathfinding.
 *
 * Model:
 *  1. Each developed zone tile injects trip demand onto its adjacent road
 *     tiles. Residential tiles are trip *origins*; commercial / industrial
 *     tiles are *destinations* (jobs). Demand scales with density (jobs ×2, as
 *     in the old weighting).
 *  2. A multi-source BFS over the road graph from every job-access tile gives
 *     each road tile its hop-distance to the *nearest* job — a shortest-path
 *     field that answers "A* to the closest destination" for every origin at
 *     once, instead of running A* per origin.
 *  3. From each origin road tile we descend that gradient to the nearest job,
 *     adding the origin's trip volume to every road tile on the route. Roads
 *     carrying many home→job paths (arterials, bridges) accumulate the most.
 *  4. Access demand is also added directly, so an isolated zone next to a stub
 *     of road still registers, then the grid is normalized to 0..100.
 */
export function computeTraffic(world: World): Uint8Array {
  const C = world.cols, R = world.rows, N = C * R
  const isRoad = new Uint8Array(N)
  const homeW  = new Float64Array(N)  // residential trip volume injected per road tile
  const jobW   = new Float64Array(N)  // job attraction injected per road tile

  world.forEach((tile, col, row) => {
    if (tile.overlay & Overlay.Road) isRoad[row * C + col] = 1
  })

  // 1. Inject demand from each developed zone onto its adjacent road tiles.
  world.forEach((tile, col, row) => {
    if (tile.zone === Zone.None || tile.density === 0) return
    const home = tile.zone === Zone.Residential
    const w = home ? tile.density : tile.density * 2
    for (const [dc, dr] of DIRS) {
      const nc = col + dc, nr = row + dr
      if (nc < 0 || nr < 0 || nc >= C || nr >= R) continue
      const ni = nr * C + nc
      if (!isRoad[ni]) continue
      if (home) homeW[ni] += w
      else      jobW[ni]  += w
    }
  })

  // 2. Multi-source BFS from job-access tiles → hop distance to the nearest job.
  const dist  = new Int32Array(N).fill(-1)
  const queue = new Int32Array(N)
  let head = 0, tail = 0
  for (let i = 0; i < N; i++) {
    if (jobW[i] > 0) { dist[i] = 0; queue[tail++] = i }
  }
  while (head < tail) {
    const cur = queue[head++]
    const cc = cur % C, cr = (cur / C) | 0
    const nd = dist[cur] + 1
    for (const [dc, dr] of DIRS) {
      const nc = cc + dc, nr = cr + dr
      if (nc < 0 || nr < 0 || nc >= C || nr >= R) continue
      const ni = nr * C + nc
      if (!isRoad[ni] || dist[ni] !== -1) continue
      dist[ni] = nd
      queue[tail++] = ni
    }
  }

  const load = new Float64Array(N)

  // 4. Base access demand so an isolated zone-by-a-road still shows load.
  for (let i = 0; i < N; i++) load[i] += homeW[i] + jobW[i]

  // 3. Route each origin's trips down the gradient to its nearest job.
  for (let i = 0; i < N; i++) {
    const vol = homeW[i]
    if (vol <= 0 || dist[i] < 0) continue   // no demand, or no road path to any job
    let cur = i, steps = 0
    while (dist[cur] > 0 && steps < MAX_TRIP) {
      const cc = cur % C, cr = (cur / C) | 0
      let next = -1
      for (const [dc, dr] of DIRS) {
        const nc = cc + dc, nr = cr + dr
        if (nc < 0 || nr < 0 || nc >= C || nr >= R) continue
        const ni = nr * C + nc
        if (isRoad[ni] && dist[ni] === dist[cur] - 1) { next = ni; break }
      }
      if (next < 0) break
      load[next] += vol
      cur = next
      steps++
    }
  }

  return normalize(load, N)
}

function normalize(values: Float64Array, n: number): Uint8Array {
  let max = 0
  for (let i = 0; i < n; i++) if (values[i] > max) max = values[i]
  const out = new Uint8Array(n)
  if (max === 0) return out
  for (let i = 0; i < n; i++) out[i] = Math.min(100, Math.round((values[i] / max) * 100))
  return out
}
