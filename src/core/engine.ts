import { World, WORLD_COLS } from './world'
import { IsoCamera, TILE_H } from '../rendering/isoCamera'
import { Renderer } from '../rendering/renderer'
import { SimManager } from '../simulation/simManager'

export class Engine {
  readonly world:  World
  readonly camera: IsoCamera
  renderer: Renderer | undefined   // set after async init()
  readonly sim:    SimManager

  private rafId   = 0
  private simId   = 0
  private running = false
  private canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.world  = new World()
    this.camera = new IsoCamera()
    this.sim    = new SimManager(this.world)

    // Centre the view on the middle of the world
    const midTile    = WORLD_COLS / 2
    this.camera.panX = canvas.width  / 2
    this.camera.panY = canvas.height / 2 - midTile * 2 * (TILE_H / 2)
  }

  /** Async step: creates the PixiJS renderer.  Must be called before start(). */
  async init(): Promise<void> {
    this.renderer = await Renderer.create(this.canvas, this.world, this.camera)
  }

  start(): void {
    if (this.running || !this.renderer) return
    this.running = true

    const renderer = this.renderer
    const loop = () => {
      renderer.draw()
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

  setSimSpeed(hz: number): void {
    clearInterval(this.simId)
    if (hz > 0) {
      this.simId = window.setInterval(() => this.sim.step(), 1000 / hz)
    }
  }
}
