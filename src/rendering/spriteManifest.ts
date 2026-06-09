/**
 * spriteManifest.ts — types for the building sprite atlas manifest.
 *
 * The manifest + atlas PNG live in `public/sprites/` and are produced by
 * `tools/buildAtlas.mjs` (from a CC0 pack or Blender renders). At startup
 * `spriteAtlas.ts` loads them and overlays the resulting textures onto the
 * renderer's `texCache`, replacing the procedural baker for any key present.
 *
 * Logical keys mirror the procedural cache keys, with an extra variant slot for
 * zone buildings so a city block isn't wall-to-wall identical lots:
 *   z:{zone}:{bucket}:{variant}   zone buildings   (bucket 0=low 1=mid 2=high)
 *   b:{building}                  plopped service/utility buildings
 * Roads/power overlays are NOT in the manifest — they stay procedural.
 *
 * Geometry contract (must match the in-game iso, TILE_W=64 / TILE_H=32):
 *  - A sprite is authored so one tile is `tilePx` wide (default 64) → 2:1 iso.
 *  - (anchorX, anchorY) is the pixel inside the frame that sits exactly on the
 *    NORTH apex of the plot's origin tile (the same point the renderer places a
 *    building sprite at). Buildings rise upward (smaller y) from there.
 *  - `scale` converts frame px → world px (1.0 when authored at tilePx=64).
 */

export interface SpriteFrame {
  x: number
  y: number
  w: number
  h: number
}

export interface SpriteEntry {
  key: string        // logical key, e.g. "z:1:0:0" or "b:1"
  frame: SpriteFrame // rect within the atlas page
  footW: number      // plot width  in tiles
  footH: number      // plot height in tiles
  anchorX: number    // px in frame landing on the plot's north apex
  anchorY: number
  scale: number      // frame-px → world-px multiplier (1.0 if tilePx === 64)
  page?: number      // index into `images` (default 0)
}

export interface SpriteManifest {
  /** Atlas image path of page 0, relative to the site root (e.g. "/sprites/atlas.png"). */
  image: string
  /** All atlas page paths; hi-res levels may span several ≤4096px pages. */
  images?: string[]
  /** Pixels per tile width the sprites were authored at (informational). */
  tilePx: number
  entries: SpriteEntry[]
}
