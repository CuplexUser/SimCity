"""
render_isos.py — headless Blender batch-renderer for WebCity building sprites.

Renders each top-level object (or collection) in a .blend file to a transparent
PNG at the exact isometric projection the game uses, and writes an anchor sidecar
so tools/buildAtlas.mjs can pack the result with no manual anchoring.

Run:
    blender -b tools/blender/city_assets.blend -P tools/blender/render_isos.py -- --out tools/assets-src

Geometry contract (must match the in-game iso — see src/rendering/isoCamera.ts):
    TILE_W = 64, TILE_H = 32  → 2:1 dimetric.
    A 1×1×0 ground tile must project to a 64×32 px diamond.

How the camera achieves 2:1:
    - ORTHOGRAPHIC camera looking down the -Z-ish SW diagonal.
    - Azimuth 45°, elevation = atan(0.5) ≈ 26.565°  → top face of a unit cube
      projects to a 2:1 diamond (true SimCity-style dimetric). Set ortho_scale so
      one Blender unit (= one tile) spans 64 device px at the chosen render scale.
    - SUN lamp from the screen-south-west so the two faces the game shades dark
      (south/west) read consistently with the procedural fallback.

Modeling convention:
    - 1 Blender unit = 1 tile. Model an N×M building inside the box
      x∈[0,N], y∈[0,M], z≥0, with its NW/top corner at the world origin (0,0,0).
    - Name objects/collections to match atlas keys, e.g. "z_1_0_0", "b_3"
      (':' isn't legal in names; buildAtlas/spriteMap convert '_' → ':').
"""

import bpy
import sys
import os
import json
import math
from mathutils import Vector

# ── Args after "--" ───────────────────────────────────────────────────────────
argv = sys.argv
argv = argv[argv.index("--") + 1:] if "--" in argv else []
out_dir = "tools/assets-src"
if "--out" in argv:
    out_dir = argv[argv.index("--out") + 1]
os.makedirs(out_dir, exist_ok=True)

TILE_PX = 128          # render tiles at 2× (128px) for crisp downscale to 64 in buildAtlas
HH_RATIO = 0.5         # 2:1 iso
ELEV = math.atan(HH_RATIO)   # ≈ 26.565°

scene = bpy.context.scene
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'

# ── Camera ──────────────────────────────────────────────────────────────────
def setup_camera():
    cam_data = bpy.data.cameras.new("iso")
    cam_data.type = 'ORTHO'
    cam = bpy.data.objects.new("iso", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    # Point down the SW diagonal at the dimetric elevation.
    cam.rotation_euler = (math.pi / 2 - ELEV, 0.0, math.pi / 4)
    return cam

# ── Sun (south-west, matching the game's shaded faces) ─────────────────────────
def setup_sun():
    if not any(o.type == 'LIGHT' for o in scene.objects):
        light_data = bpy.data.lights.new("sun", 'SUN')
        light_data.energy = 3.0
        light = bpy.data.objects.new("sun", light_data)
        light.rotation_euler = (math.radians(55), 0.0, math.radians(215))
        scene.collection.objects.link(light)

# Frame the camera to a building's tile-space bounding box and compute the pixel
# anchor = projection of the plot's NORTH apex (origin tile top, world (0,0,0)).
def render_object(obj, cam):
    # Footprint = ceil of the XY bounding box in tile units.
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    max_x = max(v.x for v in bb); max_y = max(v.y for v in bb)
    foot_w = max(1, math.ceil(max_x - 1e-4))
    foot_h = max(1, math.ceil(max_y - 1e-4))

    # Fit ortho so the plot + height are framed; aim the camera at the plot center.
    target = Vector((foot_w / 2, foot_h / 2, 0))
    cam.location = target + Vector((10, -10, 10))  # along the SW->NE diagonal
    span = max(foot_w + foot_h, 4)
    cam.data.ortho_scale = span * 1.15

    res = int(TILE_PX * span)
    scene.render.resolution_x = res
    scene.render.resolution_y = res

    name = obj.name
    scene.render.filepath = os.path.join(out_dir, name + ".png")

    # isolate this object
    for o in scene.objects:
        o.hide_render = (o.type == 'MESH' and o is not obj)
    bpy.ops.render.render(write_still=True)

    return {"name": name, "footW": foot_w, "footH": foot_h}

def main():
    cam = setup_camera()
    setup_sun()
    meta = []
    for obj in [o for o in scene.objects if o.type == 'MESH']:
        meta.append(render_object(obj, cam))
    with open(os.path.join(out_dir, "_blender_meta.json"), "w") as f:
        json.dump({"tilePx": TILE_PX, "objects": meta}, f, indent=2)
    print("Rendered %d objects to %s" % (len(meta), out_dir))

main()
