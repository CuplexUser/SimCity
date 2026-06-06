"""
import_kenney.py — headless Blender: import Kenney City Kit .glb buildings,
re-origin them to the WebCity tile contract, render each at the in-game 2:1
dimetric angle, and emit PNGs + a spriteMap.json that tools/buildAtlas.mjs packs.

You never open Blender's UI. Run:

    blender -b -P tools/blender/import_kenney.py -- \
        --config tools/blender/kenney_packs.json --out tools/assets-src

Then:  pnpm build:atlas   (packs tools/assets-src/*.png -> public/sprites/)

Geometry contract (must match src/rendering/isoCamera.ts):
    1 tile = 64x32 px (2:1 dimetric). 1 Blender unit = 1 tile.
    Camera: ORTHO, azimuth 45 deg, elevation atan(0.5) ~= 26.565 deg.
    SUN from screen south-west so south/west faces read dark (matches the
    procedural fallback in tileTextures.ts).

The anchor (pixel sitting on the origin tile's NORTH apex) and the per-sprite
tilePx are measured EMPIRICALLY from the rendered projection (world_to_camera_view),
so they stay correct regardless of framing/resolution.
"""

import bpy
import sys
import os
import json
import math
import glob
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

# ── Args after "--" ───────────────────────────────────────────────────────────
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(flag, default):
    return argv[argv.index(flag) + 1] if flag in argv else default

config_path = arg("--config", "tools/blender/kenney_packs.json")
out_dir = os.path.abspath(arg("--out", "tools/assets-src"))
os.makedirs(out_dir, exist_ok=True)

PPU = 96            # render pixels per blender-unit (sets resolution; tilePx is measured, not assumed)
ELEV = math.atan(0.5)
TILE_UNIT = 1.0     # Kenney City Kit: 1 grid cell ~= 1 blender unit (verified by probe)

scene = bpy.context.scene
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
# EEVEE silently writes nothing in headless `-b` mode (no GL context); Workbench
# renders reliably headless. Configure it to show glTF textures with directional
# studio shading + cavity so low-poly faces read like the procedural fallback.
scene.render.engine = 'BLENDER_WORKBENCH'
shading = scene.display.shading
shading.light = 'STUDIO'
shading.color_type = 'TEXTURE'
shading.show_shadows = False
shading.show_cavity = True
shading.cavity_type = 'WORLD'

# ── Camera (orthographic 2:1 dimetric) ────────────────────────────────────────
cam_data = bpy.data.cameras.new("iso")
cam_data.type = 'ORTHO'
cam = bpy.data.objects.new("iso", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam.rotation_euler = (math.pi / 2 - ELEV, 0.0, math.pi / 4)
cam_data.clip_start = 0.01
cam_data.clip_end = 1000.0
# Camera basis vectors in world space.
R = cam.rotation_euler.to_matrix()
CAM_RIGHT = (R @ Vector((1, 0, 0))).normalized()
CAM_UP = (R @ Vector((0, 1, 0))).normalized()
CAM_FWD = (R @ Vector((0, 0, -1))).normalized()  # camera looks down -Z local

# ── Sun (screen south-west) ───────────────────────────────────────────────────
sun_data = bpy.data.lights.new("sun", 'SUN')
sun_data.energy = 3.0
sun = bpy.data.objects.new("sun", sun_data)
sun.rotation_euler = (math.radians(55), 0.0, math.radians(215))
scene.collection.objects.link(sun)
# A little ambient so shadowed faces aren't pure black.
world = bpy.data.worlds.new("w") if not scene.world else scene.world
scene.world = world
world.use_nodes = True
try:
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.35
except Exception:
    pass


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before and o.type == 'MESH']


def world_bbox(objs):
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            for i in range(3):
                mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
    return mn, mx


def _render_current(objs, fname):
    """Frame the current pose, render to fname.png, return (anchorX, anchorY, tilePx)."""
    mn, mx = world_bbox(objs)
    corners = [Vector((x, y, z)) for x in (mn.x, mx.x) for y in (mn.y, mx.y) for z in (mn.z, mx.z)]
    corners += [Vector((0, 0, 0)), Vector((1, 0, 0)), Vector((1, 1, 0)), Vector((0, 1, 0))]
    us = [p.dot(CAM_RIGHT) for p in corners]
    vs = [p.dot(CAM_UP) for p in corners]
    u_c, v_c = (min(us) + max(us)) / 2, (min(vs) + max(vs)) / 2
    extent = max(max(us) - min(us), max(vs) - min(vs)) * 1.12

    cam.data.ortho_scale = extent
    cam.location = CAM_RIGHT * u_c + CAM_UP * v_c - CAM_FWD * 100.0
    res = max(256, min(1536, round(extent * PPU)))
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.resolution_percentage = 100

    for o in scene.objects:
        if o.type == 'MESH':
            o.hide_render = (o not in objs)

    scene.render.filepath = os.path.join(out_dir, fname + ".png")
    bpy.ops.render.render(write_still=True)

    def px(p):
        co = world_to_camera_view(scene, cam, Vector(p))
        return (co.x * res, (1.0 - co.y) * res)
    # The tile's NORTH apex (where the game anchors the sprite) is the Blender
    # corner (0,1) under this camera azimuth — it has the max screen-up. Anchoring
    # at (0,0,0) shifts the building 1 tile up-right of its plot.
    ax, ay = px((0, 1, 0))
    # Tile width = horizontal span of the full unit-tile diamond (N/S corners are the
    # horizontal extremes under the 45-deg camera; E/W coincide in screen x).
    txs = [px((0, 0, 0))[0], px((1, 0, 0))[0], px((1, 1, 0))[0], px((0, 1, 0))[0]]
    return round(ax), round(ay), round(max(txs) - min(txs))


def render_building(objs, zone, bucket, variant, name):
    """Force the model to a 1x1 tile cell, then render 4 rotations (r0..r3) so the
    renderer can face the building toward its road. Returns [(fname, entry), ...]."""
    # Uniform-scale the assembly (about world origin) so it fits one tile in plan.
    mn, mx = world_bbox(objs)
    span = mx - mn
    s = TILE_UNIT / max(span.x, span.y, 1e-4)
    for o in objs:
        o.location = o.location * s
        o.scale = o.scale * s
    bpy.context.view_layer.update()

    # Center in the [0,1]x[0,1] cell, sitting on the ground.
    mn, mx = world_bbox(objs)
    shift = Vector((0.5 - (mn.x + mx.x) / 2, 0.5 - (mn.y + mx.y) / 2, -mn.z))
    for o in objs:
        o.location += shift
    bpy.context.view_layer.update()

    # Pivot at the cell center so 90-deg steps rotate the building in place.
    pivot = bpy.data.objects.new("pivot", None)
    pivot.location = (0.5, 0.5, 0.0)
    scene.collection.objects.link(pivot)
    bpy.context.view_layer.update()
    for o in objs:
        o.parent = pivot
        o.matrix_parent_inverse = pivot.matrix_world.inverted()

    out = []
    for rot in range(4):
        pivot.rotation_euler = (0.0, 0.0, math.radians(90 * rot))
        bpy.context.view_layer.update()
        fname = f"z_{zone}_{bucket}_{variant}_r{rot}__{name}"
        ax, ay, tile_px = _render_current(objs, fname)
        out.append((fname + ".png", {
            "key": f"z:{zone}:{bucket}:{variant}:r{rot}",
            "footW": 1, "footH": 1,
            "anchorX": ax, "anchorY": ay, "tilePx": tile_px,
        }))

    bpy.data.objects.remove(pivot, do_unlink=True)
    return out


def bucket_assignments(buildings, mode):
    """buildings: list of (name, path, height). Returns dict name -> bucket(0/1/2)."""
    out = {}
    if mode == "all-low":
        for n, _, _ in buildings:
            out[n] = 0
        return out
    sky = [b for b in buildings if "skyscraper" in b[0].lower()] if mode == "height+sky" else []
    rest = [b for b in buildings if b not in sky]
    rest.sort(key=lambda b: b[2])  # by height
    if mode == "height+sky":
        # rest -> buckets 0/1 by median; skyscrapers -> 2
        half = len(rest) // 2
        for i, b in enumerate(rest):
            out[b[0]] = 0 if i < half else 1
        for b in sky:
            out[b[0]] = 2
    else:  # "height" -> tertiles 0/1/2
        n = len(rest)
        for i, b in enumerate(rest):
            out[b[0]] = min(2, (i * 3) // max(1, n))
    return out


def main():
    with open(config_path) as f:
        cfg = json.load(f)

    sprite_map = {}
    summary = []
    for pack in cfg["packs"]:
        folder = pack["glb"]
        zone = pack["zone"]
        mode = pack["mode"]
        files = sorted(glob.glob(os.path.join(folder, "*.glb")))
        files = [f for f in files if os.path.basename(f).lower().startswith("building")]

        # First pass: import each, measure height, keep objs around.
        builds = []  # (name, objs, height)
        for fpath in files:
            name = os.path.splitext(os.path.basename(fpath))[0]
            objs = import_glb(fpath)
            if not objs:
                continue
            mn, mx = world_bbox(objs)
            builds.append((name, objs, mx.z - mn.z))

        buckets = bucket_assignments([(b[0], None, b[2]) for b in builds], mode)

        # Assign variant index per (zone,bucket).
        variant_counter = {}
        for name, objs, _ in builds:
            b = buckets[name]
            v = variant_counter.get(b, 0)
            variant_counter[b] = v + 1
            for png, entry in render_building(objs, zone, b, v, name):
                sprite_map[png] = entry
            summary.append((f"z:{zone}:{b}:{v}", name))
            # Remove this building's objects before the next import.
            for o in list(objs):
                bpy.data.objects.remove(o, do_unlink=True)

    # Write spriteMap.json next to assets so buildAtlas.mjs consumes it.
    map_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(config_path)))), "spriteMap.json")
    # config is tools/blender/kenney_packs.json -> spriteMap at tools/spriteMap.json
    map_path = os.path.normpath(os.path.join(os.path.dirname(config_path), "..", "spriteMap.json"))
    with open(map_path, "w") as f:
        json.dump(sprite_map, f, indent=2)

    print("\n=== WebCity import summary ===")
    for key, name in summary:
        print(f"  {key:12s} <- {name}")
    print(f"Rendered {len(summary)} buildings x4 rotations = {len(sprite_map)} sprites to {out_dir}")
    print(f"Wrote sprite map: {map_path}")
    print("Next: pnpm build:atlas")


main()
