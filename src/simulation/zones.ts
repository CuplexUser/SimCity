import { type World } from '../core/world'
import { Zone, Overlay, Terrain } from '../core/tile'
import { events, type LogEvent } from '../core/events'
import { isRoadConnected } from '../utils/astar'
import { placeFootprint } from '../core/footprint'

interface ZoneResult {
  population: number
}

/**
 * Returns the square footprint sizes (in tiles) that have building art for a
 * zone, largest first. Supplied by the renderer once the sprite atlas is loaded;
 * when absent, zones develop as plain 1×1 lots exactly as before (the procedural
 * fallback never makes multi-tile lots, so the no-art look is unchanged).
 */
export type LotSizer = (zone: Zone) => number[]

export function stepZones(world: World, isYearTick: boolean, lotSizer?: LotSizer): ZoneResult {
  let rCount = 0
  let cCount = 0
  let iCount = 0

  // Count current state. Covered (non-origin) footprint tiles carry zone None,
  // so each developed lot is counted exactly once at its origin.
  world.forEach((tile) => {
    if (tile.zone === Zone.Residential) rCount++
    if (tile.zone === Zone.Commercial)  cCount++
    if (tile.zone === Zone.Industrial)  iCount++
  })

  // Simplified demand: R always grows, C needs a population base, I follows C
  const rDemand = true
  const cDemand = population(world) > cCount * 30
  const iDemand = cCount > iCount * 2

  if (isYearTick) {
    const prevPop = population(world)

    world.forEach((tile, col, row) => {
      if (tile.zone === Zone.None) return
      // Only origin tiles develop; covered tiles are part of an existing lot.
      if (tile.rootCol !== -1 || tile.rootRow !== -1) return

      const demand =
        (tile.zone === Zone.Residential && rDemand) ||
        (tile.zone === Zone.Commercial  && cDemand) ||
        (tile.zone === Zone.Industrial  && iDemand)

      if (!(demand && tile.density < 8 && tile.powered && hasRoadAccess(world, col, row))) return

      // First development on a vacant plot may claim a multi-tile lot from
      // contiguous same-zone vacant neighbors (only when art sizes are known).
      if (tile.density === 0 && lotSizer) {
        const size = chooseLotSize(world, col, row, tile.zone, lotSizer)
        if (size > 1) {
          placeFootprint(world, col, row, size, size, { zone: tile.zone, density: 1 })
          return
        }
      }

      world.set(col, row, { density: tile.density + 1 })
    })

    const pop = population(world)

    // Milestone log events
    if (prevPop < 1_000 && pop >= 1_000) {
      events.emit<LogEvent>('log', { message: 'Population reached 1,000!' })
    } else if (prevPop < 10_000 && pop >= 10_000) {
      events.emit<LogEvent>('log', { message: 'Population reached 10,000!' })
    } else if (prevPop < 50_000 && pop >= 50_000) {
      events.emit<LogEvent>('log', { message: 'Population reached 50,000!' })
    }

    return { population: pop }
  }

  return { population: population(world) }
}

/** Residential population: each origin lot houses density × 10 per tile of its footprint. */
function population(world: World): number {
  let pop = 0
  world.forEach((tile) => {
    if (tile.zone === Zone.Residential && tile.rootCol === -1 && tile.rootRow === -1) {
      pop += tile.density * 10 * tile.footW * tile.footH
    }
  })
  return pop
}

/**
 * Pick a square lot size for a developing plot: the largest art size that fits a
 * contiguous block of same-zone, vacant, road-irrelevant tiles anchored at the
 * origin, chosen deterministically per tile so a block isn't uniform.
 */
function chooseLotSize(world: World, col: number, row: number, zone: Zone, lotSizer: LotSizer): number {
  const sizes = lotSizer(zone).filter((s) => s >= 1).sort((a, b) => b - a)
  if (sizes.length === 0) return 1

  // Deterministic preference order rooted at this tile.
  const start = lotHash(col, row) % sizes.length
  for (let i = 0; i < sizes.length; i++) {
    const s = sizes[(start + i) % sizes.length]
    if (canClaimLot(world, col, row, s, zone)) return s
  }
  return 1
}

function canClaimLot(world: World, col: number, row: number, s: number, zone: Zone): boolean {
  for (let r = row; r < row + s; r++) {
    for (let c = col; c < col + s; c++) {
      if (!world.inBounds(c, r)) return false
      const t = world.get(c, r)
      if (t.zone !== zone) return false
      if (t.density > 0) return false
      if (t.rootCol !== -1 || t.rootRow !== -1) return false
      if (t.overlay !== 0) return false
      if (t.terrain === Terrain.Water) return false
    }
  }
  return true
}

function lotHash(col: number, row: number): number {
  let h = Math.imul(col + 7, 374761393) ^ Math.imul(row + 13, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

function hasRoadAccess(world: World, col: number, row: number): boolean {
  const dirs = [{ dc: 0, dr: 1 }, { dc: 0, dr: -1 }, { dc: 1, dr: 0 }, { dc: -1, dr: 0 }]
  const candidates: Array<{ col: number; row: number }> = []
  const maxRoadAccessDistance = 2

  if (world.get(col, row).overlay & Overlay.Road) candidates.push({ col, row })
  for (const { dc, dr } of dirs) {
    for (let distance = 1; distance <= maxRoadAccessDistance; distance++) {
      const nc = col + dc * distance, nr = row + dr * distance
      if (world.inBounds(nc, nr) && (world.get(nc, nr).overlay & Overlay.Road)) {
        candidates.push({ col: nc, row: nr })
        break
      }
    }
  }

  // Require the accessed road to be part of a connected segment (not an isolated stub).
  return candidates.some(({ col: rc, row: rr }) => isRoadConnected(world, rc, rr, 1))
}
