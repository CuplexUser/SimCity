Original prompt: Continue with the implementation plan according to the TODO.md file

## 2026-05-18

- Started Phase 2 Services with Police Stations, since `Tile` and `Building` already include police-specific fields.
- Planned slice: police coverage simulation, placement UI/hotkey, budget upkeep, renderer support, tests, and TODO update.
- Added police coverage implementation and fixed the water-barrier test to account for BFS routing around single obstacles.
- Verified with `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- Ran Playwright smoke test through a project-local copy of the web-game client because the skill script resolves packages relative to its own directory. The first burst showed no placement because the client only mapped `a`/`b`; patched the ignored local copy to map `o` to `KeyO`.
- Smoke result: screenshot shows a Police Station placed near screen center; text state reported funds `$19,000`, `buildings: { "Police Station": 1 }`, and `policedTiles: 1301`.

## Next TODOs

- Fire stations and `src/simulation/fire.ts` are the next Phase 2 slice.
- Add a real data-layer/overlay panel before making crime/fire coverage visually inspectable across the whole map.
- Added the remaining Utilities modules: save/load serialization, traffic, land value, pollution, fire, disasters, and placeholder UI panels.
- Added bulldozer modes: normal demolition, clear/level terrain, and zoning-only removal. Covered behavior in `src/core/bulldoze.test.ts`.
- Added toolbar options menu with New City, Save City, and Load City. Save/load now stores full game state metadata as well as world tiles.
- Named city saves are now listed in the options menu; New City uses a fresh randomized terrain seed.
- Widened zone road access from direct adjacency to roads up to 2 cardinal tiles away, preserving the connected-road requirement. Added regression coverage for 3x3 zones surrounded by roads and a three-tile-away negative case.
- Verified the road-access change with Vitest (92 tests), `pnpm typecheck`, `pnpm build`, and a Playwright smoke run against Vite. Latest screenshot loaded with the map visible and no captured console errors.
- Replaced flat terrain sprite fills with deterministic procedural terrain textures baked into the existing OffscreenCanvas cache. Grass, water, dirt, and forest now get distinct dither/noise/ripple/canopy treatment, and the Sprites TODO is marked done.
- Verified the texture change with `pnpm typecheck`, `pnpm test`, `pnpm build`, and a Playwright screenshot run against Vite. The screenshot shows textured grass/forest terrain rendering correctly.
- Continuing grass pass: identified that the previous grass texture was baked once per zoom and repeated exactly on every tile. Added deterministic coordinate-keyed grass variants and layered seeded simplex noise with subtle blade detail while keeping the terrain sprite cache.
- Replaced the default Playwright example setup with a WebCity-specific config and smoke test: Vite web server, app base URL, Chromium project, canvas/game-state assertions, console-error guard, and rendered-pixel checks for nonblank textured terrain.

## 2026-05-29 — PixiJS v8 WebGL migration

Migrated the rendering layer from Canvas 2D to PixiJS v8 (WebGL). Target visual quality upgraded from SimCity 2000 to SimCity 4. All `core/` and `simulation/` code is unchanged; only `rendering/` was rewritten.

**Changes:**
- `rendering/renderer.ts` — complete rewrite: `Renderer.create()` async factory, PixiJS `Application`, single sortable `worldContainer`, terrain as `PIXI.Graphics`, roads/buildings as `PIXI.Sprite`
- `rendering/tileTextures.ts` — new file: pre-bakes all building + overlay textures at startup via OffscreenCanvas → ImageBitmap → PIXI.Texture (~100 textures, keyed by `z:{zone}:{density}`, `b:{building}`, `o:{overlayBitmask}:{roadMask}`)
- `rendering/tileRenderer.ts` — widened all `ctx` parameters to `Ctx2D` union type so drawing functions work with both `CanvasRenderingContext2D` and `OffscreenCanvasRenderingContext2D`
- `rendering/minimap.ts` — changed `draw()` signature; minimap now draws at (0,0) into its own dedicated `HTMLCanvasElement` which is uploaded to PixiJS as a texture each frame
- `core/world.ts` — added `readonly dirty = new Set<number>()` and `world.set()` now calls `dirty.add(idx)` on every write
- `core/engine.ts` — added `async init()` method; `renderer` field is now `Renderer | undefined` set after init
- `main.tsx` — updated for async init pattern: `eng.init().then(() => { generateWorld(); eng.start(); window.__eng = eng })`
- `CLAUDE.md` — updated to reflect PixiJS architecture, scene layout, module table, sprite/texture pipeline

**Architecture decisions:**
- Single sortable container with `zIndex = (col+row)*3 + layer` — no separate layer containers needed
- Terrain as `PIXI.Graphics` (no texture upload) for fast startup
- Zoom handled by `worldContainer.scale` on the GPU — no per-zoom texture rebake
- Minimap isolated to its own Canvas 2D canvas to avoid mixing WebGL + 2D on the same element
- `pnpm typecheck` and `pnpm build` pass clean
