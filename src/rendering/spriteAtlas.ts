/**
 * spriteAtlas.ts — loads the building sprite atlas (if present) at startup.
 *
 * Degrades gracefully: if `/sprites/manifest.json` is missing or empty, returns
 * an empty result and the renderer falls back entirely to the procedural baker
 * (`tileTextures.ts`). When present, each manifest entry becomes a sub-Texture
 * sliced from the shared atlas image plus the footprint/anchor/scale metadata
 * the renderer needs to size & place a multi-tile building sprite.
 */

import { Assets, Rectangle, Texture } from 'pixi.js'
import type { SpriteManifest } from './spriteManifest'

/** Everything the renderer needs to draw one building sprite from the atlas. */
export interface SpriteMeta {
  texture: Texture
  footW: number
  footH: number
  anchorX: number // px in frame on the plot's north apex
  anchorY: number
  scale: number   // frame-px → world-px
  frameW: number
  frameH: number
}

export interface LoadedAtlas {
  /** Full logical key (incl. variant) → drawable sprite metadata. */
  meta: Map<string, SpriteMeta>
  /** "z:{zone}:{bucket}" → list of full variant keys (sorted), for variant picks. */
  variants: Map<string, string[]>
}

/**
 * Resolve a site-root-absolute asset path (e.g. "/sprites/atlas.png") against
 * Vite's configured base. On GitHub Pages the app is served from a subpath
 * (e.g. "/SimCity/"), so a bare "/sprites/..." would 404 and silently drop us
 * back to the procedural fallback sprites.
 */
function withBase(path: string): string {
  return import.meta.env.BASE_URL.replace(/\/$/, '') + '/' + path.replace(/^\//, '')
}

/** Zoom levels with their own packed atlas (must match tools/atlasPack.mjs). */
export type AtlasLevel = 1 | 2 | 4

// ".2x"/".4x" (not "@2x") — Pixi parses "@Nx" filenames as a resolution hint,
// which would shrink the texture's logical size and break frame coordinates.
const LEVEL_SUFFIX: Record<AtlasLevel, string> = { 1: '', 2: '.2x', 4: '.4x' }

function empty(): LoadedAtlas {
  return { meta: new Map(), variants: new Map() }
}

export async function loadSpriteAtlas(level: AtlasLevel = 1): Promise<LoadedAtlas> {
  let manifest: SpriteManifest
  try {
    const res = await fetch(withBase(`/sprites/manifest${LEVEL_SUFFIX[level]}.json`))
    if (!res.ok) return empty()
    manifest = (await res.json()) as SpriteManifest
  } catch {
    return empty()
  }

  if (!manifest?.entries?.length) return empty()

  let pages: Texture[]
  try {
    const paths = manifest.images ?? [manifest.image]
    pages = await Promise.all(paths.map((p) => Assets.load<Texture>(withBase(p))))
  } catch {
    return empty()
  }

  const result = empty()

  for (const e of manifest.entries) {
    const base = pages[e.page ?? 0]
    if (!base) continue
    const frame = new Rectangle(e.frame.x, e.frame.y, e.frame.w, e.frame.h)
    const texture = new Texture({ source: base.source, frame })
    result.meta.set(e.key, {
      texture,
      footW: e.footW,
      footH: e.footH,
      anchorX: e.anchorX,
      anchorY: e.anchorY,
      scale: e.scale ?? 1,
      frameW: e.frame.w,
      frameH: e.frame.h,
    })

    // Group zone-building variants: key "z:{zone}:{bucket}:{variant}:r{rot}".
    // variants[groupKey] holds the distinct *base* keys (no rotation); the renderer
    // appends ":r{rot}" once it knows which way the building should face.
    if (e.key.startsWith('z:')) {
      const parts = e.key.split(':')
      if (parts.length === 5) {
        const groupKey = `${parts[0]}:${parts[1]}:${parts[2]}`
        const baseKey = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}`
        const arr = result.variants.get(groupKey) ?? []
        if (!arr.includes(baseKey)) arr.push(baseKey)
        result.variants.set(groupKey, arr)
      }
    }
  }

  for (const arr of result.variants.values()) arr.sort()
  return result
}
