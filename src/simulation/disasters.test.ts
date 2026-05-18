import { describe, it, expect } from 'vitest'
import { stepDisasters, triggerEarthquake } from './disasters'
import { World } from '../core/world'
import { Building, Overlay, Zone } from '../core/tile'

describe('disasters', () => {
  it('does nothing when chance roll misses', () => {
    const world = new World()
    world.set(0, 0, { zone: Zone.Residential, density: 3 })
    expect(stepDisasters(world, () => 0.9, 0.1)).toEqual({ type: 'none', destroyed: 0 })
    expect(world.get(0, 0).zone).toBe(Zone.Residential)
  })

  it('earthquake destroys developed tiles', () => {
    const world = new World()
    world.set(0, 0, { zone: Zone.Commercial, density: 4, overlay: Overlay.Road, building: Building.Library })
    const result = triggerEarthquake(world, () => 0, 1)
    expect(result).toEqual({ type: 'earthquake', destroyed: 1 })
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
})
