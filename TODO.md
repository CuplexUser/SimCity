# WebCity — TODO & Roadmap

## Phase 1 — Core (MVP) status
- [x] Project scaffold (Vite, TypeScript, Preact, JSX)
- [x] Isometric camera (pan, zoom, world↔screen transforms)
- [x] World grid (128×128 tiles)
- [x] Terrain generation (simplex-noise multi-octave)
- [x] Tile renderer with elevation and painter's-algorithm draw order
- [x] Zone placement (R/C/I) via click
- [x] Road overlay placement
- [x] Bulldoze tool
- [x] Minimap
- [x] Basic UI — Toolbar + BottomBar
- [x] Sim tick (1 Hz) + year counter
- [x] Zone growth simulation (density stages 0–8, grows on power + road access within 2 tiles)
- [x] Power network (BFS flood-fill, 50-tile range from Power Plant)
- [x] Water network (BFS flood-fill, 20-tile range from Water Tower)
- [x] Annual budget engine (zone tax revenue, road upkeep expenses)
- [x] City log (year-end budget summary + population milestones)
- [x] Road connectivity check (A* in utils/astar.ts; zones require connected road segment ≥2 tiles within 2-tile road access)

## Phase 2 — Services
- [x] Police stations (coverage radius → crime reduction)
- [ ] Fire stations (coverage radius + fire spread probability)
- [ ] Hospitals, schools, libraries, stadium
- [ ] Crime overlay
- [ ] Fire coverage overlay
- [ ] Land value overlay
- [ ] Pollution overlay
- [ ] Data layer panel (toggle 7 overlay types)

## Phase 3 — Infrastructure
- [ ] Seaport, airport (multi-tile buildings)
- [ ] Rail (above-ground)
- [ ] Metro (underground toggle view)
- [ ] Highways
- [ ] Bus depots

## Phase 4 — Economy depth
- [ ] Bond system (issue / pay off, 10-year fixed, 5–12% interest)
- [ ] Deficit → credit rating spiral
- [ ] Advisor panel (Finance / Transport / Police / Fire / Health / Education)
- [ ] Population history graph (canvas-rendered)
- [ ] Budget history chart
- [ ] City rating score

## Phase 5 — Polish & disasters
- [ ] Earthquake (random tile destruction)
- [ ] Fire spread simulation
- [ ] Monster attack (tile-pathing walker)
- [ ] Tornado
- [ ] Day/night palette shift
- [ ] Animated water tiles
- [ ] Tree planting + wilderness decay over time

## Technical debt / improvements
- [x] **Sprites**: Pre-baked terrain diamonds now use SC2000-style dithered procedural textures instead of solid colors.
- [ ] **Draw order**: Diagonal-sweep implemented. Tall buildings may need depth-sort
      by (row + col + buildingHeight) once multi-tile buildings are added.
- [x] **Minimap redraw**: Dirty-flag implemented — only rebakes when world changes.
- [ ] **Viewport indicator**: Show camera viewport rect on minimap.
- [x] **Keyboard shortcuts**: 1/2/3 = R/C/I zone, R = road, P = power/plant, W = water tower, L = power line, B = bulldoze, Escape = deselect, +/- = zoom.
- [x] **Speed control UI**: Pause / 1× / 2× / 3× (SpeedControl.tsx).
- [ ] **Save/load**: IndexedDB via idb-keyval; RLE-compress grid; multiple slots + autosave.
- [x] **Tests**: Vitest — 92 tests across core, rendering, simulation, and utility modules.

## Utilities still to implement
- [x] `src/utils/astar.ts` — A* for road connectivity + `isRoadConnected` BFS
- [x] `src/utils/floodfill.ts` — BFS for power/water networks
- [x] `src/core/saveLoad.ts` — IndexedDB serialization
- [x] `src/simulation/zones.ts` — RCI demand + density
- [x] `src/simulation/economy.ts` — Tax engine (bonds still pending)
- [x] `src/simulation/power.ts` — Power network propagation
- [x] `src/simulation/water.ts` — Water network propagation
- [x] `src/simulation/traffic.ts` — Road load (density convolution)
- [x] `src/simulation/landValue.ts` — Distance-decay desirability
- [x] `src/simulation/pollution.ts` — Industry/traffic diffusion grid
- [x] `src/simulation/crime.ts` — Police coverage model
- [x] `src/simulation/fire.ts` — Fire coverage + spread
- [x] `src/simulation/disasters.ts` — Disaster event triggers
- [x] `src/data/buildings.ts` — Building costs, upkeep, capacity
- [x] `src/ui/BudgetPanel.tsx`
- [x] `src/ui/DataLayerPanel.tsx`
- [x] `src/ui/AdvisorPanel.tsx`
- [x] `src/ui/GraphPanel.tsx`
- [x] `src/ui/ZoneInfoPopup.tsx`
- [x] `src/ui/SpeedControl.tsx`

## Hosting decisions pending
- Custom domain: `webcity.cuplex.se`
- Cloud saves / multiplayer: SQLite or as a binary download.
- Linux VPS deploy
