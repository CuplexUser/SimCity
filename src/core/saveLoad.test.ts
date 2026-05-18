import { describe, it, expect } from 'vitest'
import { deserializeGameState, deserializeWorld, normalizeCityName, serializeGameState, serializeWorld } from './saveLoad'
import { World } from './world'
import { Building, Overlay, Terrain, Zone } from './tile'

describe('saveLoad', () => {
  it('round-trips edited tiles', () => {
    const world = new World()
    world.set(2, 3, {
      terrain: Terrain.Forest,
      elevation: 4,
      zone: Zone.Residential,
      density: 6,
      overlay: Overlay.Road,
      building: Building.PoliceStation,
      powered: true,
      watered: true,
      policed: true,
      fireProtected: true,
      burning: true,
    })

    const restored = deserializeWorld(serializeWorld(world))
    expect(restored.get(2, 3)).toEqual(world.get(2, 3))
  })

  it('compresses repeated default tiles into a single run', () => {
    const world = new World()
    const save = serializeWorld(world)
    expect(save.runs).toHaveLength(1)
    expect(save.runs[0].count).toBe(world.cols * world.rows)
  })

  it('rejects saves with the wrong dimensions', () => {
    const world = new World()
    const save = serializeWorld(world)
    expect(() => deserializeWorld({ ...save, cols: 1 })).toThrow('Unsupported save format')
  })

  it('round-trips full game state metadata', () => {
    const world = new World()
    world.set(1, 1, { building: Building.WaterTower })
    const save = serializeGameState(world, { year: 2010, tick: 42, population: 1200, funds: 99_999 })
    const restored = deserializeGameState(save)
    expect(restored.world.get(1, 1).building).toBe(Building.WaterTower)
    expect(restored.sim).toEqual({ year: 2010, tick: 42, population: 1200, funds: 99_999 })
  })

  it('normalizes city names for save slots', () => {
    expect(normalizeCityName('  New   Stockholm  ')).toBe('New Stockholm')
    expect(normalizeCityName('   ')).toBe('Untitled City')
  })
})
