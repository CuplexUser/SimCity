import { type World } from '../core/world'
import { Zone, Overlay } from '../core/tile'
import { events, type LogEvent } from '../core/events'
import { isRoadConnected } from '../utils/astar'

interface ZoneResult {
  population: number
}

export function stepZones(world: World, isYearTick: boolean): ZoneResult {
  let rCount = 0
  let cCount = 0
  let iCount = 0
  let population = 0

  // Count current state
  world.forEach((tile) => {
    if (tile.zone === Zone.Residential) { rCount++; population += tile.density * 10 }
    if (tile.zone === Zone.Commercial)  cCount++
    if (tile.zone === Zone.Industrial)  iCount++
  })

  // Simplified demand: R always grows, C needs a population base, I follows C
  const rDemand = true
  const cDemand = population > cCount * 30
  const iDemand = cCount > iCount * 2

  if (isYearTick) {
    const prevPop = population
    population = 0

    world.forEach((tile, col, row) => {
      if (tile.zone === Zone.None) return

      const demand =
        (tile.zone === Zone.Residential && rDemand) ||
        (tile.zone === Zone.Commercial  && cDemand) ||
        (tile.zone === Zone.Industrial  && iDemand)

      if (demand && tile.density < 8 && tile.powered && hasRoadAccess(world, col, row)) {
        tile.density++
      }

      if (tile.zone === Zone.Residential) population += tile.density * 10
    })

    // Milestone log events
    if (prevPop < 1_000 && population >= 1_000) {
      events.emit<LogEvent>('log', { message: 'Population reached 1,000!' })
    } else if (prevPop < 10_000 && population >= 10_000) {
      events.emit<LogEvent>('log', { message: 'Population reached 10,000!' })
    } else if (prevPop < 50_000 && population >= 50_000) {
      events.emit<LogEvent>('log', { message: 'Population reached 50,000!' })
    }
  }

  return { population }
}

function hasRoadAccess(world: World, col: number, row: number): boolean {
  const dirs = [{ dc: 0, dr: 1 }, { dc: 0, dr: -1 }, { dc: 1, dr: 0 }, { dc: -1, dr: 0 }]
  const candidates: Array<{ col: number; row: number }> = []

  if (world.get(col, row).overlay & Overlay.Road) candidates.push({ col, row })
  for (const { dc, dr } of dirs) {
    const nc = col + dc, nr = row + dr
    if (world.inBounds(nc, nr) && (world.get(nc, nr).overlay & Overlay.Road)) {
      candidates.push({ col: nc, row: nr })
    }
  }

  // Require the adjacent road to be part of a connected segment (not an isolated stub)
  return candidates.some(({ col: rc, row: rr }) => isRoadConnected(world, rc, rr, 1))
}
