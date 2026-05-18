import { describe, it, expect } from 'vitest'
import { computePollution } from './pollution'
import { World } from '../core/world'
import { Building, Zone } from '../core/tile'

describe('computePollution', () => {
  it('returns zero pollution for a blank world', () => {
    const world = new World()
    expect(Math.max(...computePollution(world))).toBe(0)
  })

  it('creates pollution around industrial density', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Industrial, density: 8 })
    const pollution = computePollution(world)
    expect(pollution[5 * world.cols + 5]).toBeGreaterThan(0)
    expect(pollution[5 * world.cols + 5]).toBeGreaterThan(pollution[10 * world.cols + 10])
  })

  it('power plants are pollution sources', () => {
    const world = new World()
    world.set(8, 8, { building: Building.PowerPlant })
    expect(computePollution(world)[8 * world.cols + 8]).toBeGreaterThan(0)
  })
})
