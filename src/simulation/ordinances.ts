/**
 * ordinances.ts — toggleable city ordinances (SC4-style budget laws).
 *
 * Each ordinance flips revenue or expenses by an amount that scales with the
 * city's population, so the same law matters more in a metropolis than a hamlet.
 * Effects are applied at the annual budget (see SimManager.currentBudget); the
 * flavor of each law (crime/pollution/traffic/fire) lives in its description so
 * players can weigh trade-offs, while the mechanical effect stays on the budget.
 */

export type OrdinanceId =
  | 'gambling'
  | 'tourism'
  | 'smokeDetectors'
  | 'cleanAir'
  | 'publicTransit'
  | 'neighborhoodWatch'

export interface OrdinanceDef {
  id:          OrdinanceId
  label:       string
  description: string
  kind:        'income' | 'expense'
  /** Annual dollar magnitude for the current population (always positive). */
  amount:      (population: number) => number
}

export const ORDINANCES: OrdinanceDef[] = [
  { id: 'gambling',          label: 'Legalize Gambling',       kind: 'income',
    description: 'Casino taxes boost income, but gambling tends to raise crime.',
    amount: (p) => Math.round(50 + p * 0.6) },
  { id: 'tourism',           label: 'Tourism Campaign',        kind: 'income',
    description: 'Advertise the city to draw visitor spending.',
    amount: (p) => Math.round(p * 0.4) },
  { id: 'smokeDetectors',    label: 'Smoke-Detector Subsidy',  kind: 'expense',
    description: 'Subsidized alarms cut fire risk across the city.',
    amount: (p) => Math.round(30 + p * 0.10) },
  { id: 'cleanAir',          label: 'Clean Air Act',           kind: 'expense',
    description: 'Emission controls reduce industrial pollution.',
    amount: (p) => Math.round(40 + p * 0.20) },
  { id: 'publicTransit',     label: 'Transit Subsidy',         kind: 'expense',
    description: 'Subsidized buses ease road congestion.',
    amount: (p) => Math.round(p * 0.30) },
  { id: 'neighborhoodWatch', label: 'Neighborhood Watch',      kind: 'expense',
    description: 'Community policing lowers crime cheaply.',
    amount: (p) => Math.round(20 + p * 0.15) },
]

export type OrdinanceState = Record<OrdinanceId, boolean>

export function newOrdinanceState(): OrdinanceState {
  return {
    gambling: false, tourism: false, smokeDetectors: false,
    cleanAir: false, publicTransit: false, neighborhoodWatch: false,
  }
}

/** Merge a (possibly partial / legacy) saved state onto a full default. */
export function normalizeOrdinanceState(saved?: Partial<OrdinanceState>): OrdinanceState {
  return { ...newOrdinanceState(), ...saved }
}

/** Net effect of the active ordinances on the annual budget. */
export function ordinanceBudget(
  state: OrdinanceState, population: number,
): { revenue: number; expenses: number } {
  let revenue = 0, expenses = 0
  for (const o of ORDINANCES) {
    if (!state[o.id]) continue
    const amt = o.amount(population)
    if (o.kind === 'income') revenue += amt
    else                     expenses += amt
  }
  return { revenue, expenses }
}
