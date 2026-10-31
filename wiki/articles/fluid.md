---
title: Fluid kit
short: GPU stable fluids and the particles that ride them
category: World and simulation
order: 20
module: fluid
example: fluid
see: fluid-ocean, fluid-solver, fluid-particles, world-terrain, perf, post
---
**Fluid kit** is the family of Warp SDK modules that simulates moving water and the particles that ride it on the GPU. It lives in `warp_sdk::fluid`, which has three submodules and re-exports `Ocean` and `OceanConfig`. The one call path for a game is `Ocean`: the solver, the particles and an optional terrain in one value, with a `perf` budget.[[src:warp_sdk/src/fluid/mod.rs|The one call path for a game is]]

## Parts

| Module | Article | What it holds |
|---|---|---|
| `fluid::ocean` | [[fluid-ocean]] | `Ocean`, the one value that wires the others each frame |
| `fluid::solver` | [[fluid-solver]] | A stable-fluids velocity and dye simulation in wgpu compute |
| `fluid::particles` | [[fluid-particles]] | GPU particles that ride a velocity field and land on terrain |

## Design

All of the simulation state stays on the GPU. The solver records its work into the encoder of the game, and the CPU never reads the fields back.[[src:warp_sdk/src/fluid/solver.rs|The CPU never reads the fields back.]] The CPU side of the particles only spawns particles and writes two small uniforms, so the CPU cost does not grow with the count.[[src:warp_sdk/src/fluid/particles.rs|The CPU only spawns]]

The parts meet through textures and rects. The solver publishes a velocity texture. The terrain publishes a signed distance texture. The water treats that distance as obstacles, and the particles treat the same texture as a floor, so the water and the particles hit the same rock.[[src:warp_sdk/examples/fluid.rs|The water and the particles hit]]

## Usage

Use `Ocean` unless a game needs to wire the parts itself. The two samples in the SDK reference show the shape of a game.

```rust
use warp_sdk::fluid::{Ocean, OceanConfig};
use warp_sdk::fluid::particles::{Emitter, Kind};
use warp_sdk::world::terrain::{Terrain, TerrainConfig};

// Renderer::new
let mut ocean = Ocean::new(OceanConfig::new([-8.0, -4.5, 8.0, 4.5]))
    .with_terrain(Terrain::generate(TerrainConfig::side(7)));
let snow = ocean.particles.add_kind(Kind::marine_snow());
ocean.particles.add_emitter(Emitter::area(snow, [-8.0, 4.0, 8.0, 4.5], 800.0));
// Renderer::render
ocean.splat(sub_pos, sub_vel, 0.6);
// Renderer::scene_underlay
ocean.encode(shared, encoder, hdr_view, view, dt);
```

The `fluid` example runs one `Ocean` over a seeded cave, 64 x 32 world units, with snow, bubbles, plankton and silt. The left button pushes the water, D or the right button digs the rock, and B throws a cloud of silt.[[src:warp_sdk/examples/fluid.rs|real water in a seeded cave, with snow and bubbles]]

```bash
cargo run -p warp_sdk --example fluid
```

## Requirements

The solver needs compute shaders and at least two storage textures per stage. `Solver::new` returns SolverError::NoCompute on a device without them, for example GLES or WebGL2. `Ocean` handles that error, and the particles then run with no water. See [[fluid-solver#Errors|solver errors]].

## History

Commits on 2026-10-29 added the solver (`d905e000`), the particles (`ec5776ad`) and `Ocean` (`a8c7f540`). Before the last of these the parts were not connected, and the particle example used an analytic swirl.
