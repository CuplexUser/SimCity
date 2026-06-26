// @ts-check
/**
 * carModel.js — the single source of truth for the animated-traffic car
 * silhouette. It is plain JS (no PixiJS, no DOM beyond a 2D context) so that
 * BOTH consumers can share the exact same geometry:
 *
 *   • the runtime fallback baker (rendering/tileRenderer.ts → tileTextures.ts),
 *     which draws cars into textures when the sprite atlas lacks `car:*` keys, and
 *   • the asset pipeline (tools/genCars.mjs), which renders the same cars to
 *     PNGs that `pnpm build:atlas` packs into public/sprites — so the atlas cars
 *     and the procedural fallback are identical.
 *
 * Geometry contract (matches rendering/isoCamera.ts): 1 tile = 64×32 px, so a
 * caller passes hw=32, hh=16 for 1× and draws the car centered on (cx,cy), which
 * is the car's ground contact point (the sprite anchor).
 */

/** @typedef {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} Ctx2D */
/** @typedef {{ x: number, y: number }} Pt */
/** @typedef {[number, number]} Vec2 */

// The 8 screen directions a car can travel: the 4 grid-axis roads read as the
// screen diagonals (ne/se/sw/nw), the 4 diagonal roads as the screen axes (n/e/s/w).
export const CAR_DIRS = /** @type {const} */ (['ne', 'se', 'sw', 'nw', 'n', 'e', 's', 'w'])

// Number of color variants the spawner cycles through.
export const CAR_VARIANTS = 4

// Ground-plane axes in screen space (2:1 iso). COL = +col step (reads screen SE),
// ROW = +row step (reads screen SW). A car is built as a box framed by the two
// ground axes of its road, so it lies flat *and* points along travel rather than
// skating sideways.
const A = 0.8944, B = 0.4472          // a unit grid step = (±2, ±1)/√5
/** @type {Vec2} */ const COL = [ A, B]
/** @type {Vec2} */ const ROW = [-A, B]
/** @param {Vec2} v @returns {Vec2} */
const neg = (v) => [-v[0], -v[1]]

// Per travel direction: `along` runs down the road, `across` is the perpendicular
// ground axis (car width). Grid-axis roads use the COL/ROW axes; the 45° diagonal
// roads run along the screen axes (their ground axes project to screen H/V).
/** @type {Record<string, { along: Vec2, across: Vec2 }>} */
const CAR_AXES = {
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
/** @param {string} hex @param {number} f */
function shadeHex(hex, f) {
  const n = parseInt(hex.slice(1), 16)
  const t = f < 0 ? 0 : 255, a = Math.abs(f)
  const mix = (/** @type {number} */ c) => Math.round(c + (t - c) * a)
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`
}

/** @param {Ctx2D} ctx @param {Pt[]} pts */
function fillPoly(ctx, pts) {
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath(); ctx.fill()
}
/** @param {Pt[]} pts */
const avgY = (pts) => pts.reduce((s, p) => s + p.y, 0) / pts.length

/** @typedef {{ p: Pt[], c: string, glass?: Pt[] }} Panel */

/**
 * Draw one car at (cx,cy) facing `dir` as a small low-poly vehicle on the iso
 * ground: four wheels, a beveled hull (so the outline isn't a slab), a raked
 * glasshouse cabin with side windows, and head/tail lights — reads as a car
 * rather than a driving shoebox.
 *
 * @param {Ctx2D} ctx
 * @param {number} cx @param {number} cy
 * @param {number} hw @param {number} hh
 * @param {string} dir   one of CAR_DIRS
 * @param {number} variant
 */
export function drawCar(ctx, cx, cy, hw, hh, dir, variant) {
  const { along, across } = CAR_AXES[dir]
  const L = hw * 0.46, W = hw * 0.19   // half length / half width on the ground
  const floor = hh * 0.20              // underside of the body (wheels peek below)
  const belt  = hh * 0.56              // top of the lower body / base of the cabin
  const roofZ = hh * 1.04              // top of the cabin

  const body  = CAR_BODY[variant % CAR_BODY.length]
  const roofc = CAR_ROOF[variant % CAR_ROOF.length]
  const glass = '#1b2a38'

  // Project a body-local point: sl along travel (−1..1), sw across (−1..1), z up.
  /** @returns {Pt} */
  const P = (/** @type {number} */ sl, /** @type {number} */ sw, /** @type {number} */ z) => ({
    x: cx + along[0] * L * sl + across[0] * W * sw,
    y: cy + along[1] * L * sl + across[1] * W * sw - z,
  })
  /** @param {Pt[]} pts */
  const avgX = (pts) => pts.reduce((s, p) => s + p.x, 0) / pts.length
  // Shrink a quad toward its centroid → a window inset within a body panel.
  /** @param {Pt[]} pts @param {number} f @returns {Pt[]} */
  const shrink = (pts, f) => {
    const c = { x: avgX(pts), y: avgY(pts) }
    return pts.map((p) => ({ x: p.x + (c.x - p.x) * f, y: p.y + (c.y - p.y) * f }))
  }
  // Paint a group of panels back→front (ascending screen y); draw any window inset.
  /** @param {Panel[]} panels */
  const paint = (panels) => {
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
  /** @type {Panel[]} */
  const hullPanels = []
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
