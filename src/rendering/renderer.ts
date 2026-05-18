import { type World } from '../core/world'
import { type IsoCamera } from './isoCamera'
import { drawTiles } from './tileRenderer'
import { Minimap } from './minimap'

export class Renderer {
  private ctx:     CanvasRenderingContext2D
  readonly minimap: Minimap

  constructor(
    private canvas: HTMLCanvasElement,
    private world:  World,
    private camera: IsoCamera,
  ) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get canvas 2D context')
    this.ctx     = ctx
    this.minimap = new Minimap(world)
  }

  draw(): void {
    const { ctx, canvas, world, camera } = this
    const W = canvas.width
    const H = canvas.height

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, W, H)

    drawTiles(ctx, world, camera, W, H)

    // Minimap — bottom-right corner
    this.minimap.draw(ctx, W - 170, H - 138)
  }

  resize(w: number, h: number): void {
    this.canvas.width  = w
    this.canvas.height = h
  }
}
