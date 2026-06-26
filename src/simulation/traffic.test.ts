import { describe, it, expect } from 'vitest'
import { computeTraffic } from './traffic'
import { World } from '../core/world'
import { Overlay, Zone } from '../core/tile'

describe('computeTraffic', () => {
  it('returns zero load for a blank world', () => {
    const world = new World()
    const traffic = computeTraffic(world)
    expect(Math.max(...traffic)).toBe(0)
  })

  it('adds load to roads near developed zones', () => {
    const world = new World()
    world.set(5, 5, { zone: Zone.Residential, density: 4 })
    world.set(5, 6, { overlay: Overlay.Road })
    const traffic = computeTraffic(world)
    expect(traffic[6 * world.cols + 5]).toBeGreaterThan(0)
  })

  it('commercial zones create stronger road load than residential zones', () => {
    const residential = new World()
    residential.set(5, 5, { zone: Zone.Residential, density: 4 })
    residential.set(5, 6, { overlay: Overlay.Road })

    const commercial = new World()
    commercial.set(5, 5, { zone: Zone.Commercial, density: 4 })
    commercial.set(5, 6, { overlay: Overlay.Road })

    expect(computeTraffic(commercial)[6 * commercial.cols + 5])
      .toBeGreaterThanOrEqual(computeTraffic(residential)[6 * residential.cols + 5])
  })

  it('routes commuter trips along the road between homes and jobs', () => {
    const world = new World()
    // A vertical road corridor from a home cluster (top) to a job cluster (bottom).
    for (let r = 5; r <= 15; r++) world.set(5, r, { overlay: Overlay.Road })
    world.set(4, 5, { zone: Zone.Residential, density: 8 })   // origin, adjacent to road (5,5)
    world.set(4, 15, { zone: Zone.Commercial, density: 8 })   // destination, adjacent to road (5,15)

    const traffic = computeTraffic(world)
    // A mid-corridor road tile carries the through trip even though no zone touches it.
    expect(traffic[10 * world.cols + 5]).toBeGreaterThan(0)
    // An unrelated road tile far from the corridor stays empty.
    world.set(40, 40, { overlay: Overlay.Road })
    expect(computeTraffic(world)[40 * world.cols + 40]).toBe(0)
  })

  it('routes commuter trips along a diagonal road corridor', () => {
    const world = new World()
    // A diagonal road corridor from a home (top-left) to a job (bottom-right).
    for (let i = 5; i <= 15; i++) world.set(i, i, { overlay: Overlay.RoadDiag })
    world.set(4, 5, { zone: Zone.Residential, density: 8 })   // adjacent to diag road (5,5)
    world.set(16, 15, { zone: Zone.Commercial, density: 8 })  // adjacent to diag road (15,15)

    const traffic = computeTraffic(world)
    // A mid-corridor diagonal tile carries the through trip.
    expect(traffic[10 * world.cols + 10]).toBeGreaterThan(0)
  })
})
