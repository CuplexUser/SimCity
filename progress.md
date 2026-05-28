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
