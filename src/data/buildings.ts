import { Building, Zone, Overlay } from '../core/tile'

export interface BuildingDef {
  cost:   number   // one-time placement cost
  upkeep: number   // annual upkeep expense
  label:  string
}

export const BUILDING_DEFS: Record<Building, BuildingDef> = {
  [Building.None]:          { cost: 0,      upkeep: 0,   label: '' },
  [Building.PowerPlant]:    { cost: 5_000,  upkeep: 300, label: 'Power Plant' },
  [Building.WaterTower]:    { cost: 500,    upkeep: 50,  label: 'Water Tower' },
  [Building.PoliceStation]: { cost: 1_000,  upkeep: 100, label: 'Police Station' },
  [Building.FireStation]:   { cost: 1_000,  upkeep: 100, label: 'Fire Station' },
  [Building.Hospital]:      { cost: 1_500,  upkeep: 150, label: 'Hospital' },
  [Building.School]:        { cost: 750,    upkeep: 75,  label: 'School' },
  [Building.Library]:       { cost: 500,    upkeep: 50,  label: 'Library' },
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
