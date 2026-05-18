import { Terrain, Zone } from '../core/tile'
import { PALETTE } from '../data/palette'
import { TILE_W, TILE_H } from './isoCamera'

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

// Pre-baked ImageBitmap per (terrain, zoom) — one drawImage replaces path ops.
const ZOOM_STEPS = [0.5, 1, 2, 4]

export class SpriteSheet {
  private cache = new Map<string, ImageBitmap>()

  bakeAll(): void {
    for (const zoom of ZOOM_STEPS) {
      for (const terrain of [Terrain.Grass, Terrain.Water, Terrain.Dirt, Terrain.Forest]) {
        this.bake(terrain, zoom)
      }
    }
  }

  get(terrain: Terrain, zoom: number): ImageBitmap | undefined {
    return this.cache.get(`${terrain}-${zoom}`)
  }

  private bake(terrain: Terrain, zoom: number): void {
    const hw = (TILE_W * zoom) / 2
    const hh = (TILE_H * zoom) / 2
    const w  = Math.ceil(TILE_W * zoom)
    const h  = Math.ceil(TILE_H * zoom)
    const oc  = new OffscreenCanvas(w, h)
    const ctx = oc.getContext('2d')!
    drawDiamond(ctx, hw, 0, hw, hh, terrainColor(terrain))
    this.cache.set(`${terrain}-${zoom}`, oc.transferToImageBitmap())
  }
}
