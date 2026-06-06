# Credits

## Building art — Kenney

The building sprites in `public/sprites/atlas.png` are rendered from 3D models by
**Kenney** (<https://www.kenney.nl>):

- **City Kit (Suburban)** — residential buildings
- **City Kit (Commercial)** — commercial buildings & skyscrapers
- **City Kit (Industrial)** — industrial buildings
- **Modular Buildings** — civic buildings (police, fire, hospital, school,
  library) and large 3×3 zone buildings, assembled from the kit's modular
  wall/window/door/roof pieces

All are released under the **Creative Commons Zero (CC0 1.0)** license
(<https://creativecommons.org/publicdomain/zero/1.0/>) — free for personal,
educational, and commercial use, no permission or credit required.

Crediting Kenney is not a license requirement, but it's the right thing to do.
If you enjoy this art, support Kenney at <https://www.kenney.nl/donate>.

The models are imported, re-angled to the game's 2:1 dimetric projection, and
packed into the atlas by `tools/blender/import_kenney.py` (single-cell City Kit
buildings) and `tools/blender/assemble_modular.py` (civic + large buildings
assembled from the Modular Buildings kit). See `tools/README.md`.
