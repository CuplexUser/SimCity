import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stepZones } from './zones'
import { World } from '../core/world'
import { Zone, Overlay } from '../core/tile'
import { placeFootprint } from '../core/footprint'
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

  it('forms a multi-tile lot on first development when art sizes are available', () => {
    const world = new World()
    for (let row = 5; row <= 6; row++) {
      for (let col = 5; col <= 6; col++) {
        world.set(col, row, { zone: Zone.Residential, density: 0, powered: true })
      }
    }
    world.set(5, 4, { overlay: Overlay.Road })
    world.set(5, 3, { overlay: Overlay.Road }) // connected road segment

    stepZones(world, true, () => [2]) // only 2×2 art available

    const origin = world.get(5, 5)
    expect(origin.footW).toBe(2)
    expect(origin.footH).toBe(2)
    expect(origin.density).toBe(1)

    // a covered tile points back to the origin and is no longer its own R plot
    const covered = world.get(6, 6)
    expect(covered.rootCol).toBe(5)
    expect(covered.rootRow).toBe(5)
    expect(covered.zone).toBe(Zone.None)
  })

  it('without a lot sizer zones stay 1×1 (unchanged fallback behavior)', () => {
    const world = new World()
    for (let row = 5; row <= 6; row++) {
      for (let col = 5; col <= 6; col++) {
        world.set(col, row, { zone: Zone.Residential, density: 0, powered: true })
      }
    }
    world.set(5, 4, { overlay: Overlay.Road })
    world.set(5, 3, { overlay: Overlay.Road })

    stepZones(world, true) // no lotSizer

    // The origin develops as a plain 1×1 lot; no tile becomes covered.
    expect(world.get(5, 5).footW).toBe(1)
    expect(world.get(5, 5).density).toBe(1)
    expect(world.get(6, 6).rootCol).toBe(-1)
    expect(world.get(6, 6).footW).toBe(1)
  })

  it('scales residential population by lot footprint area', () => {
    const world = new World()
    placeFootprint(world, 5, 5, 2, 2, { zone: Zone.Residential, density: 3 })
    const { population } = stepZones(world, false)
    expect(population).toBe(3 * 10 * 4) // density × 10 × (2×2 tiles)
  })

  it('small-town residential stays low-rise (density caps at 2)', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 2, powered: true })
    world.set(5, 6, { overlay: Overlay.Road })
    world.set(5, 7, { overlay: Overlay.Road })
    stepZones(world, true) // population ≈ 20 → stage 0
    expect(world.get(5, 5).density).toBe(2)
  })

  it('residential grows past low-rise once city population reaches mid stage', () => {
    const world = new World()
    // 50 filler lots × density 2 × 10 = 1,000 population → residential mid stage
    for (let i = 0; i < 50; i++) {
      world.set(i % 20, 20 + Math.floor(i / 20), { zone: Zone.Residential, density: 2, powered: true })
    }
    world.set(5, 5, { zone: Zone.Residential, density: 2, powered: true })
    world.set(5, 6, { overlay: Overlay.Road })
    world.set(5, 7, { overlay: Overlay.Road })
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(3)
  })

  it('commercial stays low-rise until the city is much larger than residential needs', () => {
    const world = new World()
    // 60 filler lots → 1,200 population: above residential mid (1,000) but
    // below commercial mid (2,000); commercial demand itself is satisfied.
    for (let i = 0; i < 60; i++) {
      world.set(i % 20, 20 + Math.floor(i / 20), { zone: Zone.Residential, density: 2, powered: true })
    }
    world.set(5, 5, { zone: Zone.Commercial, density: 2, powered: true })
    world.set(5, 6, { overlay: Overlay.Road })
    world.set(5, 7, { overlay: Overlay.Road })
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(2)
  })

  it('3×3 lots only form once the city reaches mid stage', () => {
    const makeBlock = (world: World) => {
      for (let row = 5; row <= 7; row++) {
        for (let col = 5; col <= 7; col++) {
          world.set(col, row, { zone: Zone.Residential, density: 0, powered: true })
        }
      }
      world.set(5, 4, { overlay: Overlay.Road })
      world.set(6, 4, { overlay: Overlay.Road })
    }

    // Small town: 3×3 art exists but the lot develops 1×1
    const small = new World()
    makeBlock(small)
    stepZones(small, true, () => [3])
    expect(small.get(5, 5).footW).toBe(1)
    expect(small.get(5, 5).density).toBe(1)

    // Mid-stage city: the same block claims a 3×3 lot
    const mid = new World()
    makeBlock(mid)
    for (let i = 0; i < 50; i++) {
      mid.set(i % 20, 20 + Math.floor(i / 20), { zone: Zone.Residential, density: 2, powered: true })
    }
    stepZones(mid, true, () => [3])
    expect(mid.get(5, 5).footW).toBe(3)
    expect(mid.get(5, 5).density).toBe(1)
  })

  it('non-year ticks do not change density', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 1, powered: true })
    world.set(5, 6, { overlay: Overlay.Road })
    stepZones(world, false)
    expect(world.get(5, 5).density).toBe(1)
  })
})
