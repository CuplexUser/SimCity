import { type World } from '../core/world'
import { Overlay, Zone } from '../core/tile'

const RADIUS = 3

export function computeTraffic(world: World): Uint8Array {
  const load = new Uint16Array(world.cols * world.rows)
  let max = 0

  world.forEach((tile, col, row) => {
    if (tile.zone === Zone.None || tile.density === 0) return
    const weight = tile.zone === Zone.Residential ? tile.density : tile.density * 2

    for (let dr = -RADIUS; dr <= RADIUS; dr++) {
      for (let dc = -RADIUS; dc <= RADIUS; dc++) {
        const dist = Math.abs(dc) + Math.abs(dr)
        if (dist === 0 || dist > RADIUS) continue
        const nc = col + dc
        const nr = row + dr
        if (!world.inBounds(nc, nr)) continue
        if (!(world.get(nc, nr).overlay & Overlay.Road)) continue
        const idx = nr * world.cols + nc
        load[idx] += weight * (RADIUS + 1 - dist)
        if (load[idx] > max) max = load[idx]
      }
    }
  })

  return normalize(load, max)
}

function normalize(values: Uint16Array, max: number): Uint8Array {
  const out = new Uint8Array(values.length)
  if (max === 0) return out
  for (let i = 0; i < values.length; i++) {
    out[i] = Math.min(100, Math.round((values[i] / max) * 100))
  }
  return out
}
