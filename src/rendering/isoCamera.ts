export const TILE_W   = 64   // tile bounding-box width  at 1× zoom
export const TILE_H   = 32   // tile bounding-box height at 1× zoom
export const ELEV_H   = 8    // vertical px per elevation level at 1× zoom

const ZOOM_MIN   = 0.5
const ZOOM_MAX   = 4.0
const ZOOM_STEPS = [0.5, 1, 2, 4] as const

export class IsoCamera {
  panX = 0
  panY = 0
  zoom = 1.0

  // World (col, row, elevation) → screen position of the tile's top apex
  worldToScreen(col: number, row: number, elevation = 0): { x: number; y: number } {
    const hw = (TILE_W * this.zoom) / 2
    const hh = (TILE_H * this.zoom) / 2
    const eh = ELEV_H * this.zoom
    return {
      x: (col - row) * hw + this.panX,
      y: (col + row) * hh - elevation * eh + this.panY,
    }
  }

  // Screen (px, py) → world tile coordinates (ignores elevation)
  screenToWorld(px: number, py: number): { col: number; row: number } {
    const hw = (TILE_W * this.zoom) / 2
    const hh = (TILE_H * this.zoom) / 2
    const nx = (px - this.panX) / hw
    const ny = (py - this.panY) / hh
    return {
      col: Math.floor((nx + ny) / 2),
      row: Math.floor((ny - nx) / 2),
    }
  }

  pan(dx: number, dy: number): void {
    this.panX += dx
    this.panY += dy
  }

  // Continuous zoom anchored to a screen point
  setZoom(newZoom: number, originX: number, originY: number): void {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom))
    const ratio   = clamped / this.zoom
    this.panX = originX + (this.panX - originX) * ratio
    this.panY = originY + (this.panY - originY) * ratio
    this.zoom = clamped
  }

  // Snap to the nearest discrete zoom step
  snapZoom(wheelDelta: number, originX: number, originY: number): void {
    const steps = ZOOM_STEPS as readonly number[]
    const cur   = steps.reduce((best, z, i) =>
      Math.abs(z - this.zoom) < Math.abs(steps[best] - this.zoom) ? i : best, 0)
    const next  = Math.max(0, Math.min(steps.length - 1, cur + (wheelDelta > 0 ? -1 : 1)))
    this.setZoom(steps[next], originX, originY)
  }

  // Half-extents at current zoom (shortcuts used by renderers)
  get hw(): number { return (TILE_W * this.zoom) / 2 }
  get hh(): number { return (TILE_H * this.zoom) / 2 }
  get eh(): number { return ELEV_H * this.zoom }
}
