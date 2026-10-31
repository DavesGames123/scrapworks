---
title: Pattern shaders
short: WGSL per-pixel line art, tilings, textiles and seamless pattern motion
category: Shader library
order: 28
see: shaderlib, shader-sdf, shader-noise, art-direction, visual
---
**Pattern shaders** are the `pattern/` category of the [[shaderlib|shader library]], a set of WGSL functions that draw graphic patterns per pixel: grids, tilings, mazes, flow lines, textiles, optical art and a Hopf fibration. The category is registered in `shaderlib::pattern`. Each function returns ink coverage, so a game maps it to its own palette. Two further files stack modifiers on any pattern and loop any pattern seamlessly. All functions start with `pattern_`.

## Files

| File | Provides | Central functions |
|---|---|---|
| `pattern/kit.wgsl` | Coverage, hashes, noise, lattices, phyllotaxis | `pattern_px`, `pattern_fill`, `pattern_stroke`, `pattern_ink`, `pattern_isolines`, `pattern_phyllo` |
| `pattern/grid.wgsl` | Tiles and modules on a cell grid | `pattern_grid_arc_lattice`, `pattern_grid_running_bond`, `pattern_grid_basket_weave`, `pattern_grid_module` |
| `pattern/tiling.wgsl` | Truchet, Wang, star rosettes, bricks | `pattern_tiling_nested_truchet`, `pattern_tiling_hex_arcs`, `pattern_tiling_star_rosettes`, `pattern_tiling_herringbone` |
| `pattern/radial.wgsl` | Rings, rays, roses, seed heads | `pattern_radial_phase_rings`, `pattern_radial_rose`, `pattern_radial_seed_head` |
| `pattern/geometric.wgsl` | Guilloche, Lissajous, superformula, pursuit, Apollonian | `pattern_geometric_guilloche`, `pattern_geometric_lissajous_table`, `pattern_geometric_apollonian` |
| `pattern/flow.wgsl` | Lines that follow a field | `pattern_flow_contour_bands`, `pattern_flow_topo_lines`, `pattern_flow_curl_streams` |
| `pattern/organic.wgsl` | Cells, blobs, reaction looks | `pattern_organic_voronoi`, `pattern_organic_soft_cells`, `pattern_organic_morphogen` |
| `pattern/mesh.wgsl` | Triangles, lead glass, rectangle cuts, cracks | `pattern_mesh_triangles`, `pattern_mesh_lead_glass`, `pattern_mesh_crackle` |
| `pattern/paths.wgsl` | Mazes and the Hilbert curve | `pattern_paths_maze_walls`, `pattern_paths_ring_labyrinth`, `pattern_paths_hilbert` |
| `pattern/physics.wgsl` | Field lines, spring nets, spirals | `pattern_physics_charge_field`, `pattern_physics_cyclotron` |
| `pattern/textile.wgsl` | Plaid, twill, chevron, resist-dye bands | `pattern_textile_sett_plaid`, `pattern_textile_twill_check`, `pattern_textile_flame_chevron` |
| `pattern/texture.wgsl` | Halftone, hatch, stipple from a tone | `pattern_texture_screen_dots`, `pattern_texture_tone_hatch`, `pattern_texture_grain_stipple` |
| `pattern/opart.wgsl` | Moire, tunnels, waving bands | `pattern_opart_moire_lines`, `pattern_opart_drift_tunnel`, `pattern_opart_wave_bands` |
| `pattern/iso.wgsl` | Isometric blocks | `pattern_iso_face`, `pattern_iso_tumbling_blocks`, `pattern_iso_grid` |
| `pattern/distort.wgsl` | Plain bases bent by lenses and waves | `pattern_distort_lens`, `pattern_distort_lens_grid`, `pattern_distort_twirl_checker` |
| `pattern/botanical.wgsl` | Leaf spirals | `pattern_botanical_leaf_sd`, `pattern_botanical_leaf_spiral` |
| `pattern/hopf.wgsl` | The Hopf fibration as strokes | `pattern_hopf_fibres`, `pattern_hopf_map` |
| `pattern/modifiers.wgsl` | Stackable domain and value changes | `pattern_mod_kaleido`, `pattern_mod_lens`, `pattern_mod_mask` |
| `pattern/motion.wgsl` | Seamless loops | `pattern_motion_phase`, `pattern_motion_curve`, `pattern_motion_rotate`, `pattern_motion_wave` |

Every file requires `pattern/kit.wgsl`, which requires `noise/hash.wgsl`, except `pattern/mesh.wgsl`, which reaches the kit through `pattern/organic.wgsl`.

## Conventions

`p` is in board units, with the short side of the board 1. Counts such as `cells` are measured across the short side. `weight` is usually a line width as a share of a cell or ring step. `seed` is a `u32`. Centred motifs such as `pattern/radial.wgsl` take `p` relative to the centre, with a motif radius of 1.

The output follows the kit.[[src:warp_sdk/shaderlib/pattern/kit.wgsl|// Conventions of the pattern files:]]

| Output | Meaning |
|---|---|
| `f32` | Coverage in 0..1, where 1 is ink and 0 is paper |
| `vec2<f32>` | x is coverage, y is an ink key in 0..1 |

`pattern_ink` maps an ink key to a slot in 0..n-1, and the game holds the actual colours. `pattern/iso.wgsl` uses the key for faces: 0 top, 1/3 left, 2/3 right, so three inks shade the three faces. `pattern_hopf_fibres` is the exception, with linear RGB in xyz and coverage in w.

## Coverage and fragment stage

```wgsl
fn pattern_px(p: vec2<f32>) -> f32
fn pattern_fill(d: f32, px: f32) -> f32
fn pattern_stroke(d: f32, w: f32, px: f32) -> f32
fn pattern_isolines(v: f32, weight: f32) -> f32
fn pattern_ink(key: f32, n: i32) -> i32
```

`pattern_px` measures the pixel with `fwidth`, so a pattern that calls it works in a fragment stage only, in uniform control flow. The caller must therefore not call a pattern function inside a branch that depends on a varying value.[[src:warp_sdk/shaderlib/pattern/kit.wgsl|//   fwidth     only pattern_px calls fwidth. Call a pattern function in]] The kit comment says that only `pattern_px` calls `fwidth`, but `pattern_isolines` and functions in ten files, the kit included, call it directly. `pattern_fill` and `pattern_stroke` take `px` as an argument.

## Shared tools

`pattern_hash`, `pattern_hash2`, `pattern_vnoise` and `pattern_fbm` are the category noise. `pattern_vnoise` is 0..1 and `pattern_fbm` is about -1..1. `pattern_cell` gives square cells, and `pattern_hex` gives pointy-top hex cells with circumradius 1. Each returns the local point in xy and the cell in zw. `pattern_phyllo` finds the nearest golden-angle seed among the Fibonacci neighbours of the seed with the same radius.

## Sample signatures

```wgsl
fn pattern_grid_arc_lattice(p: vec2<f32>, cells: f32, bands: f32, weight: f32, seed: u32) -> vec2<f32>
fn pattern_tiling_star_rosettes(p: vec2<f32>, size: f32, angle: f32, weight: f32) -> f32
fn pattern_radial_phase_rings(p: vec2<f32>, rings: f32, lobes: f32, amp: f32, twist: f32, weight: f32) -> f32
fn pattern_flow_curl_streams(p: vec2<f32>, spacing: f32, scale: f32, weight: f32, seed: u32) -> f32
fn pattern_paths_hilbert(p: vec2<f32>, order: i32, weight: f32) -> vec2<f32>
fn pattern_texture_screen_dots(p: vec2<f32>, cells: f32, angle: f32, tone: f32) -> f32
fn pattern_opart_wave_bands(p: vec2<f32>, bands: f32, amp: f32, waves: f32, lag: f32) -> f32
fn pattern_hopf_fibres(p: vec2<f32>, n: i32, rot: vec2<f32>, view: vec2<f32>, scale: f32, weight: f32) -> vec4<f32>
```

The texture functions take a `tone` in 0..1, where 1 is full ink, and the caller supplies it from an image, a light value or `pattern_fbm`. Many functions cap a count for a bounded loop: at most 6 lenses, 64 rings, 4 Truchet levels and 64 Hopf fibres.

## How the ports became per-pixel

The category ports vector generators to a pixel function, and some forms changed in that step.

- **Distortion.** The source bends geometry forward, but a fragment shader bends the domain, sampling the base at the inverse of each lens and twirl.[[src:warp_sdk/shaderlib/pattern/distort.wgsl|// domain instead: it samples the base at the inverse of each lens and]]
- **Mazes.** The source carves with a seeded walk that needs the whole grid. `pattern_paths_maze_walls` uses the binary-tree rule, in which each cell opens one of two walls from its own hash. The result is also a perfect maze.[[src:warp_sdk/shaderlib/pattern/paths.wgsl|// rule instead: each cell opens one of two walls from its own hash. The]]
- **Meshes.** `pattern_mesh_triangles` jitters a grid and cuts each quad on a seeded diagonal. The result is a valid triangle mesh but not Delaunay.
- **Streamlines.** `pattern/flow.wgsl` draws the level lines of a stream function, which are the streamlines of its curl flow, so the lines are even and never cross.
- **Morphogen.** `pattern_organic_morphogen` is a stand-in for reaction-diffusion, a sum of waves of one wavelength cut at a threshold. `feed` below 0.4 gives spots, near 0.5 mazes, and above 0.6 holes.

Several source patterns were not ported, because they need state from earlier steps or recursion. The file headers name them under "Not ported", for example recursive fern fronds and step-by-step orbit trails.

## Modifiers

A domain modifier returns the point at which to sample the pattern, and a value modifier takes a coverage and returns a new coverage. Domain modifiers apply in the reverse order of a stack, because each one maps back from the screen to the pattern.[[src:warp_sdk/shaderlib/pattern/modifiers.wgsl|// modifiers in the reverse order of the source stack, because each one]]

| Kind | Functions |
|---|---|
| Domain | `pattern_mod_lens`, `pattern_mod_twirl`, `pattern_mod_wave`, `pattern_mod_noise`, `pattern_mod_mirror`, `pattern_mod_kaleido`, `pattern_mod_repeat`, `pattern_mod_jitter` |
| Value | `pattern_mod_dash`, `pattern_mod_dots`, `pattern_mod_mask` |
| Shape | `pattern_mod_shape_sd`: 0 circle, 1 rounded rectangle, 2 diamond, 3 arch, 4 hex |

## Motion

`pattern/motion.wgsl` makes seamless loops. `t` is in seconds, `l` is the loop length, and `cycles` is a whole number, so every channel is back at its start at `t = l`.[[src:warp_sdk/shaderlib/pattern/motion.wgsl|// Inputs: t in seconds, loop length l in seconds, cycles per loop (a whole]]

```wgsl
fn pattern_motion_phase(t: f32, l: f32, cycles: f32, phase: f32) -> f32
fn pattern_motion_curve(kind: i32, x: f32, a: f32, b: f32) -> f32
fn pattern_motion_rotate(p: vec2<f32>, c: vec2<f32>, amount: f32, kind: i32, x: f32) -> vec2<f32>
fn pattern_motion_wave(p: vec2<f32>, amount: f32, freq: f32, kind: i32, x: f32) -> vec2<f32>
```

`kind` is 0 sine, 1 ease, 2 noise, 3 bounce, 4 ramp. `pattern_motion_phase` gives the phase `x`, and each transform takes it. A fragment shader samples the pattern at the inverse point. Rotate, zoom, drift, twist and lens are exact inverses, and wave, ripple and flow subtract the push to first order. Motif channels such as `pattern_motion_spin`, `pattern_motion_breathe` and `pattern_motion_thin` return values for one motif, and `pattern_motion_dash` feeds `pattern_mod_dash`.

## Usage

The sample below draws lobed rings about the centre and winds them with time. It composes `pattern/radial.wgsl` and runs in a fragment stage.

```wgsl
let p = uv * 2.0 - vec2<f32>(1.0);
let ink = pattern_radial_phase_rings(p, 12.0, 7.0, 1.5, 2.0 * sin(time * 0.3), 0.4);
```

## Interaction with other kits

- `pattern/kit.wgsl` has its own noise, separate from [[shader-noise]], apart from the hash file.
- The polar functions in [[shader-sdf]] give a related set of anti-aliased ring patterns.
