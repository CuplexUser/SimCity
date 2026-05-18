import { type World } from '../core/world'
import { Zone, Overlay, Building } from '../core/tile'
import { type IsoCamera, ELEV_H } from './isoCamera'
import { PALETTE } from '../data/palette'
import {
  terrainColor, zoneOutlineColor, zoneFillColor,
  drawDiamond, drawElevationSides,
  type SpriteSheet,
} from './sprites'

// Max diagonal elevation shift = 7 * (ELEV_H / (TILE_H/2)) = 7 * 0.5 = 3.5
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

  // ── Visible range ──────────────────────────────────────────────────────
  const dMin = Math.max(0,
    Math.floor(-panY / hh) - 1)
  const dMax = Math.min(
    world.cols + world.rows - 2,
    Math.ceil((canvasH - panY) / hh) + 1 + ELEV_PAD)
  const offsetMin = Math.floor(-panX / hw) - 1
  const offsetMax = Math.ceil((canvasW - panX) / hw) + 1

  // ── Batch collectors (reset each frame) ──────────────────────────────
  // Grid outline points
  const gridX: number[] = []
  const gridY: number[] = []

  // Vacant zone outlines bucketed by zone type
  const vacantZ = new Map<Zone, [number, number][]>()

  // Occupied zone fills bucketed by (zone, density-bucket 0-2)
  // bucket 0: density 1-2, bucket 1: density 3-5, bucket 2: density 6-8
  const filledZ = new Map<number, [number, number][]>() // key = zone*10+bucket

  // Road and power-line positions
  const roadX: number[] = [], roadY: number[] = []
  const pwrX:  number[] = [], pwrY:  number[] = []

  // ── Pass 1: terrain + collect overlay data ─────────────────────────────
  for (let d = dMin; d <= dMax; d++) {
    const wColMin = Math.max(0, d - world.rows + 1)
    const wColMax = Math.min(d, world.cols - 1)
    const vColMin = Math.floor((d + offsetMin) / 2)
    const vColMax = Math.ceil((d + offsetMax) / 2)
    const colStart = Math.max(wColMin, vColMin)
    const colEnd   = Math.min(wColMax, vColMax)

    for (let col = colStart; col <= colEnd; col++) {
      const row = d - col
      if (row < 0 || row >= world.rows) continue

      const tile = world.get(col, row)
      // Inline worldToScreen — avoids per-tile object allocation
      const cx = (col - row) * hw + panX
      const cy = (col + row) * hh - tile.elevation * eh + panY

      // Elevation sides
      if (tile.elevation > 0) drawElevationSides(ctx, cx, cy, hw, hh, eh)

      // Terrain face
      const bitmap = sprites.get(tile.terrain, zoom)
      if (bitmap) {
        ctx.drawImage(bitmap, cx - hw, cy)
      } else {
        drawDiamond(ctx, cx, cy, hw, hh, terrainColor(tile.terrain))
      }

      // Buildings (rendered in-order — rare enough to not batch)
      if (tile.building !== Building.None) drawBuilding(ctx, cx, cy, hw, hh, tile.building)

      // ── Collect overlay batches ─────────────────────────────────────────

      if (zoom >= 1) { gridX.push(cx); gridY.push(cy) }

      if (tile.zone !== Zone.None) {
        if (tile.density === 0) {
          if (!vacantZ.has(tile.zone)) vacantZ.set(tile.zone, [])
          vacantZ.get(tile.zone)!.push([cx, cy])
        } else {
          const bucket = tile.density <= 2 ? 0 : tile.density <= 5 ? 1 : 2
          const key    = tile.zone * 10 + bucket
          if (!filledZ.has(key)) filledZ.set(key, [])
          filledZ.get(key)!.push([cx, cy])
        }
      }

      if (tile.overlay & Overlay.Road)      { roadX.push(cx); roadY.push(cy) }
      if (tile.overlay & Overlay.PowerLine) { pwrX.push(cx);  pwrY.push(cy) }
    }
  }

  // ── Pass 2: batched overlays ───────────────────────────────────────────

  // Grid outlines — one single stroke call for all tiles
  if (zoom >= 1 && gridX.length > 0) {
    ctx.beginPath()
    for (let i = 0; i < gridX.length; i++) {
      const cx = gridX[i], cy = gridY[i]
      ctx.moveTo(cx,      cy)
      ctx.lineTo(cx + hw, cy + hh)
      ctx.lineTo(cx,      cy + hh * 2)
      ctx.lineTo(cx - hw, cy + hh)
      ctx.closePath()
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.10)'
    ctx.lineWidth   = 0.5
    ctx.stroke()
  }

  // Vacant zone outlines — one stroke per zone type (max 3 calls)
  const outlineW = Math.max(1, zoom * 1.5)
  for (const [zone, pts] of vacantZ) {
    ctx.beginPath()
    for (const [cx, cy] of pts) {
      // Inset diamond — vertices must match the terrain tile's perspective exactly.
      // Terrain tile: top=(cx,cy), right=(cx+hw,cy+hh), bottom=(cx,cy+2hh), left=(cx-hw,cy+hh)
      // Inset by scale s around center (cx, cy+hh):
      //   top    = (cx,         cy + hh*(1-s))
      //   right  = (cx + hw*s,  cy + hh)
      //   bottom = (cx,         cy + hh*(1+s))
      //   left   = (cx - hw*s,  cy + hh)
      const s = 0.88
      ctx.moveTo(cx,          cy + hh * (1 - s))
      ctx.lineTo(cx + hw * s, cy + hh)
      ctx.lineTo(cx,          cy + hh * (1 + s))
      ctx.lineTo(cx - hw * s, cy + hh)
      ctx.closePath()
    }
    ctx.strokeStyle = zoneOutlineColor(zone)
    ctx.lineWidth   = outlineW
    ctx.stroke()
  }

  // Occupied zone fills — one fill per (zone, density-bucket) group
  const DENSITY_SCALES = [0.38, 0.60, 0.84]  // bucket 0, 1, 2
  for (const [key, pts] of filledZ) {
    const zone   = Math.floor(key / 10) as Zone
    const bucket = key % 10
    const s      = DENSITY_SCALES[bucket]
    ctx.beginPath()
    for (const [cx, cy] of pts) {
      ctx.moveTo(cx,          cy + hh * (1 - s))
      ctx.lineTo(cx + hw * s, cy + hh)
      ctx.lineTo(cx,          cy + hh * (1 + s))
      ctx.lineTo(cx - hw * s, cy + hh)
      ctx.closePath()
    }
    ctx.fillStyle = zoneFillColor(zone)
    ctx.fill()
    // South face tint for depth
    ctx.beginPath()
    for (const [cx, cy] of pts) {
      ctx.moveTo(cx,          cy + hh)
      ctx.lineTo(cx + hw * s, cy + hh)
      ctx.lineTo(cx + hw * s, cy + hh + hh * s * 0.5)
      ctx.lineTo(cx,          cy + hh * (1 + s))
      ctx.closePath()
    }
    ctx.fillStyle = PALETTE.faceDark
    ctx.fill()
  }

  // Roads — one fill call for all road tiles
  if (roadX.length > 0) {
    const rh = hh * 0.35
    ctx.fillStyle = PALETTE.road
    ctx.beginPath()
    for (let i = 0; i < roadX.length; i++) {
      const cx = roadX[i], cy = roadY[i]
      ctx.moveTo(cx,      cy + hh - rh)
      ctx.lineTo(cx + hw, cy + hh)
      ctx.lineTo(cx,      cy + hh + rh)
      ctx.lineTo(cx - hw, cy + hh)
      ctx.closePath()
    }
    ctx.fill()
    // Centerline dash
    ctx.strokeStyle = PALETTE.roadDark
    ctx.lineWidth   = Math.max(0.5, hw * 0.05)
    ctx.beginPath()
    for (let i = 0; i < roadX.length; i++) {
      ctx.moveTo(roadX[i] - hw, roadY[i] + hh)
      ctx.lineTo(roadX[i] + hw, roadY[i] + hh)
    }
    ctx.stroke()
  }

  // Power lines — one stroke call
  if (pwrX.length > 0) {
    ctx.strokeStyle = PALETTE.powerLine
    ctx.lineWidth   = Math.max(1, zoom)
    ctx.beginPath()
    for (let i = 0; i < pwrX.length; i++) {
      ctx.moveTo(pwrX[i] - hw * 0.5, pwrY[i] + hh * 0.8)
      ctx.lineTo(pwrX[i] + hw * 0.5, pwrY[i] + hh * 1.2)
    }
    ctx.stroke()
  }
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  hw: number, hh: number,
  building: Building,
): void {
  if (building === Building.PowerPlant) {
    drawDiamond(ctx, cx, cy + hh * 0.15, hw * 0.78, hh * 0.78, '#3a3a3a')
    ctx.fillStyle = '#ff6600'
    ctx.beginPath()
    ctx.arc(cx, cy + hh * 0.35, Math.max(2, hw * 0.13), 0, Math.PI * 2)
    ctx.fill()
  } else if (building === Building.WaterTower) {
    drawDiamond(ctx, cx, cy + hh * 0.35, hw * 0.65, hh * 0.40, '#2d5c7a')
    drawDiamond(ctx, cx, cy + hh * 0.05, hw * 0.45, hh * 0.45, '#4a7a9b')
  }
}
