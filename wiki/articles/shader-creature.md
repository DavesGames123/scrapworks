---
title: Creature shaders
short: WGSL layered 2D body plans for fish, jellies, squid, crabs and a submersible
category: Shader library
order: 26
see: shaderlib, shader-organic, shader-post, lit2d, shader-sdf
---
**Creature shaders** are the `creature/` category of the [[shaderlib|shader library]], a set of WGSL body plans that draw sea animals and a submersible as layered 2D signed distance fields. The category is registered in `shaderlib::creature`. Each body plan comes from one parameter record, so a seed gives a stable species, and it returns a MaterialSample. All functions start with `creature_`. The plans port profile ideas from Stella Nova pages to 2D.

## Files

| File | Record | Species or default | Hit function | Material function |
|---|---|---|---|---|
| `creature/fish.wgsl` | `struct CreatureFish` | `creature_fish_species` | `creature_fish_hit` | `creature_fish` |
| `creature/jellyfish.wgsl` | `struct CreatureJelly` | `creature_jelly_species` | `creature_jelly_hit` | `creature_jelly` |
| `creature/cephalopod.wgsl` | `struct CreatureSquid` | `creature_squid_species` | `creature_squid_hit` | `creature_squid` |
| `creature/crustacean.wgsl` | `struct CreatureCrab` | `creature_crab_species` | `creature_crab_hit` | `creature_crab` |
| `creature/gloom.wgsl` | `struct CreatureGloom` | `creature_gloom_species` | `creature_gloom_hit` | `creature_gloom` |
| `creature/submersible.wgsl` | `struct CreatureSub` | `creature_sub_default` | `creature_sub_hit` | `creature_sub` |

Two shared files sit below them. `creature/common.wgsl` gives the hit record, 2D shapes, smooth union, relief, noise and output builders, and it requires `core/material.wgsl` and `noise/hash.wgsl`. `creature/parts.wgsl` gives surface helpers and requires the common file. Each body plan requires `creature/parts.wgsl`. `creature/submersible.wgsl` also requires `post/volumetric.wgsl`.

## Conventions

These apply to all creature files:[[src:warp_sdk/shaderlib/creature/common.wgsl|// Conventions for all creature files:]]

| Name | Meaning |
|---|---|
| `p` | Local position. The body has a length of about 1, centred on 0. +y is up on the screen |
| `aa` | One screen pixel in local units. It sets the edge width |
| `seed` | Any float. One seed gives one stable individual |
| `light` | 2D key light direction, any length, used for the eye spot |

The game scales and rotates `p` in its shader. Animation enters through record fields such as `phase`, `pulse`, `time` and `walk`, which the game sets from its simulation. No file reads a uniform.

| Body plan | Frame | Animation fields |
|---|---|---|
| Fish | Snout at x = +0.5, tail tip at x = -0.5 | `phase` |
| Jellyfish | Bell top near y = +0.45, tentacles toward -y | `pulse`, `time`, `flow` |
| Squid | Mantle tip at x = +0.5, arms toward x = -0.5 | `phase` |
| Crab | Top view, head faces +y, mirror symmetric in x | `walk`, `claw_open` |
| Gloom | Head faces +x, tail near x = -0.5 | `phase`, `jaw_open` |
| Submersible | Nose faces +x, thrusters near x = -0.5 | `thrust`, `time`, `lamp` |

## How a body plan works

The `struct CreatureHit` record has a signed distance `d`, relief height `h`, a `part` id and part coordinates `uv`.

```wgsl
fn creature_miss() -> CreatureHit
fn creature_layer(below: CreatureHit, d: f32, h: f32, part: f32, uv: vec2<f32>) -> CreatureHit
```

A `_hit` function starts with `creature_miss` and calls `creature_layer` from back to front. The new layer wins where it covers the point, or where nothing below covers the point and the new layer is nearer. The distance is the union of the layers.[[src:warp_sdk/shaderlib/creature/common.wgsl|// Put a new layer on top of the layers below it. Call from back to front.]]

The material function then shades that result. `creature_fish` is typical. It returns `creature_empty` when the point is more than one pixel outside. It takes relief at `p`, `p + (e, 0)` and `p + (0, e)` for `creature_normal`, computes coverage with `creature_coverage`, branches on the part id to pick colour, and ends with `creature_finish`.[[src:warp_sdk/shaderlib/creature/fish.wgsl|fn creature_fish(p: vec2<f32>, f: CreatureFish, seed: f32, aa: f32, light: vec2<f32>) -> MaterialSample {]] A call thus costs three evaluations of the whole body plan. A game that needs only a mask can call the `_hit` function.

## Signatures

```wgsl
fn creature_fish_species(seed: f32, depth: f32) -> CreatureFish
fn creature_fish(p: vec2<f32>, f: CreatureFish, seed: f32, aa: f32, light: vec2<f32>) -> MaterialSample
fn creature_jelly_species(seed: f32) -> CreatureJelly
fn creature_jelly(p: vec2<f32>, j: CreatureJelly, seed: f32, aa: f32) -> MaterialSample
fn creature_squid_species(seed: f32) -> CreatureSquid
fn creature_squid(p: vec2<f32>, c: CreatureSquid, seed: f32, aa: f32, light: vec2<f32>) -> MaterialSample
fn creature_crab_species(seed: f32) -> CreatureCrab
fn creature_crab(p: vec2<f32>, c: CreatureCrab, seed: f32, aa: f32, light: vec2<f32>) -> MaterialSample
fn creature_gloom_species(seed: f32) -> CreatureGloom
fn creature_gloom(p: vec2<f32>, g: CreatureGloom, seed: f32, aa: f32, light: vec2<f32>) -> MaterialSample
fn creature_sub_default() -> CreatureSub
fn creature_sub(p: vec2<f32>, s: CreatureSub, aa: f32, light: vec2<f32>) -> MaterialSample
```

`creature_jelly` takes no light, and `creature_sub` takes no seed.

## Body plans

### Fish

The fish has a body profile around a bending spine, a tail, dorsal, anal and pectoral fins, scales, countershading, a colour pattern, an eye, a ventral photophore row and an optional angler lure. In `creature_fish_species`, `depth` 0 is reef and 1 is abyss, and the abyss gives dark fish with glow rows, big eyes and lures.[[src:warp_sdk/shaderlib/creature/fish.wgsl|// One stable species from a seed. depth 0 = reef, 1 = abyss: the abyss]] The header notes that the spine bends in the image plane, so a top view reads the bend as the swim wave and a side view reads it as an arch, which calls for a small curvature.

| Field | Range |
|---|---|
| `body` | 0 fusiform, 1 compressed, 2 eel |
| `height` | 0.05..0.25 |
| `tail` | 0 forked, 1 lunate, 2 rounded |
| `eye` | 0.015..0.06 |
| `curvature` | 0..0.12 |
| `pattern` | 0..5, see `creature_pattern` |
| `photophores` | 0..1 |
| `lure` | 0 for none, up to 0.4 |

### Jellyfish

The bell is translucent and pulses, with a scalloped margin, radial canals and gonad arcs. Frilled oral arms and trailing tentacles bend with a flow vector. `pulse` is 0 relaxed to 1 contracted, and the header suggests `0.5 - 0.5 * cos(t)`. `tentacles` is 0..24, and `flow` is -1..1 on each axis.[[src:warp_sdk/shaderlib/creature/jellyfish.wgsl|//   pulse      bell contraction, 0 (relaxed)..1 (contracted). Drive it]]

### Cephalopod

CreatureSquid covers a squid or an octopus. `fins` 0 gives an octopus and 1 gives big rhombic fins. `arms` is 2..8, `tentacles` 1 adds two long clubs, and `curl` sets the arm tip curl. A squid swims mantle first, so the game moves it toward +x.

### Crustacean

The crab is a top view. `segments` 0 gives a crab and 6 a lobster. `legs` is 2..5 pairs, `claw_open` is 0..1, and `spines` is 0..1. `creature_crab_leg` draws one two-segment leg.

### Gloom

`creature/gloom.wgsl` is the deep-sea threat. `kind` 0 is an angler with a globe body, and 1 is a viperfish with an eel body. Both have a hinged jaw that opens, translucent fangs, a glowing eye and a lure.

### Submersible

The submersible is the player craft, with a painted hull, a conning tower, a glass viewport, thruster pods with an emissive plume and a headlamp. `creature_headlamp_cone` does not depend on `struct CreatureSub`. It calls `post_volumetric_cone` and maps the result to 0..1 with a soft saturation. The comment points to `post_volumetric_cone` for HDR light, occlusion and dither.[[src:warp_sdk/shaderlib/creature/submersible.wgsl|// It calls post_volumetric_cone: analytic in-scattering with a smooth]] `creature_sub_lamp_pos` gives the lamp position on the hull.

```wgsl
fn creature_headlamp_cone(p: vec2<f32>, origin: vec2<f32>, dir: vec2<f32>, half_angle: f32, range: f32) -> f32
```

## Part ids

Each plan numbers its parts, and `uv` has a meaning per part.

| Plan | Ids |
|---|---|
| Fish | 1 body, 2 tail, 3 dorsal, 4 anal, 5 pectoral, 6 lure stalk, 7 lure bulb, 8 eye |
| Jellyfish | 1 bell, 2 tentacle, 3 oral arm |
| Squid | 1 mantle and head, 2 fin, 3 arm, 4 eye |
| Crab | 1 carapace, 2 abdomen, 3 leg, 4 claw, 5 eye |
| Gloom | 1 body, 2 fin, 3 mouth, 4 tooth, 5 lure stalk, 6 lure bulb, 7 eye |
| Submersible | 1 hull, 2 tower, 3 thruster pod, 4 viewport glass, 5 exhaust plume, 6 headlamp |

## Surface helpers

`creature/parts.wgsl` holds the surfaces shared across plans.[[src:warp_sdk/shaderlib/creature/parts.wgsl|// creature/parts.wgsl — surface helpers that every body plan shares: an eye]]

```wgsl
fn creature_eye(p: vec2<f32>, r: f32, iris: vec3<f32>, glow: f32, light: vec2<f32>) -> CreatureEye
fn creature_fin(base: vec3<f32>, edge: vec3<f32>, uv: vec2<f32>, rays: f32) -> vec4<f32>
fn creature_iridescence(cos_t: f32, thickness: f32) -> vec3<f32>
fn creature_photophores(p: vec2<f32>, spacing: f32, radius: f32, density: f32, seed: f32) -> f32
fn creature_scales(p: vec2<f32>, size: f32) -> f32
fn creature_countershade(back: vec3<f32>, belly: vec3<f32>, up: f32) -> vec3<f32>
fn creature_pattern(kind: f32, uv: vec2<f32>, n: f32, seed: f32) -> f32
```

The eye spot is emissive, so it stays readable at game zoom without a light pass. `creature_scales` returns a relief 0..1, high at the free edge of each scale. `creature_pattern` kinds are 0 plain, 1 bars, 2 stripes, 3 spots, 4 saddle and 5 mottle.

## Usage

A game starts from the species function, overrides the animated fields, and calls the material. Field names below are those of the record:

```wgsl
var j = creature_jelly_species(3.0);
j.pulse = 0.5 - 0.5 * cos(time * 1.5);
j.time = time;
let m = creature_jelly(local, j, 3.0, px);
```

It composes `creature/jellyfish.wgsl`. Output is a MaterialSample, so `alpha` is the coverage and glow is in `emissive`.

## Interaction with other kits

- A body plan fits in a [[lit2d]] material, because it returns the same record.
- [[shader-organic]] draws the reef that these animals live on.
- `creature_headlamp_cone` depends on [[shader-post]].
