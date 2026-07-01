"""
render_isos.py — render the editable models in city_assets.blend to WebCity sprite
PNGs + spriteMap.json entries, at the exact 2:1 dimetric projection the game uses.

This is the render step for the hand-editable asset pipeline: you build/tweak
models in tools/blender/city_assets.blend (seeded once by build_city_assets.py),
then run this to turn them into atlas-ready sprites. It replaces the old approach
where infra/tower geometry only existed transiently inside assemble_modular.py.

Run:
    blender -b tools/blender/city_assets.blend -P tools/blender/render_isos.py -- --out tools/assets-src
    pnpm build:atlas

How it works — for every collection tagged with a custom ["foot"] int property:
  • key   = collection name with '_' -> ':'  (e.g. "z_2_2_6" -> "z:2:2:6").
  • foot  = the collection's ["foot"] = the NxN tile plot size.
  • The asset is re-centered on its [0,foot]^2 plot on the ground (fit_footprint),
    so its layout offset in the .blend (there only for tidy editing) is ignored.
  • z:* keys render 4 rotations (r0..r3) so the sim can face a building toward its
    road; every other key renders once.
  • The pixel anchor (the plot's NORTH apex, world (0, foot, 0)) and per-sprite
    tilePx are measured empirically from the projection, so they stay correct
    regardless of framing/resolution — exactly like import_kenney.py.

Shared camera / neutral daylight rig / PBR + glass materials come from iso_render.py.
Geometry contract (must match src/rendering/isoCamera.ts): 1 tile = 64x32 px
(2:1 dimetric); 1 blender unit = 1 tile; ORTHO camera, azimuth 45 deg, elev atan(0.5).
"""

import bpy
import sys
import os
import json
import math
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

# ── Args after "--" ───────────────────────────────────────────────────────────
# --only a,b,c   render only these collections (by name, '_' form). spriteMap still
#                merges, so every other entry/PNG is left untouched.
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
out_dir = os.path.abspath(argv[argv.index("--out") + 1] if "--out" in argv else "tools/assets-src")
ONLY = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None
os.makedirs(out_dir, exist_ok=True)

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import iso_render as ir

MAP_PATH = os.path.normpath(os.path.join(HERE, "..", "spriteMap.json"))
PPU = 96

scene = ir.setup_scene(samples=128)
cam, CAM_RIGHT, CAM_UP, CAM_FWD = ir.setup_camera(scene)
ir.setup_lights(scene)


def world_bbox(objs):
    mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            for i in range(3):
                mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
    return mn, mx


def fit_footprint(objs, foot):
    """Uniform-scale the assembly so its plan spans `foot` tiles, centered in the
    [0,foot]^2 cell sitting on the ground. Offset-invariant: the model's layout
    position in the .blend does not matter."""
    bpy.context.view_layer.update()
    mn, mx = world_bbox(objs)
    span = mx - mn
    s = foot / max(span.x, span.y, 1e-4)
    for o in objs:
        o.location = o.location * s
        o.scale = o.scale * s
    bpy.context.view_layer.update()
    mn, mx = world_bbox(objs)
    shift = Vector((foot / 2 - (mn.x + mx.x) / 2, foot / 2 - (mn.y + mx.y) / 2, -mn.z))
    for o in objs:
        o.location += shift
    bpy.context.view_layer.update()


def render_current(objs, fname, foot):
    """Frame `objs` for the iso camera, render to fname.png, return the measured
    (anchorX, anchorY, tilePx)."""
    mn, mx = world_bbox(objs)
    corners = [Vector((x, y, z)) for x in (mn.x, mx.x) for y in (mn.y, mx.y) for z in (mn.z, mx.z)]
    corners += [Vector((0, 0, 0)), Vector((1, 0, 0)), Vector((1, 1, 0)), Vector((0, 1, 0))]
    us = [p.dot(CAM_RIGHT) for p in corners]
    vs = [p.dot(CAM_UP) for p in corners]
    u_c, v_c = (min(us) + max(us)) / 2, (min(vs) + max(vs)) / 2
    extent = max(max(us) - min(us), max(vs) - min(vs)) * 1.10

    cam.data.ortho_scale = extent
    cam.location = CAM_RIGHT * u_c + CAM_UP * v_c - CAM_FWD * 100.0
    res = max(256, min(2048, round(extent * PPU)))
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
    ax, ay = px((0, foot, 0))
    txs = [px((0, 0, 0))[0], px((1, 0, 0))[0], px((1, 1, 0))[0], px((0, 1, 0))[0]]
    return round(ax), round(ay), round(max(txs) - min(txs))


def render_static(objs, foot, key, name):
    fit_footprint(objs, foot)
    ax, ay, tile_px = render_current(objs, name, foot)
    return [(name + ".png", {"key": key, "footW": foot, "footH": foot,
                             "anchorX": ax, "anchorY": ay, "tilePx": tile_px})]


def render_rotations(objs, foot, key_base, name):
    fit_footprint(objs, foot)
    pivot = bpy.data.objects.new("pivot", None)
    pivot.location = (foot / 2, foot / 2, 0.0)
    scene.collection.objects.link(pivot)
    bpy.context.view_layer.update()
    for o in objs:
        o.parent = pivot
        o.matrix_parent_inverse = pivot.matrix_world.inverted()
    out = []
    for rot in range(4):
        pivot.rotation_euler = (0.0, 0.0, math.radians(90 * rot))
        bpy.context.view_layer.update()
        fname = f"{name}_r{rot}"
        ax, ay, tile_px = render_current(objs, fname, foot)
        out.append((fname + ".png", {"key": f"{key_base}:r{rot}", "footW": foot, "footH": foot,
                                     "anchorX": ax, "anchorY": ay, "tilePx": tile_px}))
    bpy.data.objects.remove(pivot, do_unlink=True)
    return out


def main():
    # Merge into any existing map so import_kenney.py + assemble_modular.py entries
    # (zone City-Kit art, civic buildings, Kenney-module lots) are preserved.
    sprite_map = {}
    if os.path.exists(MAP_PATH):
        with open(MAP_PATH) as f:
            sprite_map = json.load(f)

    # Deterministic order for tidy logs.
    cols = sorted((c for c in bpy.data.collections if c.get("foot") is not None),
                  key=lambda c: c.name)
    summary = []
    for col in cols:
        if ONLY and col.name not in ONLY:
            continue
        foot = int(col["foot"])
        key = col.get("key") or col.name.replace("_", ":")
        # A stable file stem: prefer the collection name (matches the atlas key).
        name = col.name
        objs = [o for o in col.objects if o.type == 'MESH']
        if not objs:
            continue
        if key.startswith("z:"):
            entries = render_rotations(objs, foot, key, name)
        else:
            entries = render_static(objs, foot, key, name)
        for png, entry in entries:
            sprite_map[png] = entry
        summary.append((key, name, foot, len(entries)))

    with open(MAP_PATH, "w") as f:
        json.dump(sprite_map, f, indent=2)

    print("\n=== render_isos summary ===")
    for key, name, foot, n in summary:
        print(f"  {key:14s} {foot}x{foot}  <- {name}  ({n} png)")
    print(f"Rendered {sum(n for *_, n in summary)} sprites to {out_dir}")
    print(f"Merged sprite map: {MAP_PATH} ({len(sprite_map)} entries)")
    print("Next: pnpm build:atlas")


main()
