/**
 * cars.ts — animated traffic layer.
 *
 * A pool of car sprites driving the road network (orthogonal + diagonal) as a
 * visible representation of the traffic simulation. Cars animate in the 60fps
 * render loop, fully decoupled from the 1 Hz sim: the sim's traffic load only
 * biases where cars spawn (busy arterials get more), it doesn't drive motion.
 *
 * Cars are direct children of the world container (not a sub-layer) so each
 * car's per-frame zIndex interleaves it with buildings by depth — a car passes
 * behind a building to its south and in front of one to its north.
 */

import { Container, Sprite, type Texture } from 'pixi.js'
import { type World } from '../core/world'
import { TILE_W, TILE_H, ELEV_H } from './isoCamera'
import { buildRoadNetwork, type RoadNetwork } from '../simulation/laneGraph'
import { CAR_VARIANTS } from './tileTextures'
import { type CarDir } from './tileRenderer'

const HW = TILE_W / 2, HH = TILE_H / 2, EH = ELEV_H

/** Texture + placement for a car sprite at a given direction/variant. */
export interface CarTexture {
  texture: Texture
  scale: number    // texture-px → world-px
  anchorX: number  // 0..1
  anchorY: number
}

export type CarTexProvider = (dir: CarDir, variant: number) => CarTexture | null

interface Car {
  sprite: Sprite
  fromIdx: number
  toIdx: number
  fromX: number; fromY: number
  toX: number;   toY: number
  fromD: number; toD: number   // (col+row) at each end — for depth interpolation
  segLen: number               // segment length in world px (for constant speed)
  t: number                    // 0..1 along the segment
  pxSpeed: number              // world px per second
  dir: CarDir
  variant: number
}

// (dc,dr) grid step → screen travel direction name.
function dirName(dc: number, dr: number): CarDir {
  if (dc === 0 && dr === -1) return 'ne'
  if (dc === 1 && dr === 0)  return 'se'
  if (dc === 0 && dr === 1)  return 'sw'
  if (dc === -1 && dr === 0) return 'nw'
  if (dc === 1 && dr === 1)  return 's'
  if (dc === -1 && dr === -1) return 'n'
  if (dc === 1 && dr === -1) return 'e'
  return 'w'
}

export class CarSystem {
  private cars: Car[] = []
  private net: RoadNetwork | null = null
  private netDirty = true
  private enabled = true
  private traffic: Uint8Array | null = null
  private lastNow = 0
  private cap = 0   // current target car count

  constructor(
    private readonly world: World,
    private readonly parent: Container,
    private readonly texFor: CarTexProvider,
  ) {}

  setEnabled(on: boolean): void {
    if (on === this.enabled) return
    this.enabled = on
    if (!on) this.clear()
  }

  isEnabled(): boolean { return this.enabled }

  /** Biases spawn locations toward congested roads (0..100 per tile). */
  setTrafficField(grid: Uint8Array | null): void { this.traffic = grid }

  markNetworkDirty(): void { this.netDirty = true }

  /** Re-resolve every car's texture (e.g. after a zoom-level texture swap). */
  refreshTextures(): void {
    for (const c of this.cars) this._applyTexture(c)
  }

  private _idxColRow(idx: number): [number, number] {
    return [idx % this.world.cols, (idx / this.world.cols) | 0]
  }

  private _center(idx: number): { x: number; y: number; d: number } {
    const [col, row] = this._idxColRow(idx)
    const elev = this.world.get(col, row).elevation
    return {
      x: (col - row) * HW,
      y: (col + row) * HH - elev * EH + HH,
      d: col + row,
    }
  }

  private _applyTexture(car: Car): void {
    const ct = this.texFor(car.dir, car.variant)
    if (!ct) return
    car.sprite.texture = ct.texture
    car.sprite.anchor.set(ct.anchorX, ct.anchorY)
    car.sprite.scale.set(ct.scale)
  }

  // Begin a segment from→to, computing world endpoints, length and direction.
  private _startSegment(car: Car, fromIdx: number, toIdx: number): void {
    const a = this._center(fromIdx), b = this._center(toIdx)
    const [fc, fr] = this._idxColRow(fromIdx)
    const [tc, tr] = this._idxColRow(toIdx)
    car.fromIdx = fromIdx; car.toIdx = toIdx
    car.fromX = a.x; car.fromY = a.y; car.toX = b.x; car.toY = b.y
    car.fromD = a.d; car.toD = b.d
    car.segLen = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
    car.t = 0
    const ndir = dirName(Math.sign(tc - fc), Math.sign(tr - fr))
    if (ndir !== car.dir) { car.dir = ndir; this._applyTexture(car) }
  }

  // Pick the next tile to drive to from `toIdx`, having arrived from `fromIdx`.
  // Prefer continuing straight; avoid U-turns unless it's a dead end.
  private _pickNext(fromIdx: number, toIdx: number): number {
    const adj = this.net!.adj.get(toIdx)
    if (!adj || adj.length === 0) return -1
    const [pc, pr] = this._idxColRow(fromIdx)
    const [cc, cr] = this._idxColRow(toIdx)
    const sdc = Math.sign(cc - pc), sdr = Math.sign(cr - pr)

    let straight = -1
    const options: number[] = []
    for (const n of adj) {
      if (n === fromIdx) continue   // no U-turn
      options.push(n)
      const [nc, nr] = this._idxColRow(n)
      if (Math.sign(nc - cc) === sdc && Math.sign(nr - cr) === sdr) straight = n
    }
    if (options.length === 0) return fromIdx   // dead end → turn around
    // Bias toward going straight; otherwise random turn.
    if (straight >= 0 && Math.random() < 0.6) return straight
    return options[(Math.random() * options.length) | 0]
  }

  private _spawn(): void {
    const net = this.net!
    if (net.tiles.length === 0) return
    const fromIdx = this._weightedTile()
    if (fromIdx < 0) return
    const adj = net.adj.get(fromIdx)
    if (!adj || adj.length === 0) return
    const toIdx = adj[(Math.random() * adj.length) | 0]

    const variant = (Math.random() * CAR_VARIANTS) | 0
    const sprite = new Sprite()
    const car: Car = {
      sprite, fromIdx, toIdx,
      fromX: 0, fromY: 0, toX: 0, toY: 0, fromD: 0, toD: 0,
      segLen: 1, t: 0,
      pxSpeed: 26 + Math.random() * 18,   // ~26–44 world px/sec
      dir: 'se', variant,
    }
    this._applyTexture(car)
    this._startSegment(car, fromIdx, toIdx)
    this.parent.addChild(sprite)
    this.cars.push(car)
  }

  // Random road tile, biased toward higher traffic load when a field is present.
  private _weightedTile(): number {
    const net = this.net!
    if (!this.traffic) return net.tiles[(Math.random() * net.tiles.length) | 0]
    // Rejection sampling: try a few tiles, keep one proportional to its load+base.
    let best = -1, bestScore = -1
    for (let i = 0; i < 5; i++) {
      const idx = net.tiles[(Math.random() * net.tiles.length) | 0]
      const score = Math.random() * (10 + (this.traffic[idx] ?? 0))
      if (score > bestScore) { bestScore = score; best = idx }
    }
    return best
  }

  private _despawn(car: Car): void {
    this.parent.removeChild(car.sprite)
    car.sprite.destroy()
  }

  clear(): void {
    for (const c of this.cars) this._despawn(c)
    this.cars = []
  }

  /**
   * Advance the simulation by wall-clock `now` (ms). Returns true if any car
   * moved, signaling the caller to re-sort the world container for correct
   * depth interleaving.
   */
  update(now: number): boolean {
    if (this.netDirty) {
      this.net = buildRoadNetwork(this.world)
      this.netDirty = false
      // Drop cars whose road was removed.
      this.cars = this.cars.filter((c) => {
        if (this.net!.adj.has(c.fromIdx) && this.net!.adj.has(c.toIdx)) return true
        this._despawn(c)
        return false
      })
    }

    const dt = this.lastNow ? Math.min(0.05, (now - this.lastNow) / 1000) : 0
    this.lastNow = now

    if (!this.enabled || !this.net || this.net.tiles.length === 0) {
      if (this.cars.length) this.clear()
      return false
    }

    // Target car count scales with the size of the road network.
    this.cap = Math.min(160, Math.floor(this.net.tiles.length * 0.12))
    while (this.cars.length < this.cap) {
      const before = this.cars.length
      this._spawn()
      if (this.cars.length === before) break   // couldn't place one — stop trying
    }

    for (const car of this.cars) {
      car.t += (car.pxSpeed * dt) / car.segLen
      if (car.t >= 1) {
        const next = this._pickNext(car.fromIdx, car.toIdx)
        if (next < 0) { car.t = 1 }
        else this._startSegment(car, car.toIdx, next)   // resets t to 0
      }
      const t = car.t
      car.sprite.x = car.fromX + (car.toX - car.fromX) * t
      car.sprite.y = car.fromY + (car.toY - car.fromY) * t
      const d = car.fromD + (car.toD - car.fromD) * t
      car.sprite.zIndex = d * 3 + 1.6   // above road overlay (+1), below building (+2)
    }

    return this.cars.length > 0
  }

  destroy(): void { this.clear() }
}
