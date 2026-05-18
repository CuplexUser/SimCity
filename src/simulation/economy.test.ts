import { describe, it, expect } from 'vitest'
import { computeBudget } from './economy'
import { World } from '../core/world'
import { Zone, Overlay } from '../core/tile'

describe('computeBudget', () => {
  it('returns zero revenue and zero expenses for a blank world', () => {
    const world = new World()
    const { revenue, expenses } = computeBudget(world)
    expect(revenue).toBe(0)
    expect(expenses).toBe(0)
  })

  it('vacant zones (density 0) generate no revenue', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 0 })
    const { revenue } = computeBudget(world)
    expect(revenue).toBe(0)
  })

  it('residential tax: $8 per density per tile', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 3 })
    const { revenue } = computeBudget(world)
    expect(revenue).toBe(24)  // 3 * 8
  })

  it('commercial tax: $12 per density per tile', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Commercial, density: 2 })
    const { revenue } = computeBudget(world)
    expect(revenue).toBe(24)  // 2 * 12
  })

  it('industrial tax: $7 per density per tile', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Industrial, density: 4 })
    const { revenue } = computeBudget(world)
    expect(revenue).toBe(28)  // 4 * 7
  })

  it('road upkeep: $2 per road tile', () => {
    const world = new World()
    world.set(3, 3, { overlay: Overlay.Road })
    world.set(3, 4, { overlay: Overlay.Road })
    const { expenses } = computeBudget(world)
    expect(expenses).toBe(4)  // 2 roads * $2
  })

  it('multiple zones and roads accumulate correctly', () => {
    const world = new World()
    world.set(0, 0, { zone: Zone.Residential, density: 5 })  // 40
    world.set(0, 1, { zone: Zone.Commercial,  density: 1 })  // 12
    world.set(0, 2, { zone: Zone.Industrial,  density: 2 })  // 14
    world.set(1, 0, { overlay: Overlay.Road })               // 2 exp
    const { revenue, expenses } = computeBudget(world)
    expect(revenue).toBe(40 + 12 + 14)
    expect(expenses).toBe(2)
  })
})
