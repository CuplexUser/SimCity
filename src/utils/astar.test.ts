import { describe, it, expect } from 'vitest'
import { findRoadPath, isRoadConnected } from './astar'
import { World } from '../core/world'
import { Overlay } from '../core/tile'

function road(world: World, col: number, row: number) {
  world.set(col, row, { overlay: Overlay.Road })
}

function diag(world: World, col: number, row: number) {
  world.set(col, row, { overlay: Overlay.RoadDiag })
}

describe('findRoadPath', () => {
  it('returns null if start has no road', () => {
    const world = new World()
    road(world, 5, 5)
    expect(findRoadPath(world, 0, 0, 5, 5)).toBeNull()
  })

  it('returns null if goal has no road', () => {
    const world = new World()
    road(world, 0, 0)
    expect(findRoadPath(world, 0, 0, 5, 5)).toBeNull()
  })

  it('returns single-tile path when start equals goal', () => {
    const world = new World()
    road(world, 3, 3)
    const path = findRoadPath(world, 3, 3, 3, 3)
    expect(path).toEqual([{ col: 3, row: 3 }])
  })

  it('finds direct horizontal path', () => {
    const world = new World()
    for (let c = 0; c <= 4; c++) road(world, c, 0)
    const path = findRoadPath(world, 0, 0, 4, 0)
    expect(path).not.toBeNull()
    expect(path![0]).toEqual({ col: 0, row: 0 })
    expect(path![path!.length - 1]).toEqual({ col: 4, row: 0 })
    expect(path!.length).toBe(5)
  })

  it('finds L-shaped path', () => {
    const world = new World()
    for (let c = 0; c <= 3; c++) road(world, c, 0)
    for (let r = 0; r <= 3; r++) road(world, 3, r)
    const path = findRoadPath(world, 0, 0, 3, 3)
    expect(path).not.toBeNull()
    expect(path![path!.length - 1]).toEqual({ col: 3, row: 3 })
  })

  it('returns null when no road connection exists', () => {
    const world = new World()
    road(world, 0, 0)
    road(world, 0, 1)
    road(world, 5, 5)  // disconnected island
    road(world, 5, 6)
    expect(findRoadPath(world, 0, 0, 5, 5)).toBeNull()
  })

  it('finds path around a gap', () => {
    const world = new World()
    // Two rows of road with a bridge at col=5
    for (let c = 0; c <= 5; c++) road(world, c, 0)
    for (let c = 0; c <= 5; c++) road(world, c, 1)
    road(world, 5, 0); road(world, 5, 1)  // connecting column
    const path = findRoadPath(world, 0, 0, 0, 1)
    expect(path).not.toBeNull()
  })

  it('returns the shortest path', () => {
    const world = new World()
    // Two routes: short (3 tiles) vs long (5 tiles)
    for (let c = 0; c <= 2; c++) road(world, c, 0)      // short: row 0
    for (let c = 0; c <= 4; c++) road(world, c, 1)      // long: row 1
    road(world, 0, 0); road(world, 0, 1)  // left connector
    road(world, 2, 0); road(world, 4, 1)  // right connectors — not the same goal
    // Direct 3-tile path from (0,0) to (2,0)
    const path = findRoadPath(world, 0, 0, 2, 0)
    expect(path!.length).toBeLessThanOrEqual(3)
  })
})

describe('isRoadConnected', () => {
  it('returns false for a non-road tile', () => {
    const world = new World()
    expect(isRoadConnected(world, 5, 5)).toBe(false)
  })

  it('returns false for an isolated single-tile road (minTiles=1)', () => {
    const world = new World()
    road(world, 5, 5)
    expect(isRoadConnected(world, 5, 5, 1)).toBe(false)
  })

  it('returns true for a road segment of 2 tiles (minTiles=1)', () => {
    const world = new World()
    road(world, 5, 5)
    road(world, 5, 6)
    expect(isRoadConnected(world, 5, 5, 1)).toBe(true)
  })

  it('returns false when minTiles exceeds connected road count', () => {
    const world = new World()
    road(world, 5, 5)
    road(world, 5, 6)
    // 2 tiles total — minTiles=2 means we need >2 tiles
    expect(isRoadConnected(world, 5, 5, 2)).toBe(false)
  })

  it('returns true for a long connected road (default minTiles=1)', () => {
    const world = new World()
    for (let c = 0; c < 10; c++) road(world, c, 0)
    expect(isRoadConnected(world, 0, 0)).toBe(true)
  })

  it('returns false for out-of-bounds tile', () => {
    const world = new World()
    expect(isRoadConnected(world, -1, -1)).toBe(false)
  })
})

describe('diagonal roads', () => {
  it('routes a path along a chain of diagonal roads', () => {
    const world = new World()
    for (let i = 0; i <= 4; i++) diag(world, i, i)
    const path = findRoadPath(world, 0, 0, 4, 4)
    expect(path).not.toBeNull()
    expect(path![path!.length - 1]).toEqual({ col: 4, row: 4 })
    // Diagonal hops cover the run in 5 tiles, not via an orthogonal detour.
    expect(path!.length).toBe(5)
  })

  it('merges a diagonal run into an orthogonal road', () => {
    const world = new World()
    // Orthogonal arm along row 0, diagonal arm rising to it.
    for (let c = 0; c <= 3; c++) road(world, c, 0)
    diag(world, 4, 1); diag(world, 5, 2)
    // The diagonal tile (4,1) connects to orthogonal (3,0) at the shared corner.
    const path = findRoadPath(world, 5, 2, 0, 0)
    expect(path).not.toBeNull()
    expect(path![path!.length - 1]).toEqual({ col: 0, row: 0 })
  })

  it('does not cut across the empty corner of two orthogonal roads', () => {
    const world = new World()
    // An L: (0,0)-(1,0) and (1,0)-(1,1). The diagonal (0,0)->(1,1) is empty,
    // so a path must go through the corner (1,0), never diagonally.
    road(world, 0, 0); road(world, 1, 0); road(world, 1, 1)
    const path = findRoadPath(world, 0, 0, 1, 1)
    expect(path).not.toBeNull()
    expect(path).toContainEqual({ col: 1, row: 0 })
    expect(path!.length).toBe(3)
  })

  it('counts diagonal roads as connected segments for zone access', () => {
    const world = new World()
    diag(world, 5, 5); diag(world, 6, 6)
    expect(isRoadConnected(world, 5, 5, 1)).toBe(true)
  })

  it('treats an isolated single diagonal road as unconnected', () => {
    const world = new World()
    diag(world, 5, 5)
    expect(isRoadConnected(world, 5, 5, 1)).toBe(false)
  })
})
