import { describe, it, expect } from 'vitest'
import { stepServices } from './services'
import { World } from '../core/world'
import { Building, Terrain } from '../core/tile'

describe('stepServices — health (hospitals)', () => {
  it('marks no tiles when there is no hospital', () => {
    const world = new World()
    stepServices(world)
    let any = false
    world.forEach((t) => { if (t.healthCovered) any = true })
    expect(any).toBe(false)
  })

  it('covers tiles within hospital range', () => {
    const world = new World()
    world.set(10, 10, { building: Building.Hospital })
    stepServices(world)
    expect(world.get(10, 10).healthCovered).toBe(true)
    expect(world.get(10, 20).healthCovered).toBe(true)  // within 20
    expect(world.get(10, 31).healthCovered).toBe(false) // beyond 20
  })

  it('does not propagate health across water', () => {
    const world = new World()
    world.set(15, 5, { building: Building.Hospital })
    for (let col = 0; col <= 31; col++) world.set(col, 6, { terrain: Terrain.Water })
    stepServices(world)
    expect(world.get(15, 7).healthCovered).toBe(false)
  })
})

describe('stepServices — education (schools + libraries)', () => {
  it('schools confer education coverage', () => {
    const world = new World()
    world.set(10, 10, { building: Building.School })
    stepServices(world)
    expect(world.get(10, 10).educated).toBe(true)
    expect(world.get(10, 25).educated).toBe(true)   // within school range 15
    expect(world.get(10, 26).educated).toBe(false)  // beyond 15
  })

  it('libraries confer education coverage (shorter range)', () => {
    const world = new World()
    world.set(10, 10, { building: Building.Library })
    stepServices(world)
    expect(world.get(10, 20).educated).toBe(true)   // within library range 10
    expect(world.get(10, 21).educated).toBe(false)  // beyond 10
  })

  it('clears coverage flags each call when sources are removed', () => {
    const world = new World()
    world.set(5, 5, { building: Building.Hospital })
    stepServices(world)
    expect(world.get(5, 6).healthCovered).toBe(true)

    world.set(5, 5, { building: Building.None })
    stepServices(world)
    expect(world.get(5, 6).healthCovered).toBe(false)
  })
})
