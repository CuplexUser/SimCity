/**
 * renderer.ts — PixiJS v8 scene manager
 *
 * Scene hierarchy:
 *   app.stage
 *     worldContainer  (Container, sortableChildren=true)
 *       terrainGfx per tile       (zIndex = d*3 + 0  — elevation sides + solid fill fallback)
 *       terrainSprite per tile    (zIndex = d*3 + 0.1 — noise texture; Water/Dirt/Forest only)
 *       overlaySprites per tile   (zIndex = d*3 + 1)
 *       buildingSprites per tile  (zIndex = d*3 + 2)
 *       zoneLayerGfx              (zIndex = 60000 — zone outlines + optional semi-transparent fills)
 *       hoverGfx                  (zIndex = 80000 — tile hover highlight)
 *     nightOverlay  (Graphics covering full canvas; alpha 0 in day / 0.62 at night)
 *     minimapSprite (fixed bottom-right)
 */

import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js'
import { type World } from '../core/world'
import { type IsoCamera, TILE_W, TILE_H, ELEV_H } from './isoCamera'
import { Terrain, Zone, Overlay, Building, type Tile } from '../core/tile'
import { footprintTiles } from '../core/footprint'
import { Minimap, MINI_W, MINI_H, MINI_MARGIN_R, MINI_MARGIN_B } from './minimap'
import {
  bakeAllTextures, type TextureCache,
  getBuildingKey, getOverlayKey,
  BLDG_CANVAS_H, BLDG_APEX_Y,
} from './tileTextures'
import { loadSpriteAtlas, type LoadedAtlas, type SpriteMeta } from './spriteAtlas'
import { drawTerrainTexture } from './sprites'

// Deterministic per-tile hash for picking a building variant from the atlas.
function variantHash(col: number, row: number): number {
  let h = Math.imul(col + 1, 668265263) ^ Math.imul(row + 1, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  return (h ^ (h >>> 16)) >>> 0
}

// ── Tile layout constants (base zoom = 1) ────────────────────────────────────
const BASE_HW = TILE_W / 2   // 32
const BASE_HH = TILE_H / 2   // 16
const BASE_EH = ELEV_H        // 8

// Elevation side face colours
const ELEV_DARK  = 0x2a2a1a
const ELEV_LIGHT = 0x6a6848

// ── Terrain colour helpers ───────────────────────────────────────────────────

function grassHex(col: number, row: number): number {
  const h = (Math.sin(col * 7.31 + row * 11.71) * 0.5 + 0.5)
  const r = Math.min(0x62, Math.floor(0x4a + h * 24))
  const g = Math.min(0x8c, Math.floor(0x78 + h * 20))
  const b = Math.min(0x40, Math.floor(0x30 + h * 16))
  return (r << 16) | (g << 8) | b
}

function terrainHex(terrain: Terrain, col: number, row: number): number {
  switch (terrain) {
    case Terrain.Grass:  return grassHex(col, row)
    case Terrain.Water:  return 0x1a5c8c
    case Terrain.Dirt:   return 0x9b7a3d
    case Terrain.Forest: return 0x2d5a1a
  }
}

function zoneOutlineHex(zone: Zone): number {
  if (zone === Zone.Residential) return 0x7ddd7d
  if (zone === Zone.Commercial)  return 0x7d9dff
  return 0xffdd6a
}

// ── Terrain texture baking ───────────────────────────────────────────────────
// Bakes Water/Dirt/Forest terrain at zoom=1 into a PIXI.Texture.
// Grass uses solid-colour Graphics (per-tile colour variation via grassHex).

function bakeTerrainTex(terrain: Terrain): Texture {
  const oc  = new OffscreenCanvas(TILE_W, TILE_H)
  const ctx = oc.getContext('2d')!
  drawTerrainTexture(ctx, terrain, BASE_HW, BASE_HH, 1, 0, 0)
  return Texture.from(oc.transferToImageBitmap())
}

// ── Renderer ─────────────────────────────────────────────────────────────────

export class Renderer {
  readonly minimap: Minimap

  private app!: Application
  private worldContainer!: Container

  // Per-tile arrays (index = row * cols + col)
  private terrainGfx:      (Graphics | null)[]   // elevation sides + solid fill
  private terrainSprites:  (Sprite   | null)[]   // noise texture (Water/Dirt/Forest only)
  private overlaySprites:  (Sprite   | null)[]
  private buildingSprites: (Sprite   | null)[]

  // Shared texture cache for building/overlay textures (~100 textures)
  private texCache!: TextureCache
  // Loaded sprite atlas (empty when no manifest present → pure procedural fallback)
  private atlas: LoadedAtlas = { meta: new Map(), variants: new Map() }
  // Shared terrain textures: one per non-Grass terrain type (3 total)
  private terrainTexCache = new Map<Terrain, Texture>()

  // Fixed-zIndex overlay layers inside worldContainer
  private zoneLayerGfx!: Graphics   // zone outlines (+ fills when overlay enabled)
  private hoverGfx!: Graphics       // hover highlight
  private _hoverW = 1               // footprint width  of the hovered placement
  private _hoverH = 1               // footprint height of the hovered placement

  // Water animation: references to Water terrain sprites
  private waterSpriteList: Sprite[] = []

  // Full-screen night overlay (on app.stage, not inside worldContainer)
  private nightOverlay!: Graphics

  // State flags
  private _nightMode       = false
  private _showZoneOverlay = false
  private _hoverIdx        = -1
  private _zoneLayerDirty  = true    // rebuild on first draw
  private _waterListDirty  = true    // rebuild on first draw

  // Minimap
  private minimapHtmlCanvas!: HTMLCanvasElement
  private minimapTex!: Texture
  private minimapSprite!: Sprite

  // ── Constructor ──────────────────────────────────────────────────────────

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly world:  World,
    private readonly camera: IsoCamera,
  ) {
    this.minimap = new Minimap(world)
    const n = world.cols * world.rows
    this.terrainGfx      = new Array(n).fill(null)
    this.terrainSprites  = new Array(n).fill(null)
    this.overlaySprites  = new Array(n).fill(null)
    this.buildingSprites = new Array(n).fill(null)
  }

  static async create(
    canvas: HTMLCanvasElement,
    world:  World,
    camera: IsoCamera,
  ): Promise<Renderer> {
    const r = new Renderer(canvas, world, camera)
    await r._init()
    return r
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  private async _init(): Promise<void> {
    const { canvas, world, camera } = this

    this.app = new Application()
    await this.app.init({
      canvas,
      width:           canvas.width,
      height:          canvas.height,
      backgroundColor: 0x1a1a2e,
      antialias:       false,
      autoDensity:     false,
      resolution:      1,
    })
    this.app.ticker.stop()

    // World container — pan / zoom
    this.worldContainer = new Container()
    this.worldContainer.sortableChildren = true
    this.app.stage.addChild(this.worldContainer)

    // Pre-bake shared building + overlay textures (~100 total) — procedural fallback
    this.texCache = bakeAllTextures()

    // Load the building sprite atlas if present (empty map → pure procedural fallback)
    this.atlas = await loadSpriteAtlas()

    // Pre-bake shared terrain textures for non-Grass types
    for (const t of [Terrain.Water, Terrain.Dirt, Terrain.Forest]) {
      this.terrainTexCache.set(t, bakeTerrainTex(t))
    }

    // Create terrain Graphics + Sprites in diagonal (painter's) order
    for (let d = 0; d <= world.cols + world.rows - 2; d++) {
      const colMin = Math.max(0, d - world.rows + 1)
      const colMax = Math.min(d, world.cols - 1)
      for (let col = colMin; col <= colMax; col++) {
        const row = d - col
        this._createTerrainLayers(col, row)
      }
    }

    // Create overlay + building sprites for pre-existing tiles
    world.forEach((tile, col, row) => {
      if (tile.overlay)                                         this._rebuildOverlay(col, row)
      if (tile.density > 0 || tile.building !== Building.None) this._rebuildBuilding(col, row)
    })

    // Fixed-zIndex layers inside worldContainer
    this.zoneLayerGfx = new Graphics()
    this.zoneLayerGfx.zIndex = 60000
    this.worldContainer.addChild(this.zoneLayerGfx)

    this.hoverGfx = new Graphics()
    this.hoverGfx.zIndex = 80000
    this.worldContainer.addChild(this.hoverGfx)

    this.worldContainer.sortChildren()

    // Night overlay — full-screen, on app.stage (not scrollable)
    this.app.stage.sortableChildren = true
    this.nightOverlay = new Graphics()
    this.nightOverlay.zIndex = 9000
    this.nightOverlay.alpha  = 0
    this.app.stage.addChild(this.nightOverlay)
    this._resizeNightOverlay()

    // Minimap: HTMLCanvasElement → PIXI.Texture → PIXI.Sprite
    this.minimapHtmlCanvas        = document.createElement('canvas')
    this.minimapHtmlCanvas.width  = MINI_W
    this.minimapHtmlCanvas.height = MINI_H
    this.minimapTex    = Texture.from(this.minimapHtmlCanvas)
    this.minimapSprite = new Sprite(this.minimapTex)
    this.app.stage.addChild(this.minimapSprite)
    this._positionMinimap()

    // Clear startup dirty flags (world was just initialised, not user-changed)
    world.dirty.clear()
  }

  // ── Per-frame draw ────────────────────────────────────────────────────────

  draw(): void {
    const { world, camera } = this

    // Sync pan / zoom
    this.worldContainer.x = camera.panX
    this.worldContainer.y = camera.panY
    this.worldContainer.scale.set(camera.zoom)

    // Process tiles changed since last frame
    if (world.dirty.size > 0) {
      const dirtyIdxs   = new Set<number>()
      const overlayIdxs = new Set<number>()

      for (const idx of world.dirty) {
        dirtyIdxs.add(idx)
        overlayIdxs.add(idx)
        const col = idx % world.cols
        const row = Math.floor(idx / world.cols)
        // A changed tile that belongs to a multi-tile structure must rebuild the
        // whole plot (origin sprite + covered tiles) so it appears/clears as one.
        const tile = world.get(col, row)
        if (tile.footW > 1 || tile.footH > 1 || tile.rootCol !== -1 || tile.rootRow !== -1) {
          for (const [fc, fr] of footprintTiles(world, col, row)) {
            dirtyIdxs.add(fr * world.cols + fc)
          }
        }
        if (tile.overlay & Overlay.Road) {
          for (const [dc, dr] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
            const nc = col + dc, nr = row + dr
            if (world.inBounds(nc, nr)) overlayIdxs.add(nr * world.cols + nc)
          }
        }
      }

      for (const idx of dirtyIdxs) {
        const col = idx % world.cols
        const row = Math.floor(idx / world.cols)
        this._destroyTerrainLayers(idx)
        this._createTerrainLayers(col, row)
        this._rebuildBuilding(col, row)
        if (this._nightMode) {
          const s = this.buildingSprites[idx]
          if (s) s.tint = 0xffcc77
        }
      }

      for (const idx of overlayIdxs) {
        const col = idx % world.cols
        const row = Math.floor(idx / world.cols)
        this._rebuildOverlay(col, row)
      }

      world.dirty.clear()
      this.worldContainer.sortChildren()

      // Tile changes may affect zone layer and water list
      this._zoneLayerDirty = true
      this._waterListDirty = true
    }

    if (this._zoneLayerDirty) this._rebuildZoneLayer()
    if (this._waterListDirty) this._rebuildWaterList()

    // Animate water tiles (shimmer via tint oscillation, every frame)
    this._animateWater(performance.now())

    this._redrawMinimap()

    this.app.renderer.render({ container: this.app.stage })
  }

  resize(w: number, h: number): void {
    this.app.renderer.resize(w, h)
    this._positionMinimap()
    this._resizeNightOverlay()
  }

  // ── Public control API ────────────────────────────────────────────────────

  /**
   * Reads pixel stats from the WebGL renderer for E2E tests.
   * Triggers a draw() first so the framebuffer is current.
   */
  readPixelStats(): { nonTransparent: number; uniqueColors: number; greenPixels: number } {
    this.draw()
    // extract.pixels(stage) renders to a temporary RenderTexture and reads back —
    // works regardless of preserveDrawingBuffer setting.
    const { pixels } = (this.app.renderer as unknown as {
      extract: { pixels(t: unknown): { pixels: Uint8ClampedArray } }
    }).extract.pixels(this.app.stage)

    const colors = new Set<string>()
    let nonTransparent = 0, greenPixels = 0
    for (let i = 0; i < pixels.length; i += 64) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3]
      if (a === 0) continue
      nonTransparent++
      if (g > r * 1.15 && g > b * 1.15) greenPixels++
      colors.add(`${r >> 3},${g >> 3},${b >> 3}`)
    }
    return { nonTransparent, uniqueColors: colors.size, greenPixels }
  }

  setHoverTile(col: number, row: number, w = 1, h = 1): void {
    const idx = this.world.inBounds(col, row) ? this._idx(col, row) : -1
    if (idx !== this._hoverIdx || w !== this._hoverW || h !== this._hoverH) {
      this._hoverIdx = idx
      this._hoverW   = Math.max(1, w)
      this._hoverH   = Math.max(1, h)
      this._drawHoverHighlight()
    }
  }

  clearHoverTile(): void {
    if (this._hoverIdx !== -1) {
      this._hoverIdx = -1
      this.hoverGfx.clear()
    }
  }

  setNightMode(on: boolean): void {
    if (on === this._nightMode) return
    this._nightMode = on
    this._resizeNightOverlay()
    this._applyNightTintToBuildings(on)
  }

  /**
   * Square lot sizes (per zone) that have building art in the loaded atlas.
   * Empty when no zone art is present → simulation keeps zones as plain 1×1 lots.
   * Keyed by Zone enum value.
   */
  zoneLotSizes(): Map<number, number[]> {
    const out = new Map<number, Set<number>>()
    for (const [key, meta] of this.atlas.meta) {
      if (!key.startsWith('z:')) continue
      if (meta.footW !== meta.footH) continue // only square lots are claimable
      const zone = Number(key.split(':')[1])
      if (!out.has(zone)) out.set(zone, new Set())
      out.get(zone)!.add(meta.footW)
    }
    const result = new Map<number, number[]>()
    for (const [zone, sizes] of out) result.set(zone, [...sizes].sort((a, b) => b - a))
    return result
  }

  setZoneOverlay(on: boolean): void {
    if (on === this._showZoneOverlay) return
    this._showZoneOverlay = on
    this._zoneLayerDirty  = true
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _idx(col: number, row: number): number {
    return row * this.world.cols + col
  }

  // ── Terrain layers ────────────────────────────────────────────────────────

  private _createTerrainLayers(col: number, row: number): void {
    const tile = this.world.get(col, row)
    const idx  = this._idx(col, row)
    const d    = col + row
    const x    = (col - row) * BASE_HW
    const y    = (col + row) * BASE_HH - tile.elevation * BASE_EH
    const hw   = BASE_HW, hh = BASE_HH, eh = BASE_EH

    const g = new Graphics()

    // Elevation side faces (visible below the tile surface)
    if (tile.elevation > 0) {
      const sideH = tile.elevation * eh
      const by    = y + hh * 2
      g.poly([x - hw, y + hh, x, by, x, by + sideH, x - hw, y + hh + sideH]).fill(ELEV_DARK)
      g.poly([x + hw, y + hh, x, by, x, by + sideH, x + hw, y + hh + sideH]).fill(ELEV_LIGHT)
    }

    // Solid terrain fill (always — serves as background and per-tile grass variation)
    g.poly([x, y, x + hw, y + hh, x, y + hh * 2, x - hw, y + hh])
     .fill(terrainHex(tile.terrain, col, row))

    g.zIndex = d * 3
    this.terrainGfx[idx] = g
    this.worldContainer.addChild(g)

    // Noise texture sprite for non-Grass terrain (Water, Dirt, Forest)
    // Sits above the solid fill, providing rich procedural detail
    if (tile.terrain !== Terrain.Grass) {
      const tex    = this.terrainTexCache.get(tile.terrain)!
      const sprite = new Sprite(tex)
      sprite.x      = x - hw
      sprite.y      = y
      sprite.zIndex = d * 3 + 0.1
      this.terrainSprites[idx] = sprite
      this.worldContainer.addChild(sprite)
    }
  }

  private _destroyTerrainLayers(idx: number): void {
    const g = this.terrainGfx[idx]
    if (g) { this.worldContainer.removeChild(g); g.destroy(); this.terrainGfx[idx] = null }
    const s = this.terrainSprites[idx]
    if (s) { this.worldContainer.removeChild(s); s.destroy({ texture: false }); this.terrainSprites[idx] = null }
  }

  // ── Overlay sprites ──────────────────────────────────────────────────────

  private _roadMask(col: number, row: number): number {
    const { world } = this
    let mask = 0
    if (row > 0            && (world.get(col, row - 1).overlay & Overlay.Road)) mask |= 1
    if (col < world.cols-1 && (world.get(col + 1, row).overlay & Overlay.Road)) mask |= 2
    if (row < world.rows-1 && (world.get(col, row + 1).overlay & Overlay.Road)) mask |= 4
    if (col > 0            && (world.get(col - 1, row).overlay & Overlay.Road)) mask |= 8
    return mask
  }

  private _rebuildOverlay(col: number, row: number): void {
    const idx = this._idx(col, row)
    const old = this.overlaySprites[idx]
    if (old) { this.worldContainer.removeChild(old); old.destroy({ texture: false }); this.overlaySprites[idx] = null }

    const tile = this.world.get(col, row)
    if (!tile.overlay) return

    const mask = (tile.overlay & Overlay.Road) ? this._roadMask(col, row) : 0
    const tex  = this.texCache.get(getOverlayKey(tile.overlay, mask))
    if (!tex) return

    const sprite = new Sprite(tex)
    sprite.anchor.set(0.5, 0)
    sprite.x      = (col - row) * BASE_HW
    sprite.y      = (col + row) * BASE_HH - tile.elevation * BASE_EH
    sprite.zIndex = (col + row) * 3 + 1

    this.overlaySprites[idx] = sprite
    this.worldContainer.addChild(sprite)
  }

  // ── Building sprites ─────────────────────────────────────────────────────

  /**
   * Resolve an atlas sprite for a footprint-origin tile, or null to fall back to
   * the procedural baker. Zone buildings pick a deterministic variant per lot.
   */
  private _resolveSprite(tile: Tile, col: number, row: number): SpriteMeta | null {
    if (tile.density > 0) {
      const bucket = tile.density <= 2 ? 0 : tile.density <= 5 ? 1 : 2
      const rot = this._roadFacingRot(col, row, tile.footW, tile.footH)

      // Pick a base variant (footprint-matched, preferring the current density
      // bucket then nearest), then append the road-facing rotation. atlas.variants
      // holds base keys "z:zone:bucket:variant"; meta is keyed by "...:r{rot}".
      const pick = (base: string): SpriteMeta | null =>
        this.atlas.meta.get(`${base}:r${rot}`) ?? this.atlas.meta.get(`${base}:r0`) ?? null

      const buckets = [0, 1, 2].sort((a, b) => Math.abs(a - bucket) - Math.abs(b - bucket))
      for (const b of buckets) {
        const variants = this.atlas.variants.get(`z:${tile.zone}:${b}`)
        if (!variants) continue
        const fit = variants.filter((base) => {
          const m = this.atlas.meta.get(`${base}:r0`)
          return m && m.footW === tile.footW && m.footH === tile.footH
        })
        if (fit.length > 0) return pick(fit[variantHash(col, row) % fit.length])
      }

      // No art at this footprint anywhere: fall back to any current-bucket variant.
      const variants = this.atlas.variants.get(`z:${tile.zone}:${bucket}`)
      if (variants && variants.length > 0) return pick(variants[variantHash(col, row) % variants.length])
      return null
    }
    return this.atlas.meta.get(`b:${tile.building}`) ?? null
  }

  /**
   * Rotation index (r0–r3) so the building's front faces an adjacent road.
   * The footprint perimeter is checked S, E, N, W (front-facing screen sides first
   * so a visible front is preferred). FRONT_ROT maps a world side → the rotation
   * whose front points that way; calibrated against the rendered sprites
   * (tools/blender/import_kenney.py). Defaults to r0 when no road is adjacent.
   */
  private static FRONT_ROT = { S: 0, E: 1, N: 2, W: 3 } as const

  private _roadFacingRot(col: number, row: number, fw: number, fh: number): number {
    const w = this.world
    const road = (c: number, r: number): boolean =>
      c >= 0 && r >= 0 && c < w.cols && r < w.rows && (w.get(c, r).overlay & Overlay.Road) !== 0
    let south = false, east = false, north = false, west = false
    for (let dc = 0; dc < fw; dc++) {
      if (road(col + dc, row + fh)) south = true
      if (road(col + dc, row - 1)) north = true
    }
    for (let dr = 0; dr < fh; dr++) {
      if (road(col + fw, row + dr)) east = true
      if (road(col - 1, row + dr)) west = true
    }
    if (south) return Renderer.FRONT_ROT.S
    if (east) return Renderer.FRONT_ROT.E
    if (north) return Renderer.FRONT_ROT.N
    if (west) return Renderer.FRONT_ROT.W
    return 0
  }

  private _rebuildBuilding(col: number, row: number): void {
    const idx = this._idx(col, row)
    const old = this.buildingSprites[idx]
    if (old) { this.worldContainer.removeChild(old); old.destroy({ texture: false }); this.buildingSprites[idx] = null }

    const tile = this.world.get(col, row)
    // Only the footprint origin draws a sprite; covered (non-origin) tiles draw none.
    if (tile.rootCol !== -1 || tile.rootRow !== -1) return
    if (tile.density === 0 && tile.building === Building.None) return

    const meta = this._resolveSprite(tile, col, row)
    let sprite: Sprite
    if (meta) {
      sprite = new Sprite(meta.texture)
      sprite.anchor.set(meta.anchorX / meta.frameW, meta.anchorY / meta.frameH)
      sprite.scale.set(meta.scale)
    } else {
      const tex = this.texCache.get(getBuildingKey(tile))
      if (!tex) return
      sprite = new Sprite(tex)
      sprite.anchor.set(0.5, BLDG_APEX_Y / BLDG_CANVAS_H)
      // The procedural texture is baked one tile wide. Scale it up to fill a
      // multi-tile plot so a placed building matches its footprint (and the hover
      // preview) instead of sitting as a 1-tile blob in the middle of the plot.
      // Anchored at the origin tile's north apex, a uniform scale of N grows the
      // base diamond to the NxN plot with the same apex.
      const f = Math.max(tile.footW, tile.footH)
      if (f > 1) sprite.scale.set(f)
    }

    sprite.x = (col - row) * BASE_HW
    sprite.y = (col + row) * BASE_HH - tile.elevation * BASE_EH
    // Sort by the plot's front (south-east) tile so tall multi-tile buildings occlude
    // anything behind them and tuck behind anything in front.
    const frontD = (col + tile.footW - 1) + (row + tile.footH - 1)
    sprite.zIndex = frontD * 3 + 2
    if (this._nightMode) sprite.tint = 0xffcc77

    this.buildingSprites[idx] = sprite
    this.worldContainer.addChild(sprite)
  }

  // ── Zone layer ────────────────────────────────────────────────────────────
  // Single Graphics covering ALL zone tiles.  Rebuilt lazily when zone data changes.

  private _rebuildZoneLayer(): void {
    const g  = this.zoneLayerGfx
    const hw = BASE_HW, hh = BASE_HH
    g.clear()

    this.world.forEach((tile, col, row) => {
      if (tile.zone === Zone.None) return
      const x = (col - row) * hw
      const y = (col + row) * hh - tile.elevation * BASE_EH
      const s = 0.88

      const pts: number[] = [
        x,           y + hh * (1 - s),
        x + hw * s,  y + hh,
        x,           y + hh * (1 + s),
        x - hw * s,  y + hh,
      ]

      if (this._showZoneOverlay) {
        // Semi-transparent coloured fill over all zoned tiles
        const alpha = tile.density === 0 ? 0.22 : 0.12
        g.poly(pts).fill({ color: zoneOutlineHex(tile.zone), alpha })
      }

      // Solid outline only for vacant (density 0) zones
      if (tile.density === 0) {
        g.poly(pts).stroke({ color: zoneOutlineHex(tile.zone), width: 1.5 })
      }
    })

    this._zoneLayerDirty = false
  }

  // ── Water animation ───────────────────────────────────────────────────────
  // Collect references to Water terrain sprites once, then tint-animate each frame.

  private _rebuildWaterList(): void {
    this.waterSpriteList = []
    const { world } = this
    world.forEach((tile, col, row) => {
      if (tile.terrain === Terrain.Water) {
        const s = this.terrainSprites[this._idx(col, row)]
        if (s) this.waterSpriteList.push(s)
      }
    })
    this._waterListDirty = false
  }

  private _animateWater(now: number): void {
    if (this.waterSpriteList.length === 0) return

    // Shimmer: oscillate blue channel between 0x8c and 0xb8
    const phase   = Math.sin(now * 0.0007)              // -1..1 at ~0.11 Hz
    const shimmer = phase * 0.5 + 0.5                   // 0..1
    const rb      = Math.floor(0x1a + shimmer * 0x0a)   // slight red/blue lift
    const gv      = Math.floor(0x5c + shimmer * 0x18)   // more prominent green swing
    const bv      = Math.floor(0x8c + shimmer * 0x2c)   // strong blue swing
    const tint    = (rb << 16) | (gv << 8) | bv

    for (const s of this.waterSpriteList) s.tint = tint
  }

  // ── Hover highlight ───────────────────────────────────────────────────────

  private _drawHoverHighlight(): void {
    const g = this.hoverGfx
    g.clear()
    if (this._hoverIdx < 0) return

    const col  = this._hoverIdx % this.world.cols
    const row  = Math.floor(this._hoverIdx / this.world.cols)
    const hw   = BASE_HW, hh = BASE_HH
    const w    = this._hoverW, h = this._hoverH

    // One unified diamond around the whole footprint (not N separate tile diamonds),
    // so a multi-tile plot previews as a single unit matching the placed building.
    const e  = this.world.get(col, row).elevation
    const bx = (col - row) * hw
    const by = (col + row) * hh - e * BASE_EH
    const pts = [
      bx,                 by,                  // N apex (origin tile top)
      bx + w * hw,        by + w * hh,         // E
      bx + (w - h) * hw,  by + (w + h) * hh,   // S
      bx - h * hw,        by + h * hh,         // W
    ]
    g.poly(pts).fill({ color: 0xffffff, alpha: 0.10 })
    g.poly(pts).stroke({ color: 0xffffff, width: 1.8, alpha: 0.60 })
  }

  // ── Night mode ────────────────────────────────────────────────────────────

  private _resizeNightOverlay(): void {
    const w = this.canvas.width, h = this.canvas.height
    this.nightOverlay.clear()
    if (this._nightMode) {
      this.nightOverlay.rect(0, 0, w, h).fill({ color: 0x05102a, alpha: 0.62 })
    }
    this.nightOverlay.alpha = this._nightMode ? 1 : 0
  }

  private _applyNightTintToBuildings(on: boolean): void {
    const tint = on ? 0xffcc77 : 0xffffff
    for (const s of this.buildingSprites) { if (s) s.tint = tint }
  }

  // ── Minimap ──────────────────────────────────────────────────────────────

  private _positionMinimap(): void {
    const W = this.app.renderer.width
    const H = this.app.renderer.height
    this.minimapSprite.x = W - MINI_W - MINI_MARGIN_R
    this.minimapSprite.y = H - MINI_H - MINI_MARGIN_B
  }

  private _redrawMinimap(): void {
    const ctx = this.minimapHtmlCanvas.getContext('2d')!
    this.minimap.draw(ctx, this.camera, this.app.renderer.width, this.app.renderer.height)
    this.minimapTex.source.update()
    this._positionMinimap()
  }
}
