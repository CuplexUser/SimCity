import { describe, it, expect } from 'vitest'
import { stepFire, stepFireSpread, resolveFires, igniteFire, countBurning } from './fire'
import { World } from '../core/world'
import { Building, Terrain, Zone } from '../core/tile'

describe('stepFire', () => {
  it('covers tiles near a fire station', () => {
    const world = new World()
    world.set(10, 10, { building: Building.FireStation })
    stepFire(world)
    expect(world.get(10, 10).fireProtected).toBe(true)
    expect(world.get(10, 11).fireProtected).toBe(true)
  })

  it('clears fire protection when stations are removed', () => {
    const world = new World()
    world.set(10, 10, { building: Building.FireStation })
    stepFire(world)
    world.set(10, 10, { building: Building.None })
    stepFire(world)
    expect(world.get(10, 11).fireProtected).toBe(false)
  })
})

describe('stepFireSpread', () => {
  it('spreads fire to eligible neighbors', () => {
    const world = new World()
    world.set(5, 5, { burning: true })
    expect(stepFireSpread(world, () => 0)).toBe(4)
  })

  it('does not spread into water or protected tiles', () => {
    const world = new World()
    world.set(5, 5, { burning: true })
    world.set(5, 6, { terrain: Terrain.Water })
    world.set(6, 5, { fireProtected: true })
    const spread = stepFireSpread(world, () => 0)
    expect(spread).toBe(2)
    expect(world.get(5, 6).burning).toBe(false)
    expect(world.get(6, 5).burning).toBe(false)
  })
})

describe('igniteFire', () => {
  it('ignites a developed tile', () => {
    const world = new World()
    world.set(4, 4, { zone: Zone.Residential, density: 1 })
    expect(igniteFire(world, 4, 4)).toBe(true)
    expect(world.get(4, 4).burning).toBe(true)
  })

  it('refuses to ignite empty land', () => {
    const world = new World()
    expect(igniteFire(world, 4, 4)).toBe(false)
    expect(world.get(4, 4).burning).toBe(false)
  })
})

describe('resolveFires', () => {
  it('extinguishes a fire-protected tile (high roll succeeds)', () => {
    const world = new World()
    world.set(5, 5, { burning: true, fireProtected: true })
    const { extinguished, destroyed } = resolveFires(world, () => 0)
    expect(extinguished).toBe(1)
    expect(destroyed).toBe(0)
    expect(world.get(5, 5).burning).toBe(false)
  })

  it('burns out an unprotected developed tile, clearing it', () => {
    const world = new World()
    world.set(5, 5, { burning: true, zone: Zone.Commercial, density: 4, building: Building.Library })
    const { destroyed } = resolveFires(world, () => 0)
    expect(destroyed).toBe(1)
    const t = world.get(5, 5)
    expect(t.burning).toBe(false)
    expect(t.zone).toBe(Zone.None)
    expect(t.building).toBe(Building.None)
    expect(t.density).toBe(0)
  })

  it('leaves a burning tile alight when neither roll fires', () => {
    const world = new World()
    world.set(5, 5, { burning: true })
    const { extinguished, destroyed } = resolveFires(world, () => 0.99)
    expect(extinguished).toBe(0)
    expect(destroyed).toBe(0)
    expect(world.get(5, 5).burning).toBe(true)
  })
})

describe('countBurning', () => {
  it('counts tiles on fire', () => {
    const world = new World()
    expect(countBurning(world)).toBe(0)
    world.set(1, 1, { burning: true })
    world.set(2, 2, { burning: true })
    expect(countBurning(world)).toBe(2)
  })
})
