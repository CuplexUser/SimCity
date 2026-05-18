import { type Tile, defaultTile } from './tile'

export const WORLD_COLS = 128
export const WORLD_ROWS = 128

export class World {
  readonly cols = WORLD_COLS
  readonly rows = WORLD_ROWS
  private tiles: Tile[]

  constructor() {
    this.tiles = Array.from({ length: this.cols * this.rows }, defaultTile)
  }

  inBounds(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows
  }

  get(col: number, row: number): Tile {
    return this.tiles[row * this.cols + col]
  }

  set(col: number, row: number, patch: Partial<Tile>): void {
    if (!this.inBounds(col, row)) return
    Object.assign(this.tiles[row * this.cols + col], patch)
  }

  forEach(fn: (tile: Tile, col: number, row: number) => void): void {
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        fn(this.tiles[row * this.cols + col], col, row)
      }
    }
  }
}
