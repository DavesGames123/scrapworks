---
title: Terrain shaders
short: WGSL caves, DLA ridges, heightfields, strata, reveal and map shading
category: Shader library
order: 27
see: shaderlib, world-terrain, world-reveal, shader-material, shader-noise, hud-minimap
---
**Terrain shaders** are the `terrain/` category of the [[shaderlib|shader library]], a set of WGSL functions for side-view caves, top-down heightfields and the shading of ground. The category is registered in `shaderlib::terrain`. It gives solid and empty fields with signed distance, a per-pixel DLA ridge height, rock strata, line of sight and fog of war, and map colours. All functions start with `terrain_`. The CPU world kits are separate. See [[world-terrain]] and [[world-reveal]].

## Files

| File | Provides | Requires |
|---|---|---|
| `terrain/cave.wgsl` | Side-view solid field, signed distance, normal, ambient occlusion, soft shadow | `noise/fbm.wgsl` |
| `terrain/dla.wgsl` | Branching ridge height as a function of position | `noise/fbm.wgsl` |
| `terrain/heightfield.wgsl` | Height texture as terrain: normal, horizon occlusion, sun shadow | None |
| `terrain/strata.wgsl` | Rock layer phase and sedimentary colour | `noise/fbm.wgsl` |
| `terrain/shade.wgsl` | Surface choice for side and top views, rim light, outline | `terrain/strata.wgsl`, `material/rock.wgsl`, `material/ground.wgsl`, `material/layer.wgsl` |
| `terrain/reveal.wgsl` | Line of sight, reach circle, fog of war, cut-away | `terrain/cave.wgsl` |
| `terrain/map.wgsl` | Hypsometric tint, hillshade, contours, sea depth | None |

## Conventions

World positions have y up in side views. Seeds are `u32`. Files that read a height texture take `tex` and `samp` as arguments, with height in the `r` channel at 0..1. No file expects a uniform.

## Caves

`struct TerrainCave` holds the parameters of one world, all in world units with y up:[[src:warp_sdk/shaderlib/terrain/cave.wgsl|//   TerrainCave fields (world units, y up):]]

| Field | Meaning |
|---|---|
| `ground` | Mean surface height |
| `relief` | Height of hills above and below ground |
| `scale` | Hills per world unit, about |
| `overhang` | 0..1, lean of cliffs. Above 0.6 gives floating rock |
| `cave` | 0..1, how much rock the tunnels remove |
| `cave_width` | 0.02..0.3, tunnel width in noise units |
| `cave_depth` | Depth under the surface where tunnels start |
| `seed` | Any `u32` |

The surface line is 1D fBm over x. A domain warp of x by y makes cliffs lean out, so overhangs are true geometry. Ridged tunnel noise cuts caves below `cave_depth`.

```wgsl
fn terrain_cave_density(p: vec2<f32>, c: TerrainCave) -> f32
fn terrain_cave_sdf(p: vec2<f32>, c: TerrainCave) -> f32
fn terrain_cave_normal(p: vec2<f32>, c: TerrainCave) -> vec2<f32>
fn terrain_cave_ao(p: vec2<f32>, n: vec2<f32>, c: TerrainCave, radius: f32) -> f32
fn terrain_cave_shadow(p: vec2<f32>, light_dir: vec2<f32>, c: TerrainCave, max_dist: f32, k: f32) -> f32
```

`terrain_cave_density` is positive in solid rock and is not a distance. `terrain_cave_sdf` is negative inside rock. `terrain_cave_normal` is a unit vector out of the rock. For `terrain_cave_shadow`, `k` is 4 for soft and 32 for hard.

Physics must use the same function on the CPU. The header says to keep a Rust twin of `terrain_cave_density`, or to bake the distance into a texture and read it back.[[src:warp_sdk/shaderlib/terrain/cave.wgsl|// Physics must use the same function on the CPU. Keep a Rust twin of]]

## DLA ridges

The source grows a true diffusion-limited aggregation tree on the CPU. `terrain/dla.wgsl` instead makes a tree that can be evaluated per pixel. Level 0 is a lattice of peaks. Each node of level k sits in a cell of size `0.5^k` and connects to the node of its parent cell, and a segment stays inside its parent cell, so a 3x3 search of parent cells finds every segment near `p`.[[src:warp_sdk/shaderlib/terrain/dla.wgsl|// 3x3 search of parent cells finds every segment near p. A node near the]]

```wgsl
fn terrain_dla(p: vec2<f32>, levels: i32, blur: f32, seed: u32) -> TerrainDla
fn terrain_dla_height(p: vec2<f32>, levels: i32, blur: f32, seed: u32) -> f32
fn terrain_dla_detail(p: vec2<f32>, levels: i32, blur: f32, detail: f32, erosion: f32, seed: u32) -> f32
fn terrain_dla_normal(p: vec2<f32>, levels: i32, blur: f32, detail: f32, erosion: f32, relief: f32, seed: u32) -> vec3<f32>
```

Peaks are about 1 unit apart. `levels` is 1..7, and each level costs 45 hashes. `blur` 0 gives thin sharp ridges, and 1 gives broad round mountains. `terrain_dla_height` is about 0..1. `terrain_dla_detail` adds eroded fBm, strong on high ground and weak in valley floors, with `detail` 0..0.5 and `erosion` 0..4. `terrain_dla` returns all of height, ridge, distance and level.

The cost is high, so the header advises baking `terrain_dla_detail` into a texture once for a large map, then using `terrain/heightfield.wgsl` on that texture.

## Heightfields

```wgsl
fn terrain_hf_height(tex: texture_2d<f32>, samp: sampler, uv: vec2<f32>) -> f32
fn terrain_hf_normal(tex: texture_2d<f32>, samp: sampler, uv: vec2<f32>, texel: f32, height_scale: f32, world_size: f32) -> vec3<f32>
fn terrain_hf_horizon_ao(tex: texture_2d<f32>, samp: sampler, uv: vec2<f32>, texel: f32, height_scale: f32, world_size: f32, strength: f32) -> f32
fn terrain_hf_shadow(tex: texture_2d<f32>, samp: sampler, uv: vec2<f32>, sun: vec3<f32>, texel: f32, height_scale: f32, world_size: f32, light_size: f32) -> f32
```

`uv` runs 0..1 over the map, `texel` is 1 over the texture size, `height_scale` is the world height of `r = 1`, and `world_size` is the world width of the map. A linear sampler is required. `terrain_hf_horizon_ao` walks 8 directions of 6 steps. `terrain_hf_shadow` marches toward the sun with steps that grow by 1.12, and `light_size` is the tan of the sun disc radius, with 0.012 soft and 0.003 hard. Shadow and occlusion each cost 48 texture reads, so the header advises baking both when the sun does not move.[[src:warp_sdk/shaderlib/terrain/heightfield.wgsl|// Shadow cost: 48 texture reads. AO cost: 48 texture reads. Bake both into]]

## Strata and shading

`terrain_strata` returns (phase, hard 0..1, layer index), for a `thickness` that is the world height of one hard and soft layer pair, a `dip` that is dy/dx, and a `warp` 0..2. `terrain_strata_color` gives linear colour with `granite` 0 for a sandstone palette and 1 for grey bands. Albedo is about 0.07..0.55.

`terrain/shade.wgsl` picks a surface. The side-view function gives strata rock with a soil cap on ground that faces up. The top-down function gives beach, silt, rock on steep ground and snow above a line.[[src:warp_sdk/shaderlib/terrain/shade.wgsl|// terrain/shade.wgsl — terrain surface choice and edge light. Side view:]]

```wgsl
fn terrain_material_side(p: vec2<f32>, n: vec2<f32>, depth: f32, scale: f32, thickness: f32, soil: f32, granite: f32, seed: u32) -> MaterialSample
fn terrain_material_top(p: vec2<f32>, h: f32, slope: f32, sea: f32, snow: f32, scale: f32, seed: u32) -> MaterialSample
fn terrain_rim(sd: f32, n: vec2<f32>, light_dir: vec2<f32>, width: f32) -> f32
fn terrain_outline(sd: f32, px: f32) -> f32
fn terrain_body_dark(depth: f32, falloff: f32) -> f32
```

In `terrain_material_side`, `n` comes from `terrain_cave_normal` and `depth` is `-terrain_cave_sdf`. In `terrain_material_top`, `h` is 0..1 and `slope` is `1 - normal.z`. A `snow` above 1 means no snow. `terrain_rim` is added after lighting, and `terrain_body_dark` is a 0.25..1 multiplier that darkens deep rock.

## Reveal

`terrain/reveal.wgsl` gives a reveal value 0..1 per pixel and never a hard cut.[[src:warp_sdk/shaderlib/terrain/reveal.wgsl|// fade in space: a reveal value 0..1 per pixel, never a hard cut.]]

| Function | Output and inputs |
|---|---|
| `terrain_reveal_los(p, eye, c, skin, k)` | 1 where the eye sees `p`. `skin` is the rock depth seen past the surface, 0.05..0.5 |
| `terrain_reveal_los_tex(mask, samp, uv, eye_uv, skin, density)` | The same through a mask texture with `r > 0` solid |
| `terrain_reveal_reach(p, eye, radius, feather, wobble, seed)` | A circle with a soft, wavy edge |
| `terrain_reveal_ease(t, duration)` | A smoothstep fade in time |
| `terrain_fog_of_war(colour, visible, explored, fog)` | Linear RGB |
| `terrain_cutaway(colour, p, sd, reveal, band, ink, edge)` | Linear RGB, with hidden rock as flat ink |

Hidden rock has a flat ink fill with sparse hatching and keeps its surface line, so it reads as solid and hidden and not as a missing texture.

## Map shading

`terrain/map.wgsl` shades a height as a map. `terrain_map` combines the parts:

```wgsl
fn terrain_hypsometric(t: f32) -> vec3<f32>
fn terrain_hillshade(n: vec3<f32>, light: vec3<f32>) -> f32
fn terrain_contour(h: f32, step: f32, px: f32) -> f32
fn terrain_contour_step(span: f32) -> f32
fn terrain_map(h: f32, n: vec3<f32>, sea: f32, hi: f32, px: f32, contours: bool) -> vec3<f32>
```

`terrain_contour` draws a darker line every fifth contour, with `px` the height change across one pixel. `terrain_contour_step` picks a round step that gives about 12 lines. `terrain_hillshade` returns a 0.28..1.15 multiplier.[[src:warp_sdk/shaderlib/terrain/map.wgsl|//   terrain_hillshade(n, light) -> 0.28..1.15 multiplier]]

## Usage

The sample below draws a DLA height from `terrain/dla.wgsl`, which also brings `noise/fbm.wgsl`:

```wgsl
let h = terrain_dla_height(uv * 3.0, 4, 0.5, 1u);
```

## Interaction with other kits

- `terrain/shade.wgsl` depends on [[shader-material]] and `terrain/cave.wgsl` depends on [[shader-noise]].
- `water_sim_terrain` in [[shader-water]] is a separate map colour for a simulation height.
- `organic_encrust` in [[shader-organic]] accepts a host distance from `terrain_cave_sdf`.
