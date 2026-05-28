/**
 * renderer.ts — PixiJS v8 scene manager
 *
 * Scene hierarchy:
 *   app.stage
 *     worldContainer  (Container, sortableChildren=true)
 *       terrain Graphics per tile  (zIndex = d*3 + 0)
 *       overlay Sprites per tile   (zIndex = d*3 + 1)
 *       building Sprites per tile  (zIndex = d*3 + 2)
 *     minimapSprite  (fixed bottom-right, not in worldContainer)
 *
 * Pan / zoom:
 *   worldContainer.x = camera.panX
 *   worldContainer.y = camera.panY
 *   worldContainer.scale.set(camera.zoom)
 *
 * All sprite positions are in "base" world-container coords (zoom=1 units).
 * The container scale handles all zoom scaling on the GPU — no texture re-bake needed.
 */

import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js'
import { type World } from '../core/world'
import { type IsoCamera, TILE_W, TILE_H, ELEV_H } from './isoCamera'
import { Terrain, Zone, Overlay, Building } from '../core/tile'
import { Minimap, MINI_W, MINI_H, MINI_MARGIN_R, MINI_MARGIN_B } from './minimap'
import {
  bakeAllTextures, type TextureCache,
  getBuildingKey, getOverlayKey,
  BLDG_CANVAS_H, BLDG_APEX_Y,
} from './tileTextures'

// ── Tile layout constants (base zoom = 1) ────────────────────────────────────
const BASE_HW = TILE_W / 2   // 32
const BASE_HH = TILE_H / 2   // 16
const BASE_EH = ELEV_H        // 8

// Elevation side face colours (approximate palette values)
const ELEV_DARK  = 0x2a2a1a
const ELEV_LIGHT = 0x6a6848

// ── Terrain colour helpers ───────────────────────────────────────────────────

function grassHex(col: number, row: number): number {
  // Deterministic per-tile variation without noise function dependency
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

// ── Renderer ─────────────────────────────────────────────────────────────────

export class Renderer {
  readonly minimap: Minimap

  private app!: Application
  private worldContainer!: Container

  // Per-tile arrays (index = row * cols + col)
  private terrainGfx:      (Graphics | null)[]
  private overlaySprites:  (Sprite  | null)[]
  private buildingSprites: (Sprite  | null)[]

  private texCache!: TextureCache

  // Minimap rendered into an HTMLCanvasElement, displayed as a PixiJS Sprite
  private minimapHtmlCanvas!: HTMLCanvasElement
  private minimapTex!: Texture
  private minimapSprite!: Sprite

  // ── Constructor (sync — call create() for async init) ─────────────────────

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly world:  World,
    private readonly camera: IsoCamera,
  ) {
    this.minimap = new Minimap(world)
    const n = world.cols * world.rows
    this.terrainGfx      = new Array(n).fill(null)
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

    // PixiJS Application
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
    this.app.ticker.stop()   // manual render via draw()

    // World container — pan / zoom
    this.worldContainer = new Container()
    this.worldContainer.sortableChildren = true
    this.app.stage.addChild(this.worldContainer)

    // Pre-bake all building + overlay textures (~100 total)
    this.texCache = bakeAllTextures()

    // Create terrain Graphics for every tile, in diagonal (painter's) order
    for (let d = 0; d <= world.cols + world.rows - 2; d++) {
      const colMin = Math.max(0, d - world.rows + 1)
      const colMax = Math.min(d, world.cols - 1)
      for (let col = colMin; col <= colMax; col++) {
        const row = d - col
        this._createTerrainGfx(col, row)
      }
    }

    // Create overlay + building sprites for any tiles that already have them
    world.forEach((tile, col, row) => {
      if (tile.overlay)                                     this._rebuildOverlay(col, row)
      if (tile.density > 0 || tile.building !== Building.None) this._rebuildBuilding(col, row)
    })

    this.worldContainer.sortChildren()

    // Minimap: HTMLCanvasElement → PIXI.Texture → PIXI.Sprite (outside worldContainer)
    this.minimapHtmlCanvas        = document.createElement('canvas')
    this.minimapHtmlCanvas.width  = MINI_W
    this.minimapHtmlCanvas.height = MINI_H
    this.minimapTex    = Texture.from(this.minimapHtmlCanvas)
    this.minimapSprite = new Sprite(this.minimapTex)
    this.app.stage.addChild(this.minimapSprite)
    this._positionMinimap()

    // Clear startup dirty flags (world was not "changed" — we just initialised)
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
      // Expand dirty set: road changes also affect neighbour overlays
      const dirtyIdxs   = new Set<number>()
      const overlayIdxs = new Set<number>()

      for (const idx of world.dirty) {
        dirtyIdxs.add(idx)
        overlayIdxs.add(idx)
        const col = idx % world.cols
        const row = Math.floor(idx / world.cols)
        if (world.get(col, row).overlay & Overlay.Road) {
          for (const [dc, dr] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
            const nc = col + dc, nr = row + dr
            if (world.inBounds(nc, nr)) overlayIdxs.add(nr * world.cols + nc)
          }
        }
      }

      // Rebuild terrain Graphics and building sprites for genuinely dirty tiles
      for (const idx of dirtyIdxs) {
        const col = idx % world.cols
        const row = Math.floor(idx / world.cols)
        this._destroyTerrainGfx(idx)
        this._createTerrainGfx(col, row)
        this._rebuildBuilding(col, row)
      }

      // Rebuild overlay sprites (wider set — includes road-mask neighbours)
      for (const idx of overlayIdxs) {
        const col = idx % world.cols
        const row = Math.floor(idx / world.cols)
        this._rebuildOverlay(col, row)
      }

      world.dirty.clear()
      this.worldContainer.sortChildren()
    }

    // Minimap
    this._redrawMinimap()

    // Render
    this.app.renderer.render({ container: this.app.stage })
  }

  resize(w: number, h: number): void {
    this.app.renderer.resize(w, h)
    this._positionMinimap()
  }

  // ── Terrain Graphics ─────────────────────────────────────────────────────

  private _idx(col: number, row: number): number {
    return row * this.world.cols + col
  }

  private _destroyTerrainGfx(idx: number): void {
    const g = this.terrainGfx[idx]
    if (!g) return
    this.worldContainer.removeChild(g)
    g.destroy()
    this.terrainGfx[idx] = null
  }

  private _createTerrainGfx(col: number, row: number): void {
    const tile = this.world.get(col, row)
    const idx  = this._idx(col, row)

    const g  = new Graphics()
    const x  = (col - row) * BASE_HW
    const y  = (col + row) * BASE_HH - tile.elevation * BASE_EH
    const hw = BASE_HW, hh = BASE_HH, eh = BASE_EH

    // Elevation side faces (extend below the tile)
    if (tile.elevation > 0) {
      const sideH = tile.elevation * eh
      const by    = y + hh * 2
      g.poly([x - hw, y + hh, x, by, x, by + sideH, x - hw, y + hh + sideH]).fill(ELEV_DARK)
      g.poly([x + hw, y + hh, x, by, x, by + sideH, x + hw, y + hh + sideH]).fill(ELEV_LIGHT)
    }

    // Terrain surface diamond
    g.poly([x, y, x + hw, y + hh, x, y + hh * 2, x - hw, y + hh])
     .fill(terrainHex(tile.terrain, col, row))

    // Vacant-zone outline (drawn in terrain layer so buildings replace it)
    if (tile.zone !== Zone.None && tile.density === 0) {
      const s = 0.88
      g.poly([x, y + hh*(1-s), x + hw*s, y + hh, x, y + hh*(1+s), x - hw*s, y + hh])
       .stroke({ color: zoneOutlineHex(tile.zone), width: 1.5 })
    }

    g.zIndex = (col + row) * 3 + 0
    this.terrainGfx[idx] = g
    this.worldContainer.addChild(g)
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
    sprite.anchor.set(0.5, 0)   // top-centre → tile top apex
    sprite.x      = (col - row) * BASE_HW
    sprite.y      = (col + row) * BASE_HH - tile.elevation * BASE_EH
    sprite.zIndex = (col + row) * 3 + 1

    this.overlaySprites[idx] = sprite
    this.worldContainer.addChild(sprite)
  }

  // ── Building sprites ─────────────────────────────────────────────────────

  private _rebuildBuilding(col: number, row: number): void {
    const idx = this._idx(col, row)
    const old = this.buildingSprites[idx]
    if (old) { this.worldContainer.removeChild(old); old.destroy({ texture: false }); this.buildingSprites[idx] = null }

    const tile = this.world.get(col, row)
    if (tile.density === 0 && tile.building === Building.None) return

    const tex = this.texCache.get(getBuildingKey(tile))
    if (!tex) return

    const sprite = new Sprite(tex)
    sprite.anchor.set(0.5, BLDG_APEX_Y / BLDG_CANVAS_H)
    sprite.x      = (col - row) * BASE_HW
    sprite.y      = (col + row) * BASE_HH - tile.elevation * BASE_EH
    sprite.zIndex = (col + row) * 3 + 2

    this.buildingSprites[idx] = sprite
    this.worldContainer.addChild(sprite)
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
