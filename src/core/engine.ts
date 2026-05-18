import { World, WORLD_COLS, WORLD_ROWS } from './world'
import { IsoCamera, TILE_H } from '../rendering/isoCamera'
import { Renderer } from '../rendering/renderer'
import { SimManager } from '../simulation/simManager'

export class Engine {
  readonly world:    World
  readonly camera:   IsoCamera
  readonly renderer: Renderer
  readonly sim:      SimManager

  private rafId   = 0
  private simId   = 0
  private running = false

  constructor(canvas: HTMLCanvasElement) {
    this.world    = new World()
    this.camera   = new IsoCamera()
    this.renderer = new Renderer(canvas, this.world, this.camera)
    this.sim      = new SimManager(this.world)

    // Center the initial view on the middle of the world
    const midTile = WORLD_COLS / 2  // col and row of the center tile
    // At zoom=1: screenY of center tile = (col+row) * hh = midTile*2 * (TILE_H/2)
    this.camera.panX = canvas.width  / 2
    this.camera.panY = canvas.height / 2 - midTile * 2 * (TILE_H / 2)
  }

  start(): void {
    if (this.running) return
    this.running = true

    const loop = () => {
      this.renderer.draw()
      this.rafId = requestAnimationFrame(loop)
    }
    this.rafId = requestAnimationFrame(loop)

    this.simId = window.setInterval(() => this.sim.step(), 1000)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.rafId)
    clearInterval(this.simId)
  }

  // hz = 0 means paused
  setSimSpeed(hz: number): void {
    clearInterval(this.simId)
    if (hz > 0) {
      this.simId = window.setInterval(() => this.sim.step(), 1000 / hz)
    }
  }
}
