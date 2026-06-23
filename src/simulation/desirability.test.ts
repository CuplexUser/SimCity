import { describe, it, expect } from 'vitest'
import { zoneDesirability, desirabilityDensityCap } from './desirability'
import { defaultTile, Zone, type Tile } from '../core/tile'

function tile(zone: Zone, patch: Partial<Tile> = {}): Tile {
  return { ...defaultTile(), zone, ...patch }
}

describe('zoneDesirability', () => {
  it('is zero for unzoned tiles', () => {
    expect(zoneDesirability(tile(Zone.None), 100, 0)).toBe(0)
  })

  it('full service coverage on prime land scores higher than no services', () => {
    const served = tile(Zone.Residential, {
      policed: true, fireProtected: true, healthCovered: true, educated: true,
    })
    const bare = tile(Zone.Residential)
    expect(zoneDesirability(served, 100, 0)).toBeGreaterThan(zoneDesirability(bare, 50, 0))
  })

  it('an unserviced residential tile only sustains low density', () => {
    const bare = tile(Zone.Residential)
    expect(desirabilityDensityCap(zoneDesirability(bare, 50, 0))).toBeLessThanOrEqual(2)
  })

  it('a fully serviced residential tile on prime land sustains high density', () => {
    const served = tile(Zone.Residential, {
      policed: true, fireProtected: true, healthCovered: true, educated: true,
    })
    expect(desirabilityDensityCap(zoneDesirability(served, 100, 0))).toBeGreaterThanOrEqual(7)
  })

  it('pollution lowers residential desirability more than industrial', () => {
    const r = tile(Zone.Residential, { policed: true, fireProtected: true })
    const i = tile(Zone.Industrial, { policed: true, fireProtected: true })
    const rDrop = zoneDesirability(r, 50, 0) - zoneDesirability(r, 50, 100)
    const iDrop = zoneDesirability(i, 50, 0) - zoneDesirability(i, 50, 100)
    expect(rDrop).toBeGreaterThan(iDrop)
  })

  it('crime and traffic lower desirability', () => {
    const served = tile(Zone.Residential, {
      policed: true, fireProtected: true, healthCovered: true, educated: true,
    })
    const clean = zoneDesirability(served, 100, 0, 0, 0)
    expect(zoneDesirability(served, 100, 0, 100, 0)).toBeLessThan(clean) // heavy traffic
    expect(zoneDesirability(served, 100, 0, 0, 100)).toBeLessThan(clean) // high crime
  })

  it('clamps to the 0..1 range', () => {
    const maxed = tile(Zone.Residential, {
      policed: true, fireProtected: true, healthCovered: true, educated: true,
    })
    expect(zoneDesirability(maxed, 100, 0)).toBeLessThanOrEqual(1)
    expect(zoneDesirability(maxed, 0, 100)).toBeGreaterThanOrEqual(0)
  })
})
