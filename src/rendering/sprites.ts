import { Terrain, Zone } from '../core/tile'
import { PALETTE } from '../data/palette'

// Solid-color placeholder for terrain. Will be replaced with SC2000-style
// dithered OffscreenCanvas sprites once Phase 1 gameplay is solid.
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

// Draw an isometric diamond. (cx, cy) is the top apex of the diamond.
export function drawDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  hw: number, hh: number,
  fill: string,
): void {
  ctx.beginPath()
  ctx.moveTo(cx,      cy)
  ctx.lineTo(cx + hw, cy + hh)
  ctx.lineTo(cx,      cy + hh * 2)
  ctx.lineTo(cx - hw, cy + hh)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
}

// Draw the south and west vertical faces of an elevated tile.
export function drawElevationSides(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  hw: number, hh: number,
  sideH: number,
): void {
  const by = cy + hh * 2  // bottom apex of top face

  // West face (left)
  ctx.beginPath()
  ctx.moveTo(cx - hw, cy + hh)
  ctx.lineTo(cx,      by)
  ctx.lineTo(cx,      by + sideH)
  ctx.lineTo(cx - hw, cy + hh + sideH)
  ctx.closePath()
  ctx.fillStyle = PALETTE.faceDark
  ctx.fill()

  // East face (right)
  ctx.beginPath()
  ctx.moveTo(cx + hw, cy + hh)
  ctx.lineTo(cx,      by)
  ctx.lineTo(cx,      by + sideH)
  ctx.lineTo(cx + hw, cy + hh + sideH)
  ctx.closePath()
  ctx.fillStyle = PALETTE.faceLight
  ctx.fill()
}
