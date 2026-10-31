---
title: Fluid particles
short: GPU particles that ride a velocity field and land on terrain
category: World and simulation
order: 22
module: fluid::particles
example: fluid
see: fluid, fluid-ocean, fluid-solver, world-terrain, world-biome, post
---
**Fluid particles** is a GPU particle system for small things that ride a velocity field and land on terrain. It is the type `Particles` in `warp_sdk::fluid::particles`, and its presets are marine snow, bubbles, silt and glowing plankton. One compute pass moves all particles, and one instanced draw for each blend mode puts them into the HDR target.[[src:warp_sdk/src/fluid/particles.rs|glowing plankton. One compute pass moves all of them.]] The kit works alone, and [[fluid-ocean|Ocean]] also embeds one.

## Overview

The CPU only spawns particles and writes two small uniforms, so the cost does not grow with the count on the CPU side. A slot table on the CPU decides which GPU slot each new particle takes. The GPU buffer holds the true positions, and the CPU reads them only through `Particles::read_back`.

`Particles::new` touches no device, so warp_sdk::smoke::boot can build a game that owns one. The GPU state is made on the first `Particles::step`.[[src:warp_sdk/src/fluid/particles.rs|The GPU state is made on the first]]

## Usage

Add kinds and emitters in Renderer::new, and call `Particles::encode` from Renderer::scene_underlay. The encode call runs `Particles::step`, then `Particles::draw` into the engine HDR target with the camera of the view.

```rust
use warp_sdk::fluid::particles::{Emitter, Fields, Kind, Particles};
// Renderer::new
let mut p = Particles::new(100_000);
let snow = p.add_kind(Kind::marine_snow());
p.add_emitter(Emitter::area(snow, [-2.0, 1.0, 2.0, 1.2], 300.0).layers(0.0, 1.0));
// Renderer::scene_underlay
let fields = Fields::none().sdf(&self.rock_sdf.view, self.rock_sdf.rect);
self.particles.encode(shared, encoder, hdr_view, view, self.dt, &fields);
```

A vent is a point emitter with a start velocity and a spread. Set its rate to 0 to turn it off.

```rust
let vent = Emitter::point(bubbles, [0.4, -0.85], 30.0).velocity([0.0, 0.25]).spread(0.08);
let id = particles.add_emitter(vent);
particles.emitter_mut(id).rate = 0.0; // turn it off
```

## Fields

`Fields` holds the two optional inputs of a step, and each is a texture view and a world rect `[min_x, min_y, max_x, max_y]`. `Fields::none` gives neither, and particles then feel only gravity and jitter.[[src:warp_sdk/src/fluid/particles.rs|No fluid and no terrain. Particles feel only gravity and jitter.]]

- **Velocity.** Rgba16Float, `.xy` in world units per second. Outside its rect the fluid is still.
- **SDF.** R16Float or R32Float signed distance in world units, negative inside solid. Outside its rect there is no solid.

`Solver::velocity_view` and `Terrain::sdf_texture` supply these fields, after the rect conversion in [[fluid-ocean#Rect conventions|Ocean]]. With no solver or terrain, `sdf_texture` and `velocity_texture` in this module make a `FieldTexture` from a closure, sampled at texel centres, and `update_velocity_texture` changes a velocity texture later.

```rust
// A floor at y = -0.8 and one round rock.
let rock = sdf_texture(&device, &queue, [256, 128], [-2.0, -1.0, 2.0, 1.0], |x, y| {
    (y + 0.8).min(((x - 0.3).powi(2) + (y + 0.6).powi(2)).sqrt() - 0.25)
});
```

## Kinds

A `Kind` sets the motion, the terrain contact and the look of a particle. All lengths are world units. Start from a preset and change what you need. `Particles::add_kind` returns a `KindId`, and `Particles::kind_mut` changes a kind, with the change showing in the next step.

| Field | `marine_snow` | `bubbles` | `silt` | `glow_plankton` |
|---|---|---|---|---|
| `color` | 0.78, 0.82, 0.86, 0.32 | 0.7, 0.9, 1.0, 0.6 | 0.55, 0.47, 0.36, 0.5 | 0.3, 0.9, 1.0, 0.5 |
| `drag` | 1.5 | 2.0 | 3.0 | 2.5 |
| `gravity` | 0, -0.035 | 0, 0.25 | 0, -0.15 | 0, 0 |
| `jitter` | 0.04 | 0.15 | 0.02 | 0.1 |
| `radius` | 0.004 | 0.008 | 0.003 | 0.004 |
| `friction` | 0.6 | 0.1 | 0.8 | 0.2 |
| `restitution` | 0.05 | 0.0 | 0.1 | 0.3 |
| `settle_speed` | 0.05 | 0.0 | 0.08 | 0.0 |
| `size` | 0.004..0.009 | 0.01..0.025 | 0.003..0.006 | 0.006..0.012 |
| `streak` | 0.0 | 0.0 | 0.02 | 0.05 |
| `emissive` | 0.0 | 0.0 | 0.0 | 2.0 |
| `life` | 8..14 | 3..6 | 4..8 | 2..5 |
| `far_scale` | 0.5 | 0.6 | 0.6 | 0.5 |
| `far_alpha` | 0.25 | 0.3 | 0.3 | 0.3 |
| `shape` | Shape::Flake | Shape::Bubble | Shape::Mote | Shape::Glow |
| `blend` | Blend::Alpha | Blend::Alpha | Blend::Alpha | Blend::Additive |

`default()` for `Kind` is the same as `Kind::marine_snow`. `Kind::max_alive` caps the live particles of a kind, and spawns past it are dropped.

The presets are quiet on purpose. A depth layer of 1 draws smaller and fainter, and the depth of field spreads a far particle over more pixels with the same light. Thus a dense field reads as texture, not as clutter in front of the play.[[src:warp_sdk/src/fluid/particles.rs|same light. Thus a dense field reads as texture, not as clutter in front]]

## Emitters

An `Emitter` is a continuous source of one kind, with a rate in particles per second. `Emitter::point`, `Emitter::area` and `Emitter::line` choose the `Source`. The builder methods are `Emitter::velocity`, `Emitter::spread` for a random start speed in any direction, `Emitter::layers` for the depth layer range where 0 is the front and 1 is far back, and `Emitter::cap` for the most live particles from this emitter.

`Particles::burst` sprays `count` particles from a point in all directions, up to `speed`. `Particles::burst_with` adds a layer range. The spawns go to the GPU in the next step, and a full system drops the rest. `Particles::clear` kills every particle, and the GPU buffer is cleared in the next step.

## How it works

### The slot table

`Particles` has `capacity` slots. For each slot the CPU keeps the sim time at which the slot is free again. A spawn moves a cursor around the slots and takes the first free ones, and it sets the death time at once, so a slot is not taken twice.[[src:warp_sdk/src/fluid/particles.rs|The death time is set now, so the slot is not taken twice.]] Pending spawns go to the GPU buffer in runs of adjacent slots.

The kind and system caps apply to emitters and bursts. The emitter cap applies only to emitters. Spawn positions and speeds come from a fixed-seed xorshift generator on the CPU.

### The compute step

The update shader does these things in this order for each live slot.[[src:warp_sdk/src/fluid/particles_update.wgsl|The step does these things in this order:]]

1. It ages the particle. A particle past its life gets life 0, which marks a dead slot.
2. It pulls the velocity toward the fluid velocity. The blend factor is `1 - exp(-drag * dt)`, which is stable for any `dt`.
3. It adds gravity and a small random jitter from a hash of the slot and the frame.
4. It moves the particle in up to 8 substeps. The substep count aims for at most half a collision radius of travel per substep.
5. After each substep, it collides with the SDF if the particle collides.
6. It applies the settle rule, and it kills the particle if it left `bounds`.

`Particles::step` clamps `dt` to 0.1 s and treats a non-finite value as 0. Bilinear reads use `textureLoad`, because R32Float has no filtering sampler without a device feature.[[src:warp_sdk/src/fluid/particles_update.wgsl|with textureLoad, because R32Float has no filtering sampler without a]]

### Terrain contact

A particle that is closer to the surface than its collision radius moves out along the SDF gradient, with up to four projections. Then the normal speed reflects with the restitution, and the tangent speed loses the friction.[[src:warp_sdk/src/fluid/particles.rs|collision radius moves out along the SDF gradient.]]

A particle settles (velocity 0) only when it touches the surface, is slow, and the surface faces up against the gravity. On an overhang or a steep wall it slides or falls. A settled particle gets gravity again in the next step, so it falls when the surface below it goes away.[[src:warp_sdk/src/fluid/particles_update.wgsl|settled particle gets gravity again in the next step, so it falls when]] In the shader, "faces up" means that the dot product of the normal and the anti-gravity direction is above 0.7. A `settle_speed` of 0 never settles.

Particles never collide with each other, so they cannot stack into a shape that has no terrain under it.[[src:warp_sdk/src/fluid/particles.rs|so they cannot stack into a shape that has no terrain under it.]] That rule answers a defect recorded in the commit message, in which particles built stiff overhangs where no geometry existed.

Only particles with a depth layer up to `collide_layers` collide. Far layers pass in front of the terrain as background.

### The draw

`Particles::draw` records the alpha kinds first, then the additive kinds. The pass loads the target and has no depth.[[src:warp_sdk/src/fluid/particles.rs|The pass loads the target and has no depth.]] Each pipeline draws all slots as instanced quads, and the vertex shader removes a slot that is dead or has the other blend mode.[[src:warp_sdk/src/fluid/particles_draw.wgsl|dead or that has the other blend mode, so each kind draws once.]]

The vertex shader fades each particle in and out over its life, so nothing pops. It applies the depth layer to size and alpha, then grows the disc by the depth of field blur and spreads the same light over more pixels. A particle below `min_px` draws at that size with less alpha, so a zoomed-out view keeps its light and does not flicker. A `streak` above 0 stretches the quad into a capsule along the velocity.

The fragment shader draws the `Shape`.

| Shape | Look |
|---|---|
| Shape::Mote | A small lit sphere |
| Shape::Flake | A lumpy lit disc with its own outline for each particle |
| Shape::Bubble | A thin bright rim with one specular point |
| Shape::Glow | A soft gaussian spot. Use it with Blend::Additive and `emissive` |

`Camera` carries the view. `Camera::from_view` adds the render origin back, so particles use plain world positions. Two world units fill the screen height at scale 1, the same as the engine scene shaders and [[lit2d]].[[src:warp_sdk/src/fluid/particles.rs|the same as the engine scene shaders and `lit2d`.]]

## Configuration

These public fields of `Particles` set the system defaults.

| Field | Default | Meaning |
|---|---|---|
| `bounds` | -1e4, -1e4, 1e4, 1e4 | A particle outside this world rect dies |
| `collide_layers` | 0.35 | The deepest depth layer that collides |
| `velocity_scale` | 1.0 | A multiplier on the velocity field |
| `light` | a cool light from above | One key light and a flat ambient term |
| `opacity` | 1.0 | A multiplier on the alpha of every particle |
| `focus_layer` | 0.0 | The depth layer in focus |
| `dof_px` | 3.0 | Blur in pixels for one layer of distance from focus |
| `min_px` | 1.5 | The smallest size in pixels |

`default()` for `Light` is a cool light from above, for an underwater scene.

## Limitations

- A particle that the GPU kills early, because it left `bounds`, keeps its slot until its CPU death time. `Particles::alive` counts it until then.[[src:warp_sdk/src/fluid/particles.rs|the GPU kills before that (it left `bounds`) keeps its slot until then.]]
- Call `Particles::step` once for each queue submit. The uniforms go through `Queue::write_buffer`, so two steps in one encoder share one uniform.
- A `Particles` holds at most `MAX_KINDS` kinds, which is 16, and `Particles::add_kind` panics past that.
- `Particles::read_back` blocks until the GPU is done. Use it in tests and tools, not in a frame.
- The substep count clamps at 8. Beyond a travel of 4 collision radii in one frame, a substep is longer than half a radius.
- Particles report no GPU time. They have no timestamps, unlike [[fluid-solver|the solver]].

## History

Commit `ec5776ad` added the module on 2026-10-29. That commit recorded about 4 ms on an integrated GPU in a debug build with a worst-case overdraw start, and it listed a 1 ms target as not met. Commit `a8c7f540` later measured 100,000 particles at about 0.32 ms of wall time per frame on an RTX 4060 Ti, in release, with a spread spawn. The commit marks the GPU part of that number as an estimate.
