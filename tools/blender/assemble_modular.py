"""
assemble_modular.py — headless Blender: assemble Kenney *Modular Buildings* kit
pieces into parametric box buildings, render them at the in-game 2:1 dimetric
angle, and emit PNGs + spriteMap.json entries that tools/buildAtlas.mjs packs.

Produces three families of art the single-cell City Kits can't:
  • Civic buildings  → keyed  b:{enum}   at a 2x2 tile footprint (Police, Fire,
    Hospital, School, Library) — replaces the scaled-up procedural fallback.
  • Big zone lots    → keyed  z:{zone}:{bucket}:{variant}:r{rot}  at a 3x3 tile
    footprint with 4 rotations — lets the sim grow real large buildings instead
    of the 1x1 workaround.
  • Infrastructure   → power plants/water tower keyed b:{enum} (coal, gas,
    nuclear, solar, wind, water tower) + a transmission pylon keyed infra:pylon.
    No Kenney kit has these, so they're built from Blender mesh primitives and
    rendered with flat per-object colors (Workbench OBJECT mode).

It MERGES into any existing tools/spriteMap.json (so the City Kit zone art from
import_kenney.py is preserved) and writes PNGs alongside it. Run:

    blender -b -P tools/blender/assemble_modular.py
    pnpm build:atlas

Geometry contract matches src/rendering/isoCamera.ts and import_kenney.py:
    1 tile = 64x32 px (2:1 dimetric). 1 blender unit = 1 tile.
    Camera ORTHO, azimuth 45 deg, elevation atan(0.5).
Modules are a clean unit grid: every wall block is 1x1 in plan and FLOOR_H tall,
centered at origin with base at z=0; windows face -Y by default.
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


def instance(name, x, y, z, rz_deg, objs, grp='wall'):
    o = bpy.data.objects.new(f"{name}_i", load_module(name))
    o.location = (x, y, z)
    o.rotation_euler = (0.0, 0.0, math.radians(rz_deg))
    o["grp"] = grp          # 'wall' | 'roof' | 'trim' — for the OBJECT-color palette path
    scene.collection.objects.link(o)
    objs.append(o)
    return o


# ── Calibration offsets (degrees added to the DIR_RZ facing for each piece
# family — set empirically from a test render so the detailed side of a piece
# faces outward / the parapet sits on the correct roof edge). ─────────────────
# Measured from the GLBs (see _inspect_pieces.py): window/door/awning detail and
# the border-side raised lip both face -Y at rz 0; the corner pieces' feature (the
# L of roof-flat-border-corner, the windowed corner of building-corner-window)
# faces the +X,-Y diagonal at rz 0. So all four families share rz 0 with no offset.
WALL_OFF = 0
CORNER_OFF = 0
BORDER_OFF = 0
BORDER_CORNER_OFF = 0

# Outward diagonal a corner cell points at -> base z rotation (deg), derived from
# the measured base feature diagonal (+X,-Y). Used for both the building-corner
# wall pieces and the roof-flat-border-corner parapet so each feature points out.
CORNER_RZ = {
    frozenset(('+X', '-Y')): 0,
    frozenset(('+X', '+Y')): 90,
    frozenset(('-X', '+Y')): 180,
    frozenset(('-X', '-Y')): 270,
}


# ── Building assembly ─────────────────────────────────────────────────────────
def _parapet_roof(mw, md, z, objs, style, details):
    """Lay the roof at height z. style 'flat' = plain slabs (old look); 'parapet'
    = raised border pieces on the edges/corners with slab infill, the look that
    makes the Kenney kit read as a finished building. `details` is a list of
    roof-flat-detail-* modules scattered on interior cells (vents/units)."""
    interior = [(i, j) for i in range(1, mw - 1) for j in range(1, md - 1)]
    detail_cells = {}
    for k, c in enumerate(interior):
        if details and k % 2 == 0:
            detail_cells[c] = details[(k // 2) % len(details)]
    for i in range(mw):
        for j in range(md):
            edges = []
            if i == 0: edges.append('-X')
            if i == mw - 1: edges.append('+X')
            if j == 0: edges.append('-Y')
            if j == md - 1: edges.append('+Y')
            if style == 'flat' or not edges:
                instance(detail_cells.get((i, j), "roof-flat-center"), i, j, z, 0, objs, grp='roof')
            elif len(edges) == 1:
                instance("roof-flat-border-side", i, j, z, DIR_RZ[edges[0]] + BORDER_OFF, objs, grp='roof')
            else:
                rz = CORNER_RZ.get(frozenset(edges[:2]), 0) + BORDER_CORNER_OFF
                instance("roof-flat-border-corner", i, j, z, rz, objs, grp='roof')


def build(mw, md, floors, *, wall="building-window", ground=None,
          ground_front=None, corner=None, door="building-door", steps=None,
          roof="parapet", details=(), ac=False, tower=0, tower_wall=None):
    """Assemble an mw x md (modules) building of `floors` floors. Returns objs.

    Walls are chosen per-cell so each building reads as a distinct service:
      wall          upper-floor perimeter window module
      ground        ground-floor perimeter window module (defaults to `wall`)
      ground_front  ground-floor module for the front (-Y) row, e.g. a row of
                    `building-door` engine bays for a fire station
      corner        module for the four corner cells (e.g. round-top corners)
      door          single entrance module at the front-center cell
      steps         entrance stoop placed in front of the door (e.g. building-steps-wide)
      roof          'parapet' (bordered, detailed) or 'flat' (plain slabs)
      details       roof-flat-detail-* modules scattered on the roof interior
      ac            add rooftop AC units
      tower>0       extra floors as a watch tower at the NW corner (fire station)
    """
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
                is_corner = len(dirs) >= 2
                rz = DIR_RZ[d] + WALL_OFF
                if f == 0 and ground_front and '-Y' in dirs:
                    mod, rz = ground_front, DIR_RZ['-Y'] + WALL_OFF
                elif f == 0 and (i, j) == door_cell and door and '-Y' in dirs:
                    mod, rz = door, DIR_RZ['-Y'] + WALL_OFF
                    if steps:
                        instance(steps, i, j, 0.0, DIR_RZ['-Y'] + WALL_OFF, objs, grp='trim')
                elif is_corner and corner:
                    mod = corner
                    rz = CORNER_RZ.get(frozenset(dirs[:2]), DIR_RZ[d]) + CORNER_OFF
                elif f == 0 and ground:
                    mod = ground
                else:
                    mod = wall
                instance(mod, i, j, z, rz, objs)
    # Roof.
    ztop = floors * FLOOR_H
    _parapet_roof(mw, md, ztop, objs, roof, details)
    if ac:
        instance("detail-ac-a", mw / 2 - 0.5, md / 2 - 0.5, ztop + 0.106, 0, objs, grp='trim')
        instance("detail-ac-b", mw / 2 + 0.5, md / 2 - 0.5, ztop + 0.106, 0, objs, grp='trim')
    # Watch tower rising above the main roof (front-left cell, window to -Y),
    # capped with the kit's overhanging roof-flat-top for a distinct silhouette.
    tw = tower_wall or wall
    for t in range(tower):
        instance(tw, 0, 0, (floors + t) * FLOOR_H, DIR_RZ['-Y'] + WALL_OFF, objs)
    if tower:
        instance("roof-flat-top", 0, 0, (floors + tower) * FLOOR_H, 0, objs, grp='roof')
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
    building reads as a distinct color despite the kit's single beige texture.
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


def apply_palette(objs, pal):
    """Give each object a flat viewport color by its 'grp' tag, so a building can
    be rendered with gray walls + a green roof (matching the Kenney Suburban City
    Kit) instead of one uniform texture tint. Colors are sRGB-ish 0..1."""
    default = pal.get('wall', (0.8, 0.8, 0.8))
    for o in objs:
        c = pal.get(o.get("grp", 'wall'), default)
        o.color = (c[0], c[1], c[2], 1.0)


def _render_current(objs, fname, foot, tint=None, palette=None):
    # A palette renders flat per-object colors (Workbench OBJECT mode) instead of
    # the kit texture + post-tint, so walls and roof can differ. The 'keep'
    # sentinel means the objects already carry their own o.color (the primitive
    # infrastructure builders set colors directly) — just switch to OBJECT mode.
    if palette == 'keep':
        scene.display.shading.color_type = 'OBJECT'
    elif palette is not None:
        apply_palette(objs, palette)
        scene.display.shading.color_type = 'OBJECT'
    else:
        scene.display.shading.color_type = 'TEXTURE'
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

    if tint is not None and palette is None:
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
    """Uniform-scale the assembly so its plan spans `foot` tiles, center it in
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


def render_static(objs, foot, key, name, tint=None, palette=None):
    """Single render (no rotations) → one spriteMap entry. For civic b: keys."""
    fit_footprint(objs, foot)
    fname = f"{name}"
    ax, ay, tile_px = _render_current(objs, fname, foot, tint=tint, palette=palette)
    return [(fname + ".png", {"key": key, "footW": foot, "footH": foot,
                              "anchorX": ax, "anchorY": ay, "tilePx": tile_px})]


def render_rotations(objs, foot, key_base, name, tint=None, palette=None):
    """4 rotations about the plot center → 4 spriteMap entries. For z: keys."""
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
        ax, ay, tile_px = _render_current(objs, fname, foot, tint=tint, palette=palette)
        out.append((fname + ".png", {"key": f"{key_base}:r{rot}", "footW": foot, "footH": foot,
                                     "anchorX": ax, "anchorY": ay, "tilePx": tile_px}))
    bpy.data.objects.remove(pivot, do_unlink=True)
    return out


# ── Infrastructure primitives ──────────────────────────────────────────────────
# Power plants, the water tower and transmission pylons have no models in any
# Kenney kit, so they're assembled from Blender mesh primitives and rendered with
# flat per-object colors (Workbench OBJECT mode, palette='keep'). Coordinates are
# in tile units; fit_footprint() later normalizes the whole assembly to its plot.

def box(objs, cx, cy, cz, sx, sy, sz, color, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cx, cy, cz))
    o = bpy.context.active_object
    o.scale = (sx, sy, sz)
    o.rotation_euler = rot
    o.color = (color[0], color[1], color[2], 1.0)
    objs.append(o)
    return o


def cyl(objs, cx, cy, cz, r, h, color, rot=(0, 0, 0), verts=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=(cx, cy, cz))
    o = bpy.context.active_object
    o.rotation_euler = rot
    o.color = (color[0], color[1], color[2], 1.0)
    objs.append(o)
    return o


def cone(objs, cx, cy, cz, r1, r2, h, color, verts=24):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=h, location=(cx, cy, cz))
    o = bpy.context.active_object
    o.color = (color[0], color[1], color[2], 1.0)
    objs.append(o)
    return o


def dome(objs, cx, cy, cz, r, color, squash=0.6):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(cx, cy, cz))
    o = bpy.context.active_object
    o.scale = (1.0, 1.0, squash)
    o.color = (color[0], color[1], color[2], 1.0)
    objs.append(o)
    return o


def build_coal():
    """Coal plant (4x4): dark powerhouse box, two banded stacks, two fuel tanks."""
    objs = []
    GRAY, BASE, STK, RED, TANK = (0.34, 0.34, 0.36), (0.25, 0.25, 0.27), (0.62, 0.62, 0.64), (0.72, 0.22, 0.16), (0.78, 0.75, 0.66)
    box(objs, 0.0, 0.0, 0.55, 2.2, 1.6, 1.1, GRAY)
    box(objs, 0.0, 0.0, 1.16, 2.3, 1.7, 0.12, BASE)
    for sx in (-0.5, 0.5):
        cyl(objs, sx, 0.95, 1.4, 0.18, 2.8, STK)
        cyl(objs, sx, 0.95, 2.55, 0.20, 0.16, RED)
    cyl(objs, 1.35, -0.7, 0.45, 0.42, 0.9, TANK)
    cyl(objs, 1.35, 0.3, 0.45, 0.42, 0.9, TANK)
    return objs


def build_gas():
    """Gas turbine (3x3): clean turbine hall, two slim exhaust stacks, a tank."""
    objs = []
    HALL, ROOF, STK, TANK = (0.50, 0.55, 0.60), (0.40, 0.44, 0.48), (0.72, 0.74, 0.76), (0.80, 0.82, 0.84)
    box(objs, 0.0, 0.0, 0.50, 1.8, 1.2, 1.0, HALL)
    box(objs, 0.0, 0.0, 1.06, 1.9, 1.3, 0.12, ROOF)
    for sx in (-0.4, 0.4):
        cyl(objs, sx, 0.75, 1.25, 0.12, 1.6, STK)
    cyl(objs, 1.15, -0.5, 0.40, 0.35, 0.8, TANK)
    return objs


def build_nuclear():
    """Nuclear plant (4x4): a cooling tower, a domed containment, a turbine hall."""
    objs = []
    TOWER, HALL, CONT, DOM = (0.82, 0.82, 0.84), (0.55, 0.56, 0.58), (0.75, 0.75, 0.77), (0.70, 0.72, 0.78)
    cone(objs, 0.7, 0.7, 1.1, 0.85, 0.58, 2.2, TOWER)
    cone(objs, 0.7, 0.7, 2.28, 0.60, 0.66, 0.2, TOWER)
    cyl(objs, -0.85, -0.6, 0.6, 0.55, 1.2, CONT)
    dome(objs, -0.85, -0.6, 1.2, 0.55, DOM, squash=0.6)
    box(objs, -0.5, 0.85, 0.45, 1.5, 0.9, 0.9, HALL)
    return objs


def build_solar():
    """Solar farm (3x3): a gravel pad with three rows of tilted panels + inverter."""
    objs = []
    PAD, PANEL, POST, INV = (0.42, 0.41, 0.38), (0.10, 0.16, 0.42), (0.50, 0.50, 0.52), (0.70, 0.70, 0.72)
    box(objs, 0.0, 0.0, 0.04, 3.0, 3.0, 0.08, PAD)
    tilt = math.radians(28)
    for row in (-0.9, 0.0, 0.9):
        for px in (-1.0, 0.0, 1.0):
            box(objs, px, row - 0.15, 0.18, 0.06, 0.06, 0.32, POST)
        box(objs, 0.0, row, 0.42, 2.7, 0.66, 0.04, PANEL, rot=(tilt, 0, 0))
    box(objs, 1.25, -1.25, 0.18, 0.3, 0.3, 0.32, INV)
    return objs


def build_wind():
    """Wind turbine (1x1): tapered tower, nacelle, three-blade rotor facing -Y."""
    objs = []
    WHITE, HUB = (0.93, 0.94, 0.96), (0.85, 0.85, 0.88)
    cyl(objs, 0.0, 0.0, 0.85, 0.07, 1.7, WHITE)
    box(objs, 0.0, -0.12, 1.72, 0.16, 0.34, 0.16, WHITE)
    hx, hy, hz = 0.0, -0.30, 1.72
    cyl(objs, hx, hy, hz, 0.06, 0.12, HUB, rot=(math.radians(90), 0, 0))
    for k in range(3):
        a = math.radians(120 * k)
        box(objs, hx + 0.30 * math.sin(a), hy - 0.02, hz + 0.30 * math.cos(a),
            0.05, 0.03, 0.62, WHITE, rot=(0, a, 0))
    return objs


def build_water():
    """Water tower (2x2): four braced legs, a cylindrical tank, a conical roof."""
    objs = []
    TANK, LEG, ROOF = (0.86, 0.90, 0.95), (0.55, 0.60, 0.66), (0.42, 0.52, 0.70)
    for lx in (-0.4, 0.4):
        for ly in (-0.4, 0.4):
            box(objs, lx, ly, 0.6, 0.08, 0.08, 1.2, LEG)
    box(objs, 0.0, -0.4, 0.6, 0.85, 0.05, 0.05, LEG)
    box(objs, 0.0, 0.4, 0.6, 0.85, 0.05, 0.05, LEG)
    box(objs, -0.4, 0.0, 0.6, 0.05, 0.85, 0.05, LEG)
    box(objs, 0.4, 0.0, 0.6, 0.05, 0.85, 0.05, LEG)
    cyl(objs, 0.0, 0.0, 1.07, 0.6, 0.12, TANK)
    cyl(objs, 0.0, 0.0, 1.45, 0.6, 0.7, TANK)
    cone(objs, 0.0, 0.0, 1.95, 0.62, 0.0, 0.45, ROOF)
    return objs


def build_pylon():
    """Transmission pylon (1x1): a steel lattice with two cross-arms + insulators."""
    objs = []
    STEEL, INS = (0.55, 0.57, 0.60), (0.80, 0.80, 0.55)
    h = 2.2
    for sx in (-0.22, 0.22):
        for sy in (-0.22, 0.22):
            box(objs, sx, sy, h * 0.5, 0.05, 0.05, h, STEEL)
    for z in (0.5, 1.1, 1.7):
        box(objs, 0.0, 0.0, z, 0.48, 0.04, 0.04, STEEL)
        box(objs, 0.0, 0.0, z, 0.04, 0.48, 0.04, STEEL)
    for z in (1.85, 2.15):
        box(objs, 0.0, 0.0, z, 1.1, 0.07, 0.06, STEEL)
        for ix in (-0.5, 0.0, 0.5):
            cyl(objs, ix, 0.0, z - 0.12, 0.04, 0.16, INS)
    return objs


# (key, name, foot, builder) — power plants/water tower keyed b:{enum}, pylon its own.
INFRA = [
    ("b:1",  "infra_coal",    4, build_coal),
    ("b:8",  "infra_gas",     3, build_gas),
    ("b:9",  "infra_nuclear", 4, build_nuclear),
    ("b:10", "infra_solar",   3, build_solar),
    ("b:11", "infra_wind",    1, build_wind),
    ("b:2",  "infra_water",   2, build_water),
    ("infra:pylon", "infra_pylon", 1, build_pylon),
]


# ── Specs ─────────────────────────────────────────────────────────────────────
# Civic buildings. The Modular kit has one beige texture, so each gets a distinct
# color tint (multiplied over the render). Beyond tint, each uses a different
# mix of the kit's modules (window styles, awnings, balconies, round-top corners,
# entrance steps, bordered/detailed roofs, a watch tower) so they read as clearly
# different services rather than recolored boxes.
# (enum, name, foot, build-kwargs, tint)
CIVIC = [
    (3, "civic_police", 2, dict(
        mw=3, md=3, floors=3, wall="building-window-large",
        ground="building-window", corner="building-corner-window",
        steps="building-steps-wide",
        details=("roof-flat-detail-a", "roof-flat-detail-c")),
        (0.62, 0.72, 1.05)),                                    # solid blue precinct
    (4, "civic_fire", 2, dict(
        mw=3, md=3, floors=2, wall="building-window",
        ground_front="building-door", corner="building-corner",
        details=("roof-flat-detail-b",), tower=3),
        (1.20, 0.52, 0.45)),                                    # red, engine bays + watch tower
    (5, "civic_hospital", 2, dict(
        mw=4, md=4, floors=4, wall="building-window",
        ground="building-window-awnings", corner="building-corner-window",
        steps="building-steps-wide", ac=True,
        details=("roof-flat-detail-a", "roof-flat-detail-b", "roof-flat-detail-d")),
        (1.08, 1.08, 1.12)),                                    # tall, clean white, rooftop plant
    (6, "civic_school", 2, dict(
        mw=4, md=3, floors=2, wall="building-windows-round",
        ground="building-window-awnings",
        corner="building-corner-window-top-round", steps="building-steps-wide",
        details=("roof-flat-detail-c",)),
        (1.10, 0.90, 0.55)),                                    # wide, warm tan, arched windows
    (7, "civic_library", 2, dict(
        mw=3, md=3, floors=3, wall="building-windows-round",
        ground="building-window-large",
        corner="building-corner-window-top-round", steps="building-steps-wide",
        details=("roof-flat-detail-a", "roof-flat-corner-high")),
        (0.70, 1.00, 0.72)),                                    # green, classical arched look
]
# Big zone lots: (zone, bucket, variant, name, foot, build-kwargs, tint, palette)
# A `palette` (gray walls + green roof) renders flat per-group colors so the lot
# matches the Kenney Suburban City Kit houses instead of a warm texture tint.
RES_PALETTE = {
    'wall': (0.80, 0.82, 0.84),   # light cool gray, like the suburban house walls
    'roof': (0.16, 0.42, 0.26),   # forest green, like the suburban gable roofs
    'trim': (0.40, 0.42, 0.44),   # mid gray for door / balcony / details
}
# Mid-density residential (z:1:1): single-cell (foot=1) modular apartment blocks,
# 4 rotations + variants, gray walls + green roof so they sit between the suburban
# houses (z:1:0) and the big_res block (z:1:2). The Suburban City Kit has no
# mid-density art, so without these the sim falls back to low houses for density 3-5.
MID_RES = [
    (1, 1, 0, "mid_res_a", 1, dict(
        mw=2, md=2, floors=2, wall="building-window",
        ground="building-window-balcony", corner="building-corner"),
        None, RES_PALETTE),
    (1, 1, 1, "mid_res_b", 1, dict(
        mw=2, md=2, floors=3, wall="building-window",
        corner="building-corner-window"),
        None, RES_PALETTE),
    (1, 1, 2, "mid_res_c", 1, dict(
        mw=3, md=2, floors=2, wall="building-windows-round",
        ground="building-window-awnings", corner="building-corner-window-top-round"),
        None, RES_PALETTE),
    (1, 1, 3, "mid_res_d", 1, dict(
        mw=2, md=2, floors=3, wall="building-window-large",
        ground="building-window-balcony", corner="building-corner"),
        None, RES_PALETTE),
]
BIG = MID_RES + [
    (1, 2, 0, "big_res", 3, dict(
        mw=3, md=3, floors=3, wall="building-window",
        ground="building-window-balcony", corner="building-corner",
        details=("roof-flat-detail-c",)),
        None, RES_PALETTE),                                     # residential — gray walls, green roof
    (2, 2, 5, "big_com", 3, dict(
        mw=3, md=3, floors=7, wall="building-window-large",
        corner="building-corner-window", ac=True,
        details=("roof-flat-detail-a", "roof-flat-detail-b")),
        (0.70, 0.85, 1.10), None),                              # commercial — blue glass tower
    (3, 2, 6, "big_ind", 3, dict(
        mw=4, md=4, floors=2, wall="building-window", ac=True,
        details=("roof-flat-detail-d",)),
        (0.96, 0.90, 0.80), None),                              # industrial — drab, rooftop plant
]


def main():
    sprite_map = {}
    if os.path.exists(MAP_PATH):
        with open(MAP_PATH) as f:
            sprite_map = json.load(f)

    summary = []
    for enum, name, foot, kw, tint in CIVIC:
        objs = build(**kw)
        for png, entry in render_static(objs, foot, f"b:{enum}", name, tint=tint):
            sprite_map[png] = entry
        clear_objs(objs)
        summary.append((f"b:{enum}", name, foot))

    for zone, bucket, variant, name, foot, kw, tint, palette in BIG:
        objs = build(**kw)
        kb = f"z:{zone}:{bucket}:{variant}"
        for png, entry in render_rotations(objs, foot, kb, name, tint=tint, palette=palette):
            sprite_map[png] = entry
        clear_objs(objs)
        summary.append((kb, name, foot))

    for key, name, foot, builder in INFRA:
        objs = builder()
        for png, entry in render_static(objs, foot, key, name, palette='keep'):
            sprite_map[png] = entry
        clear_objs(objs)
        summary.append((key, name, foot))

    with open(MAP_PATH, "w") as f:
        json.dump(sprite_map, f, indent=2)

    print("\n=== assemble_modular summary ===")
    for key, name, foot in summary:
        print(f"  {key:16s} {foot}x{foot}  <- {name}")
    print(f"Wrote {len(summary)} buildings to {OUT_DIR}")
    print(f"Merged sprite map: {MAP_PATH} ({len(sprite_map)} total entries)")
    print("Next: pnpm build:atlas")


main()
