# WebCity

A browser-based SimCity 2000-style isometric city builder, built with TypeScript, Vite, Preact, and HTML5 Canvas 2D.

## Development

```bash
pnpm install
pnpm dev        # Vite HMR dev server → http://localhost:5173
pnpm typecheck  # tsc --noEmit
pnpm test       # Vitest (58 tests)
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
| `P` | Power Plant |
| `W` | Water Tower |
| `B` | Bulldoze |
| `Escape` | Deselect tool |
| `+` / `-` | Zoom in / out |

---

## What's implemented

### Rendering
- Isometric camera with pan, zoom, and elevation-aware click hit-testing
- Painter's-algorithm diagonal sweep with two-pass batched GPU flush (~15 draw calls/frame)
- Pre-baked terrain sprites via `OffscreenCanvas` + `ImageBitmap` cache (one set per zoom level)
- Minimap with dirty-flag bake, live viewport indicator, and click/drag navigation

### Simulation (1 Hz tick, 12 ticks = 1 year)
- Zone growth (R/C/I) — 9 density stages; requires power + connected road access (≥ 2-tile segment)
- Power network — BFS flood-fill, 50-tile range from Power Plant; crosses water via Power Line overlay
- Water network — BFS flood-fill, 20-tile range from Water Tower
- Annual budget — zone tax revenue, road upkeep, building upkeep; deficit warning
- City log — year-end budget summary, population milestones

### Tools & UI
- Toolbar: zone (R/C/I), Power Plant, Water Tower, Road, Power Line, Bulldoze
- Placement costs deducted from funds on each tile placed
- Speed control: ⏸ / 1× / 2× / 3×
- Bottom bar: year, population, funds

### Pathfinding utilities
- `utils/floodfill.ts` — typed-array BFS (power, water networks)
- `utils/astar.ts` — A\* road path-finding + `isRoadConnected` connectivity check

---

## Architecture

Two independent loops:
- **Render** — `requestAnimationFrame` at ~60 fps
- **Sim tick** — `setInterval` at 1–4 Hz (speed-controlled); 12 ticks = 1 game year

Coordinate system: `(col, row, elevation)` → `isoCamera.worldToScreen()` → screen `(px, py)`.  
Tile size at 1×: 64 × 32 px. Each elevation level = +8 px vertical offset.

| Module | Role |
|---|---|
| `core/engine.ts` | Game loop, speed control |
| `core/world.ts` | 128 × 128 tile grid |
| `core/tile.ts` | Tile type enums, ActiveTool |
| `core/events.ts` | Typed event bus |
| `rendering/isoCamera.ts` | World ↔ screen transforms, pan, snap-zoom |
| `rendering/tileRenderer.ts` | Two-pass batched tile renderer |
| `rendering/minimap.ts` | Minimap bake + viewport indicator |
| `simulation/simManager.ts` | Tick coordination |
| `simulation/zones.ts` | RCI demand + density growth |
| `simulation/power.ts` | Power BFS |
| `simulation/water.ts` | Water BFS |
| `simulation/economy.ts` | Annual budget |
| `data/buildings.ts` | Building costs and upkeep |
| `data/worldGen.ts` | Simplex-noise terrain generation |

---

## Roadmap

See `TODO.md` for the full feature roadmap (Phases 2–5 and remaining utilities).

Next up: Phase 2 — Services (police, fire, hospitals, schools) and data-layer overlays.
