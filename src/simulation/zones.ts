import { type World } from '../core/world'
import { Zone, Overlay, Terrain } from '../core/tile'
import { events, type LogEvent } from '../core/events'
import { isRoadConnected } from '../utils/astar'
import { placeFootprint } from '../core/footprint'
import { zoneDesirability, desirabilityDensityCap } from './desirability'

interface ZoneResult {
  population: number
}

/**
 * Per-tile inputs to zone growth, computed once per year tick by simManager:
 * land value and pollution grids (both 0..100). Optional — when absent a tile is
 * treated as average land value / no pollution, so growth still works but is
 * driven purely by the service-coverage flags.
 */
export interface GrowthFields {
  landValue?: Uint8Array
  pollution?: Uint8Array
  traffic?:   Uint8Array
  crime?:     Uint8Array
}

/**
 * Returns the square footprint sizes (in tiles) that have building art for a
 * zone, largest first. Supplied by the renderer once the sprite atlas is loaded;
 * when absent, zones develop as plain 1×1 lots exactly as before (the procedural
 * fallback never makes multi-tile lots, so the no-art look is unchanged).
 */
export type LotSizer = (zone: Zone) => number[]

/**
 * Development stages (SimCity-4 style): a city must grow before high density
 * appears. Stage 0 = low-rise (density cap 2), 1 = mid-rise (cap 5),
 * 2 = high-rise (cap 8) — the caps align with the renderer's density buckets.
 * Thresholds are total city population; commerce densifies last so a small
 * town never sprouts office skyscrapers.
 */
const STAGE_THRESHOLDS: Partial<Record<Zone, [number, number]>> = {
  [Zone.Residential]: [1_000, 6_000],
  [Zone.Commercial]:  [2_000, 12_000],
  [Zone.Industrial]:  [1_500, 8_000],
}
const STAGE_DENSITY_CAP = [2, 5, 8]
// Multi-tile lots are a mid-stage development: small towns build 1×1 homes
// (and the odd 2×2 lot); larger cities assemble bigger plots.
const STAGE_LOT_CAP = [2, 3, 3]

function devStage(zone: Zone, pop: number): number {
  const [mid, high] = STAGE_THRESHOLDS[zone] ?? [1_000, 6_000]
  return pop >= high ? 2 : pop >= mid ? 1 : 0
}

export function stepZones(world: World, isYearTick: boolean, lotSizer?: LotSizer, fields?: GrowthFields): ZoneResult {
  let cCount = 0
  let iCount = 0

  // Count current state. Covered (non-origin) footprint tiles carry zone None,
  // so each developed lot is counted exactly once at its origin.
  world.forEach((tile) => {
    if (tile.zone === Zone.Commercial)  cCount++
    if (tile.zone === Zone.Industrial)  iCount++
  })

  // Simplified demand: R always grows, C needs a population base, I follows C
  const rDemand = true
  const cDemand = population(world) > cCount * 30
  const iDemand = cCount > iCount * 2

  if (isYearTick) {
    const prevPop = population(world)
    const { landValue, pollution, traffic, crime } = fields ?? {}

    world.forEach((tile, col, row) => {
      if (tile.zone === Zone.None) return
      // Only origin tiles develop; covered tiles are part of an existing lot.
      if (tile.rootCol !== -1 || tile.rootRow !== -1) return

      const idx = row * world.cols + col
      const lv = landValue ? landValue[idx] : 50
      const poll = pollution ? pollution[idx] : 0
      const traf = traffic ? traffic[idx] : 0
      const crm = crime ? crime[idx] : 0

      const demand =
        (tile.zone === Zone.Residential && rDemand) ||
        (tile.zone === Zone.Commercial  && cDemand) ||
        (tile.zone === Zone.Industrial  && iDemand)

      // Utilities + road access are hard prerequisites. Lose any of them and a
      // developed lot decays toward abandonment regardless of how nice it is.
      const serviced = tile.powered && tile.watered && hasRoadAccess(world, col, row)
      if (!serviced) {
        if (tile.density > 0) world.set(col, row, { density: tile.density - 1 })
        return
      }

      // Desirability (services + land value − pollution) sets the density this
      // plot can sustain; the city-population stage caps it from above so small
      // towns stay low-rise even when fully serviced.
      const stage = devStage(tile.zone, prevPop)
      const desire = zoneDesirability(tile, lv, poll, traf, crm)
      const cap = Math.min(STAGE_DENSITY_CAP[stage], desirabilityDensityCap(desire))

      // Above the sustainable cap (e.g. a service was bulldozed, pollution rose):
      // the lot sheds density. This is what makes services matter both ways.
      if (tile.density > cap) {
        world.set(col, row, { density: tile.density - 1 })
        return
      }
      // At or above the cap with no demand pressure: hold steady.
      if (!(demand && tile.density < cap)) return

      // First development on a vacant plot may claim a multi-tile lot from
      // contiguous same-zone vacant neighbors (only when art sizes are known).
      if (tile.density === 0 && lotSizer) {
        const size = chooseLotSize(world, col, row, tile.zone, lotSizer, STAGE_LOT_CAP[stage])
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
function chooseLotSize(world: World, col: number, row: number, zone: Zone, lotSizer: LotSizer, maxSize: number): number {
  const sizes = lotSizer(zone).filter((s) => s >= 1 && s <= maxSize).sort((a, b) => b - a)
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
