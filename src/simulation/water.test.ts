import { describe, it, expect } from 'vitest'
import { stepWater } from './water'
import { World } from '../core/world'
import { Building, Terrain } from '../core/tile'

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
})
