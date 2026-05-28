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
// s = footprint scale (0..1 of tile half-dims); h = height in px above surface
// Ground equator = (cx, cy+hh); tile apex = (cx, cy)
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

// ── Window grid on a building face ────────────────────────────────────────────
// South face: at horiz param u (0=right, 1=left), vert param v (0=top, 1=bottom):
//   x = cx + hw*s*(1-u),  y = (cy+hh-h) + u*hh*s + v*h
// West face mirrors u.
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

// ── Horizontal floor-divider lines on building faces ──────────────────────────
// At height fraction v (0=top, 1=bottom):
//   south right edge x = cx+hw*s,  y = cy+hh - h*(1-v)
//   south left  edge x = cx,       y = cy+hh*(1+s) - h*(1-v)
//   west  left  edge x = cx-hw*s,  y = cy+hh - h*(1-v)
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
    const yR = cy + hh - h * (1 - v)           // right column y
    const yL = cy + hh * (1 + s) - h * (1 - v) // left column y
    ctx.beginPath()
    ctx.moveTo(cx + hw * s, yR); ctx.lineTo(cx,        yL); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx,           yL); ctx.lineTo(cx - hw * s, yR); ctx.stroke()
  }
}

// ── Zone building renderer ─────────────────────────────────────────────────────
export function drawZoneBuilding(
  ctx: Ctx2D,
  cx: number, cy: number, hw: number, hh: number,
  zone: Zone, density: number,
): void {
  const bucket = density <= 2 ? 0 : density <= 5 ? 1 : 2

  if (zone === Zone.Residential) {
    const configs = [
      { s: 0.52, h: hh * 1.0, top: '#7acc5a', south: '#4a8030', west: '#5a9a3c', floors: 1 },
      { s: 0.72, h: hh * 2.2, top: '#c8b890', south: '#7a6040', west: '#9a7850', floors: 3 },
      { s: 0.80, h: hh * 3.8, top: '#d8c8a0', south: '#886848', west: '#a88058', floors: 5 },
    ]
    const { s, h, top, south, west, floors } = configs[bucket]
    drawIsoBox(ctx, cx, cy, hw, hh, s, h, top, south, west)
    drawFloorLines(ctx, cx, cy, hw, hh, s, h, floors)
    if (bucket === 0) {
      // Peaked roof
      const roofY = cy + hh * (1 - s) - h
      ctx.fillStyle = '#8b3a2a'
      ctx.beginPath()
      ctx.moveTo(cx - hw * s * 0.82, cy + hh - h)   // west base
      ctx.lineTo(cx, roofY - hh * 0.55)             // peak
      ctx.lineTo(cx + hw * s * 0.82, cy + hh - h)   // east base
      ctx.closePath(); ctx.fill()
      // Roof shadow side
      ctx.fillStyle = '#5a2018'
      ctx.beginPath()
      ctx.moveTo(cx, roofY - hh * 0.55)
      ctx.lineTo(cx + hw * s * 0.82, cy + hh - h)
      ctx.lineTo(cx, cy + hh * (1 - s) - h)
      ctx.closePath(); ctx.fill()
    }
    if (bucket >= 1) {
      const winC = 'rgba(220,240,180,0.70)'
      drawWindows(ctx, cx, cy, hw, hh, s, h, bucket + 1, floors, winC, 'south')
      drawWindows(ctx, cx, cy, hw, hh, s, h, bucket + 1, floors, winC, 'west')
    }
  } else if (zone === Zone.Commercial) {
    const configs = [
      { s: 0.70, h: hh * 1.8, top: '#ccd8ee', south: '#3858c0', west: '#4068d0', floors: 2 },
      { s: 0.68, h: hh * 3.6, top: '#a8bce0', south: '#1c3aaa', west: '#2848b8', floors: 5 },
      { s: 0.70, h: hh * 6.2, top: '#88aad8', south: '#0e2890', west: '#1838a0', floors: 8 },
    ]
    const { s, h, top, south, west, floors } = configs[bucket]
    drawIsoBox(ctx, cx, cy, hw, hh, s, h, top, south, west)
    drawFloorLines(ctx, cx, cy, hw, hh, s, h, floors, 'rgba(160,200,255,0.20)')
    const winC = bucket === 2 ? 'rgba(160,220,255,0.80)' : 'rgba(200,230,255,0.70)'
    const wCols = bucket === 0 ? 2 : 3
    drawWindows(ctx, cx, cy, hw, hh, s, h, wCols, floors, winC, 'south')
    drawWindows(ctx, cx, cy, hw, hh, s, h, wCols, floors, winC, 'west')
    if (bucket === 2) {
      // Antenna
      ctx.strokeStyle = '#aaaaaa'
      ctx.lineWidth = Math.max(0.7, hw * 0.022)
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(cx, cy + hh * (1 - s) - h)
      ctx.lineTo(cx, cy + hh * (1 - s) - h - hh * 1.1)
      ctx.stroke()
    }
  } else {
    // Industrial
    const configs = [
      { s: 0.85, h: hh * 1.0, top: '#a09060', south: '#5a4818', west: '#706030', floors: 1 },
      { s: 0.88, h: hh * 1.6, top: '#888070', south: '#484030', west: '#605848', floors: 2 },
      { s: 0.88, h: hh * 2.2, top: '#707060', south: '#383020', west: '#504838', floors: 3 },
    ]
    const { s, h, top, south, west, floors } = configs[bucket]
    drawIsoBox(ctx, cx, cy, hw, hh, s, h, top, south, west)
    drawFloorLines(ctx, cx, cy, hw, hh, s, h, floors, 'rgba(255,255,200,0.12)')
    // Loading dock doors
    ctx.fillStyle = '#1a1610'
    const doorW = Math.max(2, hw * 0.14)
    const doorH = Math.max(3, hh * 0.55)
    for (let d = 0; d < bucket + 1; d++) {
      const u = (d + 0.5) / (bucket + 1)
      const xD = cx + hw * s * (1 - u)
      const yD = cy + hh * (1 + s) - h * 0.01 + u * hh * s - doorH
      ctx.fillRect(xD - doorW / 2, yD, doorW, doorH)
    }
    if (bucket >= 1) {
      // Smokestack
      const cw = Math.max(2, hw * 0.09)
      ctx.fillStyle = '#666'
      ctx.fillRect(cx + hw * s * 0.55 - cw / 2, cy + hh * (1 - s) - h - hh * 1.2, cw, hh * 1.2)
      ctx.fillStyle = '#888'
      ctx.beginPath()
      ctx.arc(cx + hw * s * 0.55, cy + hh * (1 - s) - h - hh * 1.2, cw * 0.9, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// ── Road tile renderer ────────────────────────────────────────────────────────
// SC=1.0 makes sidewalk tiles tessellate with no gaps.
// Center lines use tile boundary midpoints so they actually connect across tiles.
export function drawRoadTile(
  ctx: Ctx2D,
  cx: number, cy: number, hw: number, hh: number,
  mask: number, zoom: number,
): void {
  const SC = 1.00  // full tile — no gaps between adjacent road tiles
  const RS = 0.52  // asphalt surface (narrower center strip)

  // Sidewalk (full tile diamond)
  ctx.fillStyle = '#b0a898'
  ctx.beginPath()
  ctx.moveTo(cx,        cy + hh * (1 - SC))
  ctx.lineTo(cx + hw,   cy + hh)
  ctx.lineTo(cx,        cy + hh * (1 + SC))
  ctx.lineTo(cx - hw,   cy + hh)
  ctx.closePath(); ctx.fill()

  // Asphalt center
  ctx.fillStyle = '#484848'
  ctx.beginPath()
  ctx.moveTo(cx,           cy + hh * (1 - RS))
  ctx.lineTo(cx + hw * RS, cy + hh)
  ctx.lineTo(cx,           cy + hh * (1 + RS))
  ctx.lineTo(cx - hw * RS, cy + hh)
  ctx.closePath(); ctx.fill()

  // Center lines — endpoints at tile boundary midpoints so they meet exactly
  // Boundary midpoints:
  //   N (shared with row-1 tile): (cx+hw/2, cy+hh/2)
  //   S (shared with row+1 tile): (cx-hw/2, cy+3hh/2)
  //   E (shared with col+1 tile): (cx+hw/2, cy+3hh/2)
  //   W (shared with col-1 tile): (cx-hw/2, cy+hh/2)
  const hasN = !!(mask & 1), hasE = !!(mask & 2)
  const hasS = !!(mask & 4), hasW = !!(mask & 8)
  const cenX = cx, cenY = cy + hh
  const nX = cx + hw / 2, nY = cy + hh / 2
  const sX = cx - hw / 2, sY = cy + hh * 1.5
  const eX = cx + hw / 2, eY = cy + hh * 1.5
  const wX = cx - hw / 2, wY = cy + hh / 2

  const dashL = Math.max(2, hw * 0.10)
  const gapL  = Math.max(2, hw * 0.08)
  ctx.strokeStyle = '#ffee22'
  ctx.lineWidth   = Math.max(0.7, zoom * 0.55)
  ctx.setLineDash([dashL, gapL])

  // N–S axis (row direction)
  if (hasN || hasS) {
    ctx.beginPath()
    ctx.moveTo(hasN ? nX : cenX, hasN ? nY : cenY)
    ctx.lineTo(hasS ? sX : cenX, hasS ? sY : cenY)
    ctx.stroke()
  }
  // E–W axis (col direction)
  if (hasE || hasW) {
    ctx.beginPath()
    ctx.moveTo(hasW ? wX : cenX, hasW ? wY : cenY)
    ctx.lineTo(hasE ? eX : cenX, hasE ? eY : cenY)
    ctx.stroke()
  }
  if (mask === 0) {
    ctx.beginPath()
    ctx.moveTo(nX, nY); ctx.lineTo(sX, sY)
    ctx.moveTo(wX, wY); ctx.lineTo(eX, eY)
    ctx.stroke()
  }
  ctx.setLineDash([])
}

// ── Power line tile renderer ───────────────────────────────────────────────────
export function drawPowerLineTile(
  ctx: Ctx2D,
  cx: number, cy: number, hw: number, hh: number, zoom: number,
): void {
  const sp = 0.82
  const poleH = hh * 1.5
  const poleW = Math.max(1.5, zoom * 1.0)

  // Ground wires (X at equator)
  ctx.strokeStyle = '#c8b840'
  ctx.lineWidth = Math.max(0.5, zoom * 0.35)
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(cx - hw * sp, cy + hh)
  ctx.lineTo(cx + hw * sp, cy + hh)
  ctx.moveTo(cx, cy + hh * (1 - sp * 0.9))
  ctx.lineTo(cx, cy + hh * (1 + sp * 0.9))
  ctx.stroke()

  // Pole (vertical, rises above tile)
  ctx.strokeStyle = '#8a7a50'
  ctx.lineWidth = poleW
  ctx.beginPath()
  ctx.moveTo(cx, cy + hh)
  ctx.lineTo(cx, cy + hh - poleH)
  ctx.stroke()

  // Crossbar
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
      drawIsoBox(ctx, cx, cy, hw, hh, 0.84, hh * 2.0, '#5a5a5a', '#363636', '#484848')
      drawIsoBox(ctx, cx + hw * 0.18, cy + hh * 0.05, hw, hh, 0.38, hh * 1.4, '#636363', '#404040', '#525252')
      const cw = Math.max(3, hw * 0.10)
      ctx.fillStyle = '#6e6e6e'
      ctx.fillRect(cx - hw * 0.26 - cw / 2, cy - hh * 2.8, cw, hh * 2.8)
      ctx.fillRect(cx + hw * 0.10 - cw / 2, cy - hh * 2.3, cw, hh * 2.3)
      ctx.fillStyle = '#ff8800'
      ctx.beginPath(); ctx.arc(cx - hw * 0.26, cy - hh * 2.8, Math.max(2, cw * 0.8), 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#ff6600'
      ctx.beginPath(); ctx.arc(cx + hw * 0.10, cy - hh * 2.3, Math.max(2, cw * 0.65), 0, Math.PI * 2); ctx.fill()
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
      drawIsoBox(ctx, cx, cy, hw, hh, 0.88, hh * 1.4, '#d8d8d8', '#aaaaaa', '#c4c4c4')
      const domeH = hh * 2.2
      const domeW = hw * 0.58
      ctx.fillStyle = '#e8e8e0'
      ctx.beginPath()
      ctx.ellipse(cx - hw * 0.1, cy + hh * 0.35 - domeH * 0.5, domeW, domeH * 0.5, 0, Math.PI, 0)
      ctx.closePath(); ctx.fill()
      ctx.fillStyle = 'rgba(0,0,0,0.10)'
      ctx.beginPath()
      ctx.ellipse(cx - hw * 0.1 - domeW * 0.2, cy + hh * 0.35 - domeH * 0.4, domeW * 0.25, domeH * 0.45, 0, Math.PI, 0)
      ctx.closePath(); ctx.fill()
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
      ctx.fillStyle = 'rgba(30,80,180,0.18)'
      ctx.beginPath()
      ctx.moveTo(cx, panelTop); ctx.lineTo(cx + hw * 0.90, cy + hh)
      ctx.lineTo(cx, panelTop + hh * 0.90); ctx.lineTo(cx - hw * 0.90, cy + hh)
      ctx.closePath(); ctx.fill()
      break
    }

    case Building.WindTurbine: {
      const towerW = Math.max(2, hw * 0.08)
      const towerH = hh * 3.6
      ctx.fillStyle = '#d0d0d0'
      ctx.fillRect(cx - towerW / 2, cy - towerH, towerW, towerH + hh * 0.2)
      const nacW = hw * 0.22, nacH = hh * 0.35
      ctx.fillStyle = '#c8c8c8'
      ctx.fillRect(cx - nacW / 2, cy - towerH - nacH, nacW, nacH)
      const hubX = cx + nacW * 0.3, hubY = cy - towerH - nacH * 0.5
      const bladeL = Math.max(4, hw * 0.55)
      ctx.strokeStyle = '#e0e0e0'
      ctx.lineWidth = Math.max(1, hw * 0.06)
      for (let i = 0; i < 3; i++) {
        const ang = (i * Math.PI * 2) / 3 - Math.PI / 2
        ctx.beginPath()
        ctx.moveTo(hubX, hubY)
        ctx.lineTo(hubX + Math.cos(ang) * bladeL, hubY + Math.sin(ang) * bladeL * 0.55)
        ctx.stroke()
      }
      ctx.fillStyle = '#aaa'
      ctx.beginPath(); ctx.arc(hubX, hubY, Math.max(2, hw * 0.06), 0, Math.PI * 2); ctx.fill()
      break
    }

    case Building.WaterTower: {
      drawIsoBox(ctx, cx, cy, hw, hh, 0.16, hh * 1.9, '#4a6a3a', '#2d4a22', '#3a5a2e')
      drawIsoBox(ctx, cx, cy - hh * 0.75, hw, hh, 0.54, hh * 1.05, '#4a90c4', '#2a6a9a', '#3a7eb2')
      break
    }
    case Building.PoliceStation: {
      drawIsoBox(ctx, cx, cy, hw, hh, 0.80, hh * 1.7, '#5566cc', '#2e3ea8', '#3e4ebc')
      drawFloorLines(ctx, cx, cy, hw, hh, 0.80, hh * 1.7, 2)
      drawWindows(ctx, cx, cy, hw, hh, 0.80, hh * 1.7, 2, 2, 'rgba(200,220,255,0.65)', 'south')
      const fx = cx - hw * 0.18, fy = cy - hh * 1.3
      ctx.strokeStyle = '#b0b0b0'; ctx.lineWidth = Math.max(0.8, hw * 0.025); ctx.setLineDash([])
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy + hh); ctx.stroke()
      ctx.fillStyle = '#2244ee'
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + hw * 0.32, fy + hh * 0.22); ctx.lineTo(fx, fy + hh * 0.44); ctx.closePath(); ctx.fill()
      break
    }
    case Building.FireStation: {
      drawIsoBox(ctx, cx, cy, hw, hh, 0.80, hh * 1.7, '#dd3322', '#991100', '#cc2218')
      ctx.fillStyle = '#440600'
      ctx.fillRect(cx + hw * 0.08, cy + hh * 0.44, hw * 0.28, hh * 0.64)
      ctx.fillRect(cx + hw * 0.44, cy + hh * 0.50, hw * 0.22, hh * 0.56)
      break
    }
    case Building.Hospital: {
      drawIsoBox(ctx, cx, cy, hw, hh, 0.80, hh * 1.9, '#f0f0f0', '#c0c0c0', '#d8d8d8')
      drawFloorLines(ctx, cx, cy, hw, hh, 0.80, hh * 1.9, 3)
      drawWindows(ctx, cx, cy, hw, hh, 0.80, hh * 1.9, 3, 3, 'rgba(180,220,255,0.72)', 'south')
      drawWindows(ctx, cx, cy, hw, hh, 0.80, hh * 1.9, 3, 3, 'rgba(180,220,255,0.72)', 'west')
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
      drawWindows(ctx, cx, cy, hw, hh, 0.84, hh * 1.5, 3, 1, 'rgba(240,230,160,0.65)', 'south')
      drawIsoBox(ctx, cx - hw * 0.25, cy - hh * 0.2, hw, hh, 0.17, hh * 2.2, '#ccaa38', '#9a7818', '#b89228')
      break
    }
    case Building.Library: {
      drawIsoBox(ctx, cx, cy, hw, hh, 0.76, hh * 1.6, '#d0b080', '#9a7050', '#b89068')
      drawFloorLines(ctx, cx, cy, hw, hh, 0.76, hh * 1.6, 2)
      drawWindows(ctx, cx, cy, hw, hh, 0.76, hh * 1.6, 2, 2, 'rgba(230,210,160,0.60)', 'south')
      const pw = Math.max(2, hw * 0.07)
      ctx.fillStyle = '#e0c898'
      for (const px of [cx + hw * 0.18, cx + hw * 0.52]) {
        ctx.fillRect(px, cy + hh * 0.26, pw, hh * 1.0)
      }
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

  // Batch collectors (grid outline + vacant zones only — roads/power are inline)
  const gridX: number[] = [], gridY: number[] = []
  const vacantZ = new Map<Zone, [number, number][]>()

  // ── Pass 1: terrain → road → power line → buildings (correct Z-order) ────────
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

      // 1. Elevation sides
      if (tile.elevation > 0) drawElevationSides(ctx, cx, cy, hw, hh, eh)

      // 2. Terrain
      const bitmap = sprites.get(tile.terrain, zoom, col, row)
      if (bitmap) ctx.drawImage(bitmap, cx - hw, cy)
      else drawDiamond(ctx, cx, cy, hw, hh, terrainColor(tile.terrain))

      // 3. Road (inline — before buildings so it doesn't float above them)
      if (tile.overlay & Overlay.Road) {
        let mask = 0
        if (row > 0             && world.get(col, row - 1).overlay & Overlay.Road) mask |= 1
        if (col < world.cols-1  && world.get(col + 1, row).overlay & Overlay.Road) mask |= 2
        if (row < world.rows-1  && world.get(col, row + 1).overlay & Overlay.Road) mask |= 4
        if (col > 0             && world.get(col - 1, row).overlay & Overlay.Road) mask |= 8
        drawRoadTile(ctx, cx, cy, hw, hh, mask, zoom)
      }

      // 4. Power line (inline — before buildings, after road)
      if (tile.overlay & Overlay.PowerLine) {
        drawPowerLineTile(ctx, cx, cy, hw, hh, zoom)
      }

      // 5. Zone buildings (inline for correct Z-order)
      if (tile.zone !== Zone.None) {
        if (tile.density === 0) {
          if (!vacantZ.has(tile.zone)) vacantZ.set(tile.zone, [])
          vacantZ.get(tile.zone)!.push([cx, cy])
        } else {
          drawZoneBuilding(ctx, cx, cy, hw, hh, tile.zone, tile.density)
        }
      }

      // 6. Specific placed buildings
      if (tile.building !== Building.None) drawBuilding(ctx, cx, cy, hw, hh, tile.building)

      // Collect grid outline data
      if (zoom >= 1) { gridX.push(cx); gridY.push(cy) }
    }
  }

  // ── Pass 2: UI overlays only ──────────────────────────────────────────────

  // Tile grid outlines
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

  // Vacant zone outlines
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
