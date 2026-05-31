/**
 * buildAtlas.mjs — packs a folder of source PNG sprites into the game atlas.
 *
 * This is the ingestion endpoint for *real* art: Blender renders (see
 * tools/blender/) or a CC0 isometric pack (e.g. Kenney City Kits). It reads:
 *
 *   tools/assets-src/<file>.png   — one image per building/lot, alpha cutout
 *   tools/spriteMap.json          — maps each file → { key, footW, footH,
 *                                    anchorX, anchorY }  (anchorX/Y in source px;
 *                                    Blender output can embed these so the map is
 *                                    optional — see tools/README.md)
 *
 * and writes:
 *
 *   public/sprites/atlas.png
 *   public/sprites/manifest.json
 *
 * Each source PNG is resampled so one tile is 64px wide (the in-game tile width),
 * recording any residual `scale`. The runtime (renderer.ts) is untouched: it just
 * reads the manifest. Run:  pnpm build:atlas
 */

import { createCanvas, loadImage } from '@napi-rs/canvas'
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, basename } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DIR = resolve(ROOT, 'tools/assets-src')
const MAP_FILE = resolve(ROOT, 'tools/spriteMap.json')
const OUT_DIR = resolve(ROOT, 'public/sprites')
const TILE_PX = 64
const PAD = 2
const MAX_W = 2048

if (!existsSync(SRC_DIR)) {
  console.error(`No source dir: ${SRC_DIR}\nDrop PNGs there + author tools/spriteMap.json, or run \`pnpm gen:atlas\` for the built-in starter set.`)
  process.exit(1)
}
if (!existsSync(MAP_FILE)) {
  console.error(`No sprite map: ${MAP_FILE} — see tools/README.md for the format.`)
  process.exit(1)
}

const map = JSON.parse(readFileSync(MAP_FILE, 'utf8')) // { "<file.png>": { key, footW, footH, anchorX, anchorY, tilePx? } }
const files = readdirSync(SRC_DIR).filter((f) => f.toLowerCase().endsWith('.png'))

const loaded = []
for (const file of files) {
  const spec = map[file] ?? map[basename(file, '.png')]
  if (!spec) { console.warn(`skip (no map entry): ${file}`); continue }
  const img = await loadImage(resolve(SRC_DIR, file))

  // Resample so one tile === 64px wide. The author records the source tile width
  // via spec.tilePx (px the art was drawn at); default: assume already 64.
  const srcTilePx = spec.tilePx ?? TILE_PX
  const scale = TILE_PX / srcTilePx
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const c = createCanvas(w, h)
  c.getContext('2d').drawImage(img, 0, 0, w, h)

  loaded.push({
    key: spec.key,
    canvas: c,
    frameW: w,
    frameH: h,
    footW: spec.footW ?? 1,
    footH: spec.footH ?? 1,
    anchorX: Math.round((spec.anchorX ?? img.width / 2) * scale),
    anchorY: Math.round((spec.anchorY ?? 0) * scale),
  })
}

if (loaded.length === 0) { console.error('No sprites packed.'); process.exit(1) }

// Shelf pack tallest-first.
loaded.sort((a, b) => b.frameH - a.frameH)
let x = PAD, y = PAD, shelfH = 0, atlasW = 0, atlasH = 0
const placed = []
for (const s of loaded) {
  if (x + s.frameW + PAD > MAX_W) { x = PAD; y += shelfH + PAD; shelfH = 0 }
  placed.push({ ...s, x, y })
  x += s.frameW + PAD
  shelfH = Math.max(shelfH, s.frameH)
  atlasW = Math.max(atlasW, x)
  atlasH = Math.max(atlasH, y + shelfH + PAD)
}

const atlas = createCanvas(atlasW, atlasH)
const actx = atlas.getContext('2d')
const entries = placed.map((p) => {
  actx.drawImage(p.canvas, p.x, p.y)
  return {
    key: p.key,
    frame: { x: p.x, y: p.y, w: p.frameW, h: p.frameH },
    footW: p.footW, footH: p.footH,
    anchorX: p.anchorX, anchorY: p.anchorY,
    scale: 1,
  }
})

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(resolve(OUT_DIR, 'atlas.png'), atlas.toBuffer('image/png'))
writeFileSync(resolve(OUT_DIR, 'manifest.json'), JSON.stringify({ image: '/sprites/atlas.png', tilePx: TILE_PX, entries }, null, 2))
console.log(`Packed ${entries.length} sprites → ${OUT_DIR}\\atlas.png (${atlasW}×${atlasH})`)
