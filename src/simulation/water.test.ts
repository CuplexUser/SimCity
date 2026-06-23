import { describe, it, expect } from 'vitest'
import { stepWater } from './water'
import { World } from '../core/world'
import { Building, Terrain, Overlay } from '../core/tile'

describe('stepWater', () => {
  it('nothing is watered when no water tower exists', () => {
    const world = new World()
    stepWater(world)
    let anyWatered = false
    world.forEach((tile) => { if (tile.watered) anyWatered = true })
    expect(anyWatered).toBe(false)
  })

  it('water tower tile itself is watered', () => {
    const world = new World()
    world.set(5, 5, { building: Building.WaterTower })
    stepWater(world)
    expect(world.get(5, 5).watered).toBe(true)
  })

  it('adjacent tiles are watered', () => {
    const world = new World()
    world.set(10, 10, { building: Building.WaterTower })
    stepWater(world)
    expect(world.get(10, 11).watered).toBe(true)
    expect(world.get(11, 10).watered).toBe(true)
  })

  it('natural water terrain tile itself is not watered (BFS does not enter it)', () => {
    const world = new World()
    world.set(5, 5, { building: Building.WaterTower })
    world.set(5, 6, { terrain: Terrain.Water })
    stepWater(world)
    // BFS does not enter water tiles so the tile itself stays un-watered
    expect(world.get(5, 6).watered).toBe(false)
  })

  it('clears watered flags on each call', () => {
    const world = new World()
    world.set(5, 5, { building: Building.WaterTower })
    stepWater(world)
    expect(world.get(5, 6).watered).toBe(true)

    world.set(5, 5, { building: Building.None })
    stepWater(world)
    expect(world.get(5, 5).watered).toBe(false)
    expect(world.get(5, 6).watered).toBe(false)
  })

  it('a pipe main carries water past a source\'s normal range', () => {
    const world = new World()
    world.set(5, 5, { building: Building.WaterPump })  // range 12
    const far = { col: 5, row: 30 }                    // 25 tiles away — beyond range

    stepWater(world)
    expect(world.get(far.col, far.row).watered).toBe(false)

    // Lay a pipe main from the pump out to the far tile; pipes conduct for free.
    for (let r = 5; r <= 30; r++) {
      const t = world.get(5, r)
      world.set(5, r, { overlay: t.overlay | Overlay.Pipe })
    }
    stepWater(world)
    expect(world.get(far.col, far.row).watered).toBe(true)
  })

  it('pipes carry water across natural water terrain', () => {
    const world = new World()
    world.set(5, 5, { building: Building.WaterTower })
    // A one-tile water channel the flood normally can't enter.
    world.set(5, 6, { terrain: Terrain.Water })
    stepWater(world)
    expect(world.get(5, 6).watered).toBe(false)

    // A pipe laid over the water tile makes it a passable conduit.
    world.set(5, 6, { terrain: Terrain.Water, overlay: Overlay.Pipe })
    stepWater(world)
    expect(world.get(5, 6).watered).toBe(true)
    expect(world.get(5, 7).watered).toBe(true)  // water reaches land on the far side
  })
})
