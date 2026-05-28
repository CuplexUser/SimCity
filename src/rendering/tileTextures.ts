/**
 * tileTextures.ts — pre-bakes all building and overlay combinations onto
 * OffscreenCanvases and returns them as PIXI.Texture objects.
 *
 * Baking strategy:
 *  - Building textures: one per (zone, density) pair + one per specific building
 *  - Overlay textures:  one per (overlay bitmask, road-neighbour mask) pair
 *
 * Canvas sizes:
 *  - Building canvas: TILE_W × BLDG_CANVAS_H; tile apex at y = BLDG_APEX_Y
 *  - Overlay canvas:  TILE_W × TILE_H;        tile apex at y = 0
 *
 * All canvases are drawn at zoom = 1 (base units).  The PixiJS world-container
 * applies the zoom scale so we only need one set of textures.
 */

import { Texture } from 'pixi.js'
import { Zone, Overlay, Building, type Tile } from '../core/tile'
import { TILE_W, TILE_H } from './isoCamera'
import { drawZoneBuilding, drawBuilding, drawRoadTile, drawPowerLineTile } from './tileRenderer'

// ── Canvas dimension constants ─────────────────────────────────────────────────

export const BLDG_CANVAS_W = TILE_W         // 64 px
export const BLDG_CANVAS_H = TILE_H * 10   // 320 px — tall enough for any building
export const BLDG_APEX_Y   = TILE_H * 7    // 224 px — where drawing functions receive cy

// ── Key helpers ────────────────────────────────────────────────────────────────

export function getBuildingKey(tile: Tile): string {
  return tile.density > 0
    ? `z:${tile.zone}:${tile.density}`
    : `b:${tile.building}`
}

export function getOverlayKey(overlay: number, roadMask: number): string {
  return `o:${overlay}:${roadMask}`
}

// ── Internal bakers ────────────────────────────────────────────────────────────

function bakeBuilding(tile: Tile): Texture {
  const hw = TILE_W / 2, hh = TILE_H / 2
  const cx = BLDG_CANVAS_W / 2  // 32 — centre of canvas
  const cy = BLDG_APEX_Y        // 224 — tile apex Y in canvas-local coords

  const oc  = new OffscreenCanvas(BLDG_CANVAS_W, BLDG_CANVAS_H)
  const ctx = oc.getContext('2d')!

  if (tile.density > 0) {
    drawZoneBuilding(ctx, cx, cy, hw, hh, tile.zone, tile.density)
  } else {
    drawBuilding(ctx, cx, cy, hw, hh, tile.building)
  }

  return Texture.from(oc.transferToImageBitmap())
}

function bakeOverlay(overlay: number, roadMask: number): Texture {
  const hw = TILE_W / 2, hh = TILE_H / 2
  const cx = TILE_W / 2  // 32
  const cy = 0           // tile apex at top of canvas

  const oc  = new OffscreenCanvas(TILE_W, TILE_H)
  const ctx = oc.getContext('2d')!

  if (overlay & Overlay.Road)      drawRoadTile(ctx, cx, cy, hw, hh, roadMask, 1)
  if (overlay & Overlay.PowerLine) drawPowerLineTile(ctx, cx, cy, hw, hh, 1)

  return Texture.from(oc.transferToImageBitmap())
}

// ── Public API ─────────────────────────────────────────────────────────────────

export type TextureCache = Map<string, Texture>

/** Pre-bake every possible building and overlay texture. ~100 textures total. */
export function bakeAllTextures(): TextureCache {
  const cache: TextureCache = new Map()

  // Zone buildings  (zone × density = 3 × 9 = 27)
  for (const zone of [Zone.Residential, Zone.Commercial, Zone.Industrial]) {
    for (let density = 1; density <= 9; density++) {
      const stub = { zone, density, building: Building.None } as Tile
      cache.set(`z:${zone}:${density}`, bakeBuilding(stub))
    }
  }

  // Specific buildings (14)
  const allBldgs: Building[] = [
    Building.PowerPlant, Building.GasTurbine, Building.Nuclear,
    Building.SolarFarm,  Building.WindTurbine, Building.WaterTower,
    Building.PoliceStation, Building.FireStation, Building.Hospital,
    Building.School, Building.Library,
  ]
  for (const bldg of allBldgs) {
    const stub = { building: bldg, zone: Zone.None, density: 0 } as Tile
    cache.set(`b:${bldg}`, bakeBuilding(stub))
  }

  // Overlays: overlay bitmask (1=road, 2=power, 3=both) × road-mask (0-15) = 48
  for (const ov of [Overlay.Road, Overlay.PowerLine, Overlay.Road | Overlay.PowerLine]) {
    for (let mask = 0; mask < 16; mask++) {
      cache.set(getOverlayKey(ov, mask), bakeOverlay(ov, mask))
    }
  }

  return cache
}
