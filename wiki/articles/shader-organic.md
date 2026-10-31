---
title: Organic shaders
short: WGSL corals, plants, fungi and growth patterns as 2D distance fields
category: Shader library
order: 25
see: shaderlib, shader-creature, shader-sdf, shader-material, lit2d
---
**Organic shaders** are the `organic/` category of the [[shaderlib|shader library]], a set of WGSL functions that draw corals, plants, fungi and growth patterns as 2D distance fields shaded into a MaterialSample. The category is registered in `shaderlib::organic`. Forms are parametric and take one species record, so one seed gives one individual. All functions start with `organic_`. The ports come from Stella Nova reef and plant pages, rewritten for 2D.

## Files

| File | Central functions | Forms |
|---|---|---|
| `organic/common.wgsl` | `organic_species`, `organic_smin`, `organic_taper`, `organic_dome`, `organic_normal`, `organic_sample`, `organic_cell_edge` | Shared record, noise, shapes, shading |
| `organic/tree.wgsl` | `organic_tree` | Fixed-depth iterated branching |
| `organic/coral_branch.wgsl` | `organic_staghorn`, `organic_fan` | Staghorn coral, gorgonian sea fan |
| `organic/coral_massive.wgsl` | `organic_brain`, `organic_plate`, `organic_encrust` | Brain, plate and encrusting coral |
| `organic/coral_soft.wgsl` | `organic_anemone`, `organic_polyps`, `organic_sponge` | Anemone, polyp field, sponge |
| `organic/plant.wgsl` | `organic_kelp`, `organic_seagrass`, `organic_mushroom` | Kelp, seagrass, mushroom |
| `organic/growth.wgsl` | `organic_dendrite`, `organic_veins`, `organic_gray_scott_step` | Dendrites, veins, reaction-diffusion |

Every file requires `organic/common.wgsl`, which requires `noise/hash.wgsl` and `core/material.wgsl`. `organic/coral_branch.wgsl` also requires `organic/tree.wgsl`.

## Conventions

Every form uses local 2D units. The base is at the origin and the form grows along +y in a side view, except where a file says "top view".[[src:warp_sdk/shaderlib/organic/common.wgsl|// the origin and the form grows along +y (side view), except where a file]] The brain coral centre is at (0, size/2). `px` is the size of one pixel in local units, used for anti-aliased coverage.

The species record has five fields:

| Field | Meaning |
|---|---|
| `seed` | Any float. One seed gives one individual |
| `size` | Height of the form in local units, `> 0` |
| `branchiness` | 0..1, from sparse and simple to dense. Each file maps it to its own control |
| `colour_a` | Linear RGB body colour |
| `colour_b` | Linear RGB tip, ridge or accent colour |

```wgsl
fn organic_species(seed: f32, size: f32, branchiness: f32, colour_a: vec3<f32>, colour_b: vec3<f32>) -> OrganicSpecies
```

There is no time input. Moving forms take a `flow` vector in local units, with `|flow|` about 0..2, which the game animates, so a current or a passing fish moves the tentacles.[[src:warp_sdk/shaderlib/organic/coral_soft.wgsl|//   flow            current at the form, local units; |flow| about 0..2.]]

## Structure of a form

Each form has an `_sdf` function and a material function. The `_sdf` function returns a vector, with signed distance in x and form-specific channels after it. The material function calls it, derives a normal from height samples with `organic_normal`, and builds the result with `organic_sample`. A game that needs only the outline, such as for contact, can call the `_sdf` function alone.

| Function | y | z | w |
|---|---|---|---|
| `organic_staghorn_sdf`, `organic_fan_sdf` | 0 at base, 1 at a tip or rim | Local limb radius | None |
| `organic_kelp_sdf` | 0 at holdfast, 1 at a blade tip | Local half width | 1 on a gas float |
| `organic_seagrass_sdf` | 0..1 up the blade | Blade hash | None |
| `organic_mushroom_sdf` | 0 on the stem, 1 on the cap top | Local radius | Gill mask |
| `organic_anemone_sdf` | 0 on the column, 1 at a tentacle tip | Local radius | None |
| `organic_sponge_sdf` | 0 at base, 1 at a rim | Local radius | Osculum mask |

## Branching

WGSL has no recursion, so an L-system turtle is not possible. `organic_tree` grows a binary tree level by level into a fixed array, at most 5 levels and 31 limbs, and returns the smooth union of its tapered limbs.[[src:warp_sdk/shaderlib/organic/tree.wgsl|// organic/tree.wgsl — fixed-depth iterated branching. WGSL has no]] `depth` is 1..5, `taper` is 0.4..0.95, `spread` is 0.2..1.2 radians, and `prune` is the chance that a limb above level 1 does not grow. The output is (distance, 0 at root to 1 at a tip, local radius), and the header suggests the radius as input to `organic_dome`.

The cost is notable: the staghorn material calls the tree three times, up to 279 limbs, for the normal.[[src:warp_sdk/shaderlib/organic/coral_branch.wgsl|// .. 1 at a tip or rim, z = local limb radius. Cost: the staghorn material]]

## Corals and plants

```wgsl
fn organic_staghorn(p: vec2<f32>, sp: OrganicSpecies, px: f32) -> MaterialSample
fn organic_fan(p: vec2<f32>, sp: OrganicSpecies, px: f32) -> MaterialSample
fn organic_brain(p: vec2<f32>, sp: OrganicSpecies, px: f32) -> MaterialSample
fn organic_plate(p: vec2<f32>, sp: OrganicSpecies, px: f32) -> MaterialSample
fn organic_encrust(p: vec2<f32>, ground_d: f32, centre: vec2<f32>, reach: f32, sp: OrganicSpecies, px: f32) -> MaterialSample
fn organic_anemone(p: vec2<f32>, sp: OrganicSpecies, flow: vec2<f32>, extension: f32, px: f32) -> MaterialSample
fn organic_polyps(p: vec2<f32>, sp: OrganicSpecies, extension: f32, px: f32) -> MaterialSample
fn organic_sponge(p: vec2<f32>, sp: OrganicSpecies, px: f32) -> MaterialSample
fn organic_kelp(p: vec2<f32>, sp: OrganicSpecies, flow: vec2<f32>, bend: f32, px: f32) -> MaterialSample
fn organic_seagrass(p: vec2<f32>, sp: OrganicSpecies, flow: vec2<f32>, bend: f32, px: f32) -> MaterialSample
fn organic_mushroom(p: vec2<f32>, sp: OrganicSpecies, spots: f32, px: f32) -> MaterialSample
```

| Form | Meaning of `branchiness` | Note |
|---|---|---|
| Staghorn | Stems, levels and pruning | Pale round tips and corallite bumps |
| Fan | Fan width and mesh density | Voronoi walls in a polar domain, held by thick ribs |
| Brain | Valley density | Stripes bent by two noise octaves |
| Plate | Number of tiers | Side view, a stalk under one to four plates |
| Encrusting | Lumpiness | `ground_d` is the signed distance to the host surface |
| Anemone | Tentacle count | `extension` 0 is closed, 1 is open |
| Sponge | Tube count | One to five vase tubes with a dark osculum |
| Kelp | Blade count | Blades alternate, each with a gas float |
| Seagrass | Blade density | An endless row along x |
| Mushroom | Cap shape, 0 bell and 1 flat | `spots` 1 gives dense pale spots |

Brain coral bends stripes and not closed curves, so its valleys run side by side and meander with no closed rings.[[src:warp_sdk/shaderlib/organic/coral_massive.wgsl|// by two octaves of noise (domain warp), so valleys run side by side and]] `organic_brain_groove` exposes that step alone:

```wgsl
fn organic_brain_groove(q: vec2<f32>, seed: f32, density: f32) -> f32
```

Its result is 0 on a ridge and 1 in a valley. `organic_polyp_extension_near` reduces `extension` near a threat, so that polyps inside a radius close.

## Growth patterns

`organic_dendrite` gives the look of diffusion-limited aggregation, from short jagged segments at four scales that each point toward a root. `organic_veins` applies the same scheme with long smooth segments and an optional net of closed cells. Both return (distance, 0 on coarse limbs to 1 on fine twigs), and `organic_branch_shade` shades that as a raised, tinted line.[[src:warp_sdk/shaderlib/organic/growth.wgsl|// organic/growth.wgsl — growth patterns. Dendrite field: the look of]]

```wgsl
fn organic_dendrite(p: vec2<f32>, root: vec2<f32>, scale: f32, reach: f32, density: f32, seed: f32) -> vec2<f32>
fn organic_veins(p: vec2<f32>, root: vec2<f32>, scale: f32, reach: f32, density: f32, areoles: f32, seed: f32) -> vec2<f32>
```

The Gray-Scott functions are for a game's own compute pass, because state must persist between steps:

| Function | Role |
|---|---|
| `organic_gray_scott_start` | Start state, `u = 1` with `v = 1` in seed spots |
| `organic_laplacian9` | 9-point Laplacian, 0.2 for edges, 0.05 for corners, -1 for centre |
| `organic_gray_scott_step` | One step. Typical `du = 1.0`, `dv = 0.5`, `dt = 1.0` |
| `organic_gray_scott_preset` | (feed, kill) for 0 coral growth, 1 mitosis, 2 brain maze, 3 spots, 4 worms |
| `organic_gray_scott_shade` | A MaterialSample from `v` and its +x and +y neighbours |

## Usage

The body below builds one species and calls a kelp, with the flow animated by the game through a `time` value:

```wgsl
let sp = organic_species(seed, 1.0, 0.6, vec3<f32>(0.1, 0.25, 0.08), vec3<f32>(0.3, 0.35, 0.1));
let flow = vec2<f32>(sin(time) * 0.5, 0.0);
let m = organic_kelp(local, sp, flow, 0.7, px);
```

It composes `organic/plant.wgsl`.

## Interaction with other kits

- The result is a MaterialSample, so a form fits directly in a [[lit2d]] material.
- `organic_encrust` takes a distance from any surface, such as `terrain_cave_sdf` in [[shader-terrain]].
- Forms have their own smooth union, `organic_smin`, separate from `sdf_smooth_union_poly` in [[shader-sdf]].
