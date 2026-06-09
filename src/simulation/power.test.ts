import { describe, it, expect } from 'vitest'
import { stepPower } from './power'
import { World } from '../core/world'
import { Building, Terrain, Overlay, Zone } from '../core/tile'

describe('stepPower', () => {
  it('nothing is powered when no power plant exists', () => {
    const world = new World()
    stepPower(world)
    let anyPowered = false
    world.forEach((tile) => { if (tile.powered) anyPowered = true })
    expect(anyPowered).toBe(false)
  })

  it('power plant tile itself is powered', () => {
    const world = new World()
    world.set(5, 5, { building: Building.PowerPlant })
    stepPower(world)
    expect(world.get(5, 5).powered).toBe(true)
  })

  it('adjacent tiles within range are powered', () => {
    const world = new World()
    world.set(10, 10, { building: Building.PowerPlant })
    stepPower(world)
    expect(world.get(10, 11).powered).toBe(true)
    expect(world.get(11, 10).powered).toBe(true)
    expect(world.get(10,  9).powered).toBe(true)
    expect(world.get( 9, 10).powered).toBe(true)
  })

  it('water tile itself is not powered (BFS does not enter it)', () => {
    const world = new World()
    world.set(5, 5, { building: Building.PowerPlant })
    world.set(5, 6, { terrain: Terrain.Water })
    stepPower(world)
    // The water tile itself should not be powered — BFS skips it
    expect(world.get(5, 6).powered).toBe(false)
  })

  it('water with power line overlay lets power through', () => {
    const world = new World()
    world.set(5, 5, { building: Building.PowerPlant })
    world.set(5, 6, { terrain: Terrain.Water, overlay: Overlay.PowerLine })
    stepPower(world)
    expect(world.get(5, 6).powered).toBe(true)
    expect(world.get(5, 7).powered).toBe(true)
  })

  it('reports powered vs unpowered zone tiles', () => {
    const world = new World()
    // Two zone tiles near a plant, one far outside its 50-tile range
    world.set(5, 5, { building: Building.PowerPlant })
    world.set(5, 6, { zone: Zone.Residential })
    world.set(6, 5, { zone: Zone.Commercial })
    world.set(100, 100, { zone: Zone.Industrial })

    const stats = stepPower(world)
    expect(stats.powered).toBe(2)
    expect(stats.unpowered).toBe(1)
  })

  it('reports zero coverage with no zones', () => {
    const world = new World()
    world.set(5, 5, { building: Building.PowerPlant })
    const stats = stepPower(world)
    expect(stats).toEqual({ powered: 0, unpowered: 0 })
  })

  it('clears powered flags on each call', () => {
    const world = new World()
    world.set(5, 5, { building: Building.PowerPlant })
    stepPower(world)
    expect(world.get(5, 6).powered).toBe(true)

    // Remove plant and re-run
    world.set(5, 5, { building: Building.None })
    stepPower(world)
    expect(world.get(5, 5).powered).toBe(false)
    expect(world.get(5, 6).powered).toBe(false)
  })
})
