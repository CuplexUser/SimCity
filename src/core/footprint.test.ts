import { describe, it, expect } from 'vitest'
import { World } from './world'
import { Building, Overlay, Terrain, Zone } from './tile'
import {
  canPlaceFootprint, placeFootprint, findRoot, footprintTiles, clearFootprint,
  isFootprintOrigin, isCovered,
} from './footprint'

describe('footprint helpers', () => {
  it('canPlaceFootprint accepts empty land and rejects out-of-bounds', () => {
    const world = new World()
    expect(canPlaceFootprint(world, 5, 5, 3, 3)).toBe(true)
    expect(canPlaceFootprint(world, -1, 5, 2, 2)).toBe(false)
    expect(canPlaceFootprint(world, world.cols - 1, 5, 2, 2)).toBe(false)
  })

  it('canPlaceFootprint rejects water, roads, and occupied tiles', () => {
    const world = new World()
    world.set(6, 5, { terrain: Terrain.Water })
    expect(canPlaceFootprint(world, 5, 5, 3, 3)).toBe(false)

    const w2 = new World()
    w2.set(6, 6, { overlay: Overlay.Road })
    expect(canPlaceFootprint(w2, 5, 5, 3, 3)).toBe(false)

    const w3 = new World()
    w3.set(6, 6, { building: Building.PoliceStation })
    expect(canPlaceFootprint(w3, 5, 5, 3, 3)).toBe(false)
  })

  it('allowRoadUnder lets a utility plot sit over roads (but never over buildings/water)', () => {
    const world = new World()
    world.set(6, 6, { overlay: Overlay.Road })
    // Roads under the plot are fine for a utility…
    expect(canPlaceFootprint(world, 5, 5, 3, 3, true)).toBe(true)
    // …but the same plot is still rejected for a non-utility (default false).
    expect(canPlaceFootprint(world, 5, 5, 3, 3)).toBe(false)

    // Even with allowRoadUnder, a building or water tile still blocks placement.
    const w2 = new World()
    w2.set(6, 6, { building: Building.PoliceStation })
    expect(canPlaceFootprint(w2, 5, 5, 3, 3, true)).toBe(false)
    const w3 = new World()
    w3.set(6, 6, { terrain: Terrain.Water })
    expect(canPlaceFootprint(w3, 5, 5, 3, 3, true)).toBe(false)
  })

  it('placeFootprint preserves an underlying road overlay (roads run under utilities)', () => {
    const world = new World()
    world.set(5, 5, { overlay: Overlay.Road })
    world.set(6, 6, { overlay: Overlay.Road })
    placeFootprint(world, 5, 5, 3, 3, { building: Building.PowerPlant, zone: Zone.None })
    // Origin and covered tiles keep their road overlay so the grid stays connected.
    expect(world.get(5, 5).overlay & Overlay.Road).toBeTruthy()
    expect(world.get(6, 6).overlay & Overlay.Road).toBeTruthy()
  })

  it('placeFootprint marks origin + covered tiles', () => {
    const world = new World()
    placeFootprint(world, 4, 4, 3, 2, { building: Building.PowerPlant, zone: Zone.None })

    const origin = world.get(4, 4)
    expect(origin.building).toBe(Building.PowerPlant)
    expect(origin.footW).toBe(3)
    expect(origin.footH).toBe(2)
    expect(isFootprintOrigin(origin)).toBe(true)

    // a covered tile points back to the origin and carries no building of its own
    const covered = world.get(6, 5)
    expect(isCovered(covered)).toBe(true)
    expect(covered.rootCol).toBe(4)
    expect(covered.rootRow).toBe(4)
    expect(covered.building).toBe(Building.None)

    expect(findRoot(world, 6, 5)).toEqual({ col: 4, row: 4 })
    expect(findRoot(world, 4, 4)).toEqual({ col: 4, row: 4 })
    expect(footprintTiles(world, 6, 5)).toHaveLength(6)
  })

  it('clearFootprint removes the whole plot from any covered tile', () => {
    const world = new World()
    placeFootprint(world, 4, 4, 3, 2, { building: Building.PowerPlant, zone: Zone.None })

    const cleared = clearFootprint(world, 6, 5) // hit a covered tile
    expect(cleared).toHaveLength(6)

    for (let r = 4; r <= 5; r++) {
      for (let c = 4; c <= 6; c++) {
        const t = world.get(c, r)
        expect(t.building).toBe(Building.None)
        expect(t.rootCol).toBe(-1)
        expect(t.rootRow).toBe(-1)
        expect(t.footW).toBe(1)
        expect(t.footH).toBe(1)
      }
    }
  })

  it('clearFootprint preserves terrain and elevation', () => {
    const world = new World()
    world.set(4, 4, { terrain: Terrain.Dirt, elevation: 3 })
    placeFootprint(world, 4, 4, 2, 2, { building: Building.Hospital, zone: Zone.None })
    clearFootprint(world, 4, 4)
    expect(world.get(4, 4).terrain).toBe(Terrain.Dirt)
    expect(world.get(4, 4).elevation).toBe(3)
  })
})
