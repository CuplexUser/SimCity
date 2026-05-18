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
- [ ] Zone growth simulation (density stages 0–8)
- [ ] Road connectivity check (A* or BFS)
- [ ] Power network (flood-fill BFS from plants)
- [ ] Water network (flood-fill BFS from towers/pumps)
- [ ] Annual budget engine (zone tax revenue, service upkeep)
- [ ] City log / news ticker

## Phase 2 — Services
- [ ] Police stations (coverage radius → crime reduction)
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
- [ ] **Sprites**: Currently solid-color placeholder diamonds. Invest in SC2000-style
      dithered procedural sprites (OffscreenCanvas sprite sheet per zoom level) once
      Phase 1 gameplay is solid.
- [ ] **Draw order**: Currently diagonal-sweep for flat terrain. Tall buildings need
      a depth-sort by (row + col + height) to avoid overlap artifacts.
- [ ] **Minimap redraw**: Currently redraws every frame. Cache as dirty flag; only
      redraw when world changes (max 1 Hz).
- [ ] **Viewport indicator**: Show camera viewport rect on minimap.
- [ ] **Keyboard shortcuts**: 1/2/3 = R/C/I zone, R = road, P = power, B = bulldoze,
      Escape = deselect, +/- = zoom.
- [ ] **Speed control UI**: Pause / 1× / 2× / 3× (SpeedControl.tsx).
- [ ] **Save/load**: IndexedDB via idb-keyval; RLE-compress grid; multiple slots + autosave.
- [ ] **Tests**: Add Vitest when zones.ts / economy.ts have non-trivial logic to test.

## Utilities still to implement
- [ ] `src/utils/astar.ts` — A* for road connectivity
- [ ] `src/utils/floodfill.ts` — BFS for power/water networks
- [ ] `src/core/saveLoad.ts` — IndexedDB serialization
- [ ] `src/simulation/zones.ts` — RCI demand + density
- [ ] `src/simulation/economy.ts` — Tax engine + bonds
- [ ] `src/simulation/power.ts` — Power network propagation
- [ ] `src/simulation/water.ts` — Water network propagation
- [ ] `src/simulation/traffic.ts` — Road load (density convolution)
- [ ] `src/simulation/landValue.ts` — Distance-decay desirability
- [ ] `src/simulation/pollution.ts` — Industry/traffic diffusion grid
- [ ] `src/simulation/crime.ts` — Police coverage model
- [ ] `src/simulation/fire.ts` — Fire coverage + spread
- [ ] `src/simulation/disasters.ts` — Disaster event triggers
- [ ] `src/data/buildings.ts` — Building costs, upkeep, capacity
- [ ] `src/ui/BudgetPanel.tsx`
- [ ] `src/ui/DataLayerPanel.tsx`
- [ ] `src/ui/AdvisorPanel.tsx`
- [ ] `src/ui/GraphPanel.tsx`
- [ ] `src/ui/ZoneInfoPopup.tsx`
- [ ] `src/ui/SpeedControl.tsx`

## Hosting decisions pending
- Custom domain: `webcity.cuplex.se` — configure in Cloudflare Pages dashboard.
- Cloud saves / multiplayer: Cloudflare Workers + D1 (SQLite at edge) is the natural
  upgrade path from local IndexedDB, same CF account, no new infrastructure.
