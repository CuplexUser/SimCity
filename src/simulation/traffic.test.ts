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
})
