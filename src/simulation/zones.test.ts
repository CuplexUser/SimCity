import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stepZones, type GrowthFields } from './zones'
import { World } from '../core/world'
import { Zone, Overlay, type Tile } from '../core/tile'
import { placeFootprint } from '../core/footprint'
import { events } from '../core/events'

// Full service coverage — lets desirability reach its ceiling so a test can
// exercise the city-population staging in isolation from the service gating.
const FULLY_SERVED: Partial<Tile> = {
  powered: true, watered: true,
  policed: true, fireProtected: true, healthCovered: true, educated: true,
}

// Land-value grid pinned high, so desirability isn't held down by low value.
function highLandValue(world: World): GrowthFields {
  return { landValue: new Uint8Array(world.cols * world.rows).fill(100) }
}

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
    world.set(5, 5, { zone: Zone.Residential, density: 4, powered: true, watered: true })
    world.set(5, 4, { overlay: Overlay.Road })
    const { population } = stepZones(world, false)
    expect(population).toBe(40)
  })

  it('residential density grows on year tick when powered + connected road access', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 1, powered: true, watered: true })
    // Two-tile road segment satisfies isRoadConnected(..., 1)
    world.set(5, 6, { overlay: Overlay.Road })
    world.set(5, 7, { overlay: Overlay.Road })
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(2)
  })

  it('residential density grows when a road is two tiles away', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 1, powered: true, watered: true })
    world.set(5, 7, { overlay: Overlay.Road })
    world.set(5, 8, { overlay: Overlay.Road })
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(2)
  })

  it('center tile of a 3x3 zone block grows when surrounded by roads', () => {
    const world = new World()

    for (let row = 4; row <= 6; row++) {
      for (let col = 4; col <= 6; col++) {
        world.set(col, row, { zone: Zone.Residential, density: 1, powered: true, watered: true })
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

  it('a vacant zone does not develop when the nearest road is three tiles away', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 0, powered: true, watered: true })
    world.set(5, 8, { overlay: Overlay.Road })
    world.set(5, 9, { overlay: Overlay.Road })
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(0)
  })

  it('a vacant zone does not develop without power', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 0, powered: false })
    world.set(5, 6, { overlay: Overlay.Road })
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(0)
  })

  it('a vacant zone does not develop without water', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 0, powered: true, watered: false })
    world.set(5, 6, { overlay: Overlay.Road })
    world.set(5, 7, { overlay: Overlay.Road })
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(0)
  })

  it('a vacant zone does not develop without road access', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 0, powered: true, watered: true })
    // No road nearby — stays vacant
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(0)
  })

  it('a vacant zone does not develop with an isolated single-tile road (stub)', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 0, powered: true, watered: true })
    // Single isolated road tile fails isRoadConnected check
    world.set(5, 6, { overlay: Overlay.Road })
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(0)
  })

  it('a developed lot decays toward abandonment when it loses power', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 4, powered: false, watered: true })
    world.set(5, 6, { overlay: Overlay.Road })
    world.set(5, 7, { overlay: Overlay.Road })
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(3)
  })

  it('a developed lot sheds density when it exceeds what its desirability sustains', () => {
    const world = new World()
    // Powered + watered + road but no services and low land value → low desirability,
    // so an over-built density-6 lot declines one stage toward its sustainable cap.
    world.set(5, 5, { zone: Zone.Residential, density: 6, powered: true, watered: true })
    world.set(5, 6, { overlay: Overlay.Road })
    world.set(5, 7, { overlay: Overlay.Road })
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(5)
  })

  it('density caps at 8 even when fully serviced on prime land', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 8, ...FULLY_SERVED })
    world.set(5, 6, { overlay: Overlay.Road })
    world.set(5, 7, { overlay: Overlay.Road })
    // 50 filler lots push the city into high stage so staging doesn't cap below 8.
    for (let i = 0; i < 80; i++) {
      world.set(i % 20, 40 + Math.floor(i / 20), { zone: Zone.Residential, density: 8, ...FULLY_SERVED })
    }
    stepZones(world, true, undefined, highLandValue(world))
    expect(world.get(5, 5).density).toBe(8)
  })

  it('an unserviced low-value lot cannot climb past low density (services gate growth)', () => {
    const world = new World()
    // Big city (high stage cap) but this lot has no services and average land value.
    for (let i = 0; i < 80; i++) {
      world.set(i % 20, 40 + Math.floor(i / 20), { zone: Zone.Residential, density: 8, ...FULLY_SERVED })
    }
    world.set(5, 5, { zone: Zone.Residential, density: 2, powered: true, watered: true })
    world.set(5, 6, { overlay: Overlay.Road })
    world.set(5, 7, { overlay: Overlay.Road })
    stepZones(world, true)  // no land-value grid → defaults to average (50)
    // Desirability cap (≈2) holds it at low-rise despite the high stage cap.
    expect(world.get(5, 5).density).toBe(2)
  })

  it('full service coverage lets a lot grow past low density', () => {
    const world = new World()
    for (let i = 0; i < 80; i++) {
      world.set(i % 20, 40 + Math.floor(i / 20), { zone: Zone.Residential, density: 8, ...FULLY_SERVED })
    }
    world.set(5, 5, { zone: Zone.Residential, density: 2, ...FULLY_SERVED })
    world.set(5, 6, { overlay: Overlay.Road })
    world.set(5, 7, { overlay: Overlay.Road })
    stepZones(world, true, undefined, highLandValue(world))
    expect(world.get(5, 5).density).toBe(3)
  })

  it('a road overlay on the tile itself counts when connected to another road', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 1, powered: true, watered: true, overlay: Overlay.Road })
    world.set(5, 6, { overlay: Overlay.Road })  // makes the on-tile road connected
    stepZones(world, true)
    expect(world.get(5, 5).density).toBe(2)
  })

  it('commercial grows only when population base is sufficient', () => {
    const world = new World()
    // Very small population — commercial demand should be false
    world.set(0, 0, { zone: Zone.Residential, density: 1, powered: true, watered: true })
    world.set(0, 1, { zone: Zone.Commercial,  density: 0, powered: true, watered: true })
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
        world.set(col, row, { zone: Zone.Residential, density: 0, powered: true, watered: true })
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
        world.set(col, row, { zone: Zone.Residential, density: 0, powered: true, watered: true })
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

  it('small-town residential stays low-rise (stage cap 2)', () => {
    const world = new World()
    // Fully serviced on prime land, so only the population stage caps growth.
    world.set(5, 5, { zone: Zone.Residential, density: 2, ...FULLY_SERVED })
    world.set(5, 6, { overlay: Overlay.Road })
    world.set(5, 7, { overlay: Overlay.Road })
    stepZones(world, true, undefined, highLandValue(world)) // population ≈ 20 → stage 0
    expect(world.get(5, 5).density).toBe(2)
  })

  it('residential grows past low-rise once city population reaches mid stage', () => {
    const world = new World()
    // 50 filler lots × density 2 × 10 = 1,000 population → residential mid stage
    for (let i = 0; i < 50; i++) {
      world.set(i % 20, 20 + Math.floor(i / 20), { zone: Zone.Residential, density: 2, ...FULLY_SERVED })
    }
    world.set(5, 5, { zone: Zone.Residential, density: 2, ...FULLY_SERVED })
    world.set(5, 6, { overlay: Overlay.Road })
    world.set(5, 7, { overlay: Overlay.Road })
    stepZones(world, true, undefined, highLandValue(world))
    expect(world.get(5, 5).density).toBe(3)
  })

  it('commercial stays low-rise until the city is much larger than residential needs', () => {
    const world = new World()
    // 60 filler lots → 1,200 population: above residential mid (1,000) but
    // below commercial mid (2,000); commercial demand itself is satisfied.
    for (let i = 0; i < 60; i++) {
      world.set(i % 20, 20 + Math.floor(i / 20), { zone: Zone.Residential, density: 2, ...FULLY_SERVED })
    }
    world.set(5, 5, { zone: Zone.Commercial, density: 2, ...FULLY_SERVED })
    world.set(5, 6, { overlay: Overlay.Road })
    world.set(5, 7, { overlay: Overlay.Road })
    stepZones(world, true, undefined, highLandValue(world))
    expect(world.get(5, 5).density).toBe(2)
  })

  it('3×3 lots only form once the city reaches mid stage', () => {
    const makeBlock = (world: World) => {
      for (let row = 5; row <= 7; row++) {
        for (let col = 5; col <= 7; col++) {
          world.set(col, row, { zone: Zone.Residential, density: 0, powered: true, watered: true })
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
      mid.set(i % 20, 20 + Math.floor(i / 20), { zone: Zone.Residential, density: 2, powered: true, watered: true })
    }
    stepZones(mid, true, () => [3])
    expect(mid.get(5, 5).footW).toBe(3)
    expect(mid.get(5, 5).density).toBe(1)
  })

  it('non-year ticks do not change density', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 1, powered: true, watered: true })
    world.set(5, 6, { overlay: Overlay.Road })
    stepZones(world, false)
    expect(world.get(5, 5).density).toBe(1)
  })
})
