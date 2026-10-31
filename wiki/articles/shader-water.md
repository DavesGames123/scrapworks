---
title: Water shaders
short: WGSL caustics, depth fog, plumes, flow, refraction and simulation display
category: Shader library
order: 23
see: shaderlib, fluid, fluid-ocean, shader-post, shader-noise
---
**Water shaders** are the `water/` category of the [[shaderlib|shader library]], a set of WGSL files for underwater light, water surfaces, flow and the display of simulation textures. The category is registered in `shaderlib::water`. It covers caustics, Beer-Lambert fog, light shafts, marine snow, vent plumes, glass refraction and colour for fluid fields. All functions start with `water_`. The GPU simulations themselves belong to the [[fluid]] kit. These files only shade.

## Files

| File | Provides | Requires |
|---|---|---|
| `water/noise.wgsl` | Value and gradient noise with analytic gradients, rotated fBm, an octave count from zoom | `noise/hash.wgsl` |
| `water/caustics.wgsl` | Procedural and photon caustics, Hessian helper, tone map | `water/noise.wgsl` |
| `water/branched_flow.wgsl` | Filaments from rays through a smooth random potential | None |
| `water/light_shafts.wgsl` | Radial, directional and procedural light shafts | `water/noise.wgsl` |
| `water/depth_fog.wgsl` | Per-channel absorption, in-scatter, sunlight at depth | None |
| `water/marine_snow.wgsl` | Sinking particles as a density field, with a restrained mode | `noise/hash.wgsl` |
| `water/plume.wgsl` | Vent plume density and normal | `water/noise.wgsl` |
| `water/surface.wgsl` | Wave height, refraction offsets, Fresnel, glint, foam | `noise/hash.wgsl` |
| `water/flow.wgsl` | Advection steps, two-phase flow map, curl velocity | `water/noise.wgsl` |
| `water/fluid_color.wgsl` | Dye, density and velocity colour for stable-fluids fields | None |
| `water/refraction.wgsl` | Vector Snell refraction for panels, dispersion, thin film, rim light | `noise/hash.wgsl`, `post/sampling.wgsl` |
| `water/sim_view.wgsl` | Smooth reads of float grids; heat, signed, Life and terrain colours; fog of war | `post/color_science.wgsl` |

## Conventions

`p` is a position in world units unless a file says otherwise, and `time` is in seconds. Colour is linear RGB. A normal uses +z toward the camera, as in `core/material.wgsl`. Seeds in this category are floats. Files that read textures receive the texture and sampler as arguments, so no file expects a binding.

`water/noise.wgsl` exists because the noise category held only the hash file when the water files were written.[[src:warp_sdk/shaderlib/water/noise.wgsl|// this file was written, the noise category registered only]] Each fBm octave rotates the domain, which stops the octaves lining up on lattice axes, and the fBm gradients include that rotation so they stay exact. `water_fbm_octaves` takes the on-screen size of one noise cell in pixels and returns the octave count, 1..12, that keeps the finest octave near 2 pixels.

## Caustics

The caustics file gives two methods. The procedural functions give an animated net of bright lines, cost little and need no input field. The photon method computes intensity from the surface height field: a ray through the slope moves by `depth * k * slope`, and the intensity is the area of the old cell over that of the new cell, `E = 1 / |det(I - depth * k * H)|`, with H the Hessian of the surface height.[[src:warp_sdk/shaderlib/water/caustics.wgsl|//      over the area of the new cell: E = 1 / |det(I - depth * k * H)|.]]

```wgsl
fn water_caustic_tile(p: vec2<f32>, time: f32, iterations: i32) -> f32
fn water_caustic_cells(p: vec2<f32>, time: f32, sharpness: f32) -> f32
fn water_caustic_layered(p: vec2<f32>, time: f32) -> f32
fn water_caustic_photon(hess: vec3<f32>, depth: f32, k: f32, max_gain: f32) -> f32
fn water_caustic_photon_rgb(hess: vec3<f32>, depth: f32, max_gain: f32) -> vec3<f32>
fn water_caustic_tonemap(e: vec3<f32>, exposure: f32) -> vec3<f32>
```

`water_caustic_tile` tiles with period 1. Its output is about 0..1, though the code clamps it at 4, and 5 iterations is the stated default. `water_caustic_layered` combines two layers of `water_caustic_cells` bent by noise, with output 0..1. `hess` is (h_xx, h_yy, h_xy), which `water_hessian_fd` builds from nine height samples. `k` is about 0.25 for air to water. The photon output is 1 for flat water and rises to `max_gain` on caustic lines.

## Depth and light

Depth fog applies Beer-Lambert absorption per channel. Red goes first, so deep water turns blue-green.[[src:warp_sdk/shaderlib/water/depth_fog.wgsl|// (Beer-Lambert). Red goes first, so deep water goes blue-green.]] `water_abs_clear` and `water_abs_pool` are preset absorption vectors per metre.

```wgsl
fn water_transmittance(sigma: vec3<f32>, dist: f32) -> vec3<f32>
fn water_depth_fog(color: vec3<f32>, sigma: vec3<f32>, dist: f32, fog_color: vec3<f32>) -> vec3<f32>
fn water_sun_at_depth(sun: vec3<f32>, sigma: vec3<f32>, d: f32, sin_elev: f32) -> vec3<f32>
fn water_shafts_procedural(p: vec2<f32>, surface_y: f32, slant: f32, time: f32, fade_depth: f32) -> f32
```

`water_shafts_radial`, `water_shafts_radial_jittered` and `water_shafts_directional` march an occlusion texture in which `r` is 1 where light passes. They use `textureSampleLevel`, so they are legal in any stage and in loops. The jittered form moves the march start per pixel, which turns the step pattern into fine noise, so fewer steps look clean. `water_shafts_procedural` needs no texture. Its `p` has y down from the surface.

## Branched flow

`water/branched_flow.wgsl` traces paraxial rays through a potential of six animated sinusoids. A ray starts at (x0, 0) and moves in +y. Its side position follows `x'' = -dV/dx`, and it carries `J = dx/dx0`. The intensity at the ray is `1 / |J|`, so it peaks where rays focus.[[src:warp_sdk/shaderlib/water/branched_flow.wgsl|// The intensity at the ray is 1 / |J|, so it peaks where rays focus.]] `water_branch_density` gathers rays per pixel, and `water_branch_color` tone-maps the result. `strength` is 0..2 with 0.3 as a good start.

## Marine snow

`water_snow_layer` and `water_snow_density` draw one particle per grid cell, with parallax across layers. The file treats snow as ambient detail and not a subject: a scene full of soft dots takes the eye from the seabed and the creatures. `water_snow_restrained` therefore defaults to a sparse field, with `water_snow_weight_default` returning 0.15.[[src:warp_sdk/shaderlib/water/marine_snow.wgsl|// Restrained mode. Marine snow is ambient detail, not a subject. A scene]] The header gives this use, with the addition placed after fog and before bloom:

```wgsl
let snow = water_snow_restrained(world, time, 0.6, 0.15, depth01,
                                 water_snow_weight_default(), 0.6, 3);
col = col + snow_col * snow;   // add after fog, before bloom
```

## Plume

`water/plume.wgsl` draws a black smoker, bubble column or silt cloud as a density field with a normal. The column rises from the vent and widens with height. Gradient-noise fBm breaks it into billows, and a curl field warps the domain with a strength that grows with height. The noise domain moves up at the rise speed, so a billow keeps its shape as it rises. A threshold on the field gives crisp, broken edges and not a soft blob.[[src:warp_sdk/shaderlib/water/plume.wgsl|// the next frame matches the last one. A threshold on the field gives]]

```wgsl
fn water_plume_default() -> WaterPlume
fn water_plume(p: vec2<f32>, vent: vec2<f32>, time: f32, pl: WaterPlume) -> WaterPlumeSample
fn water_plume_shade(s: WaterPlumeSample, light: vec3<f32>, col: vec3<f32>, ambient: vec3<f32>) -> vec4<f32>
```

The sample has `density` 0..1, a unit `normal`, and `height01`, 0 at the vent and 1 at the top. `water_plume_shade` returns premultiplied colour. The header advises wrapping `time` in the game to keep it below about 1e4, and setting octaves from the zoom:

```wgsl
var pl = water_plume_default();
pl.octaves = water_fbm_octaves(pl.scale * px_per_unit);
let s = water_plume(world, vent, time, pl);
let c = water_plume_shade(s, vec3<f32>(0.3, 0.8, 0.5), smoke_col, ambient);
out = c + (1.0 - c.a) * background;      // c is premultiplied
```

## Surface and flow

`water_wave_height` sums four directional waves and returns (height, gradient). `water_normal_from_grad`, `water_refract_offset`, `water_fresnel`, `water_glint` and `water_foam_line` work on that result, and `water_surface_shade` gives the final colour. In `water_foam_line`, `shore` is the signed distance to the shore, positive in water.

`water/flow.wgsl` has the advection steps for a semi-Lagrangian pass, `water_advect_uv` and the RK2 pair `water_advect_mid` and `water_advect_rk2`. `water_flowmap` returns a `water_FlowUv` of two UVs and a blend weight. Each phase moves the UV for one period and then resets. The phases are half a period apart and cross-fade, so the reset does not show.[[src:warp_sdk/shaderlib/water/flow.wgsl|// resets; the two phases are half a period apart and cross-fade, so the]] `water_curl` gives divergence-free velocity from 2D fBm.

## Fluid colour and simulation display

`water/fluid_color.wgsl` turns the fields of a stable-fluids simulation into colour: `water_dye_color`, `water_density_ramp`, `water_velocity_color` and `water_vorticity`. The gradient comes from `water_fluid_grad` and four neighbour samples.

`water/sim_view.wgsl` reads a state texture with `textureLoad`, with no sampler, so it works on unfilterable `rgba32float` formats.[[src:warp_sdk/shaderlib/water/sim_view.wgsl|//           (no sampler, so it works on unfilterable formats)]] `water_sim_load_cubic` performs a Catmull-Rom upsample with 16 loads, clamped so that a sharp edge does not ring. Colour functions are `water_sim_heat` (HDR, output 0..2.6), `water_sim_signed`, `water_sim_life_age`, `water_sim_terrain` and `water_sim_fog_of_war`.

## Glass refraction

`water/refraction.wgsl` serves 2D panels and lenses in pixels. `water_lens_round_rect` and `water_lens_superellipse` return a `water_LensSdf` of a signed distance `d`, negative inside, and an outward normal `m`, so no finite-difference probes are needed. `water_snell_bezel` gives the displacement across a circular-arc bezel for a slab, and `water_refract_dispersed` reads the backdrop with dispersion and frost. `water_thin_film` gives thin-film colour, with thickness in nanometres, and `water_conic_light` gives the rim light. Input ranges: `ratio` 0.1..4, `eta` is `1 / ior`, `abbe` 20..90.

## Interaction with other kits

- `post_dither_ign` from [[shader-post]] is the jitter that the light shaft header suggests.
- `creature_jelly_species` and the plant forms in [[shader-organic]] use a `flow` vector that the game supplies.
- The [[fluid-ocean]] and [[fluid-solver]] articles cover the simulations whose fields these files display.
