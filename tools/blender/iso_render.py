"""
iso_render.py — shared Cycles rendering core for the WebCity sprite pipeline.

Both import_kenney.py (City Kit zone buildings) and assemble_modular.py (civic /
infra / modular lots) import this so they render with ONE consistent look:

  • Cycles (GPU/OPTIX when available) — real PBR materials, self-shadowing,
    ambient occlusion, glass reflections and emissive windows. This replaces the
    old BLENDER_WORKBENCH fallback, which was only used because the legacy EEVEE
    wrote nothing in headless `-b` mode. Modern Cycles renders fine headless.
  • A "bright dramatic day" light rig: a strong warm key sun from the screen
    south-west (keeps the same shadow side the procedural fallback assumes) +
    a Nishita sky the glass reflects + a cool ambient so shaded faces read blue,
    not black. AgX view transform tames tower highlights like an aerial render.
  • film_transparent: the sky lights + reflects but the BACKGROUND stays clear,
    so sprites composite cleanly onto the iso terrain.

Geometry contract is unchanged (must match src/rendering/isoCamera.ts and the two
caller scripts): 1 tile = 64x32 px (2:1 dimetric); 1 blender unit = 1 tile;
ORTHO camera, azimuth 45 deg, elevation atan(0.5). The anchor (origin tile north
apex) and per-sprite tilePx are still measured empirically from the projection,
so they are independent of the shading engine.
"""

import bpy
import math
import os
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ELEV = math.atan(0.5)
# Screen south-west key direction, shared by every render so all sprites + the
# procedural fallback agree on which faces are lit. (sun "rotation" points the -Z
# beam; 55 deg off vertical toward azimuth 215 deg = screen SW.)
SUN_ROT = (math.radians(55), 0.0, math.radians(215))


# ── Engine / scene ────────────────────────────────────────────────────────────
def setup_scene(samples=128, transparent=True, tonemap='AgX'):
    """Configure the active scene for headless Cycles rendering. Returns the scene."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'

    # Prefer a GPU backend (OPTIX > CUDA > HIP > ONEAPI > METAL); fall back to CPU.
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.get_devices()
        order = ['OPTIX', 'CUDA', 'HIP', 'ONEAPI', 'METAL']
        chosen = next((t for t in order if any(d.type == t for d in prefs.devices)), None)
        if chosen:
            prefs.compute_device_type = chosen
            prefs.get_devices()
            # Enable every device of the chosen backend (leave CPU off to avoid
            # the slow GPU+CPU sync on small scenes).
            for d in prefs.devices:
                d.use = (d.type == chosen)
            scene.cycles.device = 'GPU'
            print(f"[iso_render] Cycles GPU: {chosen} "
                  f"{[d.name for d in prefs.devices if d.use]}")
        else:
            scene.cycles.device = 'CPU'
            print("[iso_render] Cycles CPU (no GPU backend)")
    except Exception as e:
        scene.cycles.device = 'CPU'
        print("[iso_render] Cycles CPU (GPU init failed):", e)

    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    # TDR fix: denoise on the CPU with OpenImageDenoise rather than the GPU OptiX
    # denoiser. The OptiX denoiser's filter_color_* kernels run as one long CUDA
    # launch and routinely exceed the Windows display-driver watchdog (TDR), which
    # kills the render with "Launch exceeded timeout" (CUDA error 702). OIDN runs
    # on the CPU and never touches the GPU watchdog.
    try:
        scene.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception:
        pass
    try:
        scene.cycles.denoising_use_gpu = False
    except Exception:
        pass
    # Auto-tile so the path-tracing kernel is dispatched in bounded chunks instead
    # of one big launch — keeps each GPU launch well under the TDR watchdog too.
    try:
        scene.cycles.use_auto_tile = True
        scene.cycles.tile_size = 512
    except Exception:
        pass
    # Small caustic/bounce budget — these are tiny architectural scenes.
    scene.cycles.max_bounces = 6
    scene.cycles.transparent_max_bounces = 8

    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    try:
        scene.view_settings.view_transform = tonemap
        # Base (low) contrast, not Medium-High: the high-contrast look crushed the
        # shaded side and pushed the sun-facing face toward white, which read as the
        # "washed out / too light on one side" glass towers. Base keeps faces even.
        scene.view_settings.look = 'AgX - Base Contrast'
    except Exception:
        pass
    return scene


# ── Camera (orthographic 2:1 dimetric) ─────────────────────────────────────────
def setup_camera(scene):
    """Create the iso ortho camera. Returns (cam, CAM_RIGHT, CAM_UP, CAM_FWD)."""
    cam_data = bpy.data.cameras.new("iso")
    cam_data.type = 'ORTHO'
    cam_data.clip_start = 0.01
    cam_data.clip_end = 1000.0
    cam = bpy.data.objects.new("iso", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.rotation_euler = (math.pi / 2 - ELEV, 0.0, math.pi / 4)
    R = cam.rotation_euler.to_matrix()
    right = (R @ Vector((1, 0, 0))).normalized()
    up = (R @ Vector((0, 1, 0))).normalized()
    fwd = (R @ Vector((0, 0, -1))).normalized()
    return cam, right, up, fwd


# ── Lighting rig ───────────────────────────────────────────────────────────────
def setup_lights(scene, key_energy=3.2, sky_strength=0.5):
    """Soft, neutral daylight rig: a near-white SW key sun balanced by a strong
    near-white fill and a flat neutral sky, so both camera-facing faces read at a
    similar, even brightness with gentle directional form — no blown-out gradient.

    This replaces the old "bright dramatic day" rig (a hot warm key + a Nishita sky
    the glass reflected as bright highlights + AgX high contrast), which lit the
    sun-facing face far brighter than the shaded one and washed the glass towers
    out on one side. The sky is invisible in the alpha (scene is film_transparent);
    it only provides soft, even ambient — a flat color, not Nishita, for control."""
    # Key sun — near-white (a touch warm) so it tints faces only slightly.
    sun_d = bpy.data.lights.new("key", 'SUN')
    sun_d.energy = key_energy
    sun_d.color = (1.0, 0.98, 0.95)        # near-neutral, faintly warm daylight
    sun_d.angle = math.radians(3.0)        # soft shadow edges (diffuse look)
    sun = bpy.data.objects.new("key", sun_d)
    sun.rotation_euler = SUN_ROT
    scene.collection.objects.link(sun)

    # Strong near-white fill from the opposite (screen NE) side. At 0.5x the key
    # (was 0.22x) the shaded face stays close to the lit one — the flat, diffuse
    # look — with only a faint cool cast so the two faces still separate.
    fill_d = bpy.data.lights.new("fill", 'SUN')
    fill_d.energy = key_energy * 0.5
    fill_d.color = (0.85, 0.88, 0.95)      # near-neutral, faintly cool
    fill = bpy.data.objects.new("fill", fill_d)
    fill.rotation_euler = (math.radians(60), 0.0, math.radians(35))
    scene.collection.objects.link(fill)

    # World = a flat neutral sky color for soft, even ambient (no Nishita gradient
    # or directional sun that the glass could catch as a hot highlight).
    world = scene.world or bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs[1].default_value = sky_strength
    bg.inputs[0].default_value = (0.55, 0.60, 0.66, 1.0)   # flat neutral daylight sky
    nt.links.new(bg.outputs[0], out.inputs[0])
    return sun, fill


# ── Geometry helpers ───────────────────────────────────────────────────────────
def world_bbox(objs):
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            for i in range(3):
                mn[i] = min(mn[i], w[i])
                mx[i] = max(mx[i], w[i])
    return mn, mx


def frame_and_render(scene, cam, right, up, fwd, objs, out_path, *,
                     foot=1, ppu=96, res_cap=2048, pad=1.10):
    """Frame `objs` for the iso camera, render to out_path, and return
    (anchorX, anchorY, tilePx) measured from the projection. `foot` is the plot
    size in tiles (anchor = the footprint's north apex = blender corner (0,foot))."""
    mn, mx = world_bbox(objs)
    corners = [Vector((x, y, z)) for x in (mn.x, mx.x) for y in (mn.y, mx.y) for z in (mn.z, mx.z)]
    corners += [Vector((0, 0, 0)), Vector((1, 0, 0)), Vector((1, 1, 0)), Vector((0, 1, 0))]
    us = [p.dot(right) for p in corners]
    vs = [p.dot(up) for p in corners]
    u_c, v_c = (min(us) + max(us)) / 2, (min(vs) + max(vs)) / 2
    extent = max(max(us) - min(us), max(vs) - min(vs)) * pad

    cam.data.ortho_scale = extent
    cam.location = right * u_c + up * v_c - fwd * 100.0
    res = max(256, min(res_cap, round(extent * ppu)))
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.resolution_percentage = 100

    for o in scene.objects:
        if o.type == 'MESH':
            o.hide_render = (o not in objs)

    scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)

    def px(p):
        co = world_to_camera_view(scene, cam, Vector(p))
        return (co.x * res, (1.0 - co.y) * res)
    ax, ay = px((0, foot, 0))
    txs = [px((0, 0, 0))[0], px((1, 0, 0))[0], px((1, 1, 0))[0], px((0, 1, 0))[0]]
    return round(ax), round(ay), round(max(txs) - min(txs))


# ── Material library ───────────────────────────────────────────────────────────
def _principled(name, bevel=0.015):
    """New Principled material. `bevel` adds a Cycles Bevel node into the Normal
    input so every hard edge gets a small rounded-shading fillet (radius in world
    units, so it's uniform regardless of object scale). This softens the flat
    box-CGI look and lets edges/corners catch a highlight + contact shading."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    if bevel:
        bev = nt.nodes.new("ShaderNodeBevel")
        bev.samples = 4
        bev.inputs["Radius"].default_value = bevel
        nt.links.new(bev.outputs["Normal"], b.inputs["Normal"])
    return m, b


def mat_pbr(name, color, metallic=0.0, roughness=0.6):
    """Generic opaque PBR material from an sRGB-ish 0..1 color."""
    m, b = _principled(name)
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = roughness
    return m


def mat_metal(name, color, roughness=0.35):
    return mat_pbr(name, color, metallic=1.0, roughness=roughness)


def mat_concrete(name, color=(0.55, 0.55, 0.57)):
    return mat_pbr(name, color, metallic=0.0, roughness=0.85)


def mat_glass(name, tint=(0.10, 0.18, 0.28), roughness=0.06):
    """Sky-reflecting curtain-wall glass: dark tint, near-mirror, slightly metallic
    so it catches the Nishita sky as bright highlights (the aerial-render look)."""
    m, b = _principled(name)
    b.inputs["Base Color"].default_value = (*tint, 1.0)
    b.inputs["Metallic"].default_value = 0.85
    b.inputs["Roughness"].default_value = roughness
    return m


def mat_window_grid(name, glass_tint=(0.09, 0.16, 0.26), lit_color=(1.0, 0.86, 0.6),
                    lit_strength=6.0, lit_fraction=0.28, cell=(0.16, 0.20), seed=0.0):
    """Glass curtain wall with an emissive window grid, for box/shaft geometry you
    control (the modular towers). The grid is built in OBJECT space from two derived
    axes so it wraps the visible faces correctly instead of streaking:
        u = x + y   (runs horizontally across BOTH camera-facing faces)
        v = z       (floors)
    A Brick texture's Fac gives the mullion mask (dark grout never glows); a per-cell
    white-noise hash lights `lit_fraction` of the windows warm, the rest stay glass.
    `cell` = (window width, floor height) in blender units."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    L = nt.links
    out = nt.nodes.new("ShaderNodeOutputMaterial")

    tex = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    L.new(tex.outputs["Object"], sep.inputs[0])
    # u = x + y (horizontal around the tower); v = z (height).
    u = nt.nodes.new("ShaderNodeMath"); u.operation = 'ADD'
    L.new(sep.outputs["X"], u.inputs[0]); L.new(sep.outputs["Y"], u.inputs[1])
    uv = nt.nodes.new("ShaderNodeCombineXYZ")
    L.new(u.outputs[0], uv.inputs["X"]); L.new(sep.outputs["Z"], uv.inputs["Y"])

    # Mullion grid from a Brick texture (Fac = 1 on glass pane, 0 on mullion).
    brick = nt.nodes.new("ShaderNodeTexBrick")
    brick.offset = 0.0
    brick.inputs["Scale"].default_value = 1.0
    brick.inputs["Mortar Size"].default_value = 0.06
    brick.inputs["Brick Width"].default_value = cell[0]
    brick.inputs["Row Height"].default_value = cell[1]
    L.new(uv.outputs[0], brick.inputs["Vector"])

    # Per-window stable random: floor the cell indices, hash with white noise.
    iu = nt.nodes.new("ShaderNodeMath"); iu.operation = 'FLOOR'
    su = nt.nodes.new("ShaderNodeMath"); su.operation = 'DIVIDE'; su.inputs[1].default_value = cell[0]
    L.new(u.outputs[0], su.inputs[0]); L.new(su.outputs[0], iu.inputs[0])
    iv = nt.nodes.new("ShaderNodeMath"); iv.operation = 'FLOOR'
    sv = nt.nodes.new("ShaderNodeMath"); sv.operation = 'DIVIDE'; sv.inputs[1].default_value = cell[1]
    L.new(sep.outputs["Z"], sv.inputs[0]); L.new(sv.outputs[0], iv.inputs[0])
    cellid = nt.nodes.new("ShaderNodeCombineXYZ")
    L.new(iu.outputs[0], cellid.inputs["X"]); L.new(iv.outputs[0], cellid.inputs["Y"])
    wn = nt.nodes.new("ShaderNodeTexWhiteNoise"); wn.noise_dimensions = '4D'
    L.new(cellid.outputs[0], wn.inputs["Vector"]); wn.inputs["W"].default_value = seed
    gt = nt.nodes.new("ShaderNodeMath"); gt.operation = 'GREATER_THAN'
    gt.inputs[1].default_value = 1.0 - lit_fraction
    L.new(wn.outputs["Value"], gt.inputs[0])
    # lit = on-glass AND chosen.
    mull = nt.nodes.new("ShaderNodeMath"); mull.operation = 'MULTIPLY'
    L.new(gt.outputs[0], mull.inputs[0]); L.new(brick.outputs["Fac"], mull.inputs[1])

    # Mullions read as dark metal; panes are reflective glass; lit panes glow.
    glass = nt.nodes.new("ShaderNodeBsdfPrincipled")
    glass.inputs["Base Color"].default_value = (*glass_tint, 1.0)
    glass.inputs["Metallic"].default_value = 0.85
    glass.inputs["Roughness"].default_value = 0.07
    frame = nt.nodes.new("ShaderNodeBsdfPrincipled")
    frame.inputs["Base Color"].default_value = (0.05, 0.05, 0.06, 1.0)
    frame.inputs["Metallic"].default_value = 0.6
    frame.inputs["Roughness"].default_value = 0.5
    pane = nt.nodes.new("ShaderNodeMixShader")          # mullion vs glass pane
    L.new(brick.outputs["Fac"], pane.inputs[0])
    L.new(frame.outputs[0], pane.inputs[1]); L.new(glass.outputs[0], pane.inputs[2])
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs[0].default_value = (*lit_color, 1.0)
    emit.inputs[1].default_value = lit_strength
    mix = nt.nodes.new("ShaderNodeMixShader")           # glass vs lit window
    L.new(mull.outputs[0], mix.inputs[0])
    L.new(pane.outputs[0], mix.inputs[1]); L.new(emit.outputs[0], mix.inputs[2])
    L.new(mix.outputs[0], out.inputs[0])
    return m


def assign(obj, mat):
    """Assign `mat` via an OBJECT-linked slot so instances that SHARE a mesh
    datablock (the modular kit reuses one mesh per module) can still each carry a
    distinct material. A mesh-level (DATA) assignment would bleed across all
    instances of that module."""
    me = obj.data
    if len(me.materials) == 0:
        me.materials.append(None)   # create slot 0 on the (possibly shared) mesh
    slot = obj.material_slots[0]
    slot.link = 'OBJECT'            # override per-object, independent of the mesh
    slot.material = mat
    return obj
