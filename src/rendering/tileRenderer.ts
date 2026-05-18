import { type World } from '../core/world'
import { Zone, Overlay, Building } from '../core/tile'
import { type IsoCamera, ELEV_H, TILE_H } from './isoCamera'
import { PALETTE } from '../data/palette'
import {
  terrainColor, zoneOutlineColor, zoneFillColor,
  drawDiamond, drawElevationSides,
  type SpriteSheet,
} from './sprites'

// Extra diagonal padding to catch elevated tiles near viewport edges.
// Max elevation shift = 7 * (ELEV_H / (TILE_H/2)) = 7 * 0.5 = 3.5 diagonals.
const ELEV_PAD = 4

export function drawTiles(
  ctx: CanvasRenderingContext2D,
  world: World,
  camera: IsoCamera,
  canvasW: number,
  canvasH: number,
  sprites: SpriteSheet,
): void {
  const { hw, hh, zoom, panX, panY } = camera
  const eh = ELEV_H * zoom

  // Visible diagonal range: d = col + row, screenY ≈ d*hh + panY
  const dMin = Math.max(0,
    Math.floor(-panY / hh) - 1)
  const dMax = Math.min(
    world.cols + world.rows - 2,
    Math.ceil((canvasH - panY) / hh) + 1 + ELEV_PAD)

  // Visible col-row offset: offset = col - row, screenX ≈ offset*hw + panX
  const offsetMin = Math.floor(-panX / hw) - 1
  const offsetMax = Math.ceil((canvasW - panX) / hw) + 1

  for (let d = dMin; d <= dMax; d++) {
    const worldColMin = Math.max(0, d - world.rows + 1)
    const worldColMax = Math.min(d, world.cols - 1)
    const visColMin   = Math.floor((d + offsetMin) / 2)
    const visColMax   = Math.ceil((d + offsetMax) / 2)

    const colStart = Math.max(worldColMin, visColMin)
    const colEnd   = Math.min(worldColMax, visColMax)

    for (let col = colStart; col <= colEnd; col++) {
      const row = d - col
      if (row < 0 || row >= world.rows) continue

      const tile = world.get(col, row)
      const { x: cx, y: cy } = camera.worldToScreen(col, row, tile.elevation)

      // ── Terrain ──────────────────────────────────────────────────────────

      if (tile.elevation > 0) {
        drawElevationSides(ctx, cx, cy, hw, hh, eh)
      }

      const bitmap = sprites.get(tile.terrain, zoom)
      if (bitmap) {
        ctx.drawImage(bitmap, cx - hw, cy)
      } else {
        drawDiamond(ctx, cx, cy, hw, hh, terrainColor(tile.terrain))
      }

      // Grid outline — only worth drawing at zoom ≥ 1
      if (zoom >= 1) {
        ctx.beginPath()
        ctx.moveTo(cx,      cy)
        ctx.lineTo(cx + hw, cy + hh)
        ctx.lineTo(cx,      cy + hh * 2)
        ctx.lineTo(cx - hw, cy + hh)
        ctx.closePath()
        ctx.strokeStyle = 'rgba(0,0,0,0.10)'
        ctx.lineWidth   = 0.5
        ctx.stroke()
      }

      // ── Zone overlay ─────────────────────────────────────────────────────

      if (tile.zone !== Zone.None) {
        if (tile.density >= 1) {
          // Building block — scale up with density (1 = small, 8 = full tile)
          const scale = 0.3 + tile.density * 0.07
          const bh    = hh * scale * 2  // building "height" above tile
          const bw    = hw * scale
          const bHH   = hh * scale
          const bx    = cx
          const by    = cy + hh * (1 - scale)
          drawDiamond(ctx, bx, by, bw, bHH, zoneFillColor(tile.zone))
          // Simple south face shadow for depth
          ctx.beginPath()
          ctx.moveTo(bx,      by + bHH * 2)
          ctx.lineTo(bx + bw, by + bHH)
          ctx.lineTo(bx + bw, by + bHH + bh * 0.4)
          ctx.lineTo(bx,      by + bHH * 2 + bh * 0.4)
          ctx.closePath()
          ctx.fillStyle = PALETTE.faceDark
          ctx.fill()
        } else {
          // Vacant — just a dashed/solid outline
          ctx.beginPath()
          ctx.moveTo(cx,          cy + hh * 0.25)
          ctx.lineTo(cx + hw * 0.9, cy + hh)
          ctx.lineTo(cx,          cy + hh * 1.75)
          ctx.lineTo(cx - hw * 0.9, cy + hh)
          ctx.closePath()
          ctx.strokeStyle = zoneOutlineColor(tile.zone)
          ctx.lineWidth   = Math.max(1, zoom * 1.5)
          ctx.stroke()
        }
      }

      // ── Building overlay ─────────────────────────────────────────────────

      if (tile.building !== Building.None) {
        drawBuilding(ctx, cx, cy, hw, hh, tile.building)
      }

      // ── Infrastructure overlays ───────────────────────────────────────────

      if (tile.overlay & Overlay.Road) {
        drawRoad(ctx, cx, cy, hw, hh)
      }

      if (tile.overlay & Overlay.PowerLine) {
        ctx.strokeStyle = PALETTE.powerLine
        ctx.lineWidth   = Math.max(1, zoom)
        ctx.beginPath()
        ctx.moveTo(cx - hw * 0.5, cy + hh * 0.8)
        ctx.lineTo(cx + hw * 0.5, cy + hh * 1.2)
        ctx.stroke()
      }
    }
  }
}

function drawRoad(ctx: CanvasRenderingContext2D, cx: number, cy: number, hw: number, hh: number): void {
  // Dark band spanning the tile to represent a road surface
  const rh = hh * 0.35
  ctx.fillStyle = PALETTE.road
  ctx.beginPath()
  ctx.moveTo(cx,      cy + hh - rh)
  ctx.lineTo(cx + hw, cy + hh)
  ctx.lineTo(cx,      cy + hh + rh)
  ctx.lineTo(cx - hw, cy + hh)
  ctx.closePath()
  ctx.fill()
  // Centerline
  ctx.strokeStyle = PALETTE.roadDark
  ctx.lineWidth   = Math.max(0.5, hw * 0.04)
  ctx.beginPath()
  ctx.moveTo(cx - hw, cy + hh)
  ctx.lineTo(cx + hw, cy + hh)
  ctx.stroke()
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  hw: number, hh: number,
  building: Building,
): void {
  if (building === Building.PowerPlant) {
    // Dark block with orange accent
    drawDiamond(ctx, cx, cy + hh * 0.2, hw * 0.8, hh * 0.8, '#3a3a3a')
    ctx.fillStyle = '#ff6600'
    ctx.beginPath()
    ctx.arc(cx, cy + hh * 0.4, Math.max(2, hw * 0.12), 0, Math.PI * 2)
    ctx.fill()
  } else if (building === Building.WaterTower) {
    // Blue-gray elevated tank
    drawDiamond(ctx, cx, cy + hh * 0.1, hw * 0.5, hh * 0.5, '#4a7a9b')
    drawDiamond(ctx, cx, cy + hh * 0.4, hw * 0.7, hh * 0.4, '#2d5c7a')
  }
}
