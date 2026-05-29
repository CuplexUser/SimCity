import { Terrain, Zone } from '../core/tile'
import { PALETTE } from '../data/palette'
import { TILE_W, TILE_H } from './isoCamera'
import { createNoise2D } from 'simplex-noise'

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export function terrainColor(terrain: Terrain): string {
  switch (terrain) {
    case Terrain.Grass:  return PALETTE.grass
    case Terrain.Water:  return PALETTE.water
    case Terrain.Dirt:   return PALETTE.dirt
    case Terrain.Forest: return PALETTE.forest
  }
}

export function zoneOutlineColor(zone: Zone): string {
  switch (zone) {
    case Zone.Residential: return PALETTE.zoneR
    case Zone.Commercial:  return PALETTE.zoneC
    case Zone.Industrial:  return PALETTE.zoneI
    case Zone.None:        return 'transparent'
  }
}

export function zoneFillColor(zone: Zone): string {
  switch (zone) {
    case Zone.Residential: return PALETTE.buildR
    case Zone.Commercial:  return PALETTE.buildC
    case Zone.Industrial:  return PALETTE.buildI
    case Zone.None:        return 'transparent'
  }
}

export function drawDiamond(ctx: Ctx2D, cx: number, cy: number, hw: number, hh: number, fill: string): void {
  ctx.beginPath()
  ctx.moveTo(cx,      cy)
  ctx.lineTo(cx + hw, cy + hh)
  ctx.lineTo(cx,      cy + hh * 2)
  ctx.lineTo(cx - hw, cy + hh)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
}

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.slice(1)
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]
}

function clampByte(n: number): number { return Math.max(0, Math.min(255, Math.round(n))) }

function shade([r, g, b]: [number, number, number], amt: number): [number, number, number] {
  return [clampByte(r + amt), clampByte(g + amt), clampByte(b + amt)]
}

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x + seed * 374761393, 668265263) ^ Math.imul(y + seed * 1442695041, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function seededRandom(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s += 0x6d2b79f5
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function inDiamond(x: number, y: number, hw: number, hh: number): boolean {
  return Math.abs(x - hw) / hw + Math.abs(y - hh) / hh <= 1
}

// ── Noise ──────────────────────────────────────────────────────────────────────

// Two world-space grass noise functions — single seed → no per-tile discontinuity
const GRASS_A = createNoise2D(seededRandom(7103))
const GRASS_B = createNoise2D(seededRandom(8219))

// Local-coordinate noise for Water / Dirt / Forest (tile-local, 1 sprite per zoom)
const WATER_NOISE  = createNoise2D(seededRandom(4814))
const DIRT_NOISE   = createNoise2D(seededRandom(5423))
const FOREST_NOISE = createNoise2D(seededRandom(6037))

// ── Per-pixel terrain colour ───────────────────────────────────────────────────

function terrainTone(
  terrain: Terrain, x: number, y: number, zoom: number, col: number, row: number,
): [number, number, number] {
  switch (terrain) {
    case Terrain.Grass: {
      // World-space coordinates — continuous across tile boundaries
      const wx = col + x / (TILE_W * zoom)
      const wy = row + y / (TILE_H * zoom)
      const base  = hexToRgb(PALETTE.grass)
      const warp  = GRASS_A(wx * 0.20 + 4.7, wy * 0.22 - 3.1) * 1.2
      const broad = GRASS_A((wx + warp) * 0.38, (wy + warp) * 0.42)
      const mid   = GRASS_B(wx * 0.90 - 6.3, wy * 1.05 + 4.9)
      return shade(base, broad * 8 + mid * 4)
    }
    case Terrain.Water: {
      const ux = x / zoom, uy = y / zoom
      const base   = hexToRgb(PALETTE.water)
      const ripple = Math.sin((ux + uy * 1.7) * 0.42) > 0.66 ? 18 : -3
      const depth  = WATER_NOISE(ux * 0.11 + 3.1, uy * 0.14 - 5.3)
      return shade(base, ripple + depth * 9)
    }
    case Terrain.Dirt: {
      const ux = x / zoom, uy = y / zoom
      const base  = hexToRgb(PALETTE.dirt)
      const broad = DIRT_NOISE(ux * 0.10 + 11, uy * 0.10 - 7)
      const mid   = DIRT_NOISE(ux * 0.32 - 5,  uy * 0.29 + 3)
      return shade(base, broad * 17 + mid * 7)
    }
    case Terrain.Forest: {
      const ux = x / zoom, uy = y / zoom
      const base   = hexToRgb(PALETTE.forest)
      const canopy = FOREST_NOISE(ux * 0.17 + 7,  uy * 0.17 - 3)
      const shadow = FOREST_NOISE(ux * 0.42 - 11, uy * 0.38 + 9)
      return shade(base, canopy * 20 + shadow * 7)
    }
  }
}

// ── Texture painter ────────────────────────────────────────────────────────────

export function drawTerrainTexture(
  ctx: Ctx2D, terrain: Terrain, hw: number, hh: number, zoom: number,
  col = 0, row = 0,
): void {
  const w = Math.ceil(hw * 2)
  const h = Math.ceil(hh * 2)
  const img  = ctx.createImageData(w, h)
  const data = img.data

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inDiamond(x + 0.5, y + 0.5, hw, hh)) continue
      const idx = (y * w + x) * 4
      const [r, g, b] = terrainTone(terrain, x, y, zoom, col, row)
      data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  // Post-process overlays (clipped to diamond)
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(hw, 0); ctx.lineTo(hw * 2, hh); ctx.lineTo(hw, hh * 2); ctx.lineTo(0, hh)
  ctx.closePath()
  ctx.clip()

  if (terrain === Terrain.Water) {
    ctx.strokeStyle = 'rgba(190,230,255,0.18)'
    ctx.lineWidth = Math.max(1, zoom)
    for (let ly = hh * 0.45; ly < hh * 1.65; ly += Math.max(4, 6 * zoom)) {
      ctx.beginPath()
      ctx.moveTo(hw * 0.28, ly)
      ctx.quadraticCurveTo(hw, ly + 2 * zoom, hw * 1.72, ly)
      ctx.stroke()
    }
  } else if (terrain === Terrain.Forest) {
    ctx.fillStyle = 'rgba(18,45,12,0.26)'
    const r = Math.max(1, 1.6 * zoom)
    for (let i = 0; i < 36; i++) {
      const fx = hash2(i, 3, 131) * hw * 2
      const fy = hash2(i, 9, 137) * hh * 2
      if (inDiamond(fx, fy, hw, hh)) {
        ctx.beginPath(); ctx.arc(fx, fy, r, 0, Math.PI * 2); ctx.fill()
      }
    }
  } else if (terrain === Terrain.Grass) {
    // Grass blades: position anchored to tile world coords for stability
    ctx.lineWidth = Math.max(0.5, zoom * 0.4)
    for (let i = 0; i < 12; i++) {
      const bx = hash2(i, col * 7 + 4,  211) * hw * 2
      const by = hash2(i, row * 7 + 8,  223) * hh * 2
      if (!inDiamond(bx, by, hw, hh)) continue
      const lean   = (hash2(i, col + row,      229) - 0.5) * 3.5 * zoom
      const length = (1.1 + hash2(i, col * 3 + row, 233) * 1.8) * zoom
      ctx.strokeStyle = GRASS_A(bx / 10, by / 10) > 0
        ? 'rgba(195,228,112,0.15)' : 'rgba(28,66,8,0.13)'
      ctx.beginPath()
      ctx.moveTo(bx - lean * 0.2, by + length * 0.3)
      ctx.lineTo(bx + lean, by - length)
      ctx.stroke()
    }
  }

  ctx.restore()
}

// ── Elevation side faces ───────────────────────────────────────────────────────

export function drawElevationSides(
  ctx: Ctx2D, cx: number, cy: number, hw: number, hh: number, sideH: number,
): void {
  const by = cy + hh * 2
  ctx.beginPath()
  ctx.moveTo(cx - hw, cy + hh); ctx.lineTo(cx, by)
  ctx.lineTo(cx, by + sideH);   ctx.lineTo(cx - hw, cy + hh + sideH)
  ctx.closePath()
  ctx.fillStyle = PALETTE.faceDark; ctx.fill()

  ctx.beginPath()
  ctx.moveTo(cx + hw, cy + hh); ctx.lineTo(cx, by)
  ctx.lineTo(cx, by + sideH);   ctx.lineTo(cx + hw, cy + hh + sideH)
  ctx.closePath()
  ctx.fillStyle = PALETTE.faceLight; ctx.fill()
}

// ── Sprite cache ───────────────────────────────────────────────────────────────

const ZOOM_STEPS = [0.5, 1, 2, 4]
// Maximum cached grass sprites; evict oldest batch when exceeded
const GRASS_MAX = 1800

export class SpriteSheet {
  private cache = new Map<string, ImageBitmap>()

  // Pre-bake non-grass terrains (small fixed count); grass is lazy per tile
  bakeAll(): void {
    for (const zoom of ZOOM_STEPS) {
      for (const t of [Terrain.Water, Terrain.Dirt, Terrain.Forest]) {
        this._bake(t, zoom, 0, 0)
      }
    }
  }

  get(terrain: Terrain, zoom: number, col = 0, row = 0): ImageBitmap | undefined {
    const key = terrain === Terrain.Grass
      ? `g${zoom}:${col},${row}`
      : `${terrain}-${zoom}`

    if (!this.cache.has(key)) {
      if (terrain === Terrain.Grass) this._evictGrass()
      this._bake(terrain, zoom, col, row)
    }
    return this.cache.get(key)
  }

  private _evictGrass(): void {
    if (this._grassCount() < GRASS_MAX) return
    let removed = 0
    for (const [k, bm] of this.cache) {
      if (k[0] === 'g') { bm.close(); this.cache.delete(k); if (++removed >= 300) break }
    }
  }

  private _grassCount(): number {
    let n = 0; for (const k of this.cache.keys()) if (k[0] === 'g') n++; return n
  }

  private _bake(terrain: Terrain, zoom: number, col: number, row: number): void {
    const hw  = (TILE_W * zoom) / 2
    const hh  = (TILE_H * zoom) / 2
    const oc  = new OffscreenCanvas(Math.ceil(TILE_W * zoom), Math.ceil(TILE_H * zoom))
    const ctx = oc.getContext('2d')!
    drawTerrainTexture(ctx, terrain, hw, hh, zoom, col, row)
    const key = terrain === Terrain.Grass ? `g${zoom}:${col},${row}` : `${terrain}-${zoom}`
    this.cache.set(key, oc.transferToImageBitmap())
  }
}
