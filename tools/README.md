# WebCity building art pipeline

The game renders buildings from **resource files** (`public/sprites/atlas.png` +
`manifest.json`), loaded at startup by `src/rendering/spriteAtlas.ts`. The runtime
never draws buildings procedurally except as a **fallback** for any key missing
from the atlas. This folder is how those resource files get made.

## TL;DR

```bash
pnpm gen:atlas     # generate the built-in starter atlas (no external assets needed)
pnpm build:atlas   # pack your own PNGs from tools/assets-src/ via tools/spriteMap.json
```

Either command writes `public/sprites/atlas.png` + `manifest.json`. Delete that
folder to fall back to the procedural look.

## Logical keys

| Key                      | Meaning                                              |
|--------------------------|------------------------------------------------------|
| `z:{zone}:{bucket}:{v}`  | zone building. zone 1=R 2=C 3=I. bucket 0=low 1=mid 2=high. `v`=variant (0…n) |
| `b:{building}`           | plopped building, matching the `Building` enum + `BUILDING_FOOTPRINT` in `src/data/buildings.ts` |

Zone lots can be multi-tile: the simulation only forms an N×N lot if the atlas
has square art at that size for the zone (`Renderer.zoneLotSizes()`), so the
no-art fallback stays 1×1.

## Geometry contract (read this before authoring art)

The in-game iso (`src/rendering/isoCamera.ts`) is **2:1 dimetric**: one tile is
**64×32 px**. Every sprite must obey:

- **Tile width = 64 px** (author at any multiple, e.g. 128 for 2×, and set
  `tilePx` so `buildAtlas.mjs` downscales — it records the residual `scale`).
- **Anchor** `(anchorX, anchorY)` = the pixel that sits on the **north apex** of
  the plot's origin (NW/top) tile — the exact point `renderer.ts` positions the
  sprite at. Buildings extend upward (smaller y) and across the plot diamond from
  there. Plot base vertices relative to the north apex (px), for an `fw×fh` plot:
  - N `(0, 0)`  ·  E `(fw·32, fw·16)`  ·  S `((fw−fh)·32, (fw+fh)·16)`  ·  W `(−fh·32, fh·16)`

## Two ways to make resources

### 1. Blender (custom SC4-style art — the long-term path)

See `blender/README.md`. Model each building 1 unit = 1 tile with its NW corner at
the world origin, name objects to match keys (`z_1_0_0`, `b_3` — `_`→`:`), then:

```bash
blender -b tools/blender/city_assets.blend -P tools/blender/render_isos.py -- --out tools/assets-src
pnpm build:atlas
```

The render script uses an orthographic 2:1 dimetric camera + SW sun and writes a
`_blender_meta.json` with footprints/anchors so packing is automatic.

### 2. CC0 isometric pack (fast drop-in)

SimCity 4's own art is copyrighted — do **not** use it. Use a permissively
licensed pack instead, e.g. Kenney's CC0 **City Kit (Commercial)** /
**City Kit (Suburban)** (<https://kenney.nl/assets>). Drop the PNGs into
`tools/assets-src/`, author `tools/spriteMap.json` (file → key + footprint +
anchor + source `tilePx`), then `pnpm build:atlas`. Pick frames whose camera
angle is ~2:1 dimetric so they sit flat on the grid.

## Files

| File | Role |
|------|------|
| `genStarterAtlas.mjs` | Generates the built-in starter atlas with `@napi-rs/canvas` (no external assets). Swappable per-key by the two methods above. |
| `buildAtlas.mjs` | Packs `assets-src/*.png` + `spriteMap.json` → atlas + manifest. |
| `spriteMap.json` | Source-PNG → atlas-key mapping (illustrative entries included). |
| `blender/render_isos.py` | Headless Blender batch renderer at the in-game iso angle. |
| `blender/README.md` | Blender camera/anchor math + modeling conventions. |
