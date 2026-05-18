import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stepZones } from './zones'
import { World } from '../core/world'
import { Zone, Overlay } from '../core/tile'
import { events } from '../core/events'

describe('stepZones', () => {
  beforeEach(() => {
    // Silence any log events emitted during tests
    vi.spyOn(events, 'emit').mockImplementation(() => {})
  })

  it('returns population=0 for a blank world', () => {
    const world = new World()
    const { population } = stepZones(world, false)
    expect(population).toBe(0)
  })

  it('counts residential population as density * 10', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 4, powered: true })
    world.set(5, 4, { overlay: Overlay.Road })
    const { population } = stepZones(world, false)
    expect(population).toBe(40)
  })

  it('residential density grows on year tick when powered + road access', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 1, powered: true })
    world.set(5, 6, { overlay: Overlay.Road })
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(2)
  })

  it('density does not grow without power', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 1, powered: false })
    world.set(5, 6, { overlay: Overlay.Road })
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(1)
  })

  it('density does not grow without road access', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 1, powered: true })
    // No road nearby
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(1)
  })

  it('density caps at 8', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 8, powered: true })
    world.set(5, 6, { overlay: Overlay.Road })
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(8)
  })

  it('a road overlay on the tile itself counts as road access', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 1, powered: true, overlay: Overlay.Road })
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(2)
  })

  it('commercial grows only when population base is sufficient', () => {
    const world = new World()
    // Very small population — commercial demand should be false
    world.set(0, 0, { zone: Zone.Residential, density: 1, powered: true })
    world.set(0, 1, { zone: Zone.Commercial,  density: 0, powered: true })
    world.set(0, 2, { overlay: Overlay.Road })
    stepZones(world, true)
    // population = 10, cCount = 1, cDemand = 10 > 1*30? No → density stays 0
    expect(world.get(0, 1).density).toBe(0)
  })

  it('non-year ticks do not change density', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 1, powered: true })
    world.set(5, 6, { overlay: Overlay.Road })
    stepZones(world, false)
    expect(world.get(5, 5).density).toBe(1)
  })
})
