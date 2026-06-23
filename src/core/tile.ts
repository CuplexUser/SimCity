export enum Terrain {
  Grass  = 0,
  Water  = 1,
  Dirt   = 2,
  Forest = 3,
}

export enum Zone {
  None        = 0,
  Residential = 1,
  Commercial  = 2,
  Industrial  = 3,
}

// Bitmask flags — keep as powers of 2
export enum Overlay {
  Road      = 1,
  PowerLine = 2,
  Rail      = 4,
}

export enum Building {
  None          = 0,
  PowerPlant    = 1,   // coal plant — power source, 50-tile BFS range
  WaterTower    = 2,   // water tower — water source, 20-tile BFS range
  PoliceStation = 3,   // police coverage, 25-tile radius
  FireStation   = 4,   // fire coverage, 20-tile radius
  Hospital      = 5,   // health coverage, 20-tile radius
  School        = 6,   // education coverage, 15-tile radius
  Library       = 7,   // education coverage, 10-tile radius (small bonus)
  // Power plants — varying cost, range, and visual
  GasTurbine    = 8,   // gas turbine — 40-tile range, moderate cost
  Nuclear       = 9,   // nuclear plant — 80-tile range, very expensive
  SolarFarm     = 10,  // solar array — 30-tile range, no fuel upkeep
  WindTurbine   = 11,  // wind turbine — 25-tile range, cheap
  // Water sources — varying cost, range, and footprint (mirror the power plants)
  WaterPump     = 12,  // small ground pump — 12-tile range, cheap
  PumpingStation= 13,  // large pumping station — 45-tile range, big footprint
  // Parks — no coverage role; boost land value in a radius (simulation/landValue.ts)
  Park          = 14,  // green space — lawn + trees, larger land-value bonus
  Plaza         = 15,  // paved plaza with a fountain — smaller bonus
}

export interface Tile {
  terrain:       Terrain
  elevation:     number   // 0–7
  zone:          Zone
  density:       number   // 0–8 (0 = vacant plot, 8 = max density)
  overlay:       number   // bitmask of Overlay values
  building:      Building
  powered:       boolean
  watered:       boolean
  policed:       boolean  // within range of a Police Station
  fireProtected: boolean  // within range of a Fire Station
  healthCovered: boolean  // within range of a Hospital
  educated:      boolean  // within range of a School or Library
  burning:       boolean  // active fire/disaster state

  // ── Multi-tile footprint ──────────────────────────────────────────────────
  // A structure (plopped building or grown lot) can span an footW×footH plot
  // rooted at one "origin" tile (its NW/top corner). Only the origin carries the
  // building/density + footprint size; covered tiles point back to the origin via
  // rootCol/rootRow and are otherwise empty so the sim ignores them.
  footW:    number   // plot width  in tiles — meaningful on the origin tile (default 1)
  footH:    number   // plot height in tiles — meaningful on the origin tile (default 1)
  rootCol:  number   // origin col of the structure covering this tile; -1 = none/self
  rootRow:  number   // origin row; -1 = none/self
}

export function defaultTile(): Tile {
  return {
    terrain:       Terrain.Grass,
    elevation:     0,
    zone:          Zone.None,
    density:       0,
    overlay:       0,
    building:      Building.None,
    powered:       false,
    watered:       false,
    policed:       false,
    fireProtected: false,
    healthCovered: false,
    educated:      false,
    burning:       false,
    footW:         1,
    footH:         1,
    rootCol:       -1,
    rootRow:       -1,
  }
}

export type ActiveTool =
  | { kind: 'zone';     zone: Zone }
  | { kind: 'building'; building: Building }
  | { kind: 'road' }
  | { kind: 'power' }
  | { kind: 'bulldoze'; mode: BulldozeMode }
  | null

export type BulldozeMode = 'normal' | 'terrain' | 'zoning'
