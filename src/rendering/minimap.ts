import { type World } from '../core/world'
import { Terrain, Zone } from '../core/tile'

const MINI_W = 160
const MINI_H = 128

function tileColor(terrain: Terrain, zone: Zone): [number, number, number] {
  if (zone === Zone.Residential) return [34,  139, 34]
  if (zone === Zone.Commercial)  return [30,  63,  168]
  if (zone === Zone.Industrial)  return [184, 134, 11]
  switch (terrain) {
    case Terrain.Grass:  return [90,  138, 60]
    case Terrain.Water:  return [26,  92,  140]
    case Terrain.Dirt:   return [155, 122, 61]
    case Terrain.Forest: return [45,  90,  26]
  }
}

export class Minimap {
  private dirty = true
  private imageData: ImageData

  constructor(private world: World) {
    this.imageData = new ImageData(MINI_W, MINI_H)
  }

  markDirty(): void { this.dirty = true }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const W = MINI_W
    const H = MINI_H

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.fillRect(x - 2, y - 2, W + 4, H + 4)

    if (this.dirty) {
      this.rebake()
      this.dirty = false
    }

    ctx.putImageData(this.imageData, x, y)

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth   = 1
    ctx.strokeRect(x, y, W, H)
  }

  private rebake(): void {
    const { world, imageData } = this
    const scaleX = MINI_W / world.cols
    const scaleY = MINI_H / world.rows
    const d = imageData.data

    for (let row = 0; row < world.rows; row++) {
      for (let col = 0; col < world.cols; col++) {
        const tile = world.get(col, row)
        const [r, g, b] = tileColor(tile.terrain, tile.zone)
        const px = Math.floor(col * scaleX)
        const py = Math.floor(row * scaleY)
        const idx = (py * MINI_W + px) * 4
        d[idx]     = r
        d[idx + 1] = g
        d[idx + 2] = b
        d[idx + 3] = 255
      }
    }
  }
}
