"""
render_cars.py — headless Blender renderer for WebCity's animated traffic cars.

Builds a few low-poly car meshes *procedurally* (no external assets, like
genStarterAtlas) and renders each one at the in-game 2:1 dimetric angle facing
all 8 travel directions the road network uses:

    grid-axis roads → screen diagonals : ne se sw nw
    45° diagonal roads → screen axes   : n  e  s  w

Output: tools/assets-src/car_<dir>_<variant>__<style>.png  + merged spriteMap.json
entries keyed  car:<dir>:<variant>  (anchor = the car's ground center, the point
that sits on the road). Then:

    blender -b -P tools/blender/render_cars.py -- --out tools/assets-src
    pnpm build:atlas          # packs the PNGs into public/sprites/

The game already renders cars from a procedural fallback (tileTextures.ts); this
script just upgrades the same `car:*` keys with real geometry.

Geometry contract (must match src/rendering/isoCamera.ts):
    1 tile = 64×32 px (2:1). 1 Blender unit = 1 tile. Camera ORTHO, azimuth 45°,
    elevation atan(0.5) ≈ 26.565°. Sun from the screen south-west.
"""

import bpy
import sys
import os
import json
import math
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

# ── Args after "--" ───────────────────────────────────────────────────────────
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(flag, default):
    return argv[argv.index(flag) + 1] if flag in argv else default

out_dir = os.path.abspath(arg("--out", "tools/assets-src"))
map_file = os.path.abspath(arg("--map", "tools/spriteMap.json"))
os.makedirs(out_dir, exist_ok=True)

ELEV = math.atan(0.5)
PPU  = 256          # render px per blender-unit (cars are <1 tile, so render big)
ORTHO = 1.6         # camera span in tiles — frames a centered car with margin

# 8 travel directions → the world-space (dx,dy) the car points along. dx = +col,
# dy = +row (matches the game grid). Model forward is local +X, so yaw = atan2(dy,dx).
DIRS = {
    "se": (1, 0), "sw": (0, 1), "ne": (0, -1), "nw": (-1, 0),
    "s": (1, 1), "e": (1, -1), "n": (-1, -1), "w": (-1, 1),
}

# Body colors mirror the procedural fallback palette (tileRenderer.ts CAR_BODY).
VARIANTS = [
    ("sedan", (0.78, 0.10, 0.10)),
    ("sedan", (0.10, 0.28, 0.78)),
    ("sedan", (0.85, 0.70, 0.10)),
    ("sedan", (0.10, 0.66, 0.32)),
]

# ── Scene: Workbench, ORTHO iso camera, SW sun ────────────────────────────────
scene = bpy.context.scene
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.engine = 'BLENDER_WORKBENCH'
shading = scene.display.shading
shading.light = 'STUDIO'
shading.color_type = 'OBJECT'      # flat per-object color (no textures on these meshes)
shading.show_shadows = False
shading.show_cavity = True
shading.cavity_type = 'WORLD'

cam_data = bpy.data.cameras.new("iso")
cam_data.type = 'ORTHO'
cam_data.ortho_scale = ORTHO
cam_data.clip_start = 0.01
cam_data.clip_end = 1000.0
cam = bpy.data.objects.new("iso", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam.rotation_euler = (math.pi / 2 - ELEV, 0.0, math.pi / 4)
R = cam.rotation_euler.to_matrix()
CAM_FWD = (R @ Vector((0, 0, -1))).normalized()
cam.location = -CAM_FWD * 100.0    # look at the world origin (car is centered there)

sun_data = bpy.data.lights.new("sun", 'SUN')
sun_data.energy = 3.0
sun = bpy.data.objects.new("sun", sun_data)
sun.rotation_euler = (math.radians(55), 0.0, math.radians(215))
scene.collection.objects.link(sun)

res = round(ORTHO * PPU)
scene.render.resolution_x = res
scene.render.resolution_y = res
scene.render.resolution_percentage = 100


# ── Procedural car mesh (forward = +X, centered on origin, sitting on z=0) ──────
def add_box(name, sx, sy, sz, loc, color):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = (sx, sy, sz)
    o.color = (color[0], color[1], color[2], 1.0)
    return o


def add_wheel(name, loc):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.05, depth=0.05, location=loc,
                                         rotation=(math.radians(90), 0, 0))
    o = bpy.context.active_object
    o.name = name
    o.color = (0.08, 0.08, 0.08, 1.0)
    return o


def build_car(body_color):
    """Low-poly car ~0.7×0.34 tiles, length along +X. Returns its object list."""
    objs = []
    # Lower body + hood/trunk
    objs.append(add_box("body", 0.70, 0.34, 0.14, (0.0, 0.0, 0.10), body_color))
    # Cabin (greenhouse), set back toward the rear, slightly lighter
    cabin = tuple(min(1.0, c * 1.25 + 0.06) for c in body_color)
    objs.append(add_box("cabin", 0.34, 0.28, 0.13, (-0.04, 0.0, 0.235), cabin))
    # Windshield strip (dark) at the front of the cabin
    objs.append(add_box("glass", 0.05, 0.26, 0.11, (0.15, 0.0, 0.235), (0.10, 0.12, 0.16)))
    # Four wheels
    for i, (x, y) in enumerate([(0.24, 0.18), (0.24, -0.18), (-0.24, 0.18), (-0.24, -0.18)]):
        objs.append(add_wheel("wheel%d" % i, (x, y, 0.05)))
    return objs


def px(p):
    co = world_to_camera_view(scene, cam, Vector(p))
    return (co.x * res, (1.0 - co.y) * res)


def render_dir(objs, pivot, fname, dx, dy):
    """Rotate the car to face (dx,dy), render, return (anchorX, anchorY, tilePx)."""
    pivot.rotation_euler = (0.0, 0.0, math.atan2(dy, dx))
    bpy.context.view_layer.update()

    scene.render.filepath = os.path.join(out_dir, fname + ".png")
    bpy.ops.render.render(write_still=True)

    # Anchor = the car's ground center (origin) — the point that rides the road.
    ax, ay = px((0.0, 0.0, 0.0))
    # tilePx = on-screen width of a unit tile under this camera (for atlas scaling).
    txs = [px((0, 0, 0))[0], px((1, 0, 0))[0], px((1, 1, 0))[0], px((0, 1, 0))[0]]
    return round(ax), round(ay), round(max(txs) - min(txs))


def main():
    # Merge into any existing spriteMap so building entries are preserved.
    sprite_map = {}
    if os.path.exists(map_file):
        with open(map_file) as f:
            sprite_map = json.load(f)

    for vi, (style, color) in enumerate(VARIANTS):
        objs = build_car(color)
        # Parent everything to a pivot at the origin so a single Z-rotation aims it.
        pivot = bpy.data.objects.new("pivot_%d" % vi, None)
        scene.collection.objects.link(pivot)
        bpy.context.view_layer.update()
        for o in objs:
            o.parent = pivot
        # Only this car is visible while it renders.
        for o in scene.objects:
            if o.type == 'MESH':
                o.hide_render = o not in objs
        bpy.context.view_layer.update()

        for d, (dx, dy) in DIRS.items():
            fname = "car_%s_%d__%s" % (d, vi, style)
            ax, ay, tpx = render_dir(objs, pivot, fname, dx, dy)
            sprite_map[fname + ".png"] = {
                "key": "car:%s:%d" % (d, vi),
                "footW": 1, "footH": 1,
                "anchorX": ax, "anchorY": ay, "tilePx": tpx,
            }

        # Clean up before the next variant.
        for o in objs:
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.objects.remove(pivot, do_unlink=True)

    with open(map_file, "w") as f:
        json.dump(sprite_map, f, indent=2)
    print("Rendered %d cars (%d dirs × %d variants) → %s" %
          (len(DIRS) * len(VARIANTS), len(DIRS), len(VARIANTS), out_dir))


main()
