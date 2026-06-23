import { describe, it, expect } from 'vitest'
import { stepDisasters, triggerEarthquake, triggerFire } from './disasters'
import { World } from '../core/world'
import { Building, Overlay, Zone } from '../core/tile'

describe('disasters', () => {
  it('does nothing when chance roll misses', () => {
    const world = new World()
    world.set(0, 0, { zone: Zone.Residential, density: 3 })
    expect(stepDisasters(world, () => 0.9, 0.1)).toEqual({ type: 'none', destroyed: 0, ignited: 0 })
    expect(world.get(0, 0).zone).toBe(Zone.Residential)
  })

  it('earthquake destroys developed tiles', () => {
    const world = new World()
    world.set(0, 0, { zone: Zone.Commercial, density: 4, overlay: Overlay.Road, building: Building.Library })
    const result = triggerEarthquake(world, () => 0, 1)
    expect(result).toEqual({ type: 'earthquake', destroyed: 1, ignited: 0 })
    expect(world.get(0, 0).zone).toBe(Zone.None)
    expect(world.get(0, 0).building).toBe(Building.None)
    expect(world.get(0, 0).density).toBe(0)
  })

  it('keeps power line overlay after earthquake damage', () => {
    const world = new World()
    world.set(0, 0, { overlay: Overlay.Road | Overlay.PowerLine })
    triggerEarthquake(world, () => 0, 1)
    expect(world.get(0, 0).overlay).toBe(Overlay.PowerLine)
  })

  it('fire ignites a developed tile', () => {
    const world = new World()
    world.set(7, 7, { zone: Zone.Residential, density: 2 })
    const result = triggerFire(world, () => 0)
    expect(result).toEqual({ type: 'fire', destroyed: 0, ignited: 1 })
    expect(world.get(7, 7).burning).toBe(true)
  })

  it('fire is a no-op when nothing flammable exists', () => {
    const world = new World()
    expect(triggerFire(world, () => 0)).toEqual({ type: 'fire', destroyed: 0, ignited: 0 })
  })

  it('stepDisasters can start a fire on a developed city', () => {
    const world = new World()
    world.set(3, 3, { building: Building.Hospital })
    // roll < chance picks a disaster; second roll < 0.66 selects fire
    const result = stepDisasters(world, () => 0, 1)
    expect(result.type).toBe('fire')
    expect(result.ignited).toBe(1)
  })
})
