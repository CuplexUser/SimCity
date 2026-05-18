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

  it('residential density grows on year tick when powered + connected road access', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 1, powered: true })
    // Two-tile road segment satisfies isRoadConnected(..., 1)
    world.set(5, 6, { overlay: Overlay.Road })
    world.set(5, 7, { overlay: Overlay.Road })
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(2)
  })

  it('residential density grows when a road is two tiles away', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 1, powered: true })
    world.set(5, 7, { overlay: Overlay.Road })
    world.set(5, 8, { overlay: Overlay.Road })
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(2)
  })

  it('center tile of a 3x3 zone block grows when surrounded by roads', () => {
    const world = new World()

    for (let row = 4; row <= 6; row++) {
      for (let col = 4; col <= 6; col++) {
        world.set(col, row, { zone: Zone.Residential, density: 1, powered: true })
      }
    }

    for (let col = 3; col <= 7; col++) {
      world.set(col, 3, { overlay: Overlay.Road })
      world.set(col, 7, { overlay: Overlay.Road })
    }
    for (let row = 3; row <= 7; row++) {
      world.set(3, row, { overlay: Overlay.Road })
      world.set(7, row, { overlay: Overlay.Road })
    }

    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(2)
  })

  it('density does not grow when the nearest road is three tiles away', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 1, powered: true })
    world.set(5, 8, { overlay: Overlay.Road })
    world.set(5, 9, { overlay: Overlay.Road })
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(1)
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
    // No road nearby — stays at density 1
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(1)
  })

  it('density does not grow with an isolated single-tile road (stub)', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 1, powered: true })
    // Single isolated road tile fails isRoadConnected check
    world.set(5, 6, { overlay: Overlay.Road })
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

  it('a road overlay on the tile itself counts when connected to another road', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 1, powered: true, overlay: Overlay.Road })
    world.set(5, 6, { overlay: Overlay.Road })  // makes the on-tile road connected
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(2)
  })

  it('commercial grows only when population base is sufficient', () => {
    const world = new World()
    // Very small population — commercial demand should be false
    world.set(0, 0, { zone: Zone.Residential, density: 1, powered: true })
    world.set(0, 1, { zone: Zone.Commercial,  density: 0, powered: true })
    world.set(0, 2, { overlay: Overlay.Road })
    world.set(0, 3, { overlay: Overlay.Road })  // connected road segment
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
