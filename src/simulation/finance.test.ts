import { describe, it, expect } from 'vitest'
import {
  newFinanceState, issueBond, payAnnualDebt, payoffBond, payoffAmount,
  totalDebt, annualDebtService, computeRating, rateForRating, ratingIndex,
  BOND_TERM_YEARS, MIN_BOND, MAX_BOND,
} from './finance'

describe('issueBond', () => {
  it('creates a 10-year bond at the rating rate and tracks debt', () => {
    const f = newFinanceState()              // AAA → 5%
    const bond = issueBond(f, 10_000)
    expect(bond).not.toBeNull()
    expect(bond!.rate).toBe(rateForRating('AAA'))
    expect(bond!.termYears).toBe(BOND_TERM_YEARS)
    expect(bond!.balance).toBe(10_000)
    expect(totalDebt(f)).toBe(10_000)
  })

  it('rejects amounts outside the allowed range', () => {
    const f = newFinanceState()
    expect(issueBond(f, MIN_BOND - 1)).toBeNull()
    expect(issueBond(f, MAX_BOND + 1)).toBeNull()
    expect(f.bonds).toHaveLength(0)
  })

  it('locks the rate at issue time even if the rating later changes', () => {
    const f = newFinanceState()
    const b = issueBond(f, 10_000)!
    f.rating = 'CCC'
    expect(b.rate).toBe(rateForRating('AAA'))
  })
})

describe('annualDebtService + payAnnualDebt', () => {
  it('first-year payment is principal/term + interest on full balance', () => {
    const f = newFinanceState()
    issueBond(f, 10_000)                      // 5%, 10yr
    // 1000 principal + 500 interest
    expect(annualDebtService(f)).toBe(1_500)
    const paid = payAnnualDebt(f)
    expect(paid).toBe(1_500)
    expect(totalDebt(f)).toBe(9_000)
  })

  it('fully amortizes over the term and then disappears', () => {
    const f = newFinanceState()
    issueBond(f, 10_000)
    let total = 0
    for (let y = 0; y < BOND_TERM_YEARS; y++) total += payAnnualDebt(f)
    expect(f.bonds).toHaveLength(0)
    expect(totalDebt(f)).toBe(0)
    // Total repaid exceeds principal (it includes interest).
    expect(total).toBeGreaterThan(10_000)
  })
})

describe('payoffBond', () => {
  it('returns the outstanding balance and removes the bond', () => {
    const f = newFinanceState()
    const b = issueBond(f, 10_000)!
    payAnnualDebt(f)                          // balance now 9000
    expect(payoffAmount(f, b.id)).toBe(9_000)
    expect(payoffBond(f, b.id)).toBe(9_000)
    expect(f.bonds).toHaveLength(0)
  })

  it('is a no-op for an unknown bond id', () => {
    const f = newFinanceState()
    expect(payoffBond(f, 999)).toBe(0)
  })
})

describe('computeRating', () => {
  it('a healthy treasury with no debt is AAA', () => {
    expect(computeRating(20_000, 0, 5_000)).toBe('AAA')
  })

  it('a deep cash deficit tanks the rating', () => {
    expect(ratingIndex(computeRating(-15_000, 0, 5_000)))
      .toBeLessThan(ratingIndex('A'))
  })

  it('heavy debt relative to revenue lowers the rating', () => {
    const healthy = computeRating(10_000, 0, 10_000)
    const leveraged = computeRating(10_000, 60_000, 10_000)
    expect(ratingIndex(leveraged)).toBeLessThan(ratingIndex(healthy))
  })

  it('worse ratings carry higher interest rates', () => {
    expect(rateForRating('CCC')).toBeGreaterThan(rateForRating('AAA'))
    expect(rateForRating('BBB')).toBeGreaterThan(rateForRating('AA'))
  })
})
