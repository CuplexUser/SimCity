import { describe, it, expect } from 'vitest'
import { computeLandValue } from './landValue'
import { World } from '../core/world'
import { Building, Terrain, Zone } from '../core/tile'

describe('computeLandValue', () => {
  it('scores every tile', () => {
    const world = new World()
    expect(computeLandValue(world)).toHaveLength(world.cols * world.rows)
  })

  it('rewards nearby education services', () => {
    const world = new World()
    const base = computeLandValue(world)[5 * world.cols + 5]
    world.set(6, 5, { building: Building.School })
    expect(computeLandValue(world)[5 * world.cols + 5]).toBeGreaterThan(base)
  })

  it('penalizes industrial zoning compared with forest', () => {
    const world = new World()
    world.set(4, 4, { terrain: Terrain.Forest })
    world.set(5, 5, { zone: Zone.Industrial })
    const value = computeLandValue(world)
    expect(value[4 * world.cols + 4]).toBeGreaterThan(value[5 * world.cols + 5])
  })
})
