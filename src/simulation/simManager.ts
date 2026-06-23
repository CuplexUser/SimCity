import { type World } from '../core/world'
import { events, type TickEvent, type YearEvent, type LogEvent } from '../core/events'
import { stepPower, type PowerStats } from './power'
import { stepWater, type WaterStats } from './water'
import { stepZones, type LotSizer, type GrowthFields } from './zones'
import { stepCrime, computeCrime } from './crime'
import { stepFire, stepFireSpread, resolveFires, countBurning } from './fire'
import { stepServices } from './services'
import { stepDisasters } from './disasters'
import { computeLandValue } from './landValue'
import { computePollution } from './pollution'
import { computeTraffic } from './traffic'
import { computeBudget } from './economy'
import {
  type FinanceState, type Bond, newFinanceState,
  issueBond as financeIssueBond, payoffBond as financePayoffBond, payoffAmount,
  payAnnualDebt, totalDebt, computeRating,
} from './finance'

/** Heatmap grids the data-layer overlays can request on demand (0..100 per tile). */
export type GridMode = 'crime' | 'pollution' | 'traffic' | 'landvalue'

const TICKS_PER_YEAR = 12  // 1 tick = 1 game month

export class SimManager {
  private tick = 0
  private year = 2000

  population = 0
  funds      = 20_000
  /** Zone power coverage from the latest tick — UI reads this for the ⚡ indicator. */
  power: PowerStats = { powered: 0, unpowered: 0 }
  /** Zone water coverage from the latest tick — UI reads this for the 💧 indicator. */
  water: WaterStats = { watered: 0, unwatered: 0 }
  /** Tiles currently on fire (latest tick) — UI reads this for the 🔥 indicator. */
  burning = 0

  /** Per-year samples for the population / funds history graphs (capped length). */
  readonly popHistory:   number[] = []
  readonly fundsHistory: number[] = []

  /** Municipal bonds + credit rating (see simulation/finance.ts). */
  finance: FinanceState = newFinanceState()

  /** Supplied by the renderer once the sprite atlas is known; enables multi-tile lots. */
  private lotSizer?: LotSizer

  constructor(private world: World) {}

  setLotSizer(fn?: LotSizer): void { this.lotSizer = fn }

  step(): void {
    this.tick++
    const isYearTick = this.tick % TICKS_PER_YEAR === 0

    // Run all simulation subsystems. Coverage (power/water/crime/fire/services)
    // refreshes every tick so the data-layer overlays and zone growth read current
    // flags; the heavier land-value / pollution grids only feed yearly growth.
    this.power = stepPower(this.world)
    this.water = stepWater(this.world)
    stepCrime(this.world)
    stepFire(this.world)        // fire-station coverage flags (tile.fireProtected)
    stepServices(this.world)

    // ── Fire & disasters ──────────────────────────────────────────────────
    // An active blaze spreads to neighbors, then each burning tile is resolved
    // (fire-station coverage douses it; otherwise it may burn out and destroy the
    // lot). Random disasters can start a fresh fire or an earthquake.
    if (this.burning > 0) {
      stepFireSpread(this.world)
      resolveFires(this.world)
    }
    const disaster = stepDisasters(this.world)
    if (disaster.type === 'fire' && disaster.ignited > 0) {
      events.emit<LogEvent>('log', { message: '🔥 Fire broke out in the city!' })
    } else if (disaster.type === 'earthquake' && disaster.destroyed > 0) {
      events.emit<LogEvent>('log', { message: `Earthquake! ${disaster.destroyed} tiles destroyed.` })
    }

    const wasBurning = this.burning
    this.burning = countBurning(this.world)
    if (wasBurning > 0 && this.burning === 0) {
      events.emit<LogEvent>('log', { message: 'The fire is out.' })
    }

    let fields: GrowthFields | undefined
    if (isYearTick) {
      fields = {
        landValue: computeLandValue(this.world),
        pollution: computePollution(this.world),
        traffic:   computeTraffic(this.world),
        crime:     computeCrime(this.world),
      }
    }
    const { population } = stepZones(this.world, isYearTick, this.lotSizer, fields)
    this.population = population

    events.emit<TickEvent>('tick', { tick: this.tick })

    if (isYearTick) {
      this.year++
      const { revenue, expenses } = computeBudget(this.world)
      // Bond payments come due before we tally the year, then the rating is
      // re-assessed against the resulting cash position and debt load.
      const debtService = payAnnualDebt(this.finance)
      this.funds += revenue - expenses - debtService
      this.finance.rating = computeRating(this.funds, totalDebt(this.finance), revenue)

      this._recordHistory()

      events.emit<YearEvent>('year', { year: this.year, revenue, expenses, debtService })

      const net = revenue - expenses - debtService
      const sign = net >= 0 ? '+' : ''
      const debtNote = debtService > 0 ? `, debt $${debtService.toLocaleString()}` : ''
      events.emit<LogEvent>('log', {
        message: `${this.year} — Budget: ${sign}$${net.toLocaleString()} (rev $${revenue.toLocaleString()}${debtNote})`,
      })

      if (this.funds < 0) {
        events.emit<LogEvent>('log', { message: 'Warning: City funds in deficit!' })
      }
    }
  }

  /** Compute a fresh heatmap grid for a data-layer overlay. Called by the UI only
   *  while that overlay is showing, so the cost stays off the normal sim path. */
  grid(mode: GridMode): Uint8Array {
    switch (mode) {
      case 'crime':     return computeCrime(this.world)
      case 'pollution': return computePollution(this.world)
      case 'traffic':   return computeTraffic(this.world)
      case 'landvalue': return computeLandValue(this.world)
    }
  }

  getYear(): number { return this.year }
  getTick(): number { return this.tick }

  /** Current annual revenue / expenses (recomputed on demand for the budget UI). */
  currentBudget(): { revenue: number; expenses: number } {
    return computeBudget(this.world)
  }

  /**
   * Issue a bond for `amount`, crediting the proceeds to the treasury. Returns
   * the new bond (or null if the amount is out of range). The credit rating is
   * re-assessed immediately so a fresh debt load shows up before year-end.
   */
  issueBond(amount: number): Bond | null {
    const bond = financeIssueBond(this.finance, amount)
    if (!bond) return null
    this.funds += bond.principal
    this.finance.rating = computeRating(this.funds, totalDebt(this.finance), this.currentBudget().revenue)
    return bond
  }

  /** Retire a bond early, debiting its outstanding balance. Returns false if the
   *  bond is unknown or the treasury can't cover the payoff. */
  payoffBond(id: number): boolean {
    const owed = payoffAmount(this.finance, id)
    if (owed <= 0 || this.funds < owed) return false
    financePayoffBond(this.finance, id)
    this.funds -= owed
    this.finance.rating = computeRating(this.funds, totalDebt(this.finance), this.currentBudget().revenue)
    return true
  }

  /** Append the current population / funds to the history graphs, capping length. */
  private _recordHistory(): void {
    const CAP = 80
    this.popHistory.push(this.population)
    this.fundsHistory.push(this.funds)
    if (this.popHistory.length   > CAP) this.popHistory.shift()
    if (this.fundsHistory.length > CAP) this.fundsHistory.shift()
  }

  reset(state?: { year?: number; tick?: number; population?: number; funds?: number; finance?: FinanceState }): void {
    this.year = state?.year ?? 2000
    this.tick = state?.tick ?? 0
    this.population = state?.population ?? 0
    this.funds = state?.funds ?? 20_000
    this.power = { powered: 0, unpowered: 0 }
    this.water = { watered: 0, unwatered: 0 }
    this.burning = 0
    this.popHistory.length = 0
    this.fundsHistory.length = 0
    // Deep-copy so a loaded save's bonds aren't aliased into the save object.
    this.finance = state?.finance
      ? { rating: state.finance.rating, nextId: state.finance.nextId, bonds: state.finance.bonds.map((b) => ({ ...b })) }
      : newFinanceState()
  }
}
