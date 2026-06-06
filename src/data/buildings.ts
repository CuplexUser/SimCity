import { Building, Zone, Overlay } from '../core/tile'

export interface BuildingDef {
  cost:   number   // one-time placement cost
  upkeep: number   // annual upkeep expense
  label:  string
}

export const BUILDING_DEFS: Record<Building, BuildingDef> = {
  [Building.None]:          { cost: 0,       upkeep: 0,   label: '' },
  [Building.PowerPlant]:    { cost: 5_000,   upkeep: 300, label: 'Coal Plant' },
  [Building.WaterTower]:    { cost: 500,     upkeep: 50,  label: 'Water Tower' },
  [Building.PoliceStation]: { cost: 1_000,   upkeep: 100, label: 'Police Station' },
  [Building.FireStation]:   { cost: 1_000,   upkeep: 100, label: 'Fire Station' },
  [Building.Hospital]:      { cost: 1_500,   upkeep: 150, label: 'Hospital' },
  [Building.School]:        { cost: 750,     upkeep: 75,  label: 'School' },
  [Building.Library]:       { cost: 500,     upkeep: 50,  label: 'Library' },
  [Building.GasTurbine]:    { cost: 3_000,   upkeep: 200, label: 'Gas Turbine' },
  [Building.Nuclear]:       { cost: 15_000,  upkeep: 500, label: 'Nuclear Plant' },
  [Building.SolarFarm]:     { cost: 2_000,   upkeep: 15,  label: 'Solar Farm' },
  [Building.WindTurbine]:   { cost: 1_200,   upkeep: 25,  label: 'Wind Turbine' },
}

// Plot footprint (width × height in tiles) for plopped buildings. Larger civic
// and power structures occupy multi-tile plots like SimCity 4; the placement
// code checks the whole plot is clear and renders one sprite over it.
export const BUILDING_FOOTPRINT: Record<Building, [number, number]> = {
  [Building.None]:          [1, 1],
  [Building.PowerPlant]:    [4, 4],
  [Building.Nuclear]:       [4, 4],
  [Building.GasTurbine]:    [3, 3],
  [Building.SolarFarm]:     [3, 3],
  [Building.WindTurbine]:   [1, 1],
  [Building.WaterTower]:    [2, 2],
  [Building.PoliceStation]: [2, 2],
  [Building.FireStation]:   [2, 2],
  [Building.Hospital]:      [2, 2],
  [Building.School]:        [2, 2],
  [Building.Library]:       [2, 2],
}

export function buildingFootprint(b: Building): [number, number] {
  return BUILDING_FOOTPRINT[b] ?? [1, 1]
}

// Per-tile placement costs for zones and overlays
export const ZONE_COST: Record<Zone, number> = {
  [Zone.None]:        0,
  [Zone.Residential]: 10,
  [Zone.Commercial]:  15,
  [Zone.Industrial]:  12,
}

export const OVERLAY_COST: Partial<Record<Overlay, number>> = {
  [Overlay.Road]:      10,
  [Overlay.PowerLine]:  5,
}
