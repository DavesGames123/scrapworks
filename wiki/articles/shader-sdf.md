---
title: SDF shaders
short: WGSL 2D signed distances, operators, relief, vector fields and polar maps
category: Shader library
order: 21
see: shaderlib, shader-material, shader-post, squircle, lit2d
---
**SDF shaders** are the `sdf/` category of the [[shaderlib|shader library]], a set of WGSL files for 2D signed distance shapes and for turning a distance into pixels. The category is registered in `shaderlib::sdf`. It gives primitives, combining operators, coverage and shadow functions, a relief step that lifts a flat shape into a MaterialSample, and two tables of vector fields and polar domains. All functions start with `sdf_`.

## Files

| File | Provides |
|---|---|
| `sdf/prim_basic.wgsl` | Circle, boxes, segment, capsules, rhombus, trapezoid, triangles, regular polygons, polygon of up to 8 corners, ellipses |
| `sdf/prim_curve.wgsl` | Arc, pie, ring, horseshoe, stars, heart, vesica, egg, moon, cross, rounded X, quadratic bezier, parabola |
| `sdf/ops.wgsl` | Booleans, smooth blends, round, onion, displace, morph, and domain operators |
| `sdf/eval.wgsl` | Gradients and normals, fill and stroke coverage, glow, soft shadow, ambient occlusion |
| `sdf/relief.wgsl` | Height profiles, tangent normals, `sdf_relief_material`, extrude and revolve helpers |
| `sdf/field.wgsl` | 2D velocity fields, RK2 particle steps, and dot-field marks |
| `sdf/polar.wgsl` | Log-polar, Droste and corridor maps, anti-aliased patterns, guilloche, gear, seigaiha |

Only `sdf/relief.wgsl` has a dependency, on `core/material.wgsl`. The other files are self-contained, so a game composes them alone or together.

## Conventions

Every primitive takes the sample point `p` in the local frame of the shape, with the shape centre at the origin unless its comment says otherwise. The result is negative inside, zero on the edge and positive outside. Units are those of `p`. Sizes are half sizes and must be positive.[[src:warp_sdk/shaderlib/sdf/prim_basic.wgsl|// The result is negative inside, zero on the edge, positive outside.]]

In `sdf/prim_curve.wgsl`, an angle pair `sc` is (sin, cos) of a half aperture, in that order, and shapes with an aperture open toward -y. Some functions there use a different order, as their comments state: `sdf_ring_open` and `sdf_horseshoe` take (cos, sin).

`sdf_field_*` functions use a domain of about -1..1. `sdf_polar_*` functions use a centred position with the short side about -0.5..0.5 and y up. `px` is the size of one pixel in the same units, and `time` is in seconds.

## Primitives

```wgsl
fn sdf_circle(p: vec2<f32>, r: f32) -> f32
fn sdf_box(p: vec2<f32>, b: vec2<f32>) -> f32
fn sdf_round_box(p: vec2<f32>, b: vec2<f32>, r: vec4<f32>) -> f32
fn sdf_capsule(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>, r: f32) -> f32
fn sdf_hexagon(p0: vec2<f32>, r: f32) -> f32
fn sdf_star(p0: vec2<f32>, r: f32, n: f32, m: f32) -> f32
fn sdf_arc(p0: vec2<f32>, sc: vec2<f32>, ra: f32, rb: f32) -> f32
fn sdf_bezier(pos: vec2<f32>, A: vec2<f32>, B: vec2<f32>, C: vec2<f32>) -> f32
```

Two pairs of shapes deserve a note. `sdf_ellipse` is exact, using a Newton iteration, and `sdf_ellipse_approx` is cheap but is not a true distance far from the edge, so it suits fills and strokes and not long ray steps.[[src:warp_sdk/shaderlib/sdf/prim_basic.wgsl|// true distance. Use it for fills and strokes, not for long ray steps.]] `sdf_segment` and `sdf_bezier` are never negative, so a stroke comes from subtracting a radius.

## Operators

Distance operators take distances and return a distance. `sdf_union`, `sdf_subtract`, `sdf_intersect` and `sdf_xor` are exact at the edge. The smooth blends come in four kinds:

| Suffix | Blend | Note |
|---|---|---|
| `_poly` | Quadratic polynomial | `k` is the blend width, `> 0` |
| `_cubic` | Cubic polynomial | C2 continuous, so lit bevels show no crease line |
| `_exp` | Exponential | Changes the shape a little everywhere; order independent for more than two terms |
| `_circ` | Circular | `k` is the blend radius; union only |

Domain operators take the point and return a new point, at which the caller evaluates the shape: `sdf_op_translate`, `sdf_op_rotate`, `sdf_op_scale`, `sdf_op_mirror_x`, `sdf_op_mirror_y`, `sdf_op_mirror`, `sdf_op_repeat`, `sdf_op_repeat_limited`, `sdf_op_polar` and `sdf_op_bend`. Scale also needs `sdf_op_scale_dist` on the result.[[src:warp_sdk/shaderlib/sdf/ops.wgsl|// Uniform scale by s. Multiply the distance by s after: sdf_op_scale_dist.]] `sdf_op_repeat_id` gives the cell index for per-cell variation. A shape under `sdf_op_repeat` must fit in one cell.

`sdf_displace` adds a height scaled by `k`. Its comment warns to keep `|k * grad(h)|` below 1, or sphere tracing and soft shadows step too far.

## Evaluation

WGSL has no function pointers, so these functions cannot call a scene. The caller evaluates its own scene and passes the distance samples.[[src:warp_sdk/shaderlib/sdf/eval.wgsl|// WGSL has no function pointers. Thus the caller evaluates its own scene]]

```wgsl
fn sdf_normal_from_samples(dxp: f32, dxn: f32, dyp: f32, dyn: f32) -> vec2<f32>
fn sdf_fill_px(d: f32, px: f32) -> f32
fn sdf_stroke_px(d: f32, w: f32, px: f32) -> f32
fn sdf_fill_fwidth(d: f32) -> f32
fn sdf_glow(d: f32, r: f32) -> f32
fn sdf_shadow_step(s: SdfShadow, d: f32, k: f32, lo: f32, hi: f32) -> SdfShadow
fn sdf_shadow8(d0: array<f32, 8>, t0: array<f32, 8>, k: f32) -> f32
fn sdf_ao5(d0: array<f32, 5>, h: f32, strength: f32) -> f32
```

The `*_fwidth` forms, and `sdf_normal_dpdx`, work in a fragment stage only. The `*_px` forms take the pixel size and work anywhere.

A soft shadow is a loop owned by the caller. `sdf_shadow_begin` starts a state. For each step, the caller samples its scene at `origin + dir * s.t` and passes that distance to `sdf_shadow_step`, and `sdf_shadow_end` gives the final light fraction. `k` is the sharpness: 2 is very soft and 32 is almost hard. For a fixed count, `sdf_shadow8` takes eight samples and `sdf_ao5` takes five.

## Relief

`sdf/relief.wgsl` gives a flat shape a raised, lit surface. A profile maps the distance to a height and a slope, and returns SdfProfile with the fields `h` and `slope`.[[src:warp_sdk/shaderlib/sdf/relief.wgsl|// A profile takes d (the 2D distance, negative inside) and w (the bevel]]

| Profile | Shape |
|---|---|
| `sdf_profile_linear` | Chamfer, a straight rise over width `w` |
| `sdf_profile_round` | Quarter circle, steep at the edge and flat on top |
| `sdf_profile_smooth` | Smoothstep, soft at the edge and at the top |
| `sdf_profile_cove` | Concave quarter circle |
| `sdf_profile_dome` | Half circle of radius `w`; a true half sphere for a circle of radius `w` |
| `sdf_profile_extrude` | A slab of height `top` with a round edge; returns scene units |

The header gives the typical use in a fragment stage:

```wgsl
let n2 = sdf_normal_from_samples(...);            // sdf/eval.wgsl
let pr = sdf_profile_round(d, 0.1);
let m  = sdf_relief_material(n2, pr, albedo, 0.6);
```

The third argument of `sdf_relief_material` is the linear albedo, and `depth` is the relief height in scene units, usually 0.05 to 0.3 for sprites. `sdf_extrude`, `sdf_revolve` and `sdf_height_normal` are 3D helpers.

## Vector fields

`sdf/field.wgsl` gives velocity `v(p)` for potential flow (`sdf_field_source`, `sdf_field_vortex`, `sdf_field_rankine`, `sdf_field_cylinder`, `sdf_field_jet`, `sdf_field_vortex_street`), physics (`sdf_field_gravity`, `sdf_field_charges`, `sdf_field_magnetic_dipole`) and phase portraits (`sdf_field_hopf`, `sdf_field_vanderpol`, `sdf_field_duffing`, `sdf_field_lotka`, `sdf_field_linear`).

A particle moves with a two-part RK2 step: `sdf_field_rk2_mid` gives the midpoint, the caller evaluates the field there, and `sdf_field_rk2` gives the new position. The step is second order, so particles stay on closed orbits much longer than with an Euler step.[[src:warp_sdk/shaderlib/sdf/field.wgsl|// midpoint field v2. Second order, so particles stay on closed orbits]] `sdf_field_dir_color` and `sdf_field_comb` show a field per pixel.

The second half of the file draws a field through discrete marks. `sdf_field_cell_square`, `sdf_field_cell_hex` and `sdf_field_cell_screen` return an `sdf_FieldCell`, and `sdf_field_disc_cov`, `sdf_field_box_cov` and `sdf_field_led` draw in that cell. For curl-noise flow, the file points to `noise/curl.wgsl` in [[shader-noise]].

## Polar domains

Log-polar maps turn rings into rows and spokes into columns, so any lattice becomes a conformal spiral.[[src:warp_sdk/shaderlib/sdf/polar.wgsl|// in them. Log-polar maps turn rings into rows and spokes into columns,]]

```wgsl
fn sdf_polar_log(p: vec2<f32>, n: f32) -> vec2<f32>
fn sdf_polar_spiral(p: vec2<f32>, n: f32, twist: f32, zoom: f32) -> vec2<f32>
fn sdf_polar_droste(p: vec2<f32>, big_s: f32, m: f32, zoom: f32) -> vec2<f32>
fn sdf_polar_guilloche(p: vec2<f32>, r0: f32, amp: f32, n: f32, count: i32, phase: f32, px: f32) -> f32
fn sdf_polar_gear(p: vec2<f32>, c: vec2<f32>, big_r: f32, n: f32, th: f32, h: f32, spokes: f32) -> f32
```

`sdf_polar_sqwave`, `sdf_polar_lines` and `sdf_polar_bar` are anti-aliased patterns that fade to the mean where the pattern is finer than a pixel. They take `fw`, the derivative of the pattern coordinate per pixel. `sdf_polar_guilloche` draws `count` copies of a wave, up to 16 by its loop, and it divides the distance by the slope so that the line keeps its width.

## Interaction with other kits

- `material_edge_wear` in [[shader-material]] takes an SDF distance and gradient.
- `post_glow_shape` in [[shader-post]] turns a distance in pixels into emissive light.
- `water_lens_round_rect` in [[shader-water]] has its own outline functions with exact normals.
- The Rust [[squircle]] kit is a separate implementation for interface panels.

## Limitations

`sdf_polygon8` accepts at most 8 corners. The body of that function contains `p.y < v[j].y, e.x * w.y > e.y * w.x` inside a constructor call. The test suite uses naga 0.12, which accepts this. naga 30.0.1 rejects it with a parse error, because the `<` and `>` read as a template list. A game on a newer parser, including a browser port of this file, must add parentheses around `p.y < v[j].y`. `sdf_op_bend` is not an exact distance, so its comment asks for `k` to stay small compared to the inverse of the shape size.
