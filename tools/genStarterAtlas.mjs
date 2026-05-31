/**
 * genStarterAtlas.mjs — generates the first building sprite atlas as real PNG
 * resource files, so the game renders buildings from files (not the runtime
 * procedural baker) out of the box, including multi-tile lots.
 *
 * This is a *content* tool, not runtime code: it draws improved isometric
 * buildings with @napi-rs/canvas and packs them into:
 *     public/sprites/atlas.png
 *     public/sprites/manifest.json
 *
 * Every sprite here can be replaced, key-for-key, by a Blender render or a CC0
 * pack frame via `buildAtlas.mjs` — the runtime never changes. See tools/README.md.
 *
 * Geometry contract (must match the in-game iso: TILE_W=64, TILE_H=32):
 *   - one tile is 64px wide / 32px tall (HW=32, HH=16) → 2:1 dimetric
 *   - (anchorX, anchorY) is the pixel that sits on the NORTH apex of the plot's
 *     origin tile — the exact point renderer.ts places the sprite at.
 *
 * Run:  node tools/genStarterAtlas.mjs   (or `pnpm gen:atlas`)
 */

import { createCanvas } from '@napi-rs/canvas'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HW = 32, HH = 16          // half tile width/height at zoom 1
const TILE_PX = 64
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/sprites')

// ── A single building canvas in plot-diamond space ──────────────────────────
// We draw in (i,j) tile coordinates where i grows toward screen-east and j
// toward screen-south. iso(i, j, h) → pixel in the frame, h = height above ground.

function makeSprite(fw, fh, wallH, draw) {
  // Frame spans the full plot diamond plus the building height above the north apex.
  const frameW = (fw + fh) * HW
  const frameH = wallH + (fw + fh) * HH
  const anchorX = fh * HW
  const anchorY = wallH
  const canvas = createCanvas(frameW, frameH)
  const ctx = canvas.getContext('2d')
  const iso = (i, j, h = 0) => ({ x: anchorX + (i - j) * HW, y: anchorY + (i + j) * HH - h })
  draw(ctx, iso, fw, fh, wallH)
  return { canvas, frameW, frameH, anchorX, anchorY, fw, fh }
}

function poly(ctx, pts, fill) {
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
}

// Ground lawn/plot tint (full plot diamond), with a soft drop shadow first.
function drawGround(ctx, iso, fw, fh, color) {
  // Drop shadow, offset toward screen-south-east.
  poly(ctx, [iso(0.15, 0.15), iso(fw + 0.25, 0.15), iso(fw + 0.25, fh + 0.25), iso(0.15, fh + 0.25)],
    'rgba(0,0,0,0.18)')
  if (color) poly(ctx, [iso(0, 0), iso(fw, 0), iso(fw, fh), iso(0, fh)], color)
}

// Extruded box from footprint rect [x0,y0]-[x1,y1] (tile space) up to height h.
function drawBox(ctx, iso, x0, y0, x1, y1, h, faces) {
  const a = iso(x0, y0, 0), b = iso(x1, y0, 0), c = iso(x1, y1, 0), d = iso(x0, y1, 0)
  const at = iso(x0, y0, h), bt = iso(x1, y0, h), ct = iso(x1, y1, h), dt = iso(x0, y1, h)
  // SW wall (left, darkest), SE wall (right, medium), then top (lightest).
  poly(ctx, [d, c, ct, dt], faces.sw)
  poly(ctx, [b, c, ct, bt], faces.se)
  poly(ctx, [at, bt, ct, dt], faces.top)
  return { a, b, c, d, at, bt, ct, dt }
}

// Window grid on the SE and SW walls.
function drawWindows(ctx, iso, x0, y0, x1, y1, h, opts) {
  const { cols, rows, glass, frame } = opts
  const faceH = h * 0.82
  const yBase = h * 0.10
  for (const wall of ['se', 'sw']) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const u = (c + 0.5) / cols
        const v = (r + 0.5) / rows
        const hh = yBase + v * faceH
        let p
        if (wall === 'se') p = iso(x1, y0 + (y1 - y0) * u, hh)
        else               p = iso(x0 + (x1 - x0) * u, y1, hh)
        const ww = ((wall === 'se' ? (y1 - y0) : (x1 - x0)) / cols) * HW * 0.5
        const wv = (faceH / rows) * 0.5
        ctx.fillStyle = frame
        ctx.fillRect(p.x - ww / 2 - 1, p.y - wv / 2 - 1, ww + 2, wv + 2)
        ctx.fillStyle = glass
        ctx.fillRect(p.x - ww / 2, p.y - wv / 2, ww, wv)
      }
    }
  }
}

function drawTree(ctx, iso, i, j) {
  const base = iso(i, j, 0)
  const r = 7
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath(); ctx.ellipse(base.x + 2, base.y, r * 0.9, r * 0.4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#2f5d1f'
  ctx.beginPath(); ctx.arc(base.x, base.y - r, r, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#3f7a2a'
  ctx.beginPath(); ctx.arc(base.x - 2, base.y - r - 2, r * 0.7, 0, Math.PI * 2); ctx.fill()
}

// ── Palettes ────────────────────────────────────────────────────────────────
const PAL = {
  // [top, se, sw]
  rWarm:  { top: '#e6d4a6', se: '#cdb579', sw: '#a8915c', roof: '#8a3b28', roofSw: '#6d2f20' },
  rBlue:  { top: '#cdd8de', se: '#a9bac4', sw: '#86949f', roof: '#43536f', roofSw: '#33415a' },
  rBrick: { top: '#d8b27e', se: '#bd9462', sw: '#96714a', roof: '#7a4a2a', roofSw: '#5e3920' },
  cWhite: { top: '#eef0f2', se: '#cdd2d8', sw: '#a7adb6' },
  cGlass: { top: '#bcd6f2', se: '#5f9ad6', sw: '#3f74b4' },
  cBlue:  { top: '#b7c6d2', se: '#7e94a6', sw: '#5e7384' },
  iMetal: { top: '#9aa09a', se: '#7c827c', sw: '#5b605b' },
  iDark:  { top: '#7b7468', se: '#5b554b', sw: '#403b33' },
}

const GLASS = 'rgba(180,222,255,0.85)'
const GLASS_D = 'rgba(150,200,245,0.78)'

// ── Per-key drawing routines ─────────────────────────────────────────────────
// Each returns a sprite via makeSprite. Heights scale with bucket.

function houseLot(pal, fw, fh) {
  const wallH = 22
  return makeSprite(fw, fh, wallH + 26, (ctx, iso) => {
    drawGround(ctx, iso, fw, fh, '#4e7a32')
    const m = 0.22
    drawBox(ctx, iso, m, m, fw - m, fh - m, wallH, pal)
    drawWindows(ctx, iso, m, m, fw - m, fh - m, wallH, { cols: Math.max(1, fw), rows: 1, glass: GLASS, frame: '#efe6cf' })
    // Hip roof
    const ridge = wallH + 18
    const a = iso(m, m, wallH), b = iso(fw - m, m, wallH), c = iso(fw - m, fh - m, wallH), d = iso(m, fh - m, wallH)
    const rE = iso((fw) / 2 + 0.12, fh / 2, ridge)
    const rW = iso((fw) / 2 - 0.12, fh / 2, ridge)
    poly(ctx, [b, c, rW, rE], pal.roof)
    poly(ctx, [d, c, rW], pal.roofSw)
    poly(ctx, [a, b, rE, rW], pal.roof)
    void d
    // Trees on the lawn margin
    drawTree(ctx, iso, fw - 0.12, 0.12)
    if (fw >= 2) drawTree(ctx, iso, 0.12, fh - 0.12)
  })
}

function blockLot(pal, fw, fh, floors, wallH, opts = {}) {
  return makeSprite(fw, fh, wallH + 6, (ctx, iso) => {
    drawGround(ctx, iso, fw, fh, opts.ground ?? '#6a6a66')
    const m = opts.margin ?? 0.08
    drawBox(ctx, iso, m, m, fw - m, fh - m, wallH, pal)
    drawWindows(ctx, iso, m, m, fw - m, fh - m, wallH,
      { cols: Math.max(2, fw * 2), rows: floors, glass: opts.glass ?? GLASS, frame: opts.frame ?? '#9aa3ad' })
    // Parapet cap
    const cap = wallH + 3
    const at = iso(m, m, cap), bt = iso(fw - m, m, cap), ct = iso(fw - m, fh - m, cap), dt = iso(m, fh - m, cap)
    poly(ctx, [at, bt, ct, dt], pal.top)
  })
}

function towerLot(pal, fw, fh, floors, wallH) {
  return makeSprite(fw, fh, wallH + 16, (ctx, iso) => {
    drawGround(ctx, iso, fw, fh, '#6a6a66')
    const m = 0.12
    drawBox(ctx, iso, m, m, fw - m, fh - m, wallH, pal)
    drawWindows(ctx, iso, m, m, fw - m, fh - m, wallH,
      { cols: Math.max(3, fw * 3), rows: floors, glass: GLASS, frame: 'rgba(40,70,120,0.55)' })
    // Stepped crown
    const c2 = m + 0.12
    drawBox(ctx, iso, c2, c2, fw - c2, fh - c2, wallH + 12, pal)
    // Antenna
    const tip = iso(fw / 2, fh / 2, wallH + 14)
    ctx.strokeStyle = '#9fb6cc'; ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x, tip.y - 14); ctx.stroke()
    ctx.fillStyle = '#ffcc44'; ctx.beginPath(); ctx.arc(tip.x, tip.y - 14, 1.6, 0, Math.PI * 2); ctx.fill()
  })
}

function civic(pal, fw, fh, wallH, floors, sign) {
  return makeSprite(fw, fh, wallH + 8, (ctx, iso) => {
    drawGround(ctx, iso, fw, fh, '#7a7d72')
    const m = 0.16
    drawBox(ctx, iso, m, m, fw - m, fh - m, wallH, pal)
    drawWindows(ctx, iso, m, m, fw - m, fh - m, wallH, { cols: fw, rows: floors, glass: GLASS, frame: pal.top })
    if (sign) {
      const p = iso(fw / 2, m, wallH * 0.5)
      ctx.fillStyle = sign
      ctx.fillRect(p.x - fw * 5, p.y - 4, fw * 10, 6)
    }
  })
}

// ── Build the sprite list ─────────────────────────────────────────────────────
// keys: z:{zone}:{bucket}:{variant}  (zone 1=R 2=C 3=I; bucket 0/1/2)
//       b:{building}                  (matches Building enum + BUILDING_FOOTPRINT)

const sprites = [] // { key, sprite }
const push = (key, sprite) => sprites.push({ key, sprite })

// Residential — low bucket: 1×1 & 2×2 houses, 3×3 estate (suburban variety)
push('z:1:0:0', houseLot(PAL.rWarm, 1, 1))
push('z:1:0:1', houseLot(PAL.rBlue, 1, 1))
push('z:1:0:2', houseLot(PAL.rWarm, 2, 2))
push('z:1:0:3', houseLot(PAL.rBlue, 3, 3))
// Residential — mid: walk-ups (2×2) and a 1×1
push('z:1:1:0', blockLot(PAL.rBrick, 1, 1, 3, 40, { ground: '#5a6a40' }))
push('z:1:1:1', blockLot(PAL.rBrick, 2, 2, 3, 40, { ground: '#5a6a40' }))
// Residential — high: towers
push('z:1:2:0', towerLot(PAL.cBlue, 1, 1, 7, 72))
push('z:1:2:1', towerLot(PAL.cBlue, 2, 2, 8, 84))

// Commercial — low: shops (1×1, 2×2)
push('z:2:0:0', blockLot(PAL.cWhite, 1, 1, 2, 26, { glass: GLASS, frame: '#cfd4da' }))
push('z:2:0:1', blockLot(PAL.cWhite, 2, 2, 2, 26, { glass: GLASS, frame: '#cfd4da' }))
// Commercial — mid: offices
push('z:2:1:0', blockLot(PAL.cBlue, 1, 1, 5, 56, { glass: GLASS_D, frame: '#7f93a4' }))
push('z:2:1:1', blockLot(PAL.cBlue, 2, 2, 5, 56, { glass: GLASS_D, frame: '#7f93a4' }))
// Commercial — high: glass towers
push('z:2:2:0', towerLot(PAL.cGlass, 1, 1, 9, 96))
push('z:2:2:1', towerLot(PAL.cGlass, 2, 2, 10, 108))

// Industrial — all buckets: low warehouses / factories (fill the plot)
push('z:3:0:0', blockLot(PAL.iMetal, 1, 1, 2, 22, { margin: 0.04, ground: '#6b6258', glass: 'rgba(120,140,150,0.5)', frame: '#5b605b' }))
push('z:3:0:1', blockLot(PAL.iMetal, 2, 2, 2, 22, { margin: 0.04, ground: '#6b6258', glass: 'rgba(120,140,150,0.5)', frame: '#5b605b' }))
push('z:3:1:0', blockLot(PAL.iDark, 2, 2, 3, 34, { margin: 0.04, ground: '#6b6258', glass: 'rgba(120,140,150,0.45)', frame: '#403b33' }))
push('z:3:2:0', blockLot(PAL.iDark, 2, 2, 4, 48, { margin: 0.04, ground: '#6b6258', glass: 'rgba(120,140,150,0.45)', frame: '#403b33' }))

// Plopped buildings (Building enum: 1 PowerPlant,2 WaterTower,3 Police,4 Fire,
// 5 Hospital,6 School,7 Library,8 GasTurbine,9 Nuclear,10 Solar,11 Wind)
push('b:1',  blockLot(PAL.iDark, 4, 4, 3, 40, { margin: 0.06, ground: '#5b554b' }))   // Coal plant
push('b:2',  civic(PAL.cBlue, 2, 2, 30, 1))                                            // Water tower
push('b:3',  civic({ top: '#6f7fd6', se: '#4456c0', sw: '#2f40a0' }, 3, 3, 30, 2, '#1a2888')) // Police
push('b:4',  civic({ top: '#e0584a', se: '#cc2f22', sw: '#9c1d12' }, 3, 3, 30, 2))     // Fire
push('b:5',  civic(PAL.cWhite, 3, 3, 36, 3))                                           // Hospital
push('b:6',  civic({ top: '#e6cb5e', se: '#cba832', sw: '#9c7f1e' }, 3, 3, 28, 2))     // School
push('b:7',  civic(PAL.rBrick, 2, 2, 28, 2))                                           // Library
push('b:8',  blockLot(PAL.iMetal, 3, 3, 2, 30, { margin: 0.08, ground: '#5b605b' }))   // Gas turbine
push('b:9',  blockLot(PAL.cWhite, 4, 4, 2, 34, { margin: 0.08, ground: '#777' }))      // Nuclear
push('b:10', blockLot({ top: '#2a3a5a', se: '#1c2c4a', sw: '#121f38' }, 3, 3, 1, 8, { margin: 0.04, ground: '#5b605b', glass: 'rgba(60,110,200,0.6)' })) // Solar
push('b:11', civic(PAL.cWhite, 1, 1, 60, 1))                                           // Wind turbine (tall mast)

// ── Shelf-pack into one atlas ──────────────────────────────────────────────────
const PAD = 2
sprites.sort((a, b) => b.sprite.frameH - a.sprite.frameH)
const MAX_W = 2048
let x = PAD, y = PAD, shelfH = 0, atlasW = 0, atlasH = 0
const placed = []
for (const s of sprites) {
  const { frameW, frameH } = s.sprite
  if (x + frameW + PAD > MAX_W) { x = PAD; y += shelfH + PAD; shelfH = 0 }
  placed.push({ ...s, x, y })
  x += frameW + PAD
  shelfH = Math.max(shelfH, frameH)
  atlasW = Math.max(atlasW, x)
  atlasH = Math.max(atlasH, y + shelfH + PAD)
}

const atlas = createCanvas(atlasW, atlasH)
const actx = atlas.getContext('2d')
const entries = []
for (const p of placed) {
  actx.drawImage(p.sprite.canvas, p.x, p.y)
  entries.push({
    key: p.key,
    frame: { x: p.x, y: p.y, w: p.sprite.frameW, h: p.sprite.frameH },
    footW: p.sprite.fw,
    footH: p.sprite.fh,
    anchorX: p.sprite.anchorX,
    anchorY: p.sprite.anchorY,
    scale: 1,
  })
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(resolve(OUT_DIR, 'atlas.png'), atlas.toBuffer('image/png'))
writeFileSync(resolve(OUT_DIR, 'manifest.json'), JSON.stringify({
  image: '/sprites/atlas.png', tilePx: TILE_PX, entries,
}, null, 2))

console.log(`Wrote ${entries.length} sprites → ${OUT_DIR}\\atlas.png (${atlasW}×${atlasH}) + manifest.json`)
