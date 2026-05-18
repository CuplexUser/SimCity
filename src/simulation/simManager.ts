import { type World } from '../core/world'
import { events, type TickEvent, type YearEvent, type LogEvent } from '../core/events'
import { stepPower } from './power'
import { stepWater } from './water'
import { stepZones } from './zones'
import { computeBudget } from './economy'

const TICKS_PER_YEAR = 12  // 1 tick = 1 game month

export class SimManager {
  private tick = 0
  private year = 2000

  population = 0
  funds      = 20_000

  constructor(private world: World) {}

  step(): void {
    this.tick++
    const isYearTick = this.tick % TICKS_PER_YEAR === 0

    // Run all simulation subsystems
    stepPower(this.world)
    stepWater(this.world)
    const { population } = stepZones(this.world, isYearTick)
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
}
