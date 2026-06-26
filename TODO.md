# WebCity — TODO & Roadmap

## Phase 1 — Core (MVP) ✓ complete
- [x] Project scaffold (Vite, TypeScript, Preact, JSX)
- [x] Isometric camera (pan, zoom, world↔screen transforms)
- [x] World grid (128×128 tiles)
- [x] Terrain generation (simplex-noise multi-octave)
- [x] Tile renderer with elevation and painter's-algorithm draw order
- [x] Zone placement (R/C/I) via click
- [x] Road overlay placement
- [x] Bulldoze tool (normal, terrain, zoning modes)
- [x] Minimap with dirty-flag bake and click/drag navigation
- [x] Basic UI — Toolbar + BottomBar
- [x] Sim tick (1 Hz) + year counter
- [x] Zone growth simulation (density stages 0–8, grows on power + road access within 2 tiles + water)
- [x] Power network (BFS flood-fill from power plants)
- [x] Water network (BFS flood-fill, 20-tile range from Water Tower)
- [x] Annual budget engine (zone tax revenue, road upkeep expenses)
- [x] City log (year-end budget summary + population milestones)
- [x] Road connectivity check (A* in utils/astar.ts)
- [x] Save/load (IndexedDB via idb-keyval, named city slots, RLE-compressed grid)
- [x] Save/load to a file (Export/Import in Options panel) — portable gzip-compressed `.wcity` files (~20 KB vs ~1.2 MB raw JSON); still imports legacy plain-JSON exports
- [x] **Renderer migrated to PixiJS v8 (WebGL)** — target upgraded to SimCity 4 quality

## Phase 2 — Services
Coverage subsystems now feed back into how a city grows: a plot needs more than
power + water to densify — it needs services, land value and clean air.
- [x] Police stations (coverage flood-fill, `simulation/crime.ts` → `tile.policed`)
- [x] Fire stations (coverage flood-fill + fire spread, `simulation/fire.ts` → `tile.fireProtected`)
- [x] Hospitals, schools, libraries (coverage flood-fill, `simulation/services.ts` → `tile.healthCovered` / `tile.educated`)
- [x] **Zone desirability** (`simulation/desirability.ts`) — combines service coverage + land value − pollution into a 0..1 score that caps the density a plot can sustain. Unserviced / low-value / polluted plots stay low-rise; losing a service or rising pollution makes developed lots shed density (abandonment). This is what stops every zone racing to max density on power + water alone.
- [x] Land value simulation (`simulation/landValue.ts`) — now consumed by desirability (wired in `simManager` at year tick)
- [x] Pollution simulation (`simulation/pollution.ts`) — now consumed by desirability (wired in `simManager` at year tick)
- [x] **Coverage data-layer overlays** (View menu / `[C]` cycles) — water · police · fire · health · education. Served tiles glow in the service color; zoned tiles a service misses turn red (the actionable gap). Generalized from the old water-only overlay in `rendering/renderer.ts` (`setCoverageOverlay`).
- [x] Disaster events (`simulation/disasters.ts`) — now actually wired into `simManager.step()` (random fire **or** earthquake, low per-tick chance, logged to City Log)
- [x] Traffic simulation (`simulation/traffic.ts`) — `computeTraffic` feeds `GrowthFields.traffic` → `zoneDesirability` (per-zone congestion weight) and drives the `traffic` heatmap overlay
- [x] Crime *level* — graded 0..100 crime grid (`computeCrime`), folded into desirability (crime weight) and shown as the `crime` heatmap overlay
- [x] Fire *spread* hookup — `simManager` runs `stepFireSpread` + `resolveFires` each tick (fire stations douse covered tiles, unprotected lots burn out and clear); fire-disaster ignition wired via `triggerFire`; burning tiles render as flickering flame markers + a 🔥 indicator
- [x] Wire the unused panels into the app — `BudgetPanel`, `AdvisorPanel`, `GraphPanel` mounted in a toggleable **City Data** dashboard (`ui/Dashboard.tsx`, 📊 button / `[D]`); `ZoneInfoPopup` shows on tile click when no tool is active. (`DataLayerPanel` removed — superseded by the coverage overlays above.)

## Phase 2.5 — Power plants ✓ complete
- [x] Coal Power Plant (50-tile range)
- [x] Gas Turbine (40-tile range)
- [x] Nuclear Plant (80-tile range, high cost)
- [x] Solar Farm (30-tile range, no fuel upkeep)
- [x] Wind Turbine (25-tile range, cheap)

## Phase 3 — Art / SC4 visual quality
- [x] Blender-rendered isometric building sprites — R/C/I at every density stage (Kenney City Kits + modular assembly; R/C/I all have low/mid/high buckets, incl. mid-density residential `z:1:1`)
- [x] Plopped civic buildings — Blender-assembled from the Kenney Modular kit (`b:3`–`b:7`)
- [x] Blender-rendered infrastructure sprites — power plants (coal/gas/nuclear/solar/wind), water tower (`b:` keys) and transmission pylons (`infra:pylon` on power-line tiles), built from Blender mesh primitives; roads still draw sidewalk fringe + lane markings procedurally
- [x] Sprite atlases packed per zoom level (2×, 4×) — atlas.2x/.4x pages (≤4096px, capped at source res) + per-level `bakeAllTextures(scale)`; renderer lazily loads and hot-swaps on zoom
- [x] Proper terrain texture — Water/Dirt/Forest use per-pixel noise sprites; Grass retains per-tile color variation
- [x] Animated water tiles — shimmer via per-frame tint oscillation on Water terrain sprites
- [x] Tile hover highlight — white outline + tint overlay, redrawn on mousemove without full redraw
- [x] Zone color overlay — semi-transparent fill toggle (View panel / V key); outlines always visible on vacant zones
- [x] Night mode — dark blue screen overlay + warm amber tint on building sprites (N key / View panel)
- [x] **Animated traffic (visual)** — Infinitown-style cars driving the road network as a visible representation of the existing `simulation/traffic.ts` load field (eye-candy layered on the real sim, not a new sim). Delivered: (1) **lane graph** (`simulation/laneGraph.ts`, `buildRoadNetwork`) — pure tile-index adjacency over every road tile, mirroring the asphalt connection rules; (2) **car entity pool** (`rendering/cars.ts`, `CarSystem`) animating in the 60fps render loop, fully decoupled from the 1 Hz sim, spawn-weighted by the live `traffic` field (`setTrafficField`), capped at `min(160, tiles·0.12)`; (3) **per-frame depth sort** — each car is a direct child of `worldContainer` with fractional `zIndex = (col+row)*3 + 1.6` so it interleaves behind/in front of buildings, `sortChildren()` only when cars move; (4) **8-direction car sprites** (NE/SE/SW/NW + N/E/S/W for diagonal roads), procedurally baked in `tileTextures.ts` with an atlas upgrade path via `tools/blender/render_cars.py` (`pnpm gen:cars`). Toggle in the View menu / `[V]` is zone overlay — cars toggle is its own **Animated Traffic** button.
- [x] **Diagonal (45°) roads** — new `Overlay.RoadDiag` corner-to-corner road type (SC4-style), tool `[T]` / "Diagonal Road" in the Roads menu, drawn as constant-width asphalt arms to the connected apexes (`drawDiagRoadTile`). They **merge** with orthogonal roads at shared corners (both `_roadMask`/`_diagRoadMask` and the lane graph cross-reference both types) and are **real roads** everywhere it counts: zone road-access (`zones.ts` `ROAD_ANY`), connectivity + A* (`utils/astar.ts` with diagonal-corner rule), and traffic routing (`simulation/traffic.ts` `roadNeighbors`). Placing any road over an unbuilt zoned tile **de-zones** it.

## Phase 4 — Infrastructure depth
- [ ] Seaport, airport (multi-tile buildings)
- [ ] Rail (above-ground)
- [ ] Metro (underground toggle view)
- [ ] Highways
- [ ] Bus depots
- [x] Road auto-connect — neighbor road masks rebuild on placement AND bulldoze so segments fuse/retract live
- [x] Drag-to-zone rectangular selection — zone tools drag out a previewed rectangle, applied on mouseup (respects rules + funds)

## Phase 5 — Economy depth
- [x] Bond system (issue / pay off, 10-year fixed, 5–12% interest) — `simulation/finance.ts`; issue/pay-off in the City Data dashboard's Finance panel. Bonds amortize level-principal; the rate is locked at issue from the current credit rating
- [x] Deficit → credit rating spiral — `computeRating` (AAA→CCC) from cash position + debt-to-revenue load, re-assessed each year and on every bond action; a worse rating raises the rate on new bonds (`rateForRating`), so over-borrowing against thin revenue compounds
- [x] Full road pathfinding for traffic (A* on road graph replacing convolution) — `simulation/traffic.ts` now routes commuter trips along the road network: zones inject home/job demand onto adjacent roads, a multi-source BFS from job tiles builds a shortest-path-to-nearest-job field, and each origin descends that gradient to its job, accumulating load on every road tile en route (arterials carry the most). Falls back to access demand so isolated zones still register
- [x] Water pipes / pump stations — separate pipe overlay (`Overlay.Pipe`, new **Water pipe** tool in the Roads menu, drawn as blue mains in `renderer.ts`). `simulation/water.ts` floods via Dial's algorithm: pipes are free conduits (0 range cost) that also cross natural water like power lines, so a main carries water across the map and seeps `range` tiles into surrounding land. With no pipes it reduces to the original uniform BFS, so existing cities are unaffected
- [x] Budget ordinances — `simulation/ordinances.ts`; six toggleable laws (gambling/tourism income, smoke-detector/clean-air/transit/watch expenses) whose amount scales with population. Applied at the annual budget (`SimManager.currentBudget`), surfaced in the City Data dashboard's Ordinances panel, and saved with the city
- [x] Park / plaza building types — `Building.Park` (2×2 lawn + trees) and `Building.Plaza` (1×1 paved fountain) in a new **Parks** toolbar category; boost nearby land value in `simulation/landValue.ts` (park stronger, plaza smaller); procedurally drawn in `tileRenderer.ts` with atlas fallback
- [x] Population history graph (canvas-rendered) — `ui/HistoryGraph.tsx` draws a filled line chart on a `<canvas>` (replaces the old flex-bar GraphPanel); used for both Population and Funds in the dashboard
- [x] City rating score — `simulation/cityRating.ts`; a 0..100 mayor-approval score from utility coverage + developed land quality (value vs crime/pollution) + treasury health − active fires, recomputed yearly (reusing the land-value/pollution/crime grids) and shown with a descriptor in the dashboard

## Phase 6 — Polish
- [ ] Earthquake (random tile destruction)
- [ ] Monster attack (tile-pathing walker)
- [ ] Tornado
- [ ] Sound effects — ambient city hum, construction, disaster alert
- [ ] Touch / mobile support — pinch-to-zoom, two-finger pan
- [ ] Screenshot export — save canvas as PNG
- [ ] Undo/redo (Ctrl+Z) — command history for tile placements

## Technical debt / improvements
- [x] **Sprites**: Pre-baked via OffscreenCanvas → PIXI.Texture at startup (PixiJS migration)
- [x] **Draw order**: Single sortable container with `zIndex = (col+row)*3 + layer`
- [x] **Minimap redraw**: Dirty-flag implemented — only rebakes when world changes
- [x] **Keyboard shortcuts**: 1/2/3 = R/C/I zone, R = road, P = power plant, W = water tower, L = power line, B = bulldoze, Escape = deselect, +/- = zoom
- [x] **Speed control UI**: Pause / 1× / 3× / 10×
- [x] **Save/load**: IndexedDB via idb-keyval; RLE-compress grid; named city slots
- [x] **Tests**: Vitest — unit tests across core, rendering, simulation, and utility modules
- [ ] **Viewport indicator**: Show camera viewport rect on minimap
- [ ] **Draw order for tall buildings**: Depth-sort by (row + col + buildingHeight) once multi-tile buildings are added

## Hosting
- Custom domain: `webcity.cuplex.se`
- Deploy: `pnpm build` → Cloudflare Pages or `rsync dist/` to Linux VPS
- Cloud saves / multiplayer: SQLite or binary download
