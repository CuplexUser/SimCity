"""
build_city_assets.py — seeds tools/blender/city_assets.blend with the
infrastructure + glass-tower assets as REAL, editable Blender meshes.

Why this exists: these assets used to be generated purely as transient geometry
inside assemble_modular.py's headless render — you could never open, inspect or
tweak them. This script builds them as actual mesh objects with real materials,
grouped into one collection per atlas key, saved to a .blend you can open and
edit in Blender. From then on `city_assets.blend` is the source of truth: edit it
in the GUI, then run render_isos.py to re-render.

  Run (headless) to (re)create/refresh the .blend, then open it in Blender to edit:
      blender -b -P tools/blender/build_city_assets.py
  Or paste/run it into a live Blender session, then File > Save As city_assets.blend.

NOTE: this script owns ONLY the ASSETS below (infra + glass towers). The CIVIC
buildings (b:3 police, b:4 fire, b:5 hospital, b:6 school, b:7 library) are
hand-authored meshes that live directly in city_assets.blend — they are NOT
generated here. Re-running this script opens the existing .blend and rebuilds
only the ASSETS keys, so the hand-made civic collections are preserved (any
collection with a ["foot"] prop that isn't in ASSETS is left untouched).

Conventions (must match render_isos.py + src/rendering/isoCamera.ts):
  • 1 Blender unit = 1 tile (64x32 px, 2:1 dimetric).
  • One collection per atlas key, named with '_' for ':' (e.g. b:1 -> "b_1",
    z:2:2:6 -> "z_2_2_6", infra:pylon -> "infra_pylon").
  • Each collection carries a custom int property ["foot"] = the tile footprint
    (NxN plot). render_isos.py reads it, re-centers the asset on its plot with
    fit_footprint(), and measures the pixel anchor from the projection.
  • Assets are laid out in a spaced row purely for editing convenience; the
    world offset is irrelevant to rendering (fit_footprint re-centers by bbox).

Geometry here is ported from the old assemble_modular.py primitive builders so the
in-game look is unchanged on first render; now it lives as editable meshes.
"""

import bpy
import os
import sys
import math
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import iso_render as ir   # shared glass/pbr materials + (later) the render rig

BLEND_OUT = os.path.join(HERE, "city_assets.blend")

# ── Material cache: real Principled materials so the saved .blend is self-contained.
_MATTE = {}


def _matte(color, roughness=0.75, metallic=0.0):
    key = (round(color[0], 3), round(color[1], 3), round(color[2], 3), roughness, metallic)
    m = _MATTE.get(key)
    if m is None:
        m = ir.mat_pbr(f"mat_{len(_MATTE)}", color, metallic=metallic, roughness=roughness)
        _MATTE[key] = m
    return m


# ── Mesh primitives (each carries a real material, unlike the old o.color path) ──
def box(objs, cx, cy, cz, sx, sy, sz, color, rot=(0, 0, 0), roughness=0.78, metallic=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cx, cy, cz))
    o = bpy.context.active_object
    o.scale = (sx, sy, sz)
    o.rotation_euler = rot
    o.data.materials.append(_matte(color, roughness, metallic))
    objs.append(o)
    return o


def _smooth(o, angle_deg=35.0):
    for p in o.data.polygons:
        p.use_smooth = True
    try:
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.shade_auto_smooth(angle=math.radians(angle_deg))
    except Exception:
        pass


def cyl(objs, cx, cy, cz, r, h, color, rot=(0, 0, 0), verts=48, roughness=0.7, metallic=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=(cx, cy, cz))
    o = bpy.context.active_object
    o.rotation_euler = rot
    o.data.materials.append(_matte(color, roughness, metallic))
    _smooth(o)
    objs.append(o)
    return o


def cone(objs, cx, cy, cz, r1, r2, h, color, verts=48, roughness=0.75):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=h, location=(cx, cy, cz))
    o = bpy.context.active_object
    o.data.materials.append(_matte(color, roughness))
    _smooth(o)
    objs.append(o)
    return o


def dome(objs, cx, cy, cz, r, color, squash=0.6, roughness=0.7):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=r, location=(cx, cy, cz))
    o = bpy.context.active_object
    o.scale = (1.0, 1.0, squash)
    o.data.materials.append(_matte(color, roughness))
    _smooth(o, angle_deg=60.0)
    objs.append(o)
    return o


# ── Infrastructure builders (ported verbatim from assemble_modular.py) ──────────
WATER_BLUE = (0.16, 0.50, 0.74)
WATER_BLUE_DK = (0.11, 0.36, 0.55)


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
        box(objs, 0.0, row, 0.42, 2.7, 0.66, 0.04, PANEL, rot=(tilt, 0, 0), roughness=0.3)
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


def build_water_pump():
    """Water pump (1x1): concrete pad, brick pump house, blue wellhead + intake
    pipe, red valve wheel and a vent stack."""
    objs = []
    PAD, BRICK, ROOF, VENT, VALVE = (
        (0.55, 0.55, 0.57), (0.64, 0.46, 0.36), (0.34, 0.30, 0.30),
        (0.62, 0.64, 0.66), (0.78, 0.22, 0.18))
    box(objs, 0.0, 0.0, 0.05, 0.92, 0.92, 0.10, PAD)
    box(objs, -0.16, 0.14, 0.34, 0.46, 0.46, 0.46, BRICK)
    box(objs, -0.16, 0.14, 0.59, 0.52, 0.52, 0.06, ROOF)
    cyl(objs, 0.22, -0.18, 0.22, 0.13, 0.40, WATER_BLUE)
    cyl(objs, 0.22, -0.18, 0.43, 0.16, 0.05, WATER_BLUE_DK)
    cyl(objs, 0.22, -0.34, 0.18, 0.08, 0.5, WATER_BLUE, rot=(math.radians(90), 0, 0))
    cyl(objs, 0.22, -0.05, 0.30, 0.11, 0.03, VALVE, rot=(math.radians(90), 0, 0))
    cyl(objs, -0.30, 0.20, 0.74, 0.04, 0.34, VENT)
    return objs


def build_pumping_station():
    """Pumping station (3x3): pump hall, two big blue storage tanks, pipework, a
    control room and roof vents."""
    objs = []
    PAD, HALL, HALLROOF, CTRL, PIPE, CAP, VENT = (
        (0.52, 0.52, 0.54), (0.66, 0.68, 0.70), (0.40, 0.44, 0.50),
        (0.60, 0.62, 0.64), (0.55, 0.58, 0.62), (0.70, 0.74, 0.78), (0.46, 0.48, 0.50))
    box(objs, 0.0, 0.0, 0.04, 2.9, 2.9, 0.08, PAD)
    box(objs, -0.2, 0.7, 0.55, 2.4, 1.0, 1.0, HALL)
    box(objs, -0.2, 0.7, 1.08, 2.5, 1.1, 0.12, HALLROOF)
    for vx in (-0.9, 0.0, 0.9):
        box(objs, vx - 0.2, 0.7, 1.22, 0.22, 0.5, 0.16, VENT)
    box(objs, -1.05, -0.1, 0.40, 0.7, 0.7, 0.7, CTRL)
    box(objs, -1.05, -0.1, 0.78, 0.78, 0.78, 0.06, HALLROOF)
    for tx in (0.35, 1.15):
        cyl(objs, tx, -0.55, 0.12, 0.5, 0.24, WATER_BLUE_DK)
        cyl(objs, tx, -0.55, 0.72, 0.48, 1.05, WATER_BLUE)
        cyl(objs, tx, -0.55, 1.27, 0.50, 0.10, CAP)
    cyl(objs, 0.75, -0.55, 0.45, 0.07, 0.85, PIPE, rot=(0, math.radians(90), 0))
    cyl(objs, 0.35, 0.05, 0.45, 0.07, 0.7, PIPE, rot=(math.radians(90), 0, 0))
    return objs


def build_pylon():
    """Transmission pylon (1x1): a steel lattice with two cross-arms + insulators."""
    objs = []
    STEEL, INS = (0.55, 0.57, 0.60), (0.80, 0.80, 0.55)
    h = 2.2
    for sx in (-0.22, 0.22):
        for sy in (-0.22, 0.22):
            box(objs, sx, sy, h * 0.5, 0.05, 0.05, h, STEEL, roughness=0.5, metallic=0.6)
    for z in (0.5, 1.1, 1.7):
        box(objs, 0.0, 0.0, z, 0.48, 0.04, 0.04, STEEL, roughness=0.5, metallic=0.6)
        box(objs, 0.0, 0.0, z, 0.04, 0.48, 0.04, STEEL, roughness=0.5, metallic=0.6)
    for z in (1.85, 2.15):
        box(objs, 0.0, 0.0, z, 1.1, 0.07, 0.06, STEEL, roughness=0.5, metallic=0.6)
        for ix in (-0.5, 0.0, 0.5):
            cyl(objs, ix, 0.0, z - 0.12, 0.04, 0.16, INS)
    return objs


# ── Glass curtain-wall towers (ported from assemble_modular.py) ─────────────────
def gbox(objs, cx, cy, cz, sx, sy, sz, mat, rot=(0, 0, 0)):
    """Cube with scale baked in (Object coords == real units so the window grid
    maps correctly) and a Cycles material assigned."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cx, cy, cz))
    o = bpy.context.active_object
    o.scale = (sx, sy, sz)
    o.rotation_euler = rot
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ir.assign(o, mat)
    objs.append(o)
    return o


_GLASS_MATS = {}


def _glass(kind):
    m = _GLASS_MATS.get(kind)
    if m is None:
        if kind == 'com':
            m = ir.mat_window_grid("glass_com", glass_tint=(0.07, 0.13, 0.22),
                                   lit_color=(1.0, 0.85, 0.55), lit_strength=6.5,
                                   lit_fraction=0.22, cell=(0.24, 0.30), seed=1.0)
        elif kind == 'com2':
            m = ir.mat_window_grid("glass_com2", glass_tint=(0.10, 0.18, 0.20),
                                   lit_color=(0.9, 0.95, 1.0), lit_strength=6.0,
                                   lit_fraction=0.18, cell=(0.22, 0.28), seed=7.0)
        elif kind == 'res':
            m = ir.mat_window_grid("glass_res", glass_tint=(0.12, 0.16, 0.20),
                                   lit_color=(1.0, 0.80, 0.5), lit_strength=5.0,
                                   lit_fraction=0.30, cell=(0.26, 0.30), seed=3.0)
        _GLASS_MATS[kind] = m
    return m


_PODIUM = lambda: ir.mat_concrete("tower_podium", (0.46, 0.47, 0.50))
_CROWN = lambda: ir.mat_pbr("tower_crown", (0.12, 0.13, 0.16), metallic=0.4, roughness=0.5)
_MAST = lambda: ir.mat_metal("tower_mast", (0.7, 0.72, 0.75), roughness=0.3)


def build_glass_slab(kind='com', H=12.0):
    """Clean rectangular glass slab rising straight from the ground with a uniform
    base — no widened plaza plinth. Dark mechanical crown + mast on top."""
    objs = []
    c = 1.5
    w = 2.5
    gbox(objs, c, c, H / 2, w, w, H, _glass(kind))
    gbox(objs, c, c, H + 0.2, w * 0.68, w * 0.68, 0.4, _CROWN())
    gbox(objs, c, c, H + 0.6, 0.12, 0.12, 0.6, _MAST())
    return objs


def build_glass_setback(kind='com', H1=7.0, H2=6.0):
    """Two-tier setback glass tower rising straight from the ground: a wide lower
    shaft (uniform base, no plaza plinth) stepping in to a slimmer upper shaft.
    The lower shaft sits directly on the ground (z from 0), so there is no
    distinct base or pedestal — the setback happens up high, not at the base."""
    objs = []
    c = 1.5
    gbox(objs, c, c, H1 / 2, 2.5, 2.5, H1, _glass(kind))
    gbox(objs, c, c, H1 + H2 / 2, 1.7, 1.7, H2, _glass(kind))
    gbox(objs, c, c, H1 + H2 + 0.18, 1.3, 1.3, 0.36, _CROWN())
    gbox(objs, c, c, H1 + H2 + 0.6, 0.1, 0.1, 0.7, _MAST())
    return objs


def build_glass_twin(kind='com2', Ha=11.0, Hb=8.0):
    """Twin glass shafts of different heights rising straight from the ground.
    Each shaft has a uniform base (no plaza plinth); they simply stand side by
    side on the plot."""
    objs = []
    c = 1.5
    gbox(objs, 1.05, 1.05, Ha / 2, 1.5, 1.5, Ha, _glass(kind))
    gbox(objs, 2.0, 2.0, Hb / 2, 1.3, 1.3, Hb, _glass(kind))
    gbox(objs, 1.05, 1.05, Ha + 0.16, 1.2, 1.2, 0.32, _CROWN())
    gbox(objs, 2.0, 2.0, Hb + 0.16, 1.0, 1.0, 0.32, _CROWN())
    return objs


# ── Asset table: (key, foot, builder) ───────────────────────────────────────────
# key uses ':' here; the collection is named with '_'. render_isos.py rotates the
# z:* keys (4 road facings) and renders the b:/infra: keys once.
ASSETS = [
    ("b:1",  4, build_coal),
    ("b:8",  3, build_gas),
    ("b:9",  4, build_nuclear),
    ("b:10", 3, build_solar),
    ("b:11", 1, build_wind),
    ("b:2",  2, build_water),
    ("b:12", 1, build_water_pump),
    ("b:13", 3, build_pumping_station),
    ("infra:pylon", 1, build_pylon),
    ("z:2:2:6", 3, lambda: build_glass_slab('com', H=12.0)),
    ("z:2:2:7", 3, lambda: build_glass_setback('com', 7.0, 6.0)),
    ("z:2:2:8", 3, lambda: build_glass_twin('com2', 11.0, 8.0)),
    ("z:1:2:3", 3, lambda: build_glass_setback('res', 6.0, 5.0)),
]


def _new_collection(name):
    if name in bpy.data.collections:
        col = bpy.data.collections[name]
        for o in list(col.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        return col
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def _clear_scene():
    """Remove only the collections this script OWNS (the ASSETS keys) + their
    objects, plus any stray non-asset objects (a default startup cube, cameras,
    lights). Collections tagged with a ["foot"] custom prop that are NOT in ASSETS
    are PRESERVED — those are hand-made assets authored directly in the .blend
    (the civic buildings), which this generator must never clobber."""
    keys = {k.replace(":", "_") for k, _, _ in ASSETS}
    for c in list(bpy.data.collections):
        if c.name in keys:
            for o in list(c.objects):
                bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.collections.remove(c)
    # drop stray objects (startup cube/camera/light) but keep anything living in a
    # ["foot"]-tagged asset collection (e.g. the hand-made civic buildings).
    for o in list(bpy.data.objects):
        if not any(c.get("foot") is not None for c in o.users_collection):
            bpy.data.objects.remove(o, do_unlink=True)


def seed():
    _clear_scene()
    layout_x = 0.0
    for key, foot, builder in ASSETS:
        objs = builder()
        col = _new_collection(key.replace(":", "_"))
        col["foot"] = foot
        col["key"] = key
        # Move each asset into its own collection and space assets out in a row so
        # the .blend is pleasant to edit. The offset does not affect rendering:
        # render_isos.py re-centers each asset on its plot with fit_footprint().
        for o in objs:
            for c in list(o.users_collection):
                c.objects.unlink(o)
            col.objects.link(o)
            o.location.x += layout_x
        layout_x += foot + 3.0
    bpy.context.view_layer.update()  # flush matrices so anything reading right after is current
    print(f"Seeded {len(ASSETS)} asset collections.")


def main():
    # If the master already exists, edit it IN PLACE so hand-made collections (the
    # civic buildings, authored directly in the .blend) survive — seed() only
    # rebuilds this script's ASSETS keys. On first bootstrap, seed the default file.
    if bpy.app.background and os.path.exists(BLEND_OUT):
        bpy.ops.wm.open_mainfile(filepath=BLEND_OUT)
    seed()
    # Save when run headless (`blender -b`); in a GUI session just leave the scene
    # populated so you can File > Save As yourself.
    if bpy.app.background:
        bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
        print(f"Saved {BLEND_OUT}")


if __name__ == "__main__":
    main()
