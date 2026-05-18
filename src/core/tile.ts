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
  None       = 0,
  PowerPlant = 1,  // coal plant — power source, 50-tile BFS range
  WaterTower = 2,  // water tower — water source, 20-tile BFS range
}

export interface Tile {
  terrain:   Terrain
  elevation: number   // 0–7
  zone:      Zone
  density:   number   // 0–8 (0 = vacant plot, 8 = max density)
  overlay:   number   // bitmask of Overlay values
  building:  Building
  powered:   boolean
  watered:   boolean
}

export function defaultTile(): Tile {
  return {
    terrain:   Terrain.Grass,
    elevation: 0,
    zone:      Zone.None,
    density:   0,
    overlay:   0,
    building:  Building.None,
    powered:   false,
    watered:   false,
  }
}

export type ActiveTool =
  | { kind: 'zone';     zone: Zone }
  | { kind: 'building'; building: Building }
  | { kind: 'road' }
  | { kind: 'power' }
  | { kind: 'bulldoze' }
  | null
