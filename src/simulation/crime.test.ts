import { describe, it, expect } from 'vitest'
import { stepCrime } from './crime'
import { World } from '../core/world'
import { Building, Terrain } from '../core/tile'

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
