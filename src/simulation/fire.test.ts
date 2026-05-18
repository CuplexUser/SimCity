import { describe, it, expect } from 'vitest'
import { stepFire, stepFireSpread } from './fire'
import { World } from '../core/world'
import { Building, Terrain } from '../core/tile'

describe('stepFire', () => {
  it('covers tiles near a fire station', () => {
    const world = new World()
    world.set(10, 10, { building: Building.FireStation })
    stepFire(world)
    expect(world.get(10, 10).fireProtected).toBe(true)
    expect(world.get(10, 11).fireProtected).toBe(true)
  })

  it('clears fire protection when stations are removed', () => {
    const world = new World()
    world.set(10, 10, { building: Building.FireStation })
    stepFire(world)
    world.set(10, 10, { building: Building.None })
    stepFire(world)
    expect(world.get(10, 11).fireProtected).toBe(false)
  })
})

describe('stepFireSpread', () => {
  it('spreads fire to eligible neighbors', () => {
    const world = new World()
    world.set(5, 5, { burning: true })
    expect(stepFireSpread(world, () => 0)).toBe(4)
  })

  it('does not spread into water or protected tiles', () => {
    const world = new World()
    world.set(5, 5, { burning: true })
    world.set(5, 6, { terrain: Terrain.Water })
    world.set(6, 5, { fireProtected: true })
    const spread = stepFireSpread(world, () => 0)
    expect(spread).toBe(2)
    expect(world.get(5, 6).burning).toBe(false)
    expect(world.get(6, 5).burning).toBe(false)
  })
})
