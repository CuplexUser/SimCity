import { type World } from '../core/world'
import { type IsoCamera } from './isoCamera'
import { drawTiles } from './tileRenderer'
import { Minimap } from './minimap'
import { SpriteSheet } from './sprites'

export class Renderer {
  private ctx:      CanvasRenderingContext2D
  private sprites:  SpriteSheet
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
    this.sprites = new SpriteSheet()
    this.sprites.bakeAll()
  }

  draw(): void {
    const { ctx, canvas, world, camera, sprites } = this
    const W = canvas.width
    const H = canvas.height

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, W, H)

    drawTiles(ctx, world, camera, W, H, sprites)

    this.minimap.draw(ctx, W, H, camera)
  }

  resize(w: number, h: number): void {
    this.canvas.width  = w
    this.canvas.height = h
  }
}
