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
import { loadSpriteAtlas, type AtlasLevel, type LoadedAtlas, type SpriteMeta } from './spriteAtlas'
import { drawTerrainTexture } from './sprites'

// ── Coverage overlays ────────────────────────────────────────────────────────
// A family of data-layer views (like SimCity's query overlays) that tint every
// tile by a service-coverage flag: covered tiles glow in the service color, and
// zoned tiles the service does NOT reach are flagged red — the actionable gap
// telling you where to drop the next station. 'none' hides the overlay.

export type CoverageMode = 'none' | 'water' | 'police' | 'fire' | 'health' | 'education'

interface CoverageDef {
  flag:    (t: Tile) => boolean
  sources: Set<Building>
  color:   number   // covered-tile tint
}

const COVERAGE_DEFS: Record<Exclude<CoverageMode, 'none'>, CoverageDef> = {
  water:     { flag: (t) => t.watered,       sources: new Set([Building.WaterTower, Building.WaterPump, Building.PumpingStation]), color: 0x35a7e0 },
  police:    { flag: (t) => t.policed,       sources: new Set([Building.PoliceStation]), color: 0x3a6cff },
  fire:      { flag: (t) => t.fireProtected, sources: new Set([Building.FireStation]),   color: 0xff8c2a },
  health:    { flag: (t) => t.healthCovered, sources: new Set([Building.Hospital]),      color: 0x35e07a },
  education: { flag: (t) => t.educated,      sources: new Set([Building.School, Building.Library]), color: 0xffd23a },
}

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

// Elevation side face colors
const ELEV_DARK  = 0x2a2a1a
const ELEV_LIGHT = 0x6a6848

// ── Terrain color helpers ───────────────────────────────────────────────────

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
// Grass uses solid-color Graphics (per-tile color variation via grassHex).

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
  private overlayMask:     Int8Array            // road mask baked into each overlay sprite (-1 = none); debug/test signal
  private pylonSprites:    (Sprite   | null)[]   // Blender transmission-pylon sprite, spaced along power runs (atlas only)
  private wireGfx:         (Graphics | null)[]   // catenary conductors spanning between power-line tiles
  private buildingSprites: (Sprite   | null)[]
  private _powerArmH = 30   // screen px from tile apex up to the conductor attach height (from pylon meta)

  // Texture caches and atlases per zoom level (1× always present; 2×/4× are
  // baked/fetched lazily the first time the camera zooms in, then hot-swapped).
  // Keys are identical across levels, so a swap is "same key, other cache".
  private texCaches = new Map<number, TextureCache>()
  private atlases   = new Map<number, LoadedAtlas>()
  private _texLevel: AtlasLevel = 1
  private _levelPending = new Set<number>()
  // Shared terrain textures: one per non-Grass terrain type (3 total)
  private terrainTexCache = new Map<Terrain, Texture>()

  // Fixed-zIndex overlay layers inside worldContainer
  private zoneLayerGfx!: Graphics    // zone outlines (+ fills when overlay enabled)
  private coverageGfx!: Graphics     // coverage view (service color = served, red = uncovered zone)
  private hoverGfx!: Graphics       // hover highlight
  private _hoverW = 1               // footprint width  of the hovered placement
  private _hoverH = 1               // footprint height of the hovered placement

  // Water animation: references to Water terrain sprites
  private waterSpriteList: Sprite[] = []

  // Full-screen night overlay (on app.stage, not inside worldContainer)
  private nightOverlay!: Graphics

  // State flags
  private _nightMode        = false
  private _showZoneOverlay  = false
  private _coverageMode: CoverageMode = 'none'
  private _hoverIdx         = -1
  private _zoneLayerDirty   = true    // rebuild on first draw
  private _coverageDirty    = true    // coverage view geometry
  private _waterListDirty   = true    // rebuild on first draw

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
    this.overlayMask     = new Int8Array(n).fill(-1)
    this.pylonSprites    = new Array(n).fill(null)
    this.wireGfx         = new Array(n).fill(null)
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
    this.texCaches.set(1, bakeAllTextures())

    // Load the building sprite atlas if present (empty map → pure procedural fallback)
    this.atlases.set(1, await loadSpriteAtlas())

    // Conductor attach height: the pylon sprite rises anchorY*scale px above the
    // tile apex; its cross-arms sit near the top, so hang the wires at ~0.82 of
    // that. Falls back to a fixed height when there's no pylon art.
    const pylonMeta = this._baseAtlas.meta.get('infra:pylon')
    if (pylonMeta) this._powerArmH = pylonMeta.anchorY * pylonMeta.scale * 0.66

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

    this.coverageGfx = new Graphics()
    this.coverageGfx.zIndex = 61000   // above zone layer; below hover
    this.coverageGfx.visible = false
    this.worldContainer.addChild(this.coverageGfx)

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

    // Swap texture resolution to match the zoom level (lazy: until the hi-res
    // assets are ready the current textures keep rendering, just GPU-scaled).
    const wantLevel: AtlasLevel = camera.zoom >= 4 ? 4 : camera.zoom >= 2 ? 2 : 1
    if (wantLevel !== this._texLevel) this._setTexLevel(wantLevel)

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
        // Rebuild any road- or power-bearing neighbor's overlay so connections
        // fuse on placement AND retract on bulldoze (road masks, power wires +
        // pylon spacing). Keying off the neighbor (not this tile) covers removal,
        // where this tile no longer carries the overlay itself.
        for (const [dc, dr] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
          const nc = col + dc, nr = row + dr
          if (world.inBounds(nc, nr) && (world.get(nc, nr).overlay & (Overlay.Road | Overlay.PowerLine))) {
            overlayIdxs.add(nr * world.cols + nc)
          }
        }
      }

      for (const idx of dirtyIdxs) {
        const col = idx % world.cols
        const row = Math.floor(idx / world.cols)
        this._destroyTerrainLayers(idx)
        this._createTerrainLayers(col, row)
        this._rebuildBuilding(col, row)   // applies night / zone-overlay tint itself
      }

      for (const idx of overlayIdxs) {
        const col = idx % world.cols
        const row = Math.floor(idx / world.cols)
        this._rebuildOverlay(col, row)
      }

      world.dirty.clear()
      this.worldContainer.sortChildren()

      // Tile changes may affect zone layer, coverage view, and water list
      this._zoneLayerDirty = true
      this._coverageDirty  = true
      this._waterListDirty = true
    }

    if (this._zoneLayerDirty) this._rebuildZoneLayer()
    if (this._coverageMode !== 'none' && this._coverageDirty) this._rebuildCoverageLayer()
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
    this._refreshBuildingTints()
  }

  /**
   * Square lot sizes (per zone) that have building art in the loaded atlas.
   * Empty when no zone art is present → simulation keeps zones as plain 1×1 lots.
   * Keyed by Zone enum value.
   */
  zoneLotSizes(): Map<number, number[]> {
    const out = new Map<number, Set<number>>()
    for (const [key, meta] of this._baseAtlas.meta) {
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
    // Tint developed lots by their zone color so zones read through the buildings.
    this._refreshBuildingTints()
  }

  /** Select the coverage view (water / police / fire / health / education, or
   *  'none' to hide it): tiles a service reaches glow in its color, zoned tiles
   *  it misses turn red (where a new station is needed). */
  setCoverageOverlay(mode: CoverageMode): void {
    if (mode === this._coverageMode) return
    this._coverageMode = mode
    this._coverageDirty = true
    this.coverageGfx.visible = mode !== 'none'
    if (mode === 'none') this.coverageGfx.clear()
  }

  getCoverageOverlay(): CoverageMode {
    return this._coverageMode
  }

  /** Coverage flags (watered/policed/…) change during sim steps without going
   *  through world.set, so the UI pokes this each tick to refresh the live view. */
  markCoverageDirty(): void {
    this._coverageDirty = true
  }

  /** Tint for a building/lot sprite: zone color when the zone overlay is on (so a
   *  developed lot shows its zone through the building), warm glow at night,
   *  otherwise none. Plopped (non-zone) buildings keep the night/neutral tint. */
  private _buildingTint(tile: Tile): number {
    if (this._showZoneOverlay && tile.density > 0 && tile.zone !== Zone.None) {
      return zoneOutlineHex(tile.zone)
    }
    return this._nightMode ? 0xffcc77 : 0xffffff
  }

  /** Re-apply _buildingTint to every existing building sprite (after a night /
   *  zone-overlay toggle) without rebuilding the sprites. */
  private _refreshBuildingTints(): void {
    this.world.forEach((tile, col, row) => {
      const s = this.buildingSprites[this._idx(col, row)]
      if (s) s.tint = this._buildingTint(tile)
    })
    // Pylons follow night mode only (they carry no zone).
    for (const s of this.pylonSprites) { if (s) s.tint = this._nightMode ? 0xffcc77 : 0xffffff }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _idx(col: number, row: number): number {
    return row * this.world.cols + col
  }

  // ── Zoom-level texture swapping ───────────────────────────────────────────

  /** The 1× atlas — always loaded; used for variant *selection* (so a lot keeps
   *  the same building across zoom levels) and as the art fallback. */
  private get _baseAtlas(): LoadedAtlas {
    return this.atlases.get(1)!
  }

  /** Atlas sprite metadata for a key at the current zoom level, falling back to
   *  the 1× atlas. SpriteMeta.scale is absolute (frame-px → world-px), so a
   *  hi-res meta drops in without any further scale compensation. */
  private _atlasMeta(key: string): SpriteMeta | null {
    return this.atlases.get(this._texLevel)?.meta.get(key)
      ?? this._baseAtlas.meta.get(key)
      ?? null
  }

  /** Procedurally baked texture for a key at the current zoom level (falling
   *  back to 1×) plus the resolution it was baked at, which the caller must
   *  divide the sprite scale by to keep the world-space size constant. */
  private _bakedTex(key: string): { tex: Texture; bakeScale: number } | null {
    const lvl = this.texCaches.get(this._texLevel)?.get(key)
    if (lvl) return { tex: lvl, bakeScale: this._texLevel }
    const base = this.texCaches.get(1)!.get(key)
    return base ? { tex: base, bakeScale: 1 } : null
  }

  /** Switch to a zoom level's textures, preparing its assets on first use. */
  private _setTexLevel(level: AtlasLevel): void {
    if (!this.texCaches.has(level)) {
      if (!this._levelPending.has(level)) {
        this._levelPending.add(level)
        loadSpriteAtlas(level).then((atlas) => {
          // Missing manifest → empty atlas: art falls back to 1× but the
          // procedural bake below still sharpens roads + fallback buildings.
          this.atlases.set(level, atlas)
          this.texCaches.set(level, bakeAllTextures(level))
          this._levelPending.delete(level)
          // draw() re-requests the level on the next frame and swaps in.
        })
      }
      return
    }
    this._texLevel = level
    this._refreshAllSprites()
  }

  /** Re-resolve textures on every existing overlay/building sprite. */
  private _refreshAllSprites(): void {
    this.world.forEach((_tile, col, row) => {
      const idx = this._idx(col, row)
      if (this.overlaySprites[idx] || this.pylonSprites[idx] || this.wireGfx[idx]) this._rebuildOverlay(col, row)
      if (this.buildingSprites[idx]) this._rebuildBuilding(col, row)
    })
    this.worldContainer.sortChildren()
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

  /** Road connection mask currently baked into the rendered overlay sprite at
   *  (col,row), or -1 if no road overlay is drawn there. Exposed for tests so
   *  they can assert neighbor sprites actually rebuild on placement/removal. */
  renderedRoadMask(col: number, row: number): number {
    return this.overlayMask[this._idx(col, row)]
  }

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
    const oldPylon = this.pylonSprites[idx]
    if (oldPylon) { this.worldContainer.removeChild(oldPylon); oldPylon.destroy({ texture: false }); this.pylonSprites[idx] = null }
    const oldWire = this.wireGfx[idx]
    if (oldWire) { this.worldContainer.removeChild(oldWire); oldWire.destroy(); this.wireGfx[idx] = null }
    this.overlayMask[idx] = -1

    const tile = this.world.get(col, row)
    if (!tile.overlay) return

    // ── Power lines: live conductors + spaced transmission pylons ────────────
    // Wires are drawn to the connected E/S neighbors (each network edge owned by
    // one tile) at a constant attach height, so adjacent half-spans meet into a
    // continuous line. A pylon is plopped only periodically (corners, junctions,
    // ends, every 3rd tile of a straight run) so runs don't read as a solid mesh.
    if (tile.overlay & Overlay.PowerLine) {
      const pmask = this._powerMask(col, row)
      this._drawWires(idx, col, row, tile, pmask)
      if (this._pylonAt(col, row, pmask) && tile.building === Building.None && tile.density === 0) {
        this._placePylon(idx, col, row, tile, pmask)
      }
    }

    // ── Roads: baked tile texture keyed by neighbor mask ─────────────────────
    if (tile.overlay & Overlay.Road) {
      const mask = this._roadMask(col, row)
      this.overlayMask[idx] = mask
      const baked = this._bakedTex(getOverlayKey(Overlay.Road, mask))
      if (baked) {
        const sprite = new Sprite(baked.tex)
        sprite.anchor.set(0.5, 0)
        sprite.scale.set(1 / baked.bakeScale)
        sprite.x      = (col - row) * BASE_HW
        sprite.y      = (col + row) * BASE_HH - tile.elevation * BASE_EH
        sprite.zIndex = (col + row) * 3 + 1
        this.overlaySprites[idx] = sprite
        this.worldContainer.addChild(sprite)
      }
    }
  }

  /** 4-bit mask of power-line neighbors: E=1, W=2, S=4, N=8. */
  private _powerMask(col: number, row: number): number {
    const w = this.world
    const p = (c: number, r: number): number =>
      w.inBounds(c, r) && (w.get(c, r).overlay & Overlay.PowerLine) ? 1 : 0
    return p(col + 1, row) | (p(col - 1, row) << 1) | (p(col, row + 1) << 2) | (p(col, row - 1) << 3)
  }

  /** Whether this power tile gets a pylon: ends/junctions/corners always, plus
   *  every 3rd tile of a straight run (so runs aren't a wall of pylons). */
  private _pylonAt(col: number, row: number, pmask: number): boolean {
    const E = !!(pmask & 1), W = !!(pmask & 2), S = !!(pmask & 4), N = !!(pmask & 8)
    const count = (E ? 1 : 0) + (W ? 1 : 0) + (S ? 1 : 0) + (N ? 1 : 0)
    if (count !== 2) return true                    // isolated, dead-end, junction
    const straightCol = E && W, straightRow = S && N
    if (!straightCol && !straightRow) return true   // corner (direction change)
    return straightCol ? col % 3 === 0 : row % 3 === 0
  }

  /** Conductor attach point (screen space, at arm height) for a power tile. */
  private _wireHub(col: number, row: number): { x: number; y: number } {
    const t = this.world.get(col, row)
    return {
      x: (col - row) * BASE_HW,
      y: (col + row) * BASE_HH - t.elevation * BASE_EH - this._powerArmH,
    }
  }

  /** Draw the catenary conductors this tile owns (toward its E and S neighbors). */
  private _drawWires(idx: number, col: number, row: number, tile: Tile, pmask: number): void {
    const g = new Graphics()
    g.zIndex = (col + row) * 3 + 2.5
    const a = this._wireHub(col, row)

    const span = (nc: number, nr: number): void => {
      const b = this._wireHub(nc, nr)
      const dx = b.x - a.x, dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      const ox = (-dy / len) * 3, oy = (dx / len) * 3   // perpendicular split
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + 5   // mid-span sag
      for (const s of [-1, 1]) {
        g.moveTo(a.x + ox * s, a.y + oy * s)
        g.quadraticCurveTo(mx + ox * s, my + oy * s, b.x + ox * s, b.y + oy * s)
      }
      g.stroke({ color: 0x111111, width: 1, alpha: 0.8 })
    }
    if (pmask & 1) span(col + 1, row)   // E edge
    if (pmask & 4) span(col, row + 1)   // S edge

    // No pylon art: draw a simple pole so power runs still read in the fallback.
    if (!this._baseAtlas.meta.get('infra:pylon') && this._pylonAt(col, row, pmask)) {
      const baseY = (col + row) * BASE_HH - tile.elevation * BASE_EH + BASE_HH
      g.moveTo(a.x, baseY).lineTo(a.x, a.y - 2).stroke({ color: 0x6a5a38, width: 2 })
      g.moveTo(a.x - 10, a.y).lineTo(a.x + 10, a.y).stroke({ color: 0x6a5a38, width: 1.5 })
    }

    this.wireGfx[idx] = g
    this.worldContainer.addChild(g)
  }

  /** Plop the Blender transmission pylon, re-aiming its cross-arms to the run. */
  private _placePylon(idx: number, col: number, row: number, tile: Tile, pmask: number): void {
    const meta = this._atlasMeta('infra:pylon')
    if (!meta) return   // fallback pole is drawn in _drawWires
    const p = new Sprite(meta.texture)
    p.anchor.set(meta.anchorX / meta.frameW, meta.anchorY / meta.frameH)
    p.scale.set(meta.scale)
    // The pylon's cross-arms project along the col-axis diagonal, which already
    // sits across an N–S (row-axis) run. For a straight E–W (col-axis) run the
    // arms would run *along* the wire, so a horizontal flip re-aims them across it.
    const E = !!(pmask & 1), W = !!(pmask & 2), S = !!(pmask & 4), N = !!(pmask & 8)
    if (E && W && !(S || N)) p.scale.x = -meta.scale
    p.x      = (col - row) * BASE_HW
    p.y      = (col + row) * BASE_HH - tile.elevation * BASE_EH
    p.zIndex = (col + row) * 3 + 2
    if (this._nightMode) p.tint = 0xffcc77
    this.pylonSprites[idx] = p
    this.worldContainer.addChild(p)
  }

  /** Test/debug: whether a Blender pylon sprite is currently drawn at this tile. */
  hasPylon(col: number, row: number): boolean {
    return this.pylonSprites[this._idx(col, row)] != null
  }

  /** Test/debug: whether a building/lot sprite is currently drawn at this tile. */
  hasBuildingSprite(col: number, row: number): boolean {
    return this.buildingSprites[this._idx(col, row)] != null
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
      // bucket then nearest), then append the road-facing rotation. Selection
      // always runs against the 1× atlas so a lot keeps the same variant at
      // every zoom level; only the final meta lookup is level-dependent.
      const pick = (base: string): SpriteMeta | null =>
        this._atlasMeta(`${base}:r${rot}`) ?? this._atlasMeta(`${base}:r0`)

      const buckets = [0, 1, 2].sort((a, b) => Math.abs(a - bucket) - Math.abs(b - bucket))
      for (const b of buckets) {
        const variants = this._baseAtlas.variants.get(`z:${tile.zone}:${b}`)
        if (!variants) continue
        const fit = variants.filter((base) => {
          const m = this._baseAtlas.meta.get(`${base}:r0`)
          return m && m.footW === tile.footW && m.footH === tile.footH
        })
        if (fit.length > 0) return pick(fit[variantHash(col, row) % fit.length])
      }

      // No art at this footprint anywhere: fall back to any current-bucket variant.
      const variants = this._baseAtlas.variants.get(`z:${tile.zone}:${bucket}`)
      if (variants && variants.length > 0) return pick(variants[variantHash(col, row) % variants.length])
      return null
    }
    return this._atlasMeta(`b:${tile.building}`)
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
      const baked = this._bakedTex(getBuildingKey(tile))
      if (!baked) return
      sprite = new Sprite(baked.tex)
      sprite.anchor.set(0.5, BLDG_APEX_Y / BLDG_CANVAS_H)
      // The procedural texture is baked one tile wide (at bakeScale× resolution).
      // Scale it up to fill a multi-tile plot so a placed building matches its
      // footprint (and the hover preview) instead of sitting as a 1-tile blob in
      // the middle of the plot. Anchored at the origin tile's north apex, a
      // uniform scale of N grows the base diamond to the NxN plot with the same apex.
      const f = Math.max(tile.footW, tile.footH)
      sprite.scale.set(f / baked.bakeScale)
    }

    sprite.x = (col - row) * BASE_HW
    sprite.y = (col + row) * BASE_HH - tile.elevation * BASE_EH
    // Sort by the plot's front (south-east) tile so tall multi-tile buildings occlude
    // anything behind them and tuck behind anything in front.
    const frontD = (col + tile.footW - 1) + (row + tile.footH - 1)
    sprite.zIndex = frontD * 3 + 2
    sprite.tint = this._buildingTint(tile)

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

      const color = zoneOutlineHex(tile.zone)

      if (this._showZoneOverlay) {
        // Bold colored fill + outline over every zoned tile so the overlay reads
        // clearly even where a building sits on the plot (the building sprite is
        // additionally tinted by zone — see _buildingTint).
        const alpha = tile.density === 0 ? 0.40 : 0.32
        g.poly(pts).fill({ color, alpha })
        g.poly(pts).stroke({ color, width: 2, alpha: 0.85 })
      } else if (tile.density === 0) {
        // Default (overlay off): solid outline only for vacant (density 0) zones.
        g.poly(pts).stroke({ color, width: 1.5 })
      }
    })

    this._zoneLayerDirty = false
  }

  // ── Coverage view ───────────────────────────────────────────────────────────
  // A single Graphics tinting each tile by a service-coverage flag, so the player
  // can see exactly how far the current stations reach and which zones still need
  // service. Selected via setCoverageOverlay (water / police / fire / health /
  // education).
  //   service color = served (within a source's range)
  //   red           = a zoned tile that is NOT served → drop a new station here
  // Source buildings (always served) get a brighter ring so their hubs stand out.

  private _rebuildCoverageLayer(): void {
    if (this._coverageMode === 'none') return
    const def = COVERAGE_DEFS[this._coverageMode]
    const g  = this.coverageGfx
    const hw = BASE_HW, hh = BASE_HH
    g.clear()

    this.world.forEach((tile, col, row) => {
      const x = (col - row) * hw
      const y = (col + row) * hh - tile.elevation * BASE_EH
      const s = 0.94
      const pts = [
        x,          y + hh * (1 - s),
        x + hw * s, y + hh,
        x,          y + hh * (1 + s),
        x - hw * s, y + hh,
      ]

      if (def.flag(tile)) {
        g.poly(pts).fill({ color: def.color, alpha: 0.30 })
      } else if (tile.zone !== Zone.None) {
        // A zoned tile the service doesn't reach — the actionable gap.
        g.poly(pts).fill({ color: 0xff4040, alpha: 0.38 })
        g.poly(pts).stroke({ color: 0xff6060, width: 1, alpha: 0.6 })
      }

      if (def.sources.has(tile.building)) {
        g.poly(pts).stroke({ color: 0xffffff, width: 2.4, alpha: 0.9 })
      }
    })

    this._coverageDirty = false
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
