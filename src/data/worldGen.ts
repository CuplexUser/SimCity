import { createNoise2D } from 'simplex-noise'
import { makeRng } from '../utils/rng'
import { type World } from '../core/world'
import { Terrain } from '../core/tile'

export function generateWorld(world: World, seed = 42): void {
  const rng    = makeRng(seed)
  const noise2D = createNoise2D(rng)

  const { cols, rows } = world

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const nx = col / cols - 0.5
      const ny = row / rows - 0.5

      // Multi-octave noise
      const n =
        noise2D(nx * 3,  ny * 3)  * 0.55 +
        noise2D(nx * 7,  ny * 7)  * 0.30 +
        noise2D(nx * 15, ny * 15) * 0.15

      // Elevation 0–7
      const elevation = Math.max(0, Math.min(7, Math.round((n + 1) * 3.5)))

      let terrain: Terrain
      if (elevation === 0)      terrain = Terrain.Water
      else if (elevation === 1) terrain = Terrain.Dirt
      else if (elevation >= 6)  terrain = Terrain.Forest
      else                      terrain = Terrain.Grass

      world.set(col, row, { terrain, elevation })
    }
  }
}
