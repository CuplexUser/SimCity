"""
assemble_modular.py — headless Blender: assemble Kenney *Modular Buildings* kit
pieces into parametric box buildings, render them at the in-game 2:1 dimetric
angle, and emit PNGs + spriteMap.json entries that tools/buildAtlas.mjs packs.

Produces two families of art the single-cell City Kits can't:
  • Civic buildings  → keyed  b:{enum}   at a 2x2 tile footprint (Police, Fire,
    Hospital, School, Library) — replaces the scaled-up procedural fallback.
  • Big zone lots    → keyed  z:{zone}:{bucket}:{variant}:r{rot}  at a 3x3 tile
    footprint with 4 rotations — lets the sim grow real large buildings instead
    of the 1x1 workaround.

It MERGES into any existing tools/spriteMap.json (so the City Kit zone art from
import_kenney.py is preserved) and writes PNGs alongside it. Run:

    blender -b -P tools/blender/assemble_modular.py
    pnpm build:atlas

Geometry contract matches src/rendering/isoCamera.ts and import_kenney.py:
    1 tile = 64x32 px (2:1 dimetric). 1 blender unit = 1 tile.
    Camera ORTHO, azimuth 45 deg, elevation atan(0.5).
Modules are a clean unit grid: every wall block is 1x1 in plan and FLOOR_H tall,
centred at origin with base at z=0; windows face -Y by default.
"""

import bpy
import os
import json
import math
import numpy as np
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

# ── Paths ─────────────────────────────────────────────────────────────────────
HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
FOLDER = r"D:/Code/Claude/Simcity/game_assets/kenny_modular-buildings/Models/GLB format"
OUT_DIR = os.path.join(TOOLS, "assets-src")
MAP_PATH = os.path.join(TOOLS, "spriteMap.json")
os.makedirs(OUT_DIR, exist_ok=True)

PPU = 96
ELEV = math.atan(0.5)
FLOOR_H = 0.625        # measured: one wall module is 0.625 blender-units tall
DIR_RZ = {'-Y': 0, '+X': 90, '+Y': 180, '-X': 270}  # outward normal -> z rotation (deg)

# ── Scene / render engine (Workbench: EEVEE writes nothing headless) ───────────
scene = bpy.context.scene
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.engine = 'BLENDER_WORKBENCH'
sh = scene.display.shading
sh.light = 'STUDIO'
sh.color_type = 'TEXTURE'
sh.show_shadows = False
sh.show_cavity = True
sh.cavity_type = 'WORLD'

# ── Camera ────────────────────────────────────────────────────────────────────
cam_data = bpy.data.cameras.new("iso")
cam_data.type = 'ORTHO'
cam_data.clip_start = 0.01
cam_data.clip_end = 1000.0
cam = bpy.data.objects.new("iso", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam.rotation_euler = (math.pi / 2 - ELEV, 0.0, math.pi / 4)
R = cam.rotation_euler.to_matrix()
CAM_RIGHT = (R @ Vector((1, 0, 0))).normalized()
CAM_UP = (R @ Vector((0, 1, 0))).normalized()
CAM_FWD = (R @ Vector((0, 0, -1))).normalized()

# ── Sun (screen south-west) ───────────────────────────────────────────────────
sun_data = bpy.data.lights.new("sun", 'SUN')
sun_data.energy = 3.0
sun = bpy.data.objects.new("sun", sun_data)
sun.rotation_euler = (math.radians(55), 0.0, math.radians(215))
scene.collection.objects.link(sun)
world = scene.world or bpy.data.worlds.new("w")
scene.world = world
world.use_nodes = True
try:
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.35
except Exception:
    pass

# ── Module library (import each piece once, reuse its mesh datablock) ──────────
MOD_CACHE = {}


def load_module(name):
    if name in MOD_CACHE:
        return MOD_CACHE[name]
    path = os.path.join(FOLDER, name + ".glb")
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    tmpl = meshes[0]
    # Bake the glTF import transform (Y-up->Z-up etc.) into the mesh so shared
    # instances only carry our own placement transform.
    mw = tmpl.matrix_world.copy()
    tmpl.parent = None
    tmpl.matrix_world = mw
    bpy.ops.object.select_all(action='DESELECT')
    tmpl.select_set(True)
    bpy.context.view_layer.objects.active = tmpl
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    tmpl.hide_render = True
    for o in new:
        if o is not tmpl:
            bpy.data.objects.remove(o, do_unlink=True)
    MOD_CACHE[name] = tmpl.data
    return tmpl.data


def instance(name, x, y, z, rz_deg, objs):
    o = bpy.data.objects.new(f"{name}_i", load_module(name))
    o.location = (x, y, z)
    o.rotation_euler = (0.0, 0.0, math.radians(rz_deg))
    scene.collection.objects.link(o)
    objs.append(o)
    return o


# ── Building assembly ─────────────────────────────────────────────────────────
def build(mw, md, floors, window="building-window", door=True, ac=False, tower=0):
    """Assemble an mw x md (modules) building of `floors` floors. Returns objs.
    `tower`>0 adds that many extra floors as a 2x2 turret at the NW corner for a
    distinct silhouette (e.g. a fire station)."""
    objs = []
    door_cell = (mw // 2, 0)
    for f in range(floors):
        z = f * FLOOR_H
        for i in range(mw):
            for j in range(md):
                dirs = []
                if i == 0: dirs.append('-X')
                if i == mw - 1: dirs.append('+X')
                if j == 0: dirs.append('-Y')
                if j == md - 1: dirs.append('+Y')
                if not dirs:
                    continue  # interior is never seen (solid perimeter + roof)
                # Prefer a camera-facing outward direction for the visible detail.
                d = next((p for p in ('+X', '-Y', '+Y', '-X') if p in dirs), dirs[0])
                mod = window
                if f == 0 and door and (i, j) == door_cell and '-Y' in dirs:
                    mod, d = "building-door", '-Y'
                instance(mod, i, j, z, DIR_RZ[d], objs)
    # Flat roof slab on top.
    ztop = floors * FLOOR_H
    for i in range(mw):
        for j in range(md):
            instance("roof-flat-center", i, j, ztop, 0, objs)
    if ac:
        instance("detail-ac-a", mw / 2 - 0.5, md / 2 - 0.5, ztop + 0.106, 0, objs)
        instance("detail-ac-b", mw / 2 + 0.5, md / 2 - 0.5, ztop + 0.106, 0, objs)
    # Corner turret rising above the main roof (front-left cell, window to -Y).
    for t in range(tower):
        instance(window, 0, 0, (floors + t) * FLOOR_H, DIR_RZ['-Y'], objs)
    if tower:
        instance("roof-flat-center", 0, 0, (floors + tower) * FLOOR_H, 0, objs)
    return objs


def clear_objs(objs):
    for o in list(objs):
        try:
            bpy.data.objects.remove(o, do_unlink=True)
        except Exception:
            pass


# ── Render (scale to footprint, optional 4 rotations) ─────────────────────────
def world_bbox(objs):
    mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            for i in range(3):
                mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
    return mn, mx


def _tint_png(path, tint):
    """Multiply the RGB of a rendered PNG by `tint` (keeps alpha) so each civic
    building reads as a distinct colour despite the kit's single beige texture.
    Done in Blender's linear pixel space, which is the right space for a tint."""
    img = bpy.data.images.load(path, check_existing=False)
    n = len(img.pixels)
    buf = np.empty(n, dtype=np.float32)
    img.pixels.foreach_get(buf)
    buf = buf.reshape(-1, 4)
    buf[:, 0] *= tint[0]
    buf[:, 1] *= tint[1]
    buf[:, 2] *= tint[2]
    img.pixels.foreach_set(buf.reshape(-1))
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


def _render_current(objs, fname, foot, tint=None):
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

    out_path = os.path.join(OUT_DIR, fname + ".png")
    scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)

    if tint is not None:
        _tint_png(out_path, tint)

    def px(p):
        co = world_to_camera_view(scene, cam, Vector(p))
        return (co.x * res, (1.0 - co.y) * res)
    # The footprint's NORTH apex (the origin tile's top, where the game anchors a
    # multi-tile sprite) is the Blender corner (0, foot) under this camera azimuth
    # — it has the max screen-up. Anchoring at (0,0,0) would shift the building by
    # `foot` tiles up-right.
    ax, ay = px((0, foot, 0))
    txs = [px((0, 0, 0))[0], px((1, 0, 0))[0], px((1, 1, 0))[0], px((0, 1, 0))[0]]
    return round(ax), round(ay), round(max(txs) - min(txs))


def fit_footprint(objs, foot):
    """Uniform-scale the assembly so its plan spans `foot` tiles, centre it in
    the [0,foot]^2 cell sitting on the ground."""
    # Force a depsgraph update so freshly-created instances report a current
    # matrix_world. Without this, a building whose modules were all cached (no
    # import → no implicit update) measures a 1-unit bbox and gets scaled up.
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


def render_static(objs, foot, key, name, tint=None):
    """Single render (no rotations) → one spriteMap entry. For civic b: keys."""
    fit_footprint(objs, foot)
    fname = f"{name}"
    ax, ay, tile_px = _render_current(objs, fname, foot, tint=tint)
    return [(fname + ".png", {"key": key, "footW": foot, "footH": foot,
                              "anchorX": ax, "anchorY": ay, "tilePx": tile_px})]


def render_rotations(objs, foot, key_base, name, tint=None):
    """4 rotations about the plot centre → 4 spriteMap entries. For z: keys."""
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
        ax, ay, tile_px = _render_current(objs, fname, foot, tint=tint)
        out.append((fname + ".png", {"key": f"{key_base}:r{rot}", "footW": foot, "footH": foot,
                                     "anchorX": ax, "anchorY": ay, "tilePx": tile_px}))
    bpy.data.objects.remove(pivot, do_unlink=True)
    return out


# ── Specs ─────────────────────────────────────────────────────────────────────
# Civic buildings. The Modular kit has one beige texture, so each gets a distinct
# colour tint (multiplied over the render) plus a distinct silhouette so they read
# as different services. (enum, name, mw, md, floors, foot, ac, tower, tint)
CIVIC = [
    (3, "civic_police",   3, 3, 3, 2, False, 0, (0.62, 0.72, 1.05)),  # blue
    (4, "civic_fire",     3, 3, 2, 2, False, 3, (1.20, 0.52, 0.45)),  # red + watch tower
    (5, "civic_hospital", 4, 4, 4, 2, True,  0, (1.08, 1.08, 1.12)),  # clean white, tallest
    (6, "civic_school",   4, 3, 2, 2, False, 0, (1.10, 0.90, 0.55)),  # warm tan, wide & low
    (7, "civic_library",  3, 3, 3, 2, False, 0, (0.70, 1.00, 0.72)),  # green
]
# Big zone lots: (zone, bucket, variant, name, mw, md, floors, foot, tint)
BIG = [
    (1, 2, 0, "big_res",  3, 3, 3, 3, (1.05, 0.92, 0.78)),  # residential — warm
    (2, 2, 5, "big_com",  3, 3, 7, 3, (0.70, 0.85, 1.10)),  # commercial — blue glass
    (3, 2, 6, "big_ind",  4, 4, 2, 3, (0.96, 0.90, 0.80)),  # industrial — drab grey
]


def main():
    sprite_map = {}
    if os.path.exists(MAP_PATH):
        with open(MAP_PATH) as f:
            sprite_map = json.load(f)

    summary = []
    for enum, name, mw, md, floors, foot, ac, tower, tint in CIVIC:
        objs = build(mw, md, floors, ac=ac, tower=tower)
        for png, entry in render_static(objs, foot, f"b:{enum}", name, tint=tint):
            sprite_map[png] = entry
        clear_objs(objs)
        summary.append((f"b:{enum}", name, foot))

    for zone, bucket, variant, name, mw, md, floors, foot, tint in BIG:
        objs = build(mw, md, floors)
        kb = f"z:{zone}:{bucket}:{variant}"
        for png, entry in render_rotations(objs, foot, kb, name, tint=tint):
            sprite_map[png] = entry
        clear_objs(objs)
        summary.append((kb, name, foot))

    with open(MAP_PATH, "w") as f:
        json.dump(sprite_map, f, indent=2)

    print("\n=== assemble_modular summary ===")
    for key, name, foot in summary:
        print(f"  {key:16s} {foot}x{foot}  <- {name}")
    print(f"Wrote {len(summary)} buildings to {OUT_DIR}")
    print(f"Merged sprite map: {MAP_PATH} ({len(sprite_map)} total entries)")
    print("Next: pnpm build:atlas")


main()
