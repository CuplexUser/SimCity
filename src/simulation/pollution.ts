import { type World } from '../core/world'
import { Building, Overlay, Terrain, Zone } from '../core/tile'

const RADIUS = 4

export function computePollution(world: World): Uint8Array {
  const raw = new Uint16Array(world.cols * world.rows)
  let max = 0

  world.forEach((tile, col, row) => {
    let source = 0
    if (tile.zone === Zone.Industrial && tile.density > 0) source += tile.density * 8
    if (tile.building === Building.PowerPlant) source += 80
    if (tile.overlay & Overlay.Road) source += 4
    if (source === 0) return

    for (let dr = -RADIUS; dr <= RADIUS; dr++) {
      for (let dc = -RADIUS; dc <= RADIUS; dc++) {
        const dist = Math.abs(dc) + Math.abs(dr)
        if (dist > RADIUS) continue
        const nc = col + dc
        const nr = row + dr
        if (!world.inBounds(nc, nr)) continue
        const target = world.get(nc, nr)
        const terrainFactor = target.terrain === Terrain.Forest ? 0.6 : target.terrain === Terrain.Water ? 0.75 : 1
        const contribution = Math.round(source * (RADIUS + 1 - dist) * terrainFactor)
        const idx = nr * world.cols + nc
        raw[idx] += contribution
        if (raw[idx] > max) max = raw[idx]
      }
    }
  })

  const out = new Uint8Array(raw.length)
  if (max === 0) return out
  for (let i = 0; i < raw.length; i++) out[i] = Math.min(100, Math.round((raw[i] / max) * 100))
  return out
}
