import { type World } from '../core/world'
import { events, type TickEvent, type YearEvent } from '../core/events'

// One sim tick = one game month. 12 ticks = one year.
const TICKS_PER_YEAR = 12

export class SimManager {
  private tick = 0
  private year = 2000

  // Placeholder city stats — will be computed by subsystems once implemented
  population = 0
  funds      = 20_000

  constructor(private world: World) {}

  step(): void {
    this.tick++
    events.emit<TickEvent>('tick', { tick: this.tick })

    if (this.tick % TICKS_PER_YEAR === 0) {
      this.year++
      // TODO: call economy.yearEnd() when implemented
      const revenue  = 0
      const expenses = 0
      this.funds += revenue - expenses
      events.emit<YearEvent>('year', { year: this.year, revenue, expenses })
    }
  }

  getYear(): number { return this.year }
  getTick(): number { return this.tick }
}
