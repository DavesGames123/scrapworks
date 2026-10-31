---
title: Material shaders
short: WGSL procedural surfaces that return a MaterialSample
category: Shader library
order: 22
see: shaderlib, lit2d, shader-terrain, shader-noise, art-direction
---
**Material shaders** are the `material/` category of the [[shaderlib|shader library]], a set of WGSL functions that compute a lit surface at a world position and return it as a MaterialSample. The category is registered in `shaderlib::material`. It covers rock, loose ground, metal, wood, ice, flesh and volcanic surfaces, and it adds tools that blend, wet and wear those samples. The main consumer is the [[lit2d]] kit, whose material function has the same return type.

## Files

| File | Central functions | Surface |
|---|---|---|
| `material/common.wgsl` | `material_fbm`, `material_cell`, `material_normal_slope`, `material_sample` | Private noise and normal tools |
| `material/rock.wgsl` | `material_rock`, `material_rock_field` | Sedimentary stone with strata and block cracks |
| `material/ground.wgsl` | `material_sand`, `material_sediment`, `material_mud` | Rippled sand, silt with pebbles, cracked or wet mud |
| `material/metal.wgsl` | `material_metal_brushed`, `material_metal_rusted`, `material_metal_painted`, `material_rust_ramp` | Brushed, rusted and chipped metal |
| `material/wood.wgsl` | `material_wood`, `material_wood_planks` | Grain with growth rings; plank floors and walls |
| `material/ice.wgsl` | `material_ice` | Fractured lake or glacier ice |
| `material/flesh.wgsl` | `material_flesh` | Skin with wrinkles, pores and veins |
| `material/volcanic.wgsl` | `material_basalt`, `material_lava` | Basalt columns; lava crust with glowing cracks |
| `material/layer.wgsl` | `material_mix`, `material_blend_height`, `material_wet`, `material_moss_overlay`, `material_edge_wear` | Tools that act on MaterialSample values |

Each file requires `material/common.wgsl`, which requires `core/material.wgsl` and `noise/hash.wgsl`. Composing one material file thus brings the record and its tools with it.

## Conventions

All material files share one set of inputs:[[src:warp_sdk/shaderlib/material/common.wgsl|// Conventions for all material files:]]

| Parameter | Meaning |
|---|---|
| `p` | World position, in world units |
| `scale` | Pattern cells per world unit. The pattern space is `q = p * scale` |
| `seed` | Any float. Different seeds give different but similar surfaces |

Control parameters such as `strata`, `crack`, `rust`, `frost` and `wetness` are 0..1. Colours such as `tone` and `tint` are linear. A normal comes from the slope of the height in pattern space, so the relief keeps its look at every scale. No file reads a texture or a uniform.

## Structure of a material

Most materials split into two functions. A `_field` function takes the pattern point `q` and returns a `vec4<f32>` of masks, and the public function shades those masks. For example, `material_rock_field` returns (height, crack mask, layer random, detail). The file says that the field exists so that a game can apply its own colour to the same relief.[[src:warp_sdk/shaderlib/material/rock.wgsl|layer random, detail). Use it for your own colour on the same relief.]]

The public function usually evaluates the field three times, at `q`, `q + (e, 0)` and `q + (0, e)`, and passes the heights to `material_normal_fd`. A material call therefore costs about three field evaluations.

## Signatures

```wgsl
fn material_rock(p: vec2<f32>, scale: f32, strata: f32, crack: f32, tint: vec3<f32>, seed: f32) -> MaterialSample
fn material_sand(p: vec2<f32>, scale: f32, wind: vec2<f32>, ripple: f32, seed: f32) -> MaterialSample
fn material_sediment(p: vec2<f32>, scale: f32, pebbles: f32, seed: f32) -> MaterialSample
fn material_mud(p: vec2<f32>, scale: f32, wetness: f32, seed: f32) -> MaterialSample
fn material_metal_brushed(p: vec2<f32>, scale: f32, angle: f32, base: vec3<f32>, seed: f32) -> MaterialSample
fn material_metal_rusted(p: vec2<f32>, scale: f32, rust: f32, seed: f32) -> MaterialSample
fn material_metal_painted(p: vec2<f32>, scale: f32, paint: vec3<f32>, chip: f32, seed: f32) -> MaterialSample
fn material_wood(p: vec2<f32>, scale: f32, rings: f32, tone: vec3<f32>, seed: f32) -> MaterialSample
fn material_wood_planks(p: vec2<f32>, scale: f32, plank: vec2<f32>, tone: vec3<f32>, seed: f32) -> MaterialSample
fn material_ice(p: vec2<f32>, scale: f32, frost: f32, seed: f32) -> MaterialSample
fn material_flesh(p: vec2<f32>, scale: f32, tone: vec3<f32>, sss: f32, wetness: f32, seed: f32) -> MaterialSample
fn material_basalt(p: vec2<f32>, scale: f32, vesicles: f32, seed: f32) -> MaterialSample
fn material_lava(p: vec2<f32>, scale: f32, heat: f32, time: f32, seed: f32) -> MaterialSample
```

## Parameter ranges

| Function | Parameter | Range and values, from the file header |
|---|---|---|
| `material_rock` | `scale` | One block is about 1.4 cells. Albedo about 0.18..0.3, roughness 0.75..0.95 |
| `material_sand` | `wind` | Any length. Ripple crests lie across it |
| `material_mud` | `wetness` | 0 is dry plates, 0.5 is damp, 1 is puddles |
| `material_metal_brushed` | `base` | Linear F0. Steel (0.56, 0.57, 0.58), copper (0.95, 0.64, 0.54), gold (1.0, 0.78, 0.34) |
| `material_wood` | `rings` | 2..12 per pattern cell. The grain runs along x |
| `material_wood_planks` | `plank` | Board (length, width) in cells, for example (6.0, 1.0) |
| `material_ice` | `frost` | 0 is clear black ice, 1 is a white crust. Roughness 0.04..0.6 |
| `material_flesh` | `tone` | Pale skin (0.62, 0.42, 0.34), raw flesh (0.5, 0.12, 0.1), reptile green (0.25, 0.3, 0.12) |
| `material_lava` | `heat` | 0 is cold black crust, 1 is wide white-hot cracks |
| `material_lava` | `time` | Seconds. 0.0 gives a still image |

`material_lava` is the one material with a time input. Its emissive output goes above 1, so it feeds bloom.[[src:warp_sdk/shaderlib/material/volcanic.wgsl|// Basalt albedo is 0.04..0.1 linear. Lava emissive goes above 1 (feeds bloom).]]

MaterialSample has no subsurface slot, so `material_flesh` places its subsurface tint in the albedo, making creases redder and more saturated.[[src:warp_sdk/shaderlib/material/flesh.wgsl|// MaterialSample has no subsurface slot. This file puts the subsurface tint]]

## Layer tools

`material/layer.wgsl` acts on finished samples, so a game can stack surfaces.[[src:warp_sdk/shaderlib/material/layer.wgsl|// material/layer.wgsl — tools that act on MaterialSample values: linear]]

| Function | Effect |
|---|---|
| `material_mix(a, b, t)` | Linear blend |
| `material_blend_height(a, b, t, sharp)` | The sample with more height wins, so low `b` fills the crevices of `a` first. `sharp` is 0.02..0.3 |
| `material_wet(s, wetness, porosity)` | Darkens porous albedo, lowers roughness, and fills low areas with flat water above wetness 0.5 |
| `material_moss(p, scale, slime, seed)` | Moss clumps. `slime` gives darker, flatter, glossy algae |
| `material_moss_overlay(base, p, scale, amount, slime, seed)` | Moss that grows in the crevices of `base` first |
| `material_detail_normal(base, detail)` | Reoriented normal mapping of two normals |
| `material_add_detail(s, detail, strength)` | Applies a detail normal to a sample |
| `material_edge_wear(s, p, dist, grad, width, chip, under, under_metal)` | Wear and chips along an SDF edge, with `dist` negative inside |

## Usage

The sample below is a [[lit2d]] material. It composes through `Material::with_shaderlib`, which is given `"material/layer.wgsl"` and `"material/rock.wgsl"`.

```wgsl
fn lit2d_material(uv: vec2<f32>, world: vec2<f32>, inst: Lit2dInstance) -> MaterialSample {
    let rock = material_rock(world, 2.0, 0.6, 0.4, vec3<f32>(1.0), inst.seed);
    return material_moss_overlay(rock, world, 3.0, 0.3, 0.0, inst.seed);
}
```

## Interaction with other kits

- `terrain/shade.wgsl` in [[shader-terrain]] requires the rock, ground and layer files.
- The surfaces in [[shader-organic]] and [[shader-creature]] return the same record but have their own noise.
- `sdf_relief_material` in [[shader-sdf]] builds a sample from a distance profile.
- Emissive values feed the engine bloom through the HDR target. See [[post]].

## Limitations

The header of `material/common.wgsl` calls its noise tools private to the material files. Materials therefore do not share random fields with the `noise_` functions. A float `seed` is not interchangeable with the `u32` seeds of the noise files.
