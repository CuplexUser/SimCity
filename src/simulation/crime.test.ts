import { describe, it, expect } from 'vitest'
import { stepCrime, computeCrime } from './crime'
import { World } from '../core/world'
import { Building, Terrain, Zone } from '../core/tile'

describe('stepCrime', () => {
  it('nothing is policed when no police station exists', () => {
    const world = new World()
    stepCrime(world)
    let anyPoliced = false
    world.forEach((tile) => { if (tile.policed) anyPoliced = true })
    expect(anyPoliced).toBe(false)
  })

  it('police station tile itself is policed', () => {
    const world = new World()
    world.set(5, 5, { building: Building.PoliceStation })
    stepCrime(world)
    expect(world.get(5, 5).policed).toBe(true)
  })

  it('covers nearby tiles within range', () => {
    const world = new World()
    world.set(10, 10, { building: Building.PoliceStation })
    stepCrime(world)
    expect(world.get(10, 11).policed).toBe(true)
    expect(world.get(11, 10).policed).toBe(true)
  })

  it('does not cover beyond the 25-tile range', () => {
    const world = new World()
    world.set(1, 1, { building: Building.PoliceStation })
    stepCrime(world)
    expect(world.get(27, 1).policed).toBe(false)
  })

  it('does not pass through water', () => {
    const world = new World()
    world.set(15, 5, { building: Building.PoliceStation })
    for (let col = 0; col <= 31; col++) {
      world.set(col, 6, { terrain: Terrain.Water })
    }
    stepCrime(world)
    expect(world.get(15, 6).policed).toBe(false)
    expect(world.get(15, 7).policed).toBe(false)
  })

  it('clears policed flags on each call', () => {
    const world = new World()
    world.set(5, 5, { building: Building.PoliceStation })
    stepCrime(world)
    expect(world.get(5, 6).policed).toBe(true)

    world.set(5, 5, { building: Building.None })
    stepCrime(world)
    expect(world.get(5, 5).policed).toBe(false)
    expect(world.get(5, 6).policed).toBe(false)
  })
})

describe('computeCrime', () => {
  it('is all-zero with no developed zones', () => {
    const world = new World()
    const grid = computeCrime(world)
    expect(grid.every((v) => v === 0)).toBe(true)
  })

  it('developed zones radiate crime into the neighborhood', () => {
    const world = new World()
    world.set(20, 20, { zone: Zone.Commercial, density: 6 })
    const grid = computeCrime(world)
    expect(grid[20 * world.cols + 20]).toBeGreaterThan(0)
    // A nearby tile picks up diffused crime too.
    expect(grid[20 * world.cols + 22]).toBeGreaterThan(0)
  })

  it('police coverage suppresses crime', () => {
    const world = new World()
    // Two identical dense commercial clusters; only the first is policed. They
    // share the same normalization, so the policed one must read lower crime.
    world.set(20, 20, { zone: Zone.Commercial, density: 8 })
    world.set(20, 20, { building: Building.PoliceStation })
    world.set(60, 60, { zone: Zone.Commercial, density: 8 })
    stepCrime(world)
    const grid = computeCrime(world)
    const policed   = grid[20 * world.cols + 20]
    const unpoliced = grid[60 * world.cols + 60]
    expect(policed).toBeLessThan(unpoliced)
  })
})
