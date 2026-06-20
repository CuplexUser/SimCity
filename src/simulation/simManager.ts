import { type World } from '../core/world'
import { events, type TickEvent, type YearEvent, type LogEvent } from '../core/events'
import { stepPower, type PowerStats } from './power'
import { stepWater, type WaterStats } from './water'
import { stepZones, type LotSizer, type GrowthFields } from './zones'
import { stepCrime } from './crime'
import { stepFire } from './fire'
import { stepServices } from './services'
import { computeLandValue } from './landValue'
import { computePollution } from './pollution'
import { computeBudget } from './economy'

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
    stepFire(this.world)
    stepServices(this.world)

    let fields: GrowthFields | undefined
    if (isYearTick) {
      fields = {
        landValue: computeLandValue(this.world),
        pollution: computePollution(this.world),
      }
    }
    const { population } = stepZones(this.world, isYearTick, this.lotSizer, fields)
    this.population = population

    events.emit<TickEvent>('tick', { tick: this.tick })

    if (isYearTick) {
      this.year++
      const { revenue, expenses } = computeBudget(this.world)
      this.funds += revenue - expenses

      events.emit<YearEvent>('year', { year: this.year, revenue, expenses })

      const net = revenue - expenses
      const sign = net >= 0 ? '+' : ''
      events.emit<LogEvent>('log', {
        message: `${this.year} — Budget: ${sign}$${net.toLocaleString()} (rev $${revenue.toLocaleString()})`,
      })

      if (this.funds < 0) {
        events.emit<LogEvent>('log', { message: 'Warning: City funds in deficit!' })
      }
    }
  }

  getYear(): number { return this.year }
  getTick(): number { return this.tick }

  reset(state?: { year?: number; tick?: number; population?: number; funds?: number }): void {
    this.year = state?.year ?? 2000
    this.tick = state?.tick ?? 0
    this.population = state?.population ?? 0
    this.funds = state?.funds ?? 20_000
    this.power = { powered: 0, unpowered: 0 }
    this.water = { watered: 0, unwatered: 0 }
  }
}
