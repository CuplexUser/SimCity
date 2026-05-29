import { describe, it, expect } from 'vitest'
import { applyBulldoze } from './bulldoze'
import { World } from './world'
import { Building, Overlay, Terrain, Zone } from './tile'

describe('applyBulldoze', () => {
  it('normal mode removes manmade tile state but preserves terrain', () => {
    const world = new World()
    world.set(4, 4, {
      terrain: Terrain.Forest,
      elevation: 6,
      zone: Zone.Residential,
      density: 4,
      overlay: Overlay.Road,
      building: Building.Library,
      burning: true,
    })

    expect(applyBulldoze(world, 4, 4, 'normal')).toBe(true)
    // zone is preserved when structures are present — second bulldoze clears the vacant zone
    expect(world.get(4, 4)).toMatchObject({
      terrain: Terrain.Forest,
      elevation: 6,
      zone: Zone.Residential,
      density: 0,
      overlay: 0,
      building: Building.None,
      burning: false,
    })
    expect(applyBulldoze(world, 4, 4, 'normal')).toBe(true)
    expect(world.get(4, 4)).toMatchObject({ zone: Zone.None })
  })

  it('terrain mode clears development and levels to buildable grass', () => {
    const world = new World()
    world.set(2, 2, {
      terrain: Terrain.Water,
      elevation: 0,
      zone: Zone.Industrial,
      density: 8,
      overlay: Overlay.Road | Overlay.PowerLine,
      building: Building.PowerPlant,
      burning: true,
    })

    expect(applyBulldoze(world, 2, 2, 'terrain', 3)).toBe(true)
    expect(world.get(2, 2)).toMatchObject({
      terrain: Terrain.Grass,
      elevation: 3,
      zone: Zone.None,
      density: 0,
      overlay: 0,
      building: Building.None,
      burning: false,
    })
  })

  it('zoning mode removes only zoning and density', () => {
    const world = new World()
    world.set(7, 7, {
      terrain: Terrain.Dirt,
      elevation: 1,
      zone: Zone.Commercial,
      density: 5,
      overlay: Overlay.Road,
      building: Building.PoliceStation,
      burning: true,
    })

    expect(applyBulldoze(world, 7, 7, 'zoning')).toBe(true)
    expect(world.get(7, 7)).toMatchObject({
      terrain: Terrain.Dirt,
      elevation: 1,
      zone: Zone.None,
      density: 0,
      overlay: Overlay.Road,
      building: Building.PoliceStation,
      burning: true,
    })
  })

  it('returns false when the selected mode has nothing to change', () => {
    const world = new World()
    expect(applyBulldoze(world, 0, 0, 'normal')).toBe(false)
    expect(applyBulldoze(world, 0, 0, 'zoning')).toBe(false)
    world.set(0, 0, { terrain: Terrain.Grass, elevation: 2 })
    expect(applyBulldoze(world, 0, 0, 'terrain')).toBe(false)
  })
})
