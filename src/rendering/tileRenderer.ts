import { type World } from '../core/world'
import { Zone, Overlay } from '../core/tile'
import { type IsoCamera } from './isoCamera'
import { PALETTE } from '../data/palette'
import { terrainColor, zoneOutlineColor, zoneFillColor, drawDiamond, drawElevationSides } from './sprites'

export function drawTiles(
  ctx: CanvasRenderingContext2D,
  world: World,
  camera: IsoCamera,
  canvasW: number,
  canvasH: number,
): void {
  const { hw, hh, eh } = camera

  // Diagonal sweep (d = col + row) ensures correct painter's-algorithm order.
  const maxD = world.cols + world.rows - 2
  for (let d = 0; d <= maxD; d++) {
    const colStart = Math.max(0, d - world.rows + 1)
    const colEnd   = Math.min(d, world.cols - 1)

    for (let col = colStart; col <= colEnd; col++) {
      const row  = d - col
      const tile = world.get(col, row)
      const { x: cx, y: cy } = camera.worldToScreen(col, row, tile.elevation)

      // Frustum cull — skip tiles wholly outside the canvas
      if (cx + hw < 0 || cx - hw > canvasW)            continue
      if (cy + hh * 2 + tile.elevation * eh < 0)       continue
      if (cy > canvasH + 8)                             continue

      const sideH = tile.elevation > 0 ? eh : 0

      // Elevation side faces drawn below the tile above them
      if (sideH > 0) {
        drawElevationSides(ctx, cx, cy, hw, hh, sideH)
      }

      // Top terrain face
      drawDiamond(ctx, cx, cy, hw, hh, terrainColor(tile.terrain))

      // Tile outline (subtle grid)
      ctx.beginPath()
      ctx.moveTo(cx,      cy)
      ctx.lineTo(cx + hw, cy + hh)
      ctx.lineTo(cx,      cy + hh * 2)
      ctx.lineTo(cx - hw, cy + hh)
      ctx.closePath()
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'
      ctx.lineWidth   = 0.5
      ctx.stroke()

      // Zone overlay
      if (tile.zone !== Zone.None) {
        if (tile.density >= 1) {
          // Filled building block (simplified: a smaller inset diamond)
          const inset = 0.85
          drawDiamond(ctx, cx, cy + hh * (1 - inset), hw * inset, hh * inset, zoneFillColor(tile.zone))
        } else {
          // Vacant zone — just an outline
          ctx.beginPath()
          ctx.moveTo(cx,           cy + 2)
          ctx.lineTo(cx + hw - 2,  cy + hh)
          ctx.lineTo(cx,           cy + hh * 2 - 2)
          ctx.lineTo(cx - hw + 2,  cy + hh)
          ctx.closePath()
          ctx.strokeStyle = zoneOutlineColor(tile.zone)
          ctx.lineWidth   = Math.max(1, camera.zoom * 1.5)
          ctx.stroke()
        }
      }

      // Road overlay
      if (tile.overlay & Overlay.Road) {
        ctx.fillStyle = PALETTE.road
        // Draw a small rectangle aligned to the tile center
        ctx.save()
        ctx.translate(cx, cy + hh)
        ctx.scale(1, 0.5)
        ctx.beginPath()
        ctx.arc(0, 0, hw * 0.35, 0, Math.PI * 2)
        ctx.restore()
        ctx.fill()
      }

      // Power-line overlay
      if (tile.overlay & Overlay.PowerLine) {
        ctx.strokeStyle = PALETTE.powerLine
        ctx.lineWidth   = Math.max(1, camera.zoom)
        ctx.beginPath()
        ctx.moveTo(cx - hw * 0.5, cy + hh * 0.8)
        ctx.lineTo(cx + hw * 0.5, cy + hh * 1.2)
        ctx.stroke()
      }
    }
  }
}
