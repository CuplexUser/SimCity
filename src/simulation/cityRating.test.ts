import { describe, it, expect } from 'vitest'
import { World } from '../core/world'
import { Zone } from '../core/tile'
import { computeCityRating, ratingLabel, type RatingInputs } from './cityRating'

const noServices = { powered: 0, unpowered: 0 }
const noWater    = { watered: 0, unwatered: 0 }

function base(world: World, over: Partial<RatingInputs> = {}): RatingInputs {
  return { funds: 10_000, burning: 0, power: noServices, water: noWater, ...over }
}

describe('computeCityRating', () => {
  it('rates a solvent, empty city at the neutral baseline', () => {
    const world = new World()
    expect(computeCityRating(world, base(world))).toBe(55)
  })

  it('drops the rating when the treasury is in deficit', () => {
    const world = new World()
    const solvent = computeCityRating(world, base(world, { funds: 1_000 }))
    const broke   = computeCityRating(world, base(world, { funds: -1 }))
    expect(broke).toBeLessThan(solvent)
  })

  it('penalizes active fires', () => {
    const world = new World()
    const calm    = computeCityRating(world, base(world, { burning: 0 }))
    const burning = computeCityRating(world, base(world, { burning: 5 }))
    expect(burning).toBeLessThan(calm)
  })

  it('rewards full utility coverage over none', () => {
    const world = new World()
    const dry = computeCityRating(world, base(world, {
      power: { powered: 0, unpowered: 10 }, water: { watered: 0, unwatered: 10 },
    }))
    const served = computeCityRating(world, base(world, {
      power: { powered: 10, unpowered: 0 }, water: { watered: 10, unwatered: 0 },
    }))
    expect(served).toBeGreaterThan(dry)
  })

  it('lets high land value lift developed areas above high crime', () => {
    const world = new World()
    const cols = world.cols, rows = world.rows
    // Develop one tile so the land-quality term engages.
    world.set(3, 3, { zone: Zone.Residential, density: 4 })
    const lv = new Uint8Array(cols * rows).fill(20)
    const hv = new Uint8Array(cols * rows).fill(95)
    const crime = new Uint8Array(cols * rows).fill(80)

    const poor = computeCityRating(world, base(world, { landValue: lv, crime }))
    const rich = computeCityRating(world, base(world, { landValue: hv, crime }))
    expect(rich).toBeGreaterThan(poor)
  })

  it('maps scores to human-readable labels across the range', () => {
    expect(ratingLabel(95)).toBe('Thriving')
    expect(ratingLabel(55)).toBe('Stable')
    expect(ratingLabel(10)).toBe('In Crisis')
  })
})
