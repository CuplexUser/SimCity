import { describe, it, expect } from 'vitest'
import { findRoadPath, isRoadConnected } from './astar'
import { World } from '../core/world'
import { Overlay } from '../core/tile'

function road(world: World, col: number, row: number) {
  world.set(col, row, { overlay: Overlay.Road })
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
