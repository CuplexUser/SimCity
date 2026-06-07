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

### 1b. Kenney City Kits (the current atlas — automated)

The bundled atlas is built from **Kenney's CC0 City Kits** (Suburban / Commercial /
Industrial). `blender/import_kenney.py` does the whole job headlessly — you never
open Blender's UI:

```bash
blender -b -P tools/blender/import_kenney.py -- \
    --config tools/blender/kenney_packs.json --out tools/assets-src
pnpm build:atlas
```

For each `.glb` it: imports, re-origins to the tile contract (Kenney models are
center-origin; the game wants the NW corner at world origin), renders with the
ORTHO 2:1 camera + Workbench engine (EEVEE writes nothing in headless `-b` mode),
and **measures the anchor + per-sprite `tilePx` empirically** from the projection.
It writes the PNGs *and* `tools/spriteMap.json`, so `pnpm build:atlas` just packs.

`kenney_packs.json` maps each pack → zone (1=R 2=C 3=I) and a density-bucketing
rule. Only files whose name starts with `building` are imported (props/details
are skipped). Edit it to point at your own unzipped pack folders.

### 1c. Kenney Modular Buildings → civic + big buildings (automated)

The City Kits are single-cell only. `blender/assemble_modular.py` builds the art
they can't, from the **Kenney Modular Buildings** kit (a clean 1×1×0.625-unit grid
of wall/window/door/roof pieces):

```bash
blender -b -P tools/blender/assemble_modular.py
pnpm build:atlas
```

It tiles modules into parametric `W×D×floors` buildings — but not plain boxes.
Each spec mixes the kit's modules so buildings read as distinct: window styles
(`building-window-large`, `building-windows-round` arched, `building-window-awnings`,
`building-window-balcony`), round-top corner pieces, a front entrance (door +
`building-steps-wide` stoop) or a row of `building-door` engine bays, a bordered
**parapet roof** (`roof-flat-border-side`/`-corner` lip + `roof-flat-detail-*`
rooftop units) instead of a flat slab, optional rooftop AC, and a `roof-flat-top`-
capped watch tower. It renders:
- **Civic buildings** keyed `b:{enum}` at a 2×2 footprint — Police (large windows),
  Fire (engine bays + watch tower), Hospital (tall, awnings, rooftop plant), School
  (wide, arched windows, awnings), Library (arched/classical) — replacing the
  procedural fallback for those.
- **3×3 big zone buildings** keyed `z:{zone}:{bucket}:{variant}:r{rot}` (4 rotations)
  so the sim grows real large lots (`zoneLotSizes()` then reports size 3):
  residential w/ balconies (gray walls + green roof to match the Suburban City
  Kit houses), a blue-glass commercial tower, a drab industrial plant.

Most buildings are the kit's beige texture multiplied by a per-building `tint`,
but a building can instead set a `palette` (gray `wall` / green `roof` / `trim`)
that renders flat per-group colors in Workbench OBJECT mode — used by `big_res`
so a dense residential lot blends with the green-roofed suburban houses around it
instead of reading as a sand-colored box. Pieces are tagged `wall`/`roof`/`trim`
via `instance(..., grp=)`.

The same script also renders **infrastructure** that no Kenney kit models, built
from Blender mesh **primitives** (`box`/`cyl`/`cone`/`dome`, coordinates in tile
units; `fit_footprint` normalizes each to its plot). Primitives set their own
`o.color`, rendered flat via `palette='keep'` (Workbench OBJECT mode, no recolor):
- Power plants + water tower keyed `b:{enum}` — coal (powerhouse + banded stacks +
  fuel tanks), gas turbine, nuclear (cooling tower + domed containment), solar
  farm (tilted panel rows), wind turbine, water tower (braced tank) — replacing
  the procedural fallback for those.
- A transmission **pylon** keyed `infra:pylon` (1×1 steel lattice + cross-arms +
  insulators). The renderer draws it on every power-line tile, on the building
  layer above the procedural connecting wire (`renderer.ts` `_rebuildOverlay`).

Piece facings are measured from the GLBs: window/door/awning detail and the
border-side parapet lip face `-Y` at rotation 0 (map `{-Y:0,+X:90,+Y:180,-X:270}`);
corner pieces' feature faces the `+X,-Y` diagonal at rotation 0 (see `CORNER_RZ`).
It **merges** into `tools/spriteMap.json` so the City Kit zone art is preserved.
Edit the `CIVIC` / `BIG` spec lists at the bottom of the script to add buildings
or change which modules each uses.

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
| `blender/render_isos.py` | Headless Blender batch renderer at the in-game iso angle (for custom `.blend` art). |
| `blender/import_kenney.py` | Headless Blender: import Kenney `.glb` kits → re-origin → render → write PNGs + spriteMap.json. |
| `blender/assemble_modular.py` | Headless Blender: assemble Kenney Modular Buildings pieces → civic (`b:`) + 3×3 zone buildings, plus primitive-built infrastructure (power plants/water tower `b:`, `infra:pylon`) → merge spriteMap.json. |
| `blender/kenney_packs.json` | Maps each Kenney pack folder → zone + density-bucketing rule. |
| `blender/README.md` | Blender camera/anchor math + modeling conventions. |

## Credits

Building art is from **[Kenney](https://www.kenney.nl)** City Kits (Suburban,
Commercial, Industrial), released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Crediting Kenney isn't required but is appreciated — support at
[kenney.nl/donate](https://www.kenney.nl/donate).
