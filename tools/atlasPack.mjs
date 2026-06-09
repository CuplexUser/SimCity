/**
 * atlasPack.mjs — shared shelf-packer + manifest writer for the atlas tools
 * (genStarterAtlas.mjs and buildAtlas.mjs).
 *
 * Packs pre-rendered sprite canvases into one or more atlas pages for a given
 * zoom level and writes:
 *
 *   public/sprites/atlas[@Nx][.P].png    (P = page index, omitted for page 0)
 *   public/sprites/manifest[@Nx].json
 *
 * Pages are capped at 4096×4096 (2048 wide at 1×, matching the original
 * single-page layout) so the 2×/4× atlases stay within safe GPU texture
 * limits. Entries carry a `page` index into the manifest's `images` list;
 * `image` stays as page 0 for backward compatibility.
 */

import { createCanvas } from '@napi-rs/canvas'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Zoom levels the game hot-swaps between (camera snap steps 1× / 2× / 4×). */
export const ZOOM_LEVELS = [1, 2, 4]

const PAD = 2

// NOTE: "@2x"/"@4x" would trip PixiJS's filename resolution convention (it
// would halve/quarter the texture's logical size), so pages use ".2x"/".4x".
function suffix(level) {
  return level === 1 ? '' : `.${level}x`
}

function pageName(level, page) {
  return `atlas${suffix(level)}${page > 0 ? `.${page}` : ''}.png`
}

/**
 * Pack sprites into atlas pages and write the PNGs + manifest for one level.
 *
 * sprites: [{ key, canvas, frameW, frameH, footW, footH, anchorX, anchorY, scale }]
 * with all pixel fields in the canvas's own resolution and `scale` the
 * frame-px → world-px multiplier the runtime should apply.
 */
export function packAndWrite(sprites, level, outDir, tilePx) {
  const MAX_W = level === 1 ? 2048 : 4096
  const MAX_H = 4096
  const sorted = [...sprites].sort((a, b) => b.frameH - a.frameH)

  const pages = []
  let pg = null
  const newPage = () => { pg = { placed: [], x: PAD, y: PAD, shelfH: 0, w: 0, h: 0 }; pages.push(pg) }
  newPage()

  for (const s of sorted) {
    if (pg.x + s.frameW + PAD > MAX_W) { pg.x = PAD; pg.y += pg.shelfH + PAD; pg.shelfH = 0 }
    if (pg.y + s.frameH + PAD > MAX_H) newPage()
    pg.placed.push({ ...s, x: pg.x, y: pg.y })
    pg.x += s.frameW + PAD
    pg.shelfH = Math.max(pg.shelfH, s.frameH)
    pg.w = Math.max(pg.w, pg.x)
    pg.h = Math.max(pg.h, pg.y + pg.shelfH + PAD)
  }

  mkdirSync(outDir, { recursive: true })
  const images = []
  const entries = []
  for (let p = 0; p < pages.length; p++) {
    const canvas = createCanvas(pages[p].w, pages[p].h)
    const ctx = canvas.getContext('2d')
    for (const s of pages[p].placed) {
      ctx.drawImage(s.canvas, s.x, s.y)
      entries.push({
        key: s.key,
        frame: { x: s.x, y: s.y, w: s.frameW, h: s.frameH },
        footW: s.footW, footH: s.footH,
        anchorX: s.anchorX, anchorY: s.anchorY,
        scale: s.scale,
        ...(p > 0 ? { page: p } : {}),
      })
    }
    const name = pageName(level, p)
    writeFileSync(resolve(outDir, name), canvas.toBuffer('image/png'))
    images.push(`/sprites/${name}`)
  }

  writeFileSync(
    resolve(outDir, `manifest${suffix(level)}.json`),
    JSON.stringify({ image: images[0], images, tilePx, entries }, null, 2),
  )
  return { images, entries: entries.length, dims: pages.map((p) => `${p.w}×${p.h}`) }
}
