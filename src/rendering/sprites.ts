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

// Draw an isometric diamond. (cx, cy) is the top apex.
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
  const value = hex.slice(1)
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ]
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function shade([r, g, b]: [number, number, number], amount: number): [number, number, number] {
  return [clampByte(r + amount), clampByte(g + amount), clampByte(b + amount)]
}

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x + seed * 374761393, 668265263) ^ Math.imul(y + seed * 1442695041, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function inDiamond(x: number, y: number, hw: number, hh: number): boolean {
  return Math.abs(x - hw) / hw + Math.abs(y - hh) / hh <= 1
}

const GRASS_VARIANTS = 32
const GRASS_NOISES = Array.from({ length: GRASS_VARIANTS }, (_, i) => createNoise2D(seededRandom(7103 + i * 997)))

function terrainTone(terrain: Terrain, x: number, y: number, zoom: number, variant: number): [number, number, number] {
  const ux = x / zoom
  const uy = y / zoom
  const seed = terrain * 97 + variant * 131
  const n1 = hash2(Math.floor(ux), Math.floor(uy), seed + 11)
  const n2 = hash2(Math.floor(ux / 3), Math.floor(uy / 3), seed + 41)

  switch (terrain) {
    case Terrain.Grass: {
      const base = hexToRgb(PALETTE.grass)
      const noise = GRASS_NOISES[variant % GRASS_VARIANTS]
      const warp = noise(ux * 0.055 + 17, uy * 0.055 - 23) * 2.4
      const broad = noise((ux + warp) * 0.075, (uy - warp) * 0.095)
      const mid = noise(ux * 0.22 - 31, uy * 0.18 + 11)
      const fine = n1 > 0.90 ? 10 : n1 < 0.16 ? -8 : 0
      return shade(base, broad * 15 + mid * 6 + fine + (n2 > 0.62 ? 3 : -2))
    }
    case Terrain.Water: {
      const base = hexToRgb(PALETTE.water)
      const ripple = Math.sin((ux + uy * 1.7) * 0.45) > 0.68 ? 20 : -3
      return shade(base, ripple + (n2 > 0.72 ? 8 : -7))
    }
    case Terrain.Dirt: {
      const base = hexToRgb(PALETTE.dirt)
      return shade(base, n1 > 0.72 ? 20 : n2 > 0.50 ? 4 : -10)
    }
    case Terrain.Forest: {
      const base = hexToRgb(PALETTE.forest)
      const canopy = hash2(Math.floor(ux / 2), Math.floor(uy / 2), 97)
      return shade(base, canopy > 0.62 ? 18 : n1 > 0.68 ? -14 : 3)
    }
  }
}

function drawTerrainTexture(ctx: Ctx2D, terrain: Terrain, hw: number, hh: number, zoom: number, variant = 0): void {
  const w = Math.ceil(hw * 2)
  const h = Math.ceil(hh * 2)
  const img = ctx.createImageData(w, h)
  const data = img.data

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inDiamond(x + 0.5, y + 0.5, hw, hh)) continue
      const idx = (y * w + x) * 4
      const [r, g, b] = terrainTone(terrain, x, y, zoom, variant)
      data[idx] = r
      data[idx + 1] = g
      data[idx + 2] = b
      data[idx + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(hw, 0)
  ctx.lineTo(hw * 2, hh)
  ctx.lineTo(hw, hh * 2)
  ctx.lineTo(0, hh)
  ctx.closePath()
  ctx.clip()

  if (terrain === Terrain.Water) {
    ctx.strokeStyle = 'rgba(190,230,255,0.20)'
    ctx.lineWidth = Math.max(1, zoom)
    for (let y = hh * 0.45; y < hh * 1.65; y += Math.max(4, 6 * zoom)) {
      ctx.beginPath()
      ctx.moveTo(hw * 0.30, y)
      ctx.quadraticCurveTo(hw, y + 2 * zoom, hw * 1.70, y)
      ctx.stroke()
    }
  } else if (terrain === Terrain.Forest) {
    ctx.fillStyle = 'rgba(18,45,12,0.28)'
    const r = Math.max(1, 1.6 * zoom)
    for (let i = 0; i < 36; i++) {
      const x = hash2(i, 3, 131) * hw * 2
      const y = hash2(i, 9, 137) * hh * 2
      if (inDiamond(x, y, hw, hh)) {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  } else if (terrain === Terrain.Grass) {
    ctx.lineWidth = Math.max(0.5, zoom * 0.45)
    for (let i = 0; i < 16; i++) {
      const x = hash2(i, variant + 4, 211) * hw * 2
      const y = hash2(i, variant + 8, 223) * hh * 2
      if (inDiamond(x, y, hw, hh)) {
        const lean = (hash2(i, variant, 229) - 0.5) * 4 * zoom
        const length = (1.2 + hash2(i, variant, 233) * 2.0) * zoom
        ctx.strokeStyle = hash2(i, variant, 239) > 0.42
          ? 'rgba(205,236,132,0.14)'
          : 'rgba(42,82,24,0.12)'
        ctx.beginPath()
        ctx.moveTo(x - lean * 0.25, y + length * 0.35)
        ctx.lineTo(x + lean, y - length)
        ctx.stroke()
      }
    }
  }

  ctx.restore()
}

// Draw south and west vertical faces of an elevated tile.
export function drawElevationSides(ctx: Ctx2D, cx: number, cy: number, hw: number, hh: number, sideH: number): void {
  const by = cy + hh * 2

  ctx.beginPath()
  ctx.moveTo(cx - hw, cy + hh)
  ctx.lineTo(cx,      by)
  ctx.lineTo(cx,      by + sideH)
  ctx.lineTo(cx - hw, cy + hh + sideH)
  ctx.closePath()
  ctx.fillStyle = PALETTE.faceDark
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(cx + hw, cy + hh)
  ctx.lineTo(cx,      by)
  ctx.lineTo(cx,      by + sideH)
  ctx.lineTo(cx + hw, cy + hh + sideH)
  ctx.closePath()
  ctx.fillStyle = PALETTE.faceLight
  ctx.fill()
}

// Pre-baked ImageBitmap per (terrain, zoom, variant) — one drawImage replaces path ops.
const ZOOM_STEPS = [0.5, 1, 2, 4]

export class SpriteSheet {
  private cache = new Map<string, ImageBitmap>()

  bakeAll(): void {
    for (const zoom of ZOOM_STEPS) {
      for (const terrain of [Terrain.Grass, Terrain.Water, Terrain.Dirt, Terrain.Forest]) {
        const variants = terrain === Terrain.Grass ? GRASS_VARIANTS : 1
        for (let variant = 0; variant < variants; variant++) {
          this.bake(terrain, zoom, variant)
        }
      }
    }
  }

  get(terrain: Terrain, zoom: number, col = 0, row = 0): ImageBitmap | undefined {
    const variant = terrain === Terrain.Grass
      ? Math.floor(hash2(col, row, 811) * GRASS_VARIANTS)
      : 0
    return this.cache.get(`${terrain}-${zoom}-${variant}`)
  }

  private bake(terrain: Terrain, zoom: number, variant: number): void {
    const hw = (TILE_W * zoom) / 2
    const hh = (TILE_H * zoom) / 2
    const w  = Math.ceil(TILE_W * zoom)
    const h  = Math.ceil(TILE_H * zoom)
    const oc  = new OffscreenCanvas(w, h)
    const ctx = oc.getContext('2d')!
    drawTerrainTexture(ctx, terrain, hw, hh, zoom, variant)
    this.cache.set(`${terrain}-${zoom}-${variant}`, oc.transferToImageBitmap())
  }
}
