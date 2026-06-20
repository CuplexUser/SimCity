import { type World } from '../core/world'
import { Building, Terrain } from '../core/tile'
import { floodFill } from '../utils/floodfill'

// Coverage ranges (BFS tiles, blocked by water) — mirror crime/fire stations.
const HOSPITAL_RANGE = 20
const SCHOOL_RANGE   = 15
const LIBRARY_RANGE  = 10

/**
 * Recomputes health (hospitals) and education (schools + libraries) coverage,
 * setting tile.healthCovered / tile.educated. Like crime/fire this runs every
 * sim tick; zone desirability reads the flags so service buildings actually
 * matter to how a city grows.
 */
export function stepServices(world: World): void {
  const hospitals: { col: number; row: number }[] = []
  const schools:   { col: number; row: number }[] = []
  const libraries: { col: number; row: number }[] = []

  world.forEach((tile, col, row) => {
    tile.healthCovered = false
    tile.educated      = false
    if (tile.building === Building.Hospital) hospitals.push({ col, row })
    if (tile.building === Building.School)   schools.push({ col, row })
    if (tile.building === Building.Library)  libraries.push({ col, row })
  })

  const passable = (tile: { terrain: Terrain }) => tile.terrain !== Terrain.Water

  if (hospitals.length > 0) {
    floodFill(world, hospitals, HOSPITAL_RANGE, passable, (col, row) => {
      world.get(col, row).healthCovered = true
    })
  }

  // Schools reach further than libraries; both confer education coverage.
  if (schools.length > 0) {
    floodFill(world, schools, SCHOOL_RANGE, passable, (col, row) => {
      world.get(col, row).educated = true
    })
  }
  if (libraries.length > 0) {
    floodFill(world, libraries, LIBRARY_RANGE, passable, (col, row) => {
      world.get(col, row).educated = true
    })
  }
}
