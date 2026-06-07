# WebCity

A browser-based SimCity 4-style isometric city builder, built with TypeScript, Vite, Preact, and PixiJS v8 (WebGL).

## Development

```bash
pnpm install
pnpm dev        # Vite HMR dev server → http://localhost:5173
pnpm typecheck  # tsc --noEmit
pnpm test       # Vitest unit tests
pnpm test:watch # Vitest in watch mode
```

## Build & deploy

```bash
pnpm build                                          # → dist/
pnpm preview                                        # serve dist/ locally
rsync -avz --delete dist/ user@vps:/var/www/webcity/
```

nginx serves `dist/` as a static SPA with `/index.html` fallback. SSL via Certbot.

---

## Controls

| Input | Action |
|---|---|
| Left-click / drag | Place selected tool |
| Middle or right-mouse drag | Pan camera |
| Scroll wheel | Zoom (snaps to 0.5× / 1× / 2× / 4×) |
| Click minimap | Jump camera to that location |
| Drag minimap | Scroll camera continuously |

### Keyboard shortcuts

| Key | Tool |
|---|---|
| `1` | Residential zone |
| `2` | Commercial zone |
| `3` | Industrial zone |
| `R` | Road |
| `L` | Power line |
| `P` | Power plant (coal) |
| `O` | Police station |
| `W` | Water tower |
| `B` | Bulldoze |
| `Escape` | Deselect tool |
| `+` / `-` | Zoom in / out |

---

## What's implemented

### Rendering (PixiJS v8 WebGL)
- Isometric camera with pan, zoom, and elevation-aware click hit-testing
- Single sortable `worldContainer`; painter's-algorithm via `zIndex = (col+row)*3 + layer`
- Terrain: `PIXI.Graphics` solid-color diamonds with per-tile hash color variation
- Roads and buildings: `PIXI.Sprite` backed by textures pre-baked at startup in `tileTextures.ts` (~100 textures via OffscreenCanvas → ImageBitmap → PIXI.Texture)
- Dirty-tile tracking: `world.dirty: Set<number>` drained each frame — only changed tiles rebuild
- Minimap with dirty-flag bake, live viewport indicator, and click/drag navigation
- Minimap rendered into a dedicated `HTMLCanvasElement` (Canvas 2D) and uploaded as PixiJS texture each frame

### Simulation (1 Hz tick, 12 ticks = 1 year)
- Zone growth (R/C/I) — 9 density stages; requires power + road access within 2 tiles + water
- Power network — BFS flood-fill from power plants (coal, gas turbine, nuclear, solar, wind)
- Water network — BFS flood-fill, 20-tile range from Water Tower
- Crime — coverage radius from Police Stations; affects zone happiness
- Fire — coverage radius from Fire Stations; fire spread simulation
- Traffic — approximate load via zone-density convolution
- Land value — distance-decay from parks, services, water bodies
- Pollution — diffusion grid from industry tiles and traffic load
- Disasters — random disaster event triggers
- Annual budget — zone tax revenue, building upkeep, deficit warning; city log entry each year

### Buildings
| Building | Power/coverage range |
|---|---|
| Coal Power Plant | 50 tiles |
| Gas Turbine | 40 tiles |
| Nuclear Plant | 80 tiles |
| Solar Farm | 30 tiles |
| Wind Turbine | 25 tiles |
| Water Tower | 20 tiles |
| Police Station | 25 tiles |
| Fire Station | 20 tiles |
| Hospital | 20 tiles |
| School | 15 tiles |
| Library | 10 tiles |

### Tools & UI
- SC4-style toolbar: category rail + flyout panels (zones, infrastructure, services, power, bulldoze, options)
- Placement costs deducted from funds on each tile placed
- Speed control: ⏸ / 1× / 3× / 10×
- Bottom bar: year, population, funds
- City log: year-end budget summary, population milestones, disaster alerts
- Options panel: New City, Save City, Load City (named saves via IndexedDB)
- Budget, data layer, advisor, graph, and zone info panels

### Pathfinding utilities
- `utils/floodfill.ts` — typed-array BFS (power, water networks)
- `utils/astar.ts` — A\* road path-finding + `isRoadConnected` connectivity check

---

## Architecture

Two independent loops:
- **Render** — `requestAnimationFrame` at ~60 fps; calls `renderer.draw()`
- **Sim tick** — `setInterval` at 1–10 Hz (speed-controlled); 12 ticks = 1 game year

Engine init is async: `new Engine(canvas)` is sync, `await eng.init()` creates the PixiJS app, then `eng.start()` begins the RAF loop.

Coordinate system: `(col, row, elevation)` → `isoCamera.worldToScreen()` → screen `(px, py)`.  
Tile size at 1×: 64 × 32 px. Each elevation level = +8 px vertical offset.

| Module | Role |
|---|---|
| `core/engine.ts` | Game loop, speed control; `async init()` creates PixiJS renderer |
| `core/world.ts` | 128 × 128 tile grid; `world.dirty` Set tracks changed tiles |
| `core/tile.ts` | Tile type enums, ActiveTool |
| `core/events.ts` | Typed event bus |
| `rendering/isoCamera.ts` | World ↔ screen transforms, pan, snap-zoom |
| `rendering/renderer.ts` | PixiJS Application, single sortable worldContainer, dirty-tile processing |
| `rendering/tileTextures.ts` | Pre-bakes all building + overlay textures at startup: OffscreenCanvas → PIXI.Texture |
| `rendering/tileRenderer.ts` | Canvas 2D drawing primitives — called by tileTextures.ts |
| `rendering/minimap.ts` | Canvas 2D minimap; draws at (0,0) into a dedicated HTMLCanvasElement |
| `simulation/simManager.ts` | Tick coordination |
| `simulation/zones.ts` | RCI demand + density growth |
| `simulation/power.ts` | Power BFS |
| `simulation/water.ts` | Water BFS |
| `simulation/economy.ts` | Annual budget |
| `simulation/crime.ts` | Police coverage model |
| `simulation/fire.ts` | Fire coverage + spread |
| `simulation/traffic.ts` | Road load (density convolution) |
| `simulation/landValue.ts` | Distance-decay desirability |
| `simulation/pollution.ts` | Industry/traffic diffusion grid |
| `simulation/disasters.ts` | Disaster event triggers |
| `data/buildings.ts` | Building costs and upkeep |
| `data/worldGen.ts` | Simplex-noise terrain generation |

---

## Building art

Buildings render from a sprite atlas (`public/sprites/atlas.png` + `manifest.json`),
with procedural OffscreenCanvas sprites as the fallback for any missing key.

The current atlas is generated from **Kenney's CC0 City Kits** (Suburban,
Commercial, Industrial). The `.glb` models are batch-imported, re-origined to the
tile grid, and rendered at the in-game 2:1 dimetric angle by a headless Blender
script, then packed:

```bash
blender -b -P tools/blender/import_kenney.py -- \
    --config tools/blender/kenney_packs.json --out tools/assets-src
pnpm build:atlas
```

See `tools/README.md` for the full asset pipeline and the geometry contract.

## Credits

Building 3D art: **[Kenney](https://www.kenney.nl)** — City Kit (Suburban),
City Kit (Commercial), and City Kit (Industrial), all released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain).
Crediting Kenney is not required by the license, but very much appreciated —
consider supporting their work at [kenney.nl/donate](https://www.kenney.nl/donate).

## Roadmap

See `TODO.md` for the full feature roadmap.

Visual goal: SimCity 4 aesthetic — Blender-rendered sprite atlases (currently
sourced from the Kenney City Kits above), with procedural sprites as fallback.
