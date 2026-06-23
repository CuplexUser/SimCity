import { type World } from '../core/world'
import { Building, Terrain, Zone } from '../core/tile'

export function computeLandValue(world: World): Uint8Array {
  const values = new Uint8Array(world.cols * world.rows)

  world.forEach((tile, col, row) => {
    let score = 35 + tile.elevation * 3
    if (tile.terrain === Terrain.Water) score += 20
    if (tile.terrain === Terrain.Forest) score += 12
    if (tile.zone === Zone.Industrial) score -= 15
    if (tile.powered) score += 5
    if (tile.watered) score += 5
    if (tile.policed) score += 8
    if (tile.fireProtected) score += 8

    for (const source of findServiceSources(world, col, row, 10)) {
      score += source.bonus
    }

    values[row * world.cols + col] = clamp(score)
  })

  return values
}

function findServiceSources(
  world: World,
  col: number,
  row: number,
  range: number,
): Array<{ bonus: number }> {
  const out: Array<{ bonus: number }> = []
  const minCol = Math.max(0, col - range)
  const maxCol = Math.min(world.cols - 1, col + range)
  const minRow = Math.max(0, row - range)
  const maxRow = Math.min(world.rows - 1, row + range)

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const dist = Math.abs(c - col) + Math.abs(r - row)
      if (dist > range) continue
      const building = world.get(c, r).building
      if (building === Building.School || building === Building.Library) {
        out.push({ bonus: Math.max(1, range - dist) })
      }
      if (building === Building.Hospital) {
        out.push({ bonus: Math.max(1, Math.floor((range - dist) / 2)) })
      }
      // Parks lift nearby land value the most up close; plazas a smaller amount.
      if (building === Building.Park) {
        out.push({ bonus: Math.max(0, Math.round((range - dist) * 1.4)) })
      }
      if (building === Building.Plaza) {
        out.push({ bonus: Math.max(0, range - dist) })
      }
    }
  }

  return out
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}
