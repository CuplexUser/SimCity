/**
 * genCars.mjs — render the animated-traffic car sprites for the atlas.
 *
 * Draws every (direction × variant) car with @napi-rs/canvas using the *shared*
 * silhouette in src/rendering/carModel.js — the exact geometry the runtime bakes
 * as its fallback — so the atlas cars and the procedural cars are identical. No
 * Blender required. Writes:
 *
 *   tools/assets-src/car_<dir>_<variant>.png   (alpha cutout, supersampled)
 *   tools/spriteMap.json                        merged entries  car:<dir>:<variant>
 *
 * Then `pnpm build:atlas` packs these into public/sprites/. Run:
 *
 *   pnpm gen:cars        # this script (procedural, default)
 *   pnpm build:atlas     # pack into the atlas
 *
 * Geometry contract (matches src/rendering/isoCamera.ts): 1 tile = 64×32 px. The
 * car is drawn centered on a 64×56 canvas; its anchor is the canvas center (the
 * car's ground contact point). We supersample by SS for crisp 2×/4× atlases.
 */

import { createCanvas } from '@napi-rs/canvas'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { drawCar, CAR_DIRS, CAR_VARIANTS } from '../src/rendering/carModel.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(ROOT, 'tools/assets-src')
const MAP_FILE = resolve(ROOT, 'tools/spriteMap.json')

const HW = 32, HH = 16              // 1× tile half-extents
const CW = 64, CH = 56             // car canvas (matches tileTextures.ts CAR_CANVAS_*)
const SS = 6                        // supersample → tilePx = 64·6 = 384 (feeds 4× crisply)

mkdirSync(OUT_DIR, { recursive: true })
const map = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, 'utf8')) : {}

// Drop any previous car sprites (incl. the old Blender `car_*__sedan.png`) so a
// rename never leaves a duplicate `car:*` key for buildAtlas to collide on.
for (const f of readdirSync(OUT_DIR)) {
  if (/^car_.*\.png$/i.test(f)) unlinkSync(resolve(OUT_DIR, f))
}
for (const k of Object.keys(map)) {
  if (k.startsWith('car_') || (map[k] && typeof map[k].key === 'string' && map[k].key.startsWith('car:'))) delete map[k]
}

let n = 0
for (const dir of CAR_DIRS) {
  for (let v = 0; v < CAR_VARIANTS; v++) {
    const cv = createCanvas(CW * SS, CH * SS)
    const ctx = cv.getContext('2d')
    ctx.scale(SS, SS)
    drawCar(ctx, CW / 2, CH / 2, HW, HH, dir, v)

    const file = `car_${dir}_${v}.png`
    writeFileSync(resolve(OUT_DIR, file), cv.toBuffer('image/png'))
    map[file] = {
      key: `car:${dir}:${v}`,
      footW: 1, footH: 1,
      anchorX: (CW / 2) * SS, anchorY: (CH / 2) * SS,
      tilePx: CW * SS,
    }
    n++
  }
}

writeFileSync(MAP_FILE, JSON.stringify(map, null, 2))
console.log(`Generated ${n} car sprites (${CAR_DIRS.length} dirs × ${CAR_VARIANTS} variants) → ${OUT_DIR}`)
