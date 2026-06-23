import { describe, it, expect } from 'vitest'
import {
  ORDINANCES, newOrdinanceState, normalizeOrdinanceState, ordinanceBudget,
} from './ordinances'

describe('ordinances', () => {
  it('starts with every ordinance disabled', () => {
    const state = newOrdinanceState()
    expect(Object.values(state).every((v) => v === false)).toBe(true)
    expect(ordinanceBudget(state, 10_000)).toEqual({ revenue: 0, expenses: 0 })
  })

  it('routes income vs expense ordinances to the right side of the budget', () => {
    const state = newOrdinanceState()
    state.gambling = true        // income
    state.cleanAir = true        // expense
    const { revenue, expenses } = ordinanceBudget(state, 1_000)

    const gambling = ORDINANCES.find((o) => o.id === 'gambling')!
    const cleanAir = ORDINANCES.find((o) => o.id === 'cleanAir')!
    expect(revenue).toBe(gambling.amount(1_000))
    expect(expenses).toBe(cleanAir.amount(1_000))
  })

  it('scales each ordinance amount with population', () => {
    const small = ordinanceBudget({ ...newOrdinanceState(), gambling: true }, 100)
    const large = ordinanceBudget({ ...newOrdinanceState(), gambling: true }, 100_000)
    expect(large.revenue).toBeGreaterThan(small.revenue)
  })

  it('backfills a partial / legacy saved state with defaults', () => {
    const merged = normalizeOrdinanceState({ tourism: true })
    expect(merged.tourism).toBe(true)
    expect(merged.gambling).toBe(false)
    expect(Object.keys(merged).sort()).toEqual(ORDINANCES.map((o) => o.id).sort())
  })
})
