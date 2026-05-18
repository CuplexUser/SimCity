import { type World } from '../core/world'
import { Zone, Overlay } from '../core/tile'

// Annual revenue per density level per zone type
const ZONE_TAX: Record<Zone, number> = {
  [Zone.None]:        0,
  [Zone.Residential]: 8,
  [Zone.Commercial]:  12,
  [Zone.Industrial]:  7,
}

const ROAD_UPKEEP = 2  // dollars per road tile per year

export function computeBudget(world: World): { revenue: number; expenses: number } {
  let revenue  = 0
  let expenses = 0

  world.forEach((tile) => {
    if (tile.zone !== Zone.None && tile.density > 0) {
      revenue += tile.density * ZONE_TAX[tile.zone]
    }
    if (tile.overlay & Overlay.Road) {
      expenses += ROAD_UPKEEP
    }
  })

  return { revenue: Math.round(revenue), expenses: Math.round(expenses) }
}
