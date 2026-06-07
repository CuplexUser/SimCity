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

## Phase 2 — Services ✓ complete
- [x] Police stations (coverage radius → crime reduction, `simulation/crime.ts`)
- [x] Fire stations (coverage radius + fire spread, `simulation/fire.ts`)
- [x] Hospitals, schools, libraries (coverage radius, affects zone happiness)
- [x] Crime simulation (`simulation/crime.ts`)
- [x] Fire simulation (`simulation/fire.ts`)
- [x] Land value simulation (`simulation/landValue.ts`)
- [x] Pollution simulation (`simulation/pollution.ts`)
- [x] Traffic simulation (`simulation/traffic.ts`)
- [x] Disaster events (`simulation/disasters.ts`)
- [x] Data layer panel (`ui/DataLayerPanel.tsx`)
- [x] Budget panel (`ui/BudgetPanel.tsx`)
- [x] Advisor panel (`ui/AdvisorPanel.tsx`)
- [x] Graph panel (`ui/GraphPanel.tsx`)
- [x] Zone info popup (`ui/ZoneInfoPopup.tsx`)

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
- [ ] Sprite atlases packed per zoom level (2×, 4×) — hot-swap via `bakeAllTextures()` key
- [x] Proper terrain texture — Water/Dirt/Forest use per-pixel noise sprites; Grass retains per-tile color variation
- [x] Animated water tiles — shimmer via per-frame tint oscillation on Water terrain sprites
- [x] Tile hover highlight — white outline + tint overlay, redrawn on mousemove without full redraw
- [x] Zone color overlay — semi-transparent fill toggle (View panel / V key); outlines always visible on vacant zones
- [x] Night mode — dark blue screen overlay + warm amber tint on building sprites (N key / View panel)

## Phase 4 — Infrastructure depth
- [ ] Seaport, airport (multi-tile buildings)
- [ ] Rail (above-ground)
- [ ] Metro (underground toggle view)
- [ ] Highways
- [ ] Bus depots
- [x] Road auto-connect — neighbor road masks rebuild on placement AND bulldoze so segments fuse/retract live
- [x] Drag-to-zone rectangular selection — zone tools drag out a previewed rectangle, applied on mouseup (respects rules + funds)

## Phase 5 — Economy depth
- [ ] Bond system (issue / pay off, 10-year fixed, 5–12% interest)
- [ ] Deficit → credit rating spiral
- [ ] Full road pathfinding for traffic (A* on road graph replacing convolution)
- [ ] Water pipes / pump stations — separate pipe overlay
- [ ] Budget ordinances — per-ordinance toggles affecting revenue/expenses
- [ ] Park / plaza building types — boost land value in radius
- [ ] Population history graph (canvas-rendered)
- [ ] City rating score

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
