# Blender → WebCity sprite pipeline

`render_isos.py` batch-renders building models to transparent PNGs at the exact
projection the game uses, then `../buildAtlas.mjs` packs them into the atlas.

## Camera: 2:1 dimetric (matches `src/rendering/isoCamera.ts`)

The game tile is **64×32 px** → a 2:1 diamond. An **orthographic** camera at:

- **azimuth 45°**, **elevation `atan(0.5) ≈ 26.565°`**

projects a unit cube's top face to a 2:1 diamond — true SimCity-style dimetric.
The script sets `rotation_euler = (π/2 − elev, 0, π/4)` and an `ortho_scale`
sized so **one Blender unit = one tile = 64 px** (rendered at 2× = 128 px, then
downsampled in `buildAtlas.mjs`).

A **sun** lamp is placed to the screen **south-west** so the faces the procedural
fallback shades dark (south & west) stay dark here too — buildings look the same
whether they come from the atlas or the fallback.

## Modeling conventions

- **1 Blender unit = 1 tile.** Model an `N×M` building inside `x∈[0,N]`,
  `y∈[0,M]`, `z≥0`, with its **NW/top corner at the world origin `(0,0,0)`**.
  `+x` points toward screen-east, `+y` toward screen-south.
- The script derives the footprint from each object's XY bounding box
  (`ceil`), and the pixel **anchor** from the projection of the origin `(0,0,0)`
  (the plot's north apex). Both are written to `_blender_meta.json`.
- **Name objects (or collections) to match atlas keys**, using `_` for `:`
  (Blender names can't contain `:`):
  - `z_1_0_0` → `z:1:0:0` (Residential, low bucket, variant 0)
  - `b_3`     → `b:3`     (Police Station)
  `buildAtlas.mjs` / `spriteMap.json` translate `_`→`:` on ingest.

## Usage

```bash
blender -b tools/blender/city_assets.blend -P tools/blender/render_isos.py -- --out tools/assets-src
pnpm build:atlas
```

`city_assets.blend` is the artist-maintained scene of building models (not
checked in here — create it following the conventions above). Add a model, name
it, re-run the two commands, and it appears in-game with zero code changes.
