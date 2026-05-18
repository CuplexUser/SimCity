import { describe, it, expect, beforeEach } from 'vitest'
import { IsoCamera, TILE_W, TILE_H, ELEV_H } from './isoCamera'

describe('IsoCamera', () => {
  let cam: IsoCamera

  beforeEach(() => { cam = new IsoCamera() })

  it('worldToScreen origin at (0,0) equals panX/panY', () => {
    cam.panX = 100; cam.panY = 200
    const s = cam.worldToScreen(0, 0, 0)
    expect(s.x).toBe(100)
    expect(s.y).toBe(200)
  })

  it('worldToScreen advances right for increasing col', () => {
    const a = cam.worldToScreen(0, 0)
    const b = cam.worldToScreen(1, 0)
    expect(b.x).toBeGreaterThan(a.x)
    expect(b.y).toBeGreaterThan(a.y)
  })

  it('worldToScreen advances left for increasing row', () => {
    const a = cam.worldToScreen(0, 0)
    const b = cam.worldToScreen(0, 1)
    expect(b.x).toBeLessThan(a.x)
    expect(b.y).toBeGreaterThan(a.y)
  })

  it('elevation shifts tile upward on screen', () => {
    const flat = cam.worldToScreen(5, 5, 0)
    const elevated = cam.worldToScreen(5, 5, 3)
    expect(elevated.y).toBeLessThan(flat.y)
    expect(elevated.y).toBe(flat.y - 3 * ELEV_H * cam.zoom)
  })

  it('screenToWorld round-trips flat tiles', () => {
    cam.panX = 400; cam.panY = 300
    for (const [col, row] of [[0,0],[10,5],[3,12],[64,64]] as [number,number][]) {
      const s = cam.worldToScreen(col, row, 0)
      // worldToScreen returns the top apex; passing it directly to screenToWorld round-trips exactly
      const w = cam.screenToWorld(s.x, s.y)
      expect(w.col).toBe(col)
      expect(w.row).toBe(row)
    }
  })

  it('snapZoom moves to next step on scroll-down', () => {
    cam.zoom = 1
    cam.snapZoom(100, 0, 0)   // deltaY > 0 = zoom out
    expect(cam.zoom).toBe(0.5)
  })

  it('snapZoom moves to next step on scroll-up', () => {
    cam.zoom = 1
    cam.snapZoom(-100, 0, 0)  // deltaY < 0 = zoom in
    expect(cam.zoom).toBe(2)
  })

  it('snapZoom clamps at min/max', () => {
    cam.zoom = 0.5
    cam.snapZoom(100, 0, 0)
    expect(cam.zoom).toBe(0.5)

    cam.zoom = 4
    cam.snapZoom(-100, 0, 0)
    expect(cam.zoom).toBe(4)
  })

  it('hw/hh/eh getters match zoom-scaled constants', () => {
    cam.zoom = 2
    expect(cam.hw).toBe(TILE_W)        // (64*2)/2
    expect(cam.hh).toBe(TILE_H)        // (32*2)/2
    expect(cam.eh).toBe(ELEV_H * 2)
  })
})
