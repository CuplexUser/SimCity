import { describe, it, expect } from 'vitest'
import { floodFill } from './floodfill'
import { World } from '../core/world'
import { Terrain } from '../core/tile'

function makeWorld(cols = 10, rows = 10): World {
  // World is always 128×128; use small helper to test within that grid
  return new World()
}

describe('floodFill', () => {
  it('visits source tile at distance 0', () => {
    const world = makeWorld()
    const visited: Array<{ col: number; row: number; dist: number }> = []
    floodFill(world, [{ col: 5, row: 5 }], 5, () => true, (col, row, dist) => {
      visited.push({ col, row, dist })
    })
    expect(visited[0]).toEqual({ col: 5, row: 5, dist: 0 })
  })

  it('reaches tiles within maxRange', () => {
    const world = makeWorld()
    const visited = new Set<string>()
    floodFill(world, [{ col: 0, row: 0 }], 3, () => true, (col, row) => {
      visited.add(`${col},${row}`)
    })
    // (3,0), (0,3) must be reached
    expect(visited.has('3,0')).toBe(true)
    expect(visited.has('0,3')).toBe(true)
    // (4,0) must NOT be reached
    expect(visited.has('4,0')).toBe(false)
  })

  it('does not cross tiles that fail canPass', () => {
    const world = makeWorld()
    const RANGE = 6
    // Solid wall of water at col=2 covering enough rows to fully block BFS within range
    for (let row = 0; row <= RANGE + 2; row++) {
      world.set(2, row, { terrain: Terrain.Water })
    }
    const visited = new Set<string>()
    floodFill(
      world,
      [{ col: 0, row: 0 }],
      RANGE,
      (tile) => tile.terrain !== Terrain.Water,
      (col, row) => visited.add(`${col},${row}`),
    )
    // Within RANGE=6 from (0,0), the wall at col=2 must block all progress past it
    for (const key of visited) {
      const col = parseInt(key.split(',')[0])
      expect(col).toBeLessThan(2)
    }
  })

  it('handles multiple sources without duplicates', () => {
    const world = makeWorld()
    const visits: string[] = []
    floodFill(
      world,
      [{ col: 0, row: 0 }, { col: 1, row: 0 }],
      1,
      () => true,
      (col, row) => visits.push(`${col},${row}`),
    )
    const unique = new Set(visits)
    expect(unique.size).toBe(visits.length)
  })

  it('ignores out-of-bounds sources gracefully', () => {
    const world = makeWorld()
    expect(() => {
      floodFill(world, [{ col: -1, row: -1 }], 5, () => true, () => {})
    }).not.toThrow()
  })
})
