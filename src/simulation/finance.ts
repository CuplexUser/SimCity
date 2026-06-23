/**
 * finance.ts — municipal bonds + credit rating.
 *
 * A city can borrow against its future by issuing 10-year bonds. The interest
 * rate it's offered depends on its credit rating, which in turn tracks fiscal
 * health (cash on hand vs. outstanding debt vs. annual revenue). Run a deficit
 * with a big debt load and the rating falls, future borrowing gets more
 * expensive — the classic deficit spiral. Pay debt down and the rating recovers.
 *
 * Bonds amortize with level principal: each year a bond repays principal/term
 * plus interest on its remaining balance, so payments shrink as it's paid off.
 */

export type CreditRating = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC'

export interface Bond {
  id:        number
  principal: number   // original face value borrowed
  rate:      number   // fixed annual interest rate (fraction), locked at issue
  termYears: number   // total term in years (always BOND_TERM_YEARS at issue)
  remaining: number   // years left to pay
  balance:   number   // outstanding principal still owed
}

export interface FinanceState {
  bonds:  Bond[]
  rating: CreditRating
  nextId: number
}

export const BOND_TERM_YEARS = 10
export const MIN_BOND = 1_000
export const MAX_BOND = 50_000

/** Interest rate offered for a *new* bond at each credit rating (5%–12%). */
const RATING_RATE: Record<CreditRating, number> = {
  AAA: 0.05, AA: 0.06, A: 0.07, BBB: 0.08, BB: 0.095, B: 0.11, CCC: 0.12,
}

const RATING_ORDER: CreditRating[] = ['CCC', 'B', 'BB', 'BBB', 'A', 'AA', 'AAA']

export function newFinanceState(): FinanceState {
  return { bonds: [], rating: 'AAA', nextId: 1 }
}

export function rateForRating(rating: CreditRating): number {
  return RATING_RATE[rating]
}

/** Total outstanding principal across all bonds. */
export function totalDebt(f: FinanceState): number {
  return Math.round(f.bonds.reduce((sum, b) => sum + b.balance, 0))
}

/** What this year's bond payments will cost (interest + scheduled principal). */
export function annualDebtService(f: FinanceState): number {
  let total = 0
  for (const b of f.bonds) total += b.principal / b.termYears + b.balance * b.rate
  return Math.round(total)
}

/**
 * Issue a new bond for `amount`, locking in the rate for the current rating.
 * Returns the bond (caller credits `amount` to the treasury) or null if the
 * amount is outside the allowed range.
 */
export function issueBond(f: FinanceState, amount: number): Bond | null {
  const principal = Math.round(amount)
  if (!Number.isFinite(principal) || principal < MIN_BOND || principal > MAX_BOND) return null
  const bond: Bond = {
    id:        f.nextId++,
    principal,
    rate:      rateForRating(f.rating),
    termYears: BOND_TERM_YEARS,
    remaining: BOND_TERM_YEARS,
    balance:   principal,
  }
  f.bonds.push(bond)
  return bond
}

/** Cash needed to retire a bond early (its full outstanding balance). */
export function payoffAmount(f: FinanceState, id: number): number {
  const b = f.bonds.find((x) => x.id === id)
  return b ? Math.round(b.balance) : 0
}

/**
 * Retire a bond early. Returns the cash required (caller debits the treasury),
 * or 0 if the bond doesn't exist. Caller must confirm funds are available first.
 */
export function payoffBond(f: FinanceState, id: number): number {
  const i = f.bonds.findIndex((x) => x.id === id)
  if (i < 0) return 0
  const owed = Math.round(f.bonds[i].balance)
  f.bonds.splice(i, 1)
  return owed
}

/**
 * Advance every bond by one year: charge interest + scheduled principal, then
 * drop any bond that's fully paid. Returns the total paid (caller debits it).
 */
export function payAnnualDebt(f: FinanceState): number {
  let paid = 0
  for (const b of f.bonds) {
    const principalPart = b.principal / b.termYears
    paid += principalPart + b.balance * b.rate
    b.balance = Math.max(0, b.balance - principalPart)
    b.remaining -= 1
  }
  f.bonds = f.bonds.filter((b) => b.remaining > 0 && b.balance > 0.5)
  return Math.round(paid)
}

/**
 * Credit rating from fiscal health. Cash reserves lift it; a cash deficit and a
 * heavy debt-to-revenue load drag it down. The result sets the interest rate on
 * the *next* bond issued (see rateForRating), so a downgrade makes borrowing
 * more expensive — feeding the deficit spiral.
 */
export function computeRating(funds: number, debt: number, annualRevenue: number): CreditRating {
  let score = 100

  if (funds < 0) score -= Math.min(60, Math.round(-funds / 1_000) * 4)
  else           score += Math.min(15, Math.round(funds / 5_000))

  // Debt relative to annual revenue — the higher the leverage, the worse.
  const debtRatio = annualRevenue > 0 ? debt / annualRevenue : (debt > 0 ? 99 : 0)
  score -= Math.min(50, Math.round(debtRatio * 8))

  if (score >= 100) return 'AAA'
  if (score >= 90)  return 'AA'
  if (score >= 80)  return 'A'
  if (score >= 65)  return 'BBB'
  if (score >= 45)  return 'BB'
  if (score >= 25)  return 'B'
  return 'CCC'
}

/** Numeric index of a rating (0 = CCC … 6 = AAA), for comparing up/downgrades. */
export function ratingIndex(rating: CreditRating): number {
  return RATING_ORDER.indexOf(rating)
}
