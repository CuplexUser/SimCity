import { type World } from '../core/world'
import { Zone, Overlay, Building } from '../core/tile'
import { type IsoCamera, ELEV_H } from './isoCamera'
import {
  terrainColor, zoneOutlineColor,
  drawDiamond, drawElevationSides,
  type Ctx2D,
  type SpriteSheet,
} from './sprites'

const ELEV_PAD = 4

// ── Isometric box primitive ────────────────────────────────────────────────────
function drawIsoBox(
  ctx: Ctx2D,
  cx: number, cy: number, hw: number, hh: number,
  s: number, h: number,
  topFill: string, southFill: string, westFill: string,
): void {
  const gM = cy + hh
  const gB = cy + hh * (1 + s)
  const tT = cy + hh * (1 - s) - h
  const tM = gM - h
  const tB = gB - h

  ctx.beginPath()
  ctx.moveTo(cx,          tT); ctx.lineTo(cx + hw * s, tM)
  ctx.lineTo(cx,          tB); ctx.lineTo(cx - hw * s, tM)
  ctx.closePath(); ctx.fillStyle = topFill; ctx.fill()

  ctx.beginPath()
  ctx.moveTo(cx + hw * s, tM); ctx.lineTo(cx, tB)
  ctx.lineTo(cx,          gB); ctx.lineTo(cx + hw * s, gM)
  ctx.closePath(); ctx.fillStyle = southFill; ctx.fill()

  ctx.beginPath()
  ctx.moveTo(cx - hw * s, tM); ctx.lineTo(cx, tB)
  ctx.lineTo(cx,          gB); ctx.lineTo(cx - hw * s, gM)
  ctx.closePath(); ctx.fillStyle = westFill; ctx.fill()
}

// ── Window grid ────────────────────────────────────────────────────────────────
function drawWindows(
  ctx: Ctx2D,
  cx: number, cy: number, hw: number, hh: number,
  s: number, h: number,
  numCols: number, numRows: number,
  winColor: string,
  face: 'south' | 'west',
): void {
  const tM = cy + hh - h
  const wW = Math.max(1.5, hw * s * 0.65 / numCols)
  const wH = Math.max(1.5, h * 0.50 / numRows)

  ctx.fillStyle = winColor
  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      const u = (c + 0.5) / numCols
      const v = (r + 0.5) / numRows
      const xC = face === 'south'
        ? cx + hw * s * (1 - u)
        : cx - hw * s * (1 - u)
      const yC = tM + u * hh * s + v * h
      ctx.fillRect(xC - wW / 2, yC - wH / 2, wW, wH)
    }
  }
}

// ── Floor divider lines ────────────────────────────────────────────────────────
function drawFloorLines(
  ctx: Ctx2D,
  cx: number, cy: number, hw: number, hh: number,
  s: number, h: number, floorCount: number,
  color = 'rgba(255,255,255,0.18)',
): void {
  ctx.strokeStyle = color
  ctx.lineWidth   = Math.max(0.5, hw * 0.016)
  ctx.setLineDash([])
  for (let f = 1; f < floorCount; f++) {
    const v  = f / floorCount
    const yR = cy + hh - h * (1 - v)
    const yL = cy + hh * (1 + s) - h * (1 - v)
    ctx.beginPath()
    ctx.moveTo(cx + hw * s, yR); ctx.lineTo(cx,        yL); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx,           yL); ctx.lineTo(cx - hw * s, yR); ctx.stroke()
  }
}

// ── Horizontal siding / masonry lines on south face ───────────────────────────
function drawSidingLines(
  ctx: Ctx2D,
  cx: number, cy: number, hw: number, hh: number,
  s: number, h: number, count: number,
  color = 'rgba(0,0,0,0.12)',
): void {
  ctx.strokeStyle = color
  ctx.lineWidth   = Math.max(0.4, hw * 0.012)
  ctx.setLineDash([])
  for (let i = 1; i < count; i++) {
    const v  = i / count
    const yR = cy + hh - h * (1 - v)
    const yL = cy + hh * (1 + s) - h * (1 - v)
    ctx.beginPath()
    ctx.moveTo(cx + hw * s, yR); ctx.lineTo(cx, yL); ctx.stroke()
  }
}

// ── Detailed windows with frames and cross-pane ───────────────────────────────
// Places numCols×numRows windows on the south face with white frames + glass tint
function drawDetailWindows(
  ctx: Ctx2D,
  cx: number, cy: number, hw: number, hh: number,
  s: number, h: number,
  numCols: number, numRows: number,
  glassColor: string, frameColor: string,
  face: 'south' | 'west' = 'south',
): void {
  const tM = cy + hh - h
  const cellW = hw * s / numCols
  const cellH = h / numRows
  const padX  = cellW * 0.18
  const padY  = cellH * 0.16

  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      const u  = (c + 0.5) / numCols
      const v  = (r + 0.5) / numRows
      const xC = face === 'south' ? cx + hw * s * (1 - u) : cx - hw * s * (1 - u)
      const yC = tM + u * hh * s + v * h
      const wW = Math.max(1.5, cellW - padX * 2)
      const wH = Math.max(1.5, cellH - padY * 2)
      // Frame
      ctx.fillStyle = frameColor
      ctx.fillRect(xC - wW / 2 - 0.5, yC - wH / 2 - 0.5, wW + 1, wH + 1)
      // Glass
      ctx.fillStyle = glassColor
      ctx.fillRect(xC - wW / 2, yC - wH / 2, wW, wH)
      // Cross pane
      if (wW > 3 && wH > 3) {
        ctx.fillStyle = frameColor
        ctx.fillRect(xC - 0.5, yC - wH / 2, 1, wH)
        ctx.fillRect(xC - wW / 2, yC - 0.5, wW, 1)
      }
    }
  }
}

// ── Small isometric tree ───────────────────────────────────────────────────────
function drawSmallTree(
  ctx: Ctx2D,
  tx: number, ty: number, size: number,
): void {
  const tw = Math.max(1.2, size * 0.12)
  const th = size * 0.5
  const cr = size * 0.52

  // Trunk
  ctx.fillStyle = '#4d3218'
  ctx.fillRect(tx - tw / 2, ty - th, tw, th)

  // Shadow blob under canopy
  ctx.fillStyle = 'rgba(0,0,0,0.20)'
  ctx.beginPath()
  ctx.ellipse(tx + cr * 0.18, ty - th + cr * 0.08, cr * 0.72, cr * 0.36, 0, 0, Math.PI * 2)
  ctx.fill()

  // Back canopy (dark)
  ctx.fillStyle = '#2d5e18'
  ctx.beginPath()
  ctx.ellipse(tx + cr * 0.08, ty - th, cr * 0.72, cr * 0.72, 0, 0, Math.PI * 2)
  ctx.fill()

  // Front canopy (lighter)
  ctx.fillStyle = '#4a8a22'
  ctx.beginPath()
  ctx.ellipse(tx - cr * 0.08, ty - th - cr * 0.18, cr * 0.65, cr * 0.65, 0, 0, Math.PI * 2)
  ctx.fill()

  // Highlight
  ctx.fillStyle = 'rgba(110,190,55,0.28)'
  ctx.beginPath()
  ctx.ellipse(tx - cr * 0.22, ty - th - cr * 0.35, cr * 0.32, cr * 0.28, -0.3, 0, Math.PI * 2)
  ctx.fill()
}

// ── Hip-roof (all four faces slope to a raised ridge) ─────────────────────────
// Draws the two visible faces of a hip roof on top of walls at height h.
function drawHipRoof(
  ctx: Ctx2D,
  cx: number, cy: number, hw: number, hh: number,
  s: number, h: number, ridgeH: number,
  southFace: string, westFace: string, topColor: string,
): void {
  const wallTopSE = { x: cx + hw * s, y: cy + hh - h }
  const wallTopSW = { x: cx,          y: cy + hh * (1 + s) - h }
  const wallTopNW = { x: cx - hw * s, y: cy + hh - h }
  const wallTopNE = { x: cx,          y: cy + hh * (1 - s) - h }

  // Ridge endpoints (raised above wall top center)
  const ridgeE = { x: cx + hw * s * 0.48, y: cy + hh * (0.92) - h - ridgeH }
  const ridgeW = { x: cx - hw * s * 0.48, y: cy + hh * (0.92) - h - ridgeH }

  // South slope (lower-right face, toward viewer — lighter)
  ctx.fillStyle = southFace
  ctx.beginPath()
  ctx.moveTo(wallTopSE.x, wallTopSE.y)
  ctx.lineTo(wallTopSW.x, wallTopSW.y)
  ctx.lineTo(ridgeW.x, ridgeW.y)
  ctx.lineTo(ridgeE.x, ridgeE.y)
  ctx.closePath(); ctx.fill()

  // West slope (lower-left face — darker)
  ctx.fillStyle = westFace
  ctx.beginPath()
  ctx.moveTo(wallTopNW.x, wallTopNW.y)
  ctx.lineTo(wallTopSW.x, wallTopSW.y)
  ctx.lineTo(ridgeW.x, ridgeW.y)
  ctx.closePath(); ctx.fill()

  // East slope
  ctx.fillStyle = topColor
  ctx.beginPath()
  ctx.moveTo(wallTopNE.x, wallTopNE.y)
  ctx.lineTo(wallTopSE.x, wallTopSE.y)
  ctx.lineTo(ridgeE.x, ridgeE.y)
  ctx.closePath(); ctx.fill()

  // Ridge line
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth   = Math.max(0.5, hw * 0.015)
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(ridgeE.x, ridgeE.y)
  ctx.lineTo(ridgeW.x, ridgeW.y)
  ctx.stroke()
}

// ── Curtain-wall glass grid ────────────────────────────────────────────────────
function drawCurtainWall(
  ctx: Ctx2D,
  cx: number, cy: number, hw: number, hh: number,
  s: number, h: number,
  cols: number, floors: number,
  baseGlass: string, tintLine: string,
): void {
  drawIsoBox(ctx, cx, cy, hw, hh, s, h, tintLine, baseGlass, baseGlass)

  // Vertical mullions
  for (let c = 1; c < cols; c++) {
    const u  = c / cols
    const x1 = cx + hw * s * (1 - u)
    const y1 = cy + hh - h + u * hh * s
    const x2 = cx + hw * s * (1 - u)
    const y2 = cy + hh + u * hh * s
    ctx.strokeStyle = tintLine
    ctx.lineWidth   = Math.max(0.5, hw * 0.018)
    ctx.setLineDash([])
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    // West face
    const x1w = cx - hw * s * (1 - u)
    const x2w = cx - hw * s * (1 - u)
    ctx.beginPath(); ctx.moveTo(x1w, y1); ctx.lineTo(x2w, y2); ctx.stroke()
  }
  // Horizontal spandrels
  drawFloorLines(ctx, cx, cy, hw, hh, s, h, floors, tintLine)

  // Glass tint variation (alternating panels)
  ctx.globalAlpha = 0.08
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      if ((f + c) % 2 === 0) {
        const u1 = c / cols, u2 = (c + 1) / cols
        const v1 = f / floors, v2 = (f + 1) / floors
        const x1 = cx + hw * s * (1 - u1), y1 = cy + hh - h + u1 * hh * s + v1 * h
        const x2 = cx + hw * s * (1 - u2), y2 = cy + hh - h + u2 * hh * s + v1 * h
        const x3 = cx + hw * s * (1 - u2), y3 = cy + hh - h + u2 * hh * s + v2 * h
        const x4 = cx + hw * s * (1 - u1), y4 = cy + hh - h + u1 * hh * s + v2 * h
        ctx.fillStyle = '#a0c8ff'
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); ctx.fill()
      }
    }
  }
  ctx.globalAlpha = 1
}

// ── Zone building renderer ─────────────────────────────────────────────────────
export function drawZoneBuilding(
  ctx: Ctx2D,
  cx: number, cy: number, hw: number, hh: number,
  zone: Zone, density: number,
): void {
  const bucket = density <= 2 ? 0 : density <= 5 ? 1 : 2

  // ── Residential ────────────────────────────────────────────────────────────
  if (zone === Zone.Residential) {

    if (bucket === 0) {
      // ── Cottage / single-family home ──────────────────────────────────────
      const s = 0.50, h = hh * 2.6
      // Vary house color by density: 1=warm cream, 2=pale blue
      const isCream = density === 1
      const wallS = isCream ? '#c8b87a' : '#a0b4c0'
      const wallW = isCream ? '#b8a868' : '#8ea4b0'
      const wallT = isCream ? '#e0d0a0' : '#c0d0d8'
      const roofS = isCream ? '#7a3a28' : '#485878'
      const roofW = isCream ? '#602e20' : '#384868'

      // Walls
      drawIsoBox(ctx, cx, cy, hw, hh, s, h, wallT, wallS, wallW)
      // Siding lines (horizontal planks)
      drawSidingLines(ctx, cx, cy, hw, hh, s, h, 6, 'rgba(0,0,0,0.10)')

      // Hip roof
      const ridgeH = hh * 1.1
      drawHipRoof(ctx, cx, cy, hw, hh, s, h, ridgeH, roofS, roofW, roofS)
      // Roof tile lines (horizontal, on south slope)
      {
        const wt0 = { y: cy + hh - h }
        const rH = ridgeH
        ctx.strokeStyle = 'rgba(0,0,0,0.14)'
        ctx.lineWidth   = Math.max(0.4, hw * 0.010)
        for (let i = 1; i < 5; i++) {
          const t = i / 5
          // approximate midpoint on south slope
          const sy = cy + hh - h + t * ridgeH * 0.85
          const lx = cx - hw * s * t * 0.2
          const rx = cx + hw * s * t * 0.2 + hw * s
          ctx.beginPath(); ctx.moveTo(lx, sy + 0.2); ctx.lineTo(rx, sy - 0.2); ctx.stroke()
        }
        void wt0; void rH
      }

      // Windows on south face: 2 windows
      drawDetailWindows(ctx, cx, cy, hw, hh, s, h, 2, 1,
        isCream ? 'rgba(180,230,255,0.80)' : 'rgba(200,220,240,0.80)',
        isCream ? '#e8e0c8' : '#d0d8e0', 'south')

      // Door on south face (center, near bottom)
      {
        const uD = 0.5
        const xD = cx + hw * s * (1 - uD)
        const yD = cy + hh - h + uD * hh * s
        const dW = Math.max(2, hw * 0.16)
        const dH = Math.max(3, h * 0.38)
        ctx.fillStyle = isCream ? '#5a3418' : '#2a3a4a'
        ctx.fillRect(xD - dW / 2, yD + h * 0.62 - dH, dW, dH)
        // Door frame
        ctx.strokeStyle = isCream ? '#d8c898' : '#b0c0cc'
        ctx.lineWidth   = Math.max(0.5, hw * 0.014)
        ctx.strokeRect(xD - dW / 2, yD + h * 0.62 - dH, dW, dH)
        // Door knob
        ctx.fillStyle = '#d4b060'
        ctx.beginPath(); ctx.arc(xD + dW * 0.25, yD + h * 0.62 - dH * 0.45, Math.max(0.8, hw * 0.04), 0, Math.PI * 2); ctx.fill()
      }

      // Chimney (small box on upper-east side)
      {
        const chX = cx + hw * s * 0.55
        const chY = cy + hh * (1 - s) - h - ridgeH * 0.55
        const chW = Math.max(1.5, hw * 0.12)
        const chH = hh * 0.8
        ctx.fillStyle = isCream ? '#9a5a38' : '#6a7888'
        ctx.fillRect(chX - chW / 2, chY - chH, chW, chH)
        // Chimney cap
        ctx.fillStyle = isCream ? '#b87848' : '#8898a8'
        ctx.fillRect(chX - chW * 0.7, chY - chH - 1.5, chW * 1.4, 2)
      }

      // Yard trees (south-front of tile — lower portion)
      const treeY = cy + hh * 1.65
      const treeSize = Math.max(5, hw * 0.38)
      drawSmallTree(ctx, cx + hw * 0.62, treeY, treeSize)
      if (density === 2) {
        drawSmallTree(ctx, cx - hw * 0.30, treeY + hh * 0.22, treeSize * 0.82)
      }

    } else if (bucket === 1) {
      // ── Walk-up apartment / row house ─────────────────────────────────────
      const s = 0.72, h = hh * 3.8
      const floors = 3
      const wallS = '#c09870'; const wallW = '#a07858'; const wallT = '#d4b080'

      drawIsoBox(ctx, cx, cy, hw, hh, s, h, wallT, wallS, wallW)
      // Brick texture: close horizontal lines + occasional verticals
      drawSidingLines(ctx, cx, cy, hw, hh, s, h, floors * 4, 'rgba(0,0,0,0.09)')
      drawFloorLines(ctx, cx, cy, hw, hh, s, h, floors, 'rgba(255,255,255,0.22)')

      // Windows (3 cols × 3 floors each face)
      drawDetailWindows(ctx, cx, cy, hw, hh, s, h, 3, floors,
        'rgba(200,230,255,0.72)', '#d8c8a0', 'south')
      drawDetailWindows(ctx, cx, cy, hw, hh, s, h, 3, floors,
        'rgba(200,230,255,0.65)', '#c0b090', 'west')

      // Flat roof parapet
      const parH = hh * 0.35
      drawIsoBox(ctx, cx, cy - h + parH, hw, hh, s, parH, '#e0c898', '#c8aa7a', '#d8ba88')

      // Entry door on south face (bottom center)
      {
        const uD = 0.5
        const xD = cx + hw * s * (1 - uD)
        const yD = cy + hh - h + uD * hh * s
        const dW = Math.max(3, hw * 0.18)
        const dH = Math.max(4, h * 0.22)
        ctx.fillStyle = '#1a1208'
        ctx.fillRect(xD - dW / 2, yD + h * 0.78, dW, dH)
        // Stone surround
        ctx.strokeStyle = '#d8c898'
        ctx.lineWidth   = Math.max(0.6, hw * 0.018)
        ctx.strokeRect(xD - dW / 2 - 1, yD + h * 0.78 - 1, dW + 2, dH + 2)
      }

    } else {
      // ── High-rise residential ──────────────────────────────────────────────
      const s = 0.80, h = hh * 6.5
      const floors = 9

      // Concrete base
      drawIsoBox(ctx, cx, cy, hw, hh, s, h, '#d8ceb8', '#a89880', '#c0b098')
      drawFloorLines(ctx, cx, cy, hw, hh, s, h, floors, 'rgba(255,255,255,0.15)')

      // Windows
      drawDetailWindows(ctx, cx, cy, hw, hh, s, h, 4, floors,
        'rgba(190,220,255,0.75)', '#c8baa8', 'south')
      drawDetailWindows(ctx, cx, cy, hw, hh, s, h, 4, floors,
        'rgba(190,220,255,0.65)', '#b8a898', 'west')

      // Balcony rails (every other floor, south face)
      ctx.strokeStyle = 'rgba(200,190,170,0.50)'
      ctx.lineWidth   = Math.max(0.4, hw * 0.010)
      for (let f = 1; f < floors; f += 2) {
        const v  = f / floors
        const yR = cy + hh - h * (1 - v)
        const yL = cy + hh * (1 + s) - h * (1 - v)
        ctx.beginPath()
        ctx.moveTo(cx + hw * s, yR); ctx.lineTo(cx, yL); ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(cx + hw * s, yR + 1.5); ctx.lineTo(cx, yL + 1.5); ctx.stroke()
      }

      // Mechanical penthouse on top
      drawIsoBox(ctx, cx, cy - h + hh * 0.6, hw, hh, 0.52, hh * 0.6, '#c0b8a8', '#988a78', '#b0a890')

      // Antenna
      const antX = cx + hw * 0.12
      const antY = cy + hh * (1 - s) - h - hh * 0.6
      ctx.strokeStyle = '#aaa'
      ctx.lineWidth   = Math.max(0.5, hw * 0.016)
      ctx.beginPath(); ctx.moveTo(antX, antY); ctx.lineTo(antX, antY - hh * 1.4); ctx.stroke()
      ctx.fillStyle = '#ff4444'
      ctx.beginPath(); ctx.arc(antX, antY - hh * 1.4, Math.max(1, hw * 0.04), 0, Math.PI * 2); ctx.fill()
    }

  // ── Commercial ──────────────────────────────────────────────────────────────
  } else if (zone === Zone.Commercial) {

    if (bucket === 0) {
      // ── Small retail / corner shop ─────────────────────────────────────────
      const s = 0.68, h = hh * 2.0
      // White facade
      drawIsoBox(ctx, cx, cy, hw, hh, s, h, '#e8e4e0', '#c0bcb8', '#d4d0cc')

      // Large display window (ground floor, south face)
      {
        const winH = h * 0.50
        const winU0 = 0.12, winU1 = 0.88
        const v0 = 0.08, v1 = v0 + winH / h
        const tM = cy + hh - h
        const p = (u: number, v: number) => ({
          x: cx + hw * s * (1 - u),
          y: tM + u * hh * s + v * h,
        })
        const tl = p(winU0, v0), tr = p(winU1, v0)
        const bl = p(winU0, v1), br = p(winU1, v1)
        // Frame
        ctx.fillStyle = '#b0a898'
        ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y); ctx.closePath(); ctx.fill()
        // Glass
        const shrink = 1
        ctx.fillStyle = 'rgba(160,210,255,0.55)'
        ctx.beginPath()
        ctx.moveTo(tl.x - shrink, tl.y + shrink)
        ctx.lineTo(tr.x + shrink * 0.1, tr.y + shrink)
        ctx.lineTo(br.x + shrink * 0.1, br.y - shrink)
        ctx.lineTo(bl.x - shrink, bl.y - shrink)
        ctx.closePath(); ctx.fill()
        // Reflection streak
        ctx.fillStyle = 'rgba(255,255,255,0.22)'
        ctx.beginPath()
        ctx.moveTo(tl.x - shrink, tl.y + shrink)
        ctx.lineTo(tl.x - shrink + (tr.x - tl.x) * 0.28, tl.y + shrink + (tr.y - tl.y) * 0.28)
        ctx.lineTo(bl.x - shrink + (br.x - bl.x) * 0.28, bl.y - shrink + (br.y - bl.y) * 0.28)
        ctx.lineTo(bl.x - shrink, bl.y - shrink)
        ctx.closePath(); ctx.fill()
      }

      // Colored awning (fold-out, south face top strip)
      {
        const awH  = h * 0.18
        const awCol = density === 1 ? '#cc3322' : '#2244aa'
        const tM    = cy + hh - h
        const s0    = 0.15, s1 = 0.85
        ctx.fillStyle = awCol
        ctx.beginPath()
        ctx.moveTo(cx + hw * s * (1 - s0), tM + s0 * hh * s)
        ctx.lineTo(cx + hw * s * (1 - s1), tM + s1 * hh * s)
        ctx.lineTo(cx + hw * s * (1 - s1), tM + s1 * hh * s + awH)
        ctx.lineTo(cx + hw * s * (1 - s0), tM + s0 * hh * s + awH)
        ctx.closePath(); ctx.fill()
        // Awning stripe
        ctx.fillStyle = 'rgba(255,255,255,0.30)'
        for (let i = 0; i < 4; i++) {
          const u = s0 + (s1 - s0) * (i + 0.5) / 4
          const x = cx + hw * s * (1 - u)
          const y = tM + u * hh * s
          ctx.fillRect(x - 0.6, y, 1.2, awH)
        }
      }

      // Sign panel above awning
      {
        const tM    = cy + hh - h
        const sy    = cy + hh * (1 - s) - h  // top of building
        const signH = h * 0.14
        ctx.fillStyle = density === 1 ? '#1a1a40' : '#1a1a1a'
        ctx.beginPath()
        ctx.moveTo(cx + hw * s * 0.88, tM - signH + 0.3 * hh * s * 0.88)
        ctx.lineTo(cx + hw * s * 0.12, tM - signH + 0.3 * hh * s * 0.12)
        ctx.lineTo(cx + hw * s * 0.12, tM + 0.3 * hh * s * 0.12)
        ctx.lineTo(cx + hw * s * 0.88, tM + 0.3 * hh * s * 0.88)
        ctx.closePath(); ctx.fill()
        void sy
      }

      // Upper floor window
      drawDetailWindows(ctx, cx, cy, hw, hh, s, h * 0.4, 2, 1,
        'rgba(200,230,255,0.65)', '#d0ccc8', 'south')

    } else if (bucket === 1) {
      // ── Mid-rise office ────────────────────────────────────────────────────
      const s = 0.70, h = hh * 4.2
      const floors = 5

      // Blue-gray facade
      drawIsoBox(ctx, cx, cy, hw, hh, s, h, '#b0bec8', '#607888', '#788898')
      drawFloorLines(ctx, cx, cy, hw, hh, s, h, floors, 'rgba(180,210,240,0.25)')

      // Ribbon windows (wide horizontal bands, 3 per floor)
      drawDetailWindows(ctx, cx, cy, hw, hh, s, h, 3, floors,
        'rgba(160,210,255,0.72)', '#8898a8', 'south')
      drawDetailWindows(ctx, cx, cy, hw, hh, s, h, 3, floors,
        'rgba(140,190,240,0.65)', '#7888a0', 'west')

      // Entry canopy (south face bottom)
      {
        const canW = hw * s * 0.58
        const canY = cy + hh
        ctx.fillStyle = '#485868'
        ctx.beginPath()
        ctx.moveTo(cx + canW, canY - hh * 0.35)
        ctx.lineTo(cx,        canY)
        ctx.lineTo(cx - canW * 0.1, canY + hh * 0.12)
        ctx.lineTo(cx + canW, canY - hh * 0.22)
        ctx.closePath(); ctx.fill()
      }

      // Flat roof with parapet + vent box
      drawIsoBox(ctx, cx, cy - h + hh * 0.3, hw, hh, s * 0.95, hh * 0.3, '#98a8b4', '#6878880', '#7888a0')
      drawIsoBox(ctx, cx + hw * 0.15, cy - h, hw, hh, 0.28, hh * 0.7, '#a0b0bc', '#708090', '#8090a2')

    } else {
      // ── High-rise glass tower ──────────────────────────────────────────────
      const s = 0.70, h = hh * 7.8
      const floors = 10

      // Glass curtain wall
      drawCurtainWall(ctx, cx, cy, hw, hh, s, h, 4, floors,
        '#1848a0', '#3070cc')

      // Reflective sheen on south face
      ctx.globalAlpha = 0.12
      ctx.fillStyle = '#a0d0ff'
      ctx.beginPath()
      ctx.moveTo(cx + hw * s, cy + hh - h)
      ctx.lineTo(cx + hw * s * 0.3, cy + hh - h * 0.7)
      ctx.lineTo(cx, cy + hh * (1 + s * 0.3) - h * 0.7)
      ctx.lineTo(cx, cy + hh * (1 + s) - h)
      ctx.closePath(); ctx.fill()
      ctx.globalAlpha = 1

      // Lobby base (darker glass)
      drawIsoBox(ctx, cx, cy, hw, hh, s, h * 0.10, '#1030608', '#0c2248', '#0e2a50')

      // Crown: stepped top
      drawIsoBox(ctx, cx, cy - h + hh * 0.8, hw, hh, s * 0.72, hh * 0.8, '#2050b0', '#183888', '#203890')
      drawIsoBox(ctx, cx, cy - h * 1.05 + hh * 0.8, hw, hh, s * 0.42, hh * 0.6, '#2858c0', '#1a4090', '#2248a0')

      // Antenna spire
      ctx.strokeStyle = '#88aacc'
      ctx.lineWidth   = Math.max(0.6, hw * 0.020)
      const spireBase = cy + hh * (1 - s * 0.42) - h * 1.05 + hh * 0.8 - hh * 0.6
      ctx.beginPath(); ctx.moveTo(cx, spireBase); ctx.lineTo(cx, spireBase - hh * 1.8); ctx.stroke()
      ctx.fillStyle = '#ffcc44'
      ctx.beginPath(); ctx.arc(cx, spireBase - hh * 1.8, Math.max(1.2, hw * 0.05), 0, Math.PI * 2); ctx.fill()
    }

  // ── Industrial ──────────────────────────────────────────────────────────────
  } else {

    if (bucket === 0) {
      // ── Small warehouse / workshop ─────────────────────────────────────────
      const s = 0.82, h = hh * 1.6
      // Metal cladding: gray-green
      const wallS = '#787870', wallW = '#585850', wallT = '#909088'
      drawIsoBox(ctx, cx, cy, hw, hh, s, h, wallT, wallS, wallW)
      // Corrugated metal lines
      drawSidingLines(ctx, cx, cy, hw, hh, s, h, 8, 'rgba(255,255,255,0.10)')

      // Flat roof with slight taper
      drawIsoBox(ctx, cx, cy - h, hw, hh, s, hh * 0.18, '#a0a098', '#808078', '#909088')

      // Roll-up loading doors (south face, 2)
      for (let d = 0; d < 2; d++) {
        const u  = (d + 0.7) / 2.6
        const dW = Math.max(2.5, hw * 0.22)
        const dH = Math.max(3, h * 0.62)
        const xD = cx + hw * s * (1 - u)
        const yD = cy + hh - h + u * hh * s
        ctx.fillStyle = '#2a2820'
        ctx.fillRect(xD - dW / 2, yD + h * 0.38, dW, dH)
        // Door panel lines
        ctx.strokeStyle = 'rgba(80,80,72,0.60)'
        ctx.lineWidth   = 0.6
        for (let ln = 1; ln < 4; ln++) {
          const ly = yD + h * 0.38 + dH * ln / 4
          ctx.beginPath(); ctx.moveTo(xD - dW / 2, ly); ctx.lineTo(xD + dW / 2, ly); ctx.stroke()
        }
      }

    } else if (bucket === 1) {
      // ── Factory complex ────────────────────────────────────────────────────
      const s = 0.86, h = hh * 2.4
      drawIsoBox(ctx, cx, cy, hw, hh, s, h, '#706858', '#403830', '#585048')
      drawSidingLines(ctx, cx, cy, hw, hh, s, h, 6, 'rgba(255,255,255,0.08)')

      // Secondary wing (offset box)
      drawIsoBox(ctx, cx + hw * 0.22, cy + hh * 0.08, hw, hh, 0.52, hh * 1.8, '#686058', '#3c342c', '#504840')

      // Roof sections
      drawIsoBox(ctx, cx, cy - h, hw, hh, s, hh * 0.22, '#888070', '#504840', '#685860')

      // Skylight rows on main roof
      for (let i = 0; i < 3; i++) {
        const u = 0.2 + i * 0.25
        const rx = cx - hw * s * (0.3 - u * 0.1)
        const ry = cy + hh * (1 - s) - h
        const skyW = Math.max(1, hw * 0.08)
        const skyH = Math.max(1, hh * 0.28)
        ctx.fillStyle = 'rgba(180,200,220,0.60)'
        ctx.fillRect(rx - skyW / 2, ry + i * 1.5, skyW, skyH)
      }

      // Smokestack
      const cw = Math.max(2, hw * 0.09)
      ctx.fillStyle = '#707070'
      ctx.fillRect(cx + hw * s * 0.50 - cw / 2, cy + hh * (1 - s) - h - hh * 1.6, cw, hh * 1.6)
      // Stack bands
      ctx.fillStyle = '#f0f0f0'
      for (let b = 0; b < 2; b++) {
        ctx.fillRect(cx + hw * s * 0.50 - cw * 0.7, cy + hh * (1 - s) - h - hh * (0.5 + b * 0.7), cw * 1.4, hh * 0.12)
      }
      ctx.fillStyle = '#888'
      ctx.beginPath()
      ctx.arc(cx + hw * s * 0.50, cy + hh * (1 - s) - h - hh * 1.6, cw * 0.9, 0, Math.PI * 2)
      ctx.fill()

    } else {
      // ── Heavy industry / refinery ──────────────────────────────────────────
      const s = 0.88, h = hh * 3.2
      drawIsoBox(ctx, cx, cy, hw, hh, s, h, '#605850', '#382e28', '#484038')
      drawFloorLines(ctx, cx, cy, hw, hh, s, h, 3, 'rgba(255,220,160,0.10)')

      // Multiple smaller buildings in compound
      drawIsoBox(ctx, cx - hw * 0.28, cy - hh * 0.12, hw, hh, 0.38, hh * 2.0, '#686060', '#403838', '#584848')
      drawIsoBox(ctx, cx + hw * 0.20, cy + hh * 0.06, hw, hh, 0.42, hh * 1.6, '#587060', '#304030', '#445848')

      // Storage tanks (circular, approximated as ellipses)
      for (let t = 0; t < 2; t++) {
        const tx = cx + hw * (t === 0 ? -0.52 : 0.48)
        const ty = cy + hh * (1.1 - t * 0.25)
        const tr = Math.max(3, hw * 0.20)
        ctx.fillStyle = t === 0 ? '#c0b070' : '#88a0a0'
        ctx.beginPath()
        ctx.ellipse(tx, ty, tr, tr * 0.52, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.30)'
        ctx.lineWidth = 0.8
        ctx.stroke()
      }

      // Two smokestacks
      for (let k = 0; k < 2; k++) {
        const sx = cx + (k === 0 ? -hw * 0.12 : hw * 0.28)
        const sw = Math.max(2, hw * 0.09)
        const sh = hh * (1.8 + k * 0.5)
        ctx.fillStyle = '#6a6a6a'
        ctx.fillRect(sx - sw / 2, cy + hh * (1 - s) - h - sh, sw, sh)
        ctx.fillStyle = '#f0f0f0'
        ctx.fillRect(sx - sw * 0.7, cy + hh * (1 - s) - h - sh * 0.35, sw * 1.4, hh * 0.10)
        ctx.fillStyle = '#888'
        ctx.beginPath()
        ctx.arc(sx, cy + hh * (1 - s) - h - sh, sw * 0.9, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}

// ── Road tile renderer ────────────────────────────────────────────────────────
export function drawRoadTile(
  ctx: Ctx2D,
  cx: number, cy: number, hw: number, hh: number,
  mask: number, zoom: number,
): void {
  const SC = 1.00

  // Sidewalk (full tile diamond)
  ctx.fillStyle = '#b0a898'
  ctx.beginPath()
  ctx.moveTo(cx,        cy + hh * (1 - SC))
  ctx.lineTo(cx + hw,   cy + hh)
  ctx.lineTo(cx,        cy + hh * (1 + SC))
  ctx.lineTo(cx - hw,   cy + hh)
  ctx.closePath(); ctx.fill()

  // Sidewalk cracks / texture
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'
  ctx.lineWidth   = 0.5
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(cx + hw * 0.5, cy + hh * 0.5); ctx.lineTo(cx + hw * 0.5, cy + hh * 1.5); ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - hw * 0.5, cy + hh * 0.5); ctx.lineTo(cx - hw * 0.5, cy + hh * 1.5); ctx.stroke()

  // ── Asphalt ─────────────────────────────────────────────────────────────────
  // Built from a center core plus one "arm" reaching out to each connected edge,
  // so neighboring road tiles fuse into a continuous carriageway. Each tile edge
  // midpoint (where two tiles meet) lies at center ± (hw/2, ±hh/2); an arm is the
  // parallelogram from the center out to that midpoint, `RW` wide along the other
  // tile axis. RW is the fraction of the shared edge the asphalt occupies, so the
  // remainder shows through as sidewalk fringe.
  const ccx = cx, ccy = cy + hh   // diamond center
  const ex = hw / 2, ey = hh / 2  // center → edge-midpoint half-vector
  const RW = 0.58                 // road half-width (fraction of an edge)

  // bit, arm vector (center→edge midpoint), perpendicular = the other tile axis
  const arms = [
    { bit: 1, ax:  ex, ay: -ey, px:  ex, py:  ey }, // N → upper-right edge
    { bit: 2, ax:  ex, ay:  ey, px:  ex, py: -ey }, // E → lower-right edge
    { bit: 4, ax: -ex, ay:  ey, px:  ex, py:  ey }, // S → lower-left edge
    { bit: 8, ax: -ex, ay: -ey, px:  ex, py: -ey }, // W → upper-left edge
  ]

  const hasN = !!(mask & 1), hasE = !!(mask & 2)
  const hasS = !!(mask & 4), hasW = !!(mask & 8)
  const connCount = (+hasN) + (+hasE) + (+hasS) + (+hasW)

  ctx.fillStyle = '#484848'

  // Center core (tile-aligned diamond) — solid junction core + isolated-tile patch
  ctx.beginPath()
  ctx.moveTo(ccx,          ccy - ey * RW)
  ctx.lineTo(ccx + ex * RW, ccy)
  ctx.lineTo(ccx,          ccy + ey * RW)
  ctx.lineTo(ccx - ex * RW, ccy)
  ctx.closePath(); ctx.fill()

  // Arms to each connected neighbor
  for (const a of arms) {
    if (!(mask & a.bit)) continue
    const wx = a.px * RW, wy = a.py * RW
    ctx.beginPath()
    ctx.moveTo(ccx + wx,        ccy + wy)
    ctx.lineTo(ccx - wx,        ccy - wy)
    ctx.lineTo(ccx + a.ax - wx, ccy + a.ay - wy)
    ctx.lineTo(ccx + a.ax + wx, ccy + a.ay + wy)
    ctx.closePath(); ctx.fill()
  }

  // ── Lane markings ─────────────────────────────────────────────────────────
  if (connCount <= 2) {
    // Straight / corner / dead-end: dashed yellow center line along each arm
    const dashL = Math.max(2, hw * 0.10)
    const gapL  = Math.max(2, hw * 0.08)
    ctx.strokeStyle = '#ffee22'
    ctx.lineWidth   = Math.max(0.7, zoom * 0.55)
    ctx.setLineDash([dashL, gapL])
    for (const a of arms) {
      if (!(mask & a.bit)) continue
      ctx.beginPath()
      ctx.moveTo(ccx, ccy)
      ctx.lineTo(ccx + a.ax, ccy + a.ay)
      ctx.stroke()
    }
    if (mask === 0) {
      // Lone tile: small cross to read as paved
      ctx.beginPath()
      ctx.moveTo(ccx + ex * 0.5, ccy - ey * 0.5); ctx.lineTo(ccx - ex * 0.5, ccy + ey * 0.5)
      ctx.moveTo(ccx - ex * 0.5, ccy - ey * 0.5); ctx.lineTo(ccx + ex * 0.5, ccy + ey * 0.5)
      ctx.stroke()
    }
    ctx.setLineDash([])
  } else {
    // Junction (3-/4-way): white stop bar across each connected arm near its edge
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth   = Math.max(0.8, zoom * 0.5)
    ctx.setLineDash([])
    for (const a of arms) {
      if (!(mask & a.bit)) continue
      const bx = ccx + a.ax * 0.7, by = ccy + a.ay * 0.7
      const wx = a.px * RW, wy = a.py * RW
      ctx.beginPath()
      ctx.moveTo(bx + wx, by + wy)
      ctx.lineTo(bx - wx, by - wy)
      ctx.stroke()
    }
  }
}

// ── Diagonal road tile renderer ────────────────────────────────────────────────
// A diagonal road runs corner-to-corner across the tile diamond (45° to the grid
// roads), connecting diagonal neighbors. The four diamond apexes are the connection
// points; each is shared as a single point with the matching diagonal neighbor, so
// constant-width "arms" from the tile center out to each connected apex tile
// seamlessly into a continuous ribbon across neighbors.
//
//   apex   mask bit   grid neighbor      screen direction
//   ────   ────────   ─────────────      ────────────────
//   NW       1        (col-1, row-1)     straight up
//   NE       2        (col+1, row-1)     straight right
//   SE       4        (col+1, row+1)     straight down
//   SW       8        (col-1, row+1)     straight left
export function drawDiagRoadTile(
  ctx: Ctx2D,
  cx: number, cy: number, hw: number, hh: number,
  mask: number, zoom: number,
): void {
  const ox = cx, oy = cy + hh          // diamond center
  // Center → each apex (the connection point shared with a diagonal neighbor).
  const apex = [
    { bit: 1, ax:  0,   ay: -hh, vert: true  }, // NW → top apex
    { bit: 2, ax:  hw,  ay:  0,  vert: false }, // NE → right apex
    { bit: 4, ax:  0,   ay:  hh, vert: true  }, // SE → bottom apex
    { bit: 8, ax: -hw,  ay:  0,  vert: false }, // SW → left apex
  ]

  // Constant *screen* half-widths, so a diagonal road looks identical whether it
  // runs screen-vertical (NW–SE) or screen-horizontal (NE–SW). The old code scaled
  // by hw for vertical arms but hh for horizontal arms — since hw = 2·hh, one
  // orientation came out twice as wide and read as a chain of diamonds.
  const roadHalf = hh * 0.44   // asphalt half-width (px)
  const walkHalf = hh * 0.66   // sidewalk fringe half-width (px)

  // Perpendicular offset for an arm: vertical arms widen in x, horizontal in y.
  const off = (a: typeof apex[number], k: number) =>
    a.vert ? { wx: k, wy: 0 } : { wx: 0, wy: k }

  const armQuad = (a: typeof apex[number], k: number) => {
    const { wx, wy } = off(a, k)
    ctx.beginPath()
    ctx.moveTo(ox + wx,         oy + wy)
    ctx.lineTo(ox - wx,         oy - wy)
    ctx.lineTo(ox + a.ax - wx,  oy + a.ay - wy)
    ctx.lineTo(ox + a.ax + wx,  oy + a.ay + wy)
    ctx.closePath()
    ctx.fill()
  }

  // Center patch (square diamond, half-size k) so an isolated tile reads as paved
  // and junctions stay filled.
  const square = (k: number) => {
    ctx.beginPath()
    ctx.moveTo(ox, oy - k); ctx.lineTo(ox + k, oy)
    ctx.lineTo(ox, oy + k); ctx.lineTo(ox - k, oy)
    ctx.closePath(); ctx.fill()
  }

  const connCount = (+!!(mask & 1)) + (+!!(mask & 2)) + (+!!(mask & 4)) + (+!!(mask & 8))

  // Sidewalk fringe (wider, drawn first)
  ctx.fillStyle = '#b0a898'
  for (const a of apex) if (mask & a.bit) armQuad(a, walkHalf)
  square(walkHalf)

  // Asphalt
  ctx.fillStyle = '#484848'
  for (const a of apex) if (mask & a.bit) armQuad(a, roadHalf)
  square(roadHalf)

  // Lane markings: dashed yellow center line along each arm (straight runs/corners)
  if (connCount <= 2) {
    const dashL = Math.max(2, hh * 0.18)
    const gapL  = Math.max(2, hh * 0.14)
    ctx.strokeStyle = '#ffee22'
    ctx.lineWidth   = Math.max(0.7, zoom * 0.55)
    ctx.setLineDash([dashL, gapL])
    for (const a of apex) {
      if (!(mask & a.bit)) continue
      ctx.beginPath()
      ctx.moveTo(ox, oy)
      ctx.lineTo(ox + a.ax, oy + a.ay)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }
}

// ── Car renderer (animated traffic layer) ──────────────────────────────────────
// The 8 screen directions a car can travel: the 4 grid-axis roads read as the
// screen diagonals (ne/se/sw/nw), the 4 diagonal roads as the screen axes
// (n/e/s/w).
export const CAR_DIRS = ['ne', 'se', 'sw', 'nw', 'n', 'e', 's', 'w'] as const
export type CarDir = typeof CAR_DIRS[number]

type Vec2 = [number, number]

// Ground-plane axes in screen space (2:1 iso). COL = +col step (reads screen SE),
// ROW = +row step (reads screen SW). A car is built as a box framed by the two
// ground axes of its road, so it lies flat *and* points along travel rather than
// skating sideways.
const A = 0.8944, B = 0.4472          // a unit grid step = (±2, ±1)/√5
const COL: Vec2 = [ A, B]
const ROW: Vec2 = [-A, B]
const neg = (v: Vec2): Vec2 => [-v[0], -v[1]]

// Per travel direction: `along` runs down the road, `across` is the perpendicular
// ground axis (car width). Grid-axis roads use the COL/ROW axes; the 45° diagonal
// roads run along the screen axes (their ground axes project to screen H/V).
const CAR_AXES: Record<CarDir, { along: Vec2; across: Vec2 }> = {
  se: { along: COL,      across: ROW },
  nw: { along: neg(COL), across: ROW },
  sw: { along: ROW,      across: COL },
  ne: { along: neg(ROW), across: COL },
  s:  { along: [ 0,  1], across: [1, 0] },
  n:  { along: [ 0, -1], across: [1, 0] },
  e:  { along: [ 1,  0], across: [0, 1] },
  w:  { along: [-1,  0], across: [0, 1] },
}

// A small, deterministic per-variant body palette (CC0-ish car colors).
const CAR_BODY = ['#c83c3c', '#3c6ec8', '#d8b43c', '#3ca85a', '#cfcfcf', '#b85ec8']
const CAR_ROOF = ['#e86a6a', '#6a9ae8', '#f0d46a', '#6ad490', '#f0f0f0', '#dc8ae8']

// Lighten (f>0) or darken (f<0) a #rrggbb color toward white/black.
function shadeHex(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16)
  const t = f < 0 ? 0 : 255, a = Math.abs(f)
  const mix = (c: number) => Math.round(c + (t - c) * a)
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`
}

interface Pt { x: number; y: number }
function fillPoly(ctx: Ctx2D, pts: Pt[]): void {
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath(); ctx.fill()
}
const avgY = (pts: Pt[]): number => pts.reduce((s, p) => s + p.y, 0) / pts.length

interface Panel { p: Pt[]; c: string; glass?: Pt[] }

/**
 * Draw one car at (cx,cy) facing `dir` as a small low-poly vehicle on the iso
 * ground: four wheels, a beveled hull (so the outline isn't a slab), a raked
 * glasshouse cabin with side windows, and head/tail lights — reads as a car
 * rather than a driving shoebox.
 */
export function drawCar(
  ctx: Ctx2D,
  cx: number, cy: number, hw: number, hh: number,
  dir: CarDir, variant: number,
): void {
  const { along, across } = CAR_AXES[dir]
  const L = hw * 0.46, W = hw * 0.19   // half length / half width on the ground
  const floor = hh * 0.20              // underside of the body (wheels peek below)
  const belt  = hh * 0.56              // top of the lower body / base of the cabin
  const roofZ = hh * 1.04              // top of the cabin

  const body  = CAR_BODY[variant % CAR_BODY.length]
  const roofc = CAR_ROOF[variant % CAR_ROOF.length]
  const glass = '#1b2a38'

  // Project a body-local point: sl along travel (−1..1), sw across (−1..1), z up.
  const P = (sl: number, sw: number, z: number): Pt => ({
    x: cx + along[0] * L * sl + across[0] * W * sw,
    y: cy + along[1] * L * sl + across[1] * W * sw - z,
  })
  const avgX = (pts: Pt[]): number => pts.reduce((s, p) => s + p.x, 0) / pts.length
  // Shrink a quad toward its centroid → a window inset within a body panel.
  const shrink = (pts: Pt[], f: number): Pt[] => {
    const c = { x: avgX(pts), y: avgY(pts) }
    return pts.map((p) => ({ x: p.x + (c.x - p.x) * f, y: p.y + (c.y - p.y) * f }))
  }
  // Paint a group of panels back→front (ascending screen y); draw any window inset.
  const paint = (panels: Panel[]) => {
    for (const f of panels.sort((u, v) => avgY(u.p) - avgY(v.p))) {
      ctx.fillStyle = f.c; fillPoly(ctx, f.p)
      if (f.glass) { ctx.fillStyle = glass; fillPoly(ctx, f.glass) }
    }
  }

  // ── Ground shadow ────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.20)'
  fillPoly(ctx, [P(1.1, 1.25, 0), P(-1.05, 1.25, 0), P(-1.05, -1.25, 0), P(1.1, -1.25, 0)])

  // ── Wheels (before the body, so the hull caps their tops) ────────────────────
  ctx.fillStyle = '#15161a'
  for (const sl of [0.6, -0.62]) for (const sw of [0.98, -0.98]) {
    const w = P(sl, sw, hh * 0.12)
    ctx.beginPath(); ctx.ellipse(w.x, w.y, hw * 0.09, hh * 0.2, 0, 0, Math.PI * 2); ctx.fill()
  }

  // ── Lower body: a beveled hexagonal hull (tapered nose + tail, not a slab) ───
  const hull = [
    { sl: 0.98, sw: 0.5 },  { sl: 0.52, sw: 1 },   { sl: -0.86, sw: 0.82 },
    { sl: -0.86, sw: -0.82 }, { sl: 0.52, sw: -1 }, { sl: 0.98, sw: -0.5 },
  ]
  const hb = hull.map((p) => P(p.sl, p.sw, floor))
  const ht = hull.map((p) => P(p.sl, p.sw, belt))
  const hullPanels: Panel[] = []
  for (let i = 0; i < hull.length; i++) {
    const j = (i + 1) % hull.length
    const q = [hb[i], hb[j], ht[j], ht[i]]
    hullPanels.push({ p: q, c: shadeHex(body, avgX(q) > cx ? -0.06 : -0.28) })
  }
  hullPanels.push({ p: ht, c: shadeHex(body, 0.14) })   // hood / trunk top
  paint(hullPanels)

  // ── Cabin: a raked trapezoid greenhouse with side windows ────────────────────
  // bottom corners (front-right, rear-right, rear-left, front-left) at the beltline
  const cb = [P(0.3, 0.74, belt), P(-0.54, 0.74, belt), P(-0.54, -0.74, belt), P(0.3, -0.74, belt)]
  // top corners pulled in + back → windshield / rear-window rake and a narrow roof
  const cp = [P(0.08, 0.58, roofZ), P(-0.42, 0.58, roofZ), P(-0.42, -0.58, roofZ), P(0.08, -0.58, roofZ)]
  const rightSide = [cb[0], cb[1], cp[1], cp[0]]
  const leftSide  = [cb[2], cb[3], cp[3], cp[2]]
  paint([
    { p: rightSide, c: shadeHex(body, -0.05), glass: shrink(rightSide, 0.26) },
    { p: leftSide,  c: shadeHex(body, -0.24), glass: shrink(leftSide, 0.26) },
    { p: [cb[1], cb[2], cp[2], cp[1]], c: glass },   // rear window
    { p: [cb[3], cb[0], cp[0], cp[3]], c: glass },   // windshield
    { p: cp, c: roofc },                              // roof
  ])

  // ── Lights ───────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#fff7d0'
  for (const sw of [0.42, -0.42]) {
    const h = P(0.97, sw, belt * 0.66)
    ctx.beginPath(); ctx.arc(h.x, h.y, Math.max(0.7, hw * 0.045), 0, Math.PI * 2); ctx.fill()
  }
  ctx.fillStyle = '#d83026'
  for (const sw of [0.6, -0.6]) {
    const t = P(-0.9, sw, belt * 0.7)
    ctx.beginPath(); ctx.arc(t.x, t.y, Math.max(0.6, hw * 0.04), 0, Math.PI * 2); ctx.fill()
  }
}

// ── Power line tile renderer ───────────────────────────────────────────────────
export function drawPowerLineTile(
  ctx: Ctx2D,
  cx: number, cy: number, hw: number, hh: number, zoom: number,
): void {
  const sp = 0.82
  const poleH = hh * 1.5
  const poleW = Math.max(1.5, zoom * 1.0)

  ctx.strokeStyle = '#c8b840'
  ctx.lineWidth = Math.max(0.5, zoom * 0.35)
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(cx - hw * sp, cy + hh)
  ctx.lineTo(cx + hw * sp, cy + hh)
  ctx.moveTo(cx, cy + hh * (1 - sp * 0.9))
  ctx.lineTo(cx, cy + hh * (1 + sp * 0.9))
  ctx.stroke()

  ctx.strokeStyle = '#8a7a50'
  ctx.lineWidth = poleW
  ctx.beginPath()
  ctx.moveTo(cx, cy + hh)
  ctx.lineTo(cx, cy + hh - poleH)
  ctx.stroke()

  ctx.lineWidth = Math.max(0.8, zoom * 0.6)
  ctx.strokeStyle = '#7a6a40'
  ctx.beginPath()
  ctx.moveTo(cx - hw * 0.28, cy + hh - poleH * 0.82 + hh * 0.14)
  ctx.lineTo(cx + hw * 0.28, cy + hh - poleH * 0.82 - hh * 0.14)
  ctx.stroke()
}

// ── Specific-building renderer ────────────────────────────────────────────────
export function drawBuilding(
  ctx: Ctx2D,
  cx: number, cy: number, hw: number, hh: number,
  building: Building,
): void {
  switch (building) {

    case Building.PowerPlant: {
      // Coal plant: large gray complex with two tall stacks
      drawIsoBox(ctx, cx, cy, hw, hh, 0.84, hh * 2.0, '#5a5a5a', '#363636', '#484848')
      drawIsoBox(ctx, cx + hw * 0.18, cy + hh * 0.05, hw, hh, 0.38, hh * 1.4, '#636363', '#404040', '#525252')
      // Stacks with bands
      for (let k = 0; k < 2; k++) {
        const sx = k === 0 ? cx - hw * 0.26 : cx + hw * 0.10
        const sh = k === 0 ? hh * 2.8 : hh * 2.3
        const cw = Math.max(3, hw * 0.10)
        ctx.fillStyle = '#6e6e6e'
        ctx.fillRect(sx - cw / 2, cy - sh, cw, sh)
        // Band
        ctx.fillStyle = '#f0f0f0'
        ctx.fillRect(sx - cw * 0.75, cy - sh * 0.30, cw * 1.5, hh * 0.12)
        ctx.fillStyle = k === 0 ? '#ff8800' : '#ff6600'
        ctx.beginPath(); ctx.arc(sx, cy - sh, Math.max(2, cw * 0.8), 0, Math.PI * 2); ctx.fill()
      }
      break
    }

    case Building.GasTurbine: {
      drawIsoBox(ctx, cx, cy, hw, hh, 0.76, hh * 1.6, '#78787a', '#505055', '#646468')
      drawIsoBox(ctx, cx, cy - hh * 0.8, hw, hh, 0.44, hh * 0.7, '#909095', '#686870', '#7c7c82')
      const ew = Math.max(3, hw * 0.09)
      ctx.fillStyle = '#808085'
      ctx.fillRect(cx + hw * 0.08 - ew / 2, cy - hh * 2.0, ew, hh * 1.4)
      ctx.fillStyle = '#ffbb44'
      ctx.beginPath(); ctx.arc(cx + hw * 0.08, cy - hh * 2.0, Math.max(2, ew * 0.7), 0, Math.PI * 2); ctx.fill()
      break
    }

    case Building.Nuclear: {
      // Concrete base
      drawIsoBox(ctx, cx, cy, hw, hh, 0.88, hh * 1.4, '#d8d8d8', '#aaaaaa', '#c4c4c4')
      // Cooling tower dome (ellipse shape)
      const domeH = hh * 2.2, domeW = hw * 0.58
      ctx.fillStyle = '#e8e8e0'
      ctx.beginPath()
      ctx.ellipse(cx - hw * 0.1, cy + hh * 0.35 - domeH * 0.5, domeW, domeH * 0.5, 0, Math.PI, 0)
      ctx.closePath(); ctx.fill()
      // Shadow side of dome
      ctx.fillStyle = 'rgba(0,0,0,0.14)'
      ctx.beginPath()
      ctx.ellipse(cx - hw * 0.1 - domeW * 0.2, cy + hh * 0.35 - domeH * 0.4, domeW * 0.25, domeH * 0.45, 0, Math.PI, 0)
      ctx.closePath(); ctx.fill()
      // Steam vent at top
      ctx.fillStyle = 'rgba(240,240,255,0.40)'
      ctx.beginPath()
      ctx.ellipse(cx - hw * 0.1, cy + hh * 0.35 - domeH, domeW * 0.22, domeH * 0.10, 0, 0, Math.PI * 2)
      ctx.fill()
      // Containment tower
      drawIsoBox(ctx, cx + hw * 0.34, cy + hh * 0.12, hw, hh, 0.28, hh * 2.8, '#cccccc', '#999999', '#b8b8b8')
      break
    }

    case Building.SolarFarm: {
      drawIsoBox(ctx, cx, cy, hw, hh, 0.90, hh * 0.28, '#1a2a4a', '#101828', '#151f38')
      ctx.save()
      ctx.strokeStyle = 'rgba(60,100,180,0.55)'
      ctx.lineWidth = Math.max(0.5, hw * 0.018)
      const panelTop = cy + hh * (1 - 0.90) - hh * 0.28
      for (let i = 1; i < 4; i++) {
        const t = i / 4
        const lx = cx - hw * 0.90 * (1 - t * 0.5)
        const rx = cx + hw * 0.90 * (1 - t * 0.5)
        const ly = panelTop + t * hh * 0.90 * 0.5
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(rx, ly); ctx.stroke()
      }
      for (let i = 1; i < 4; i++) {
        const t = i / 4
        ctx.beginPath()
        ctx.moveTo(cx - hw * 0.90 * 0.5 + hw * 0.90 * t, panelTop + hh * 0.05)
        ctx.lineTo(cx - hw * 0.90 * 0.5 + hw * 0.90 * t + hw * 0.10, panelTop + hh * 0.45)
        ctx.stroke()
      }
      ctx.restore()
      // Panel sheen
      ctx.fillStyle = 'rgba(40,90,200,0.22)'
      ctx.beginPath()
      ctx.moveTo(cx, panelTop); ctx.lineTo(cx + hw * 0.90, cy + hh)
      ctx.lineTo(cx, panelTop + hh * 0.90); ctx.lineTo(cx - hw * 0.90, cy + hh)
      ctx.closePath(); ctx.fill()
      // Highlight glint
      ctx.fillStyle = 'rgba(200,230,255,0.18)'
      ctx.beginPath()
      ctx.moveTo(cx + hw * 0.15, panelTop + hh * 0.08)
      ctx.lineTo(cx + hw * 0.55, panelTop + hh * 0.28)
      ctx.lineTo(cx + hw * 0.40, panelTop + hh * 0.38)
      ctx.lineTo(cx + hw * 0.00, panelTop + hh * 0.18)
      ctx.closePath(); ctx.fill()
      break
    }

    case Building.WindTurbine: {
      const towerW = Math.max(2, hw * 0.08)
      const towerH = hh * 3.6
      // Tapered tower (wider at base)
      ctx.fillStyle = '#d4d4d4'
      ctx.beginPath()
      ctx.moveTo(cx - towerW, cy - towerH)
      ctx.lineTo(cx + towerW, cy - towerH)
      ctx.lineTo(cx + towerW * 2.0, cy + hh * 0.2)
      ctx.lineTo(cx - towerW * 2.0, cy + hh * 0.2)
      ctx.closePath(); ctx.fill()
      // Nacelle
      const nacW = hw * 0.22, nacH = hh * 0.38
      ctx.fillStyle = '#c8c8c8'
      ctx.fillRect(cx - nacW / 2, cy - towerH - nacH, nacW, nacH)
      ctx.fillStyle = '#b8b8b8'
      ctx.fillRect(cx - nacW / 2, cy - towerH - nacH, nacW, nacH * 0.35)
      // Hub and blades
      const hubX = cx + nacW * 0.30, hubY = cy - towerH - nacH * 0.50
      const bladeL = Math.max(5, hw * 0.58)
      ctx.strokeStyle = '#e8e8e8'
      ctx.lineWidth = Math.max(1.2, hw * 0.065)
      ctx.setLineDash([])
      for (let i = 0; i < 3; i++) {
        const ang = (i * Math.PI * 2) / 3 - Math.PI / 2
        ctx.beginPath()
        ctx.moveTo(hubX, hubY)
        ctx.quadraticCurveTo(
          hubX + Math.cos(ang) * bladeL * 0.5 + Math.sin(ang) * hw * 0.06,
          hubY + Math.sin(ang) * bladeL * 0.5 * 0.55,
          hubX + Math.cos(ang) * bladeL,
          hubY + Math.sin(ang) * bladeL * 0.55,
        )
        ctx.stroke()
      }
      ctx.fillStyle = '#a0a0a0'
      ctx.beginPath(); ctx.arc(hubX, hubY, Math.max(2, hw * 0.07), 0, Math.PI * 2); ctx.fill()
      break
    }

    case Building.WaterTower: {
      // Legs
      const legW = Math.max(1, hw * 0.055)
      ctx.strokeStyle = '#4a6028'
      ctx.lineWidth = legW
      for (const dx of [-hw * 0.18, hw * 0.18]) {
        ctx.beginPath()
        ctx.moveTo(cx + dx, cy + hh)
        ctx.lineTo(cx, cy - hh * 1.1)
        ctx.stroke()
      }
      // Tank body
      drawIsoBox(ctx, cx, cy - hh * 0.65, hw, hh, 0.52, hh * 1.10, '#4a90c4', '#2a6a9a', '#3a7eb2')
      // Tank dome top
      ctx.fillStyle = '#5aa8d8'
      ctx.beginPath()
      ctx.ellipse(cx, cy - hh * 0.65 + hh * (1 - 0.52) - hh * 1.10, hw * 0.52, hh * 0.35, 0, 0, Math.PI * 2)
      ctx.fill()
      // Water highlight
      ctx.fillStyle = 'rgba(140,200,255,0.30)'
      ctx.beginPath()
      ctx.ellipse(cx - hw * 0.12, cy - hh * 0.65 + hh * (1 - 0.52) - hh * 1.10 - hh * 0.14, hw * 0.22, hh * 0.16, -0.2, 0, Math.PI * 2)
      ctx.fill()
      break
    }

    case Building.WaterPump: {
      // Small pump house with a stubby intake pipe and a blue valve wheel.
      drawIsoBox(ctx, cx, cy, hw, hh, 0.58, hh * 0.85, '#6a7d8a', '#445660', '#566c78')
      // Intake pipe rising from the roof
      const pw = Math.max(2, hw * 0.10)
      ctx.fillStyle = '#3a7eb2'
      ctx.fillRect(cx - pw / 2, cy - hh * 0.95, pw, hh * 0.95)
      // Valve wheel
      ctx.strokeStyle = '#5aa8d8'; ctx.lineWidth = Math.max(1, hw * 0.04)
      ctx.beginPath(); ctx.arc(cx, cy - hh * 0.95, Math.max(2, hw * 0.12), 0, Math.PI * 2); ctx.stroke()
      break
    }

    case Building.PumpingStation: {
      // Large industrial water works: long hall flanked by two cylindrical tanks.
      drawIsoBox(ctx, cx, cy, hw, hh, 0.86, hh * 1.5, '#7d8a92', '#505c64', '#646e76')
      drawFloorLines(ctx, cx, cy, hw, hh, 0.86, hh * 1.5, 2)
      // Two water storage tanks on the roof
      for (const dx of [-hw * 0.30, hw * 0.34]) {
        const tcx = cx + dx, tcy = cy - hh * 0.55
        drawIsoBox(ctx, tcx, tcy, hw, hh, 0.30, hh * 1.0, '#4a90c4', '#2a6a9a', '#3a7eb2')
        ctx.fillStyle = '#5aa8d8'
        ctx.beginPath()
        ctx.ellipse(tcx, tcy + hh * (1 - 0.30) - hh * 1.0, hw * 0.30, hh * 0.20, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }

    case Building.PoliceStation: {
      drawIsoBox(ctx, cx, cy, hw, hh, 0.80, hh * 1.7, '#5566cc', '#2e3ea8', '#3e4ebc')
      drawFloorLines(ctx, cx, cy, hw, hh, 0.80, hh * 1.7, 2)
      drawDetailWindows(ctx, cx, cy, hw, hh, 0.80, hh * 1.7, 2, 2, 'rgba(200,220,255,0.68)', '#6070c8', 'south')
      // Flag pole
      const fx = cx - hw * 0.18, fy = cy - hh * 1.3
      ctx.strokeStyle = '#b0b0b0'; ctx.lineWidth = Math.max(0.8, hw * 0.025); ctx.setLineDash([])
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy + hh); ctx.stroke()
      ctx.fillStyle = '#2244ee'
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + hw * 0.32, fy + hh * 0.22); ctx.lineTo(fx, fy + hh * 0.44); ctx.closePath(); ctx.fill()
      // "POLICE" sign strip
      ctx.fillStyle = '#1a2888'
      ctx.fillRect(cx + hw * 0.05, cy + hh * 0.92, hw * 0.60, hh * 0.22)
      break
    }

    case Building.FireStation: {
      drawIsoBox(ctx, cx, cy, hw, hh, 0.80, hh * 1.7, '#dd3322', '#991100', '#cc2218')
      // Garage doors (2)
      for (let d = 0; d < 2; d++) {
        const u  = (d + 0.6) / 2.4
        const xD = cx + hw * 0.80 * (1 - u)
        const yD = cy + hh - hh * 1.7 + u * hh * 0.80
        const dW = Math.max(3, hw * 0.22), dH = Math.max(4, hh * 0.78)
        ctx.fillStyle = '#440600'
        ctx.fillRect(xD - dW / 2, yD + hh * 1.70 * 0.22, dW, dH)
        ctx.strokeStyle = '#880c08'; ctx.lineWidth = 0.6
        for (let p = 1; p < 4; p++) {
          ctx.beginPath(); ctx.moveTo(xD - dW / 2, yD + hh * 1.70 * 0.22 + dH * p / 4); ctx.lineTo(xD + dW / 2, yD + hh * 1.70 * 0.22 + dH * p / 4); ctx.stroke()
        }
      }
      break
    }

    case Building.Hospital: {
      drawIsoBox(ctx, cx, cy, hw, hh, 0.80, hh * 1.9, '#f0f0f0', '#c0c0c0', '#d8d8d8')
      drawFloorLines(ctx, cx, cy, hw, hh, 0.80, hh * 1.9, 3)
      drawDetailWindows(ctx, cx, cy, hw, hh, 0.80, hh * 1.9, 3, 3, 'rgba(180,220,255,0.72)', '#d8d8d8', 'south')
      drawDetailWindows(ctx, cx, cy, hw, hh, 0.80, hh * 1.9, 3, 3, 'rgba(180,220,255,0.65)', '#c8c8c8', 'west')
      // Red cross sign on roof
      const rcx = cx, rcy = cy - hh * 1.55
      const cs = Math.max(3, hw * 0.14)
      ctx.fillStyle = '#cc1111'
      ctx.fillRect(rcx - cs * 0.33, rcy - cs, cs * 0.66, cs * 2)
      ctx.fillRect(rcx - cs, rcy - cs * 0.33, cs * 2, cs * 0.66)
      break
    }

    case Building.School: {
      drawIsoBox(ctx, cx, cy, hw, hh, 0.84, hh * 1.5, '#e0c050', '#b08820', '#caa030')
      drawFloorLines(ctx, cx, cy, hw, hh, 0.84, hh * 1.5, 2)
      drawDetailWindows(ctx, cx, cy, hw, hh, 0.84, hh * 1.5, 3, 1, 'rgba(240,230,160,0.68)', '#c8a830', 'south')
      // Bell tower wing
      drawIsoBox(ctx, cx - hw * 0.25, cy - hh * 0.2, hw, hh, 0.17, hh * 2.2, '#ccaa38', '#9a7818', '#b89228')
      // Bell (small sphere at top of tower)
      ctx.fillStyle = '#c8a030'
      ctx.beginPath(); ctx.arc(cx - hw * 0.25, cy - hh * 0.2 + hh * (1 - 0.17) - hh * 2.2 - hh * 0.25, Math.max(2, hw * 0.08), 0, Math.PI * 2); ctx.fill()
      break
    }

    case Building.Library: {
      drawIsoBox(ctx, cx, cy, hw, hh, 0.76, hh * 1.6, '#d0b080', '#9a7050', '#b89068')
      drawFloorLines(ctx, cx, cy, hw, hh, 0.76, hh * 1.6, 2)
      drawDetailWindows(ctx, cx, cy, hw, hh, 0.76, hh * 1.6, 2, 2, 'rgba(230,210,160,0.62)', '#c0a070', 'south')
      // Columns (south face)
      const pw = Math.max(2, hw * 0.07)
      ctx.fillStyle = '#e0c898'
      for (const u of [0.22, 0.72]) {
        const xP = cx + hw * 0.76 * (1 - u)
        const yP = cy + hh - hh * 1.6 + u * hh * 0.76
        ctx.fillRect(xP - pw / 2, yP, pw, hh * 1.6)
        // Column cap
        ctx.fillRect(xP - pw, yP - 1.5, pw * 2, 2)
      }
      break
    }

    case Building.Park: {
      // Ground-level green space: a lawn diamond filling the tile, a light path
      // crossing it, and a cluster of small trees. (Drawn one tile wide; the
      // renderer scales it up to fill a multi-tile plot.)
      const top = { x: cx, y: cy }
      const rgt = { x: cx + hw, y: cy + hh }
      const bot = { x: cx, y: cy + hh * 2 }
      const lft = { x: cx - hw, y: cy + hh }
      // Lawn
      ctx.fillStyle = '#3f7d33'
      ctx.beginPath()
      ctx.moveTo(top.x, top.y); ctx.lineTo(rgt.x, rgt.y)
      ctx.lineTo(bot.x, bot.y); ctx.lineTo(lft.x, lft.y); ctx.closePath(); ctx.fill()
      // Lighter mowed highlight on the sunlit (east) half
      ctx.fillStyle = 'rgba(120,190,70,0.18)'
      ctx.beginPath()
      ctx.moveTo(top.x, top.y); ctx.lineTo(rgt.x, rgt.y)
      ctx.lineTo(bot.x, bot.y); ctx.closePath(); ctx.fill()
      // Crossing gravel path
      ctx.strokeStyle = '#c2b229'  // tan gravel
      ctx.lineWidth = Math.max(1.5, hw * 0.10)
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(cx - hw * 0.5, cy + hh * 0.5); ctx.lineTo(cx + hw * 0.5, cy + hh * 1.5)
      ctx.moveTo(cx + hw * 0.5, cy + hh * 0.5); ctx.lineTo(cx - hw * 0.5, cy + hh * 1.5)
      ctx.stroke()
      // Trees
      const tSize = Math.max(5, hw * 0.40)
      drawSmallTree(ctx, cx,              cy + hh * 0.95, tSize)
      drawSmallTree(ctx, cx - hw * 0.42,  cy + hh * 1.25, tSize * 0.85)
      drawSmallTree(ctx, cx + hw * 0.42,  cy + hh * 1.25, tSize * 0.85)
      drawSmallTree(ctx, cx,              cy + hh * 1.55, tSize * 0.9)
      break
    }

    case Building.Plaza: {
      // Paved civic plaza: stone diamond, a banded border and a central fountain.
      const top = { x: cx, y: cy }
      const rgt = { x: cx + hw, y: cy + hh }
      const bot = { x: cx, y: cy + hh * 2 }
      const lft = { x: cx - hw, y: cy + hh }
      ctx.fillStyle = '#b9b3a6'
      ctx.beginPath()
      ctx.moveTo(top.x, top.y); ctx.lineTo(rgt.x, rgt.y)
      ctx.lineTo(bot.x, bot.y); ctx.lineTo(lft.x, lft.y); ctx.closePath(); ctx.fill()
      // Inset paving band
      const s = 0.6
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'
      ctx.lineWidth = Math.max(0.8, hw * 0.03)
      ctx.beginPath()
      ctx.moveTo(cx, cy + hh * (1 - s)); ctx.lineTo(cx + hw * s, cy + hh)
      ctx.lineTo(cx, cy + hh * (1 + s)); ctx.lineTo(cx - hw * s, cy + hh); ctx.closePath(); ctx.stroke()
      // Fountain basin
      ctx.fillStyle = '#8f8a7e'
      ctx.beginPath(); ctx.ellipse(cx, cy + hh, hw * 0.30, hh * 0.30, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#4a90c4'
      ctx.beginPath(); ctx.ellipse(cx, cy + hh, hw * 0.20, hh * 0.20, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(180,220,255,0.55)'
      ctx.beginPath(); ctx.ellipse(cx - hw * 0.05, cy + hh * 0.93, hw * 0.07, hh * 0.07, 0, 0, Math.PI * 2); ctx.fill()
      // A pair of corner trees for greenery
      const tSize = Math.max(4, hw * 0.30)
      drawSmallTree(ctx, cx - hw * 0.55, cy + hh * 1.05, tSize)
      drawSmallTree(ctx, cx + hw * 0.55, cy + hh * 1.05, tSize)
      break
    }
  }
}

// ── Main draw pass ────────────────────────────────────────────────────────────

export function drawTiles(
  ctx: Ctx2D,
  world: World,
  camera: IsoCamera,
  canvasW: number,
  canvasH: number,
  sprites: SpriteSheet,
): void {
  const { hw, hh, zoom, panX, panY } = camera
  const eh = ELEV_H * zoom

  const dMin = Math.max(0, Math.floor(-panY / hh) - 1)
  const dMax = Math.min(
    world.cols + world.rows - 2,
    Math.ceil((canvasH - panY) / hh) + 1 + ELEV_PAD)
  const offsetMin = Math.floor(-panX / hw) - 1
  const offsetMax = Math.ceil((canvasW - panX) / hw) + 1

  const gridX: number[] = [], gridY: number[] = []
  const vacantZ = new Map<Zone, [number, number][]>()

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
      const cx = (col - row) * hw + panX
      const cy = (col + row) * hh - tile.elevation * eh + panY

      if (tile.elevation > 0) drawElevationSides(ctx, cx, cy, hw, hh, eh)

      const bitmap = sprites.get(tile.terrain, zoom, col, row)
      if (bitmap) ctx.drawImage(bitmap, cx - hw, cy)
      else drawDiamond(ctx, cx, cy, hw, hh, terrainColor(tile.terrain))

      if (tile.overlay & Overlay.Road) {
        let mask = 0
        if (row > 0             && world.get(col, row - 1).overlay & Overlay.Road) mask |= 1
        if (col < world.cols-1  && world.get(col + 1, row).overlay & Overlay.Road) mask |= 2
        if (row < world.rows-1  && world.get(col, row + 1).overlay & Overlay.Road) mask |= 4
        if (col > 0             && world.get(col - 1, row).overlay & Overlay.Road) mask |= 8
        drawRoadTile(ctx, cx, cy, hw, hh, mask, zoom)
      }

      if (tile.overlay & Overlay.PowerLine) {
        drawPowerLineTile(ctx, cx, cy, hw, hh, zoom)
      }

      if (tile.zone !== Zone.None) {
        if (tile.density === 0) {
          if (!vacantZ.has(tile.zone)) vacantZ.set(tile.zone, [])
          vacantZ.get(tile.zone)!.push([cx, cy])
        } else {
          drawZoneBuilding(ctx, cx, cy, hw, hh, tile.zone, tile.density)
        }
      }

      if (tile.building !== Building.None) drawBuilding(ctx, cx, cy, hw, hh, tile.building)

      if (zoom >= 1) { gridX.push(cx); gridY.push(cy) }
    }
  }

  if (zoom >= 1 && gridX.length > 0) {
    ctx.beginPath()
    for (let i = 0; i < gridX.length; i++) {
      const cx = gridX[i], cy = gridY[i]
      ctx.moveTo(cx,      cy);        ctx.lineTo(cx + hw, cy + hh)
      ctx.lineTo(cx,      cy + hh * 2); ctx.lineTo(cx - hw, cy + hh)
      ctx.closePath()
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.07)'
    ctx.lineWidth   = 0.5
    ctx.stroke()
  }

  const outlineW = Math.max(1, zoom * 1.5)
  for (const [zone, pts] of vacantZ) {
    ctx.beginPath()
    for (const [cx, cy] of pts) {
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
}
