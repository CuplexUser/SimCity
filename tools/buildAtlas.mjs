/**
 * buildAtlas.mjs — packs a folder of source PNG sprites into the game atlases.
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
 * and writes one atlas per zoom level (1× / 2× / 4×):
 *
 *   public/sprites/atlas.png      + manifest.json      (64 px/tile)
 *   public/sprites/atlas.2x.png   + manifest.2x.json   (128 px/tile)
 *   public/sprites/atlas.4x.png   + manifest.4x.json   (256 px/tile, capped at
 *                                                        the source's native res)
 *
 * Each source PNG is resampled so one tile is `64 × level` px wide, never
 * upscaling past the resolution the art was authored at (spec.tilePx); the
 * residual is recorded in each entry's `scale`. The runtime (renderer.ts)
 * hot-swaps atlases as the camera zooms. Run:  pnpm build:atlas
 */

import { createCanvas, loadImage } from '@napi-rs/canvas'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, basename } from 'node:path'
import { packAndWrite, ZOOM_LEVELS } from './atlasPack.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DIR = resolve(ROOT, 'tools/assets-src')
const MAP_FILE = resolve(ROOT, 'tools/spriteMap.json')
const OUT_DIR = resolve(ROOT, 'public/sprites')
const TILE_PX = 64

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

const sources = []
for (const file of files) {
  const spec = map[file] ?? map[basename(file, '.png')]
  if (!spec) { console.warn(`skip (no map entry): ${file}`); continue }
  const img = await loadImage(resolve(SRC_DIR, file))
  sources.push({ img, spec, srcTilePx: spec.tilePx ?? TILE_PX })
}

if (sources.length === 0) { console.error('No sprites packed.'); process.exit(1) }

for (const level of ZOOM_LEVELS) {
  const sprites = sources.map(({ img, spec, srcTilePx }) => {
    // Resample so one tile === 64×level px wide, but never upscale the source.
    const packTilePx = Math.min(TILE_PX * level, srcTilePx)
    const f = packTilePx / srcTilePx
    const w = Math.round(img.width * f)
    const h = Math.round(img.height * f)
    const c = createCanvas(w, h)
    c.getContext('2d').drawImage(img, 0, 0, w, h)
    return {
      key: spec.key,
      canvas: c,
      frameW: w,
      frameH: h,
      footW: spec.footW ?? 1,
      footH: spec.footH ?? 1,
      anchorX: Math.round((spec.anchorX ?? img.width / 2) * f),
      anchorY: Math.round((spec.anchorY ?? 0) * f),
      scale: TILE_PX / packTilePx,
    }
  })
  const out = packAndWrite(sprites, level, OUT_DIR, TILE_PX * level)
  console.log(`[${level}x] Packed ${out.entries} sprites → ${out.images.join(', ')} (${out.dims.join(', ')})`)
}
