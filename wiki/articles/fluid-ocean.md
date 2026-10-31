---
title: Ocean
short: water, particles, and terrain in one value with a perf budget
category: World and simulation
order: 23
module: fluid::ocean
example: fluid
see: fluid, fluid-solver, fluid-particles, world-terrain, perf, smoke
---
**Ocean** is the Warp SDK value that combines moving water, the particles that ride it, and the terrain they both hit. It is the type `Ocean` in `warp_sdk::fluid::ocean`, re-exported as `fluid::Ocean`. It is the one call path for a game that wants moving water.[[src:warp_sdk/src/fluid/ocean.rs|The one call path for a game that wants moving water.]] An `Ocean` owns a `Solver`, a `Particles` system and, as an option, a `Terrain`.

## Overview

Each frame `Ocean::encode` does these things, in this order.[[src:warp_sdk/src/fluid/ocean.rs|Each frame `encode` does this, in this order:]]

1. It bakes the dirty terrain chunks into the terrain SDF texture.
2. It steps the solver. The terrain SDF is the solver obstacle field.
3. It steps the particles with the solver velocity and the same SDF.
4. It draws the particles into the HDR target.
5. It reports its time to `warp_sdk::perf` under `PERF_GPU` and `PERF_CPU`.

## Usage

`Ocean::new` touches no device, so warp_sdk::smoke::boot can build a game that owns one. The solver is made in the first `Ocean::step`.[[src:warp_sdk/src/fluid/ocean.rs|The solver is made in the first `step`.]] Splats that arrive before the solver exists wait in a queue and apply when it is made.

```rust
use warp_sdk::fluid::{Ocean, OceanConfig};
use warp_sdk::fluid::particles::{Emitter, Kind};
// Renderer::new: no device yet. The GPU state is made in the first encode.
let mut ocean = Ocean::new(OceanConfig::new([-8.0, -4.5, 8.0, 4.5]))
    .with_terrain(Terrain::generate(TerrainConfig::side(7)));
let snow = ocean.particles.add_kind(Kind::marine_snow());
ocean.particles.add_emitter(Emitter::area(snow, [-8.0, 4.0, 8.0, 4.5], 800.0).layers(0.0, 1.0));
// Renderer::render
ocean.splat(sub_pos, sub_vel, 0.6);
// Renderer::scene_underlay
ocean.encode(shared, encoder, hdr_view, view, dt);
```

The `particles` field of `Ocean` is public. Add kinds and emitters to it directly. `Ocean::emit` is a short form of `Particles::burst`. `Ocean::splat` pushes the water, and a game calls it each frame while a body moves. `Ocean::terrain_mut` gives the terrain to dig or fill, and the next step bakes the changed chunks, so the water and the particles see the change.[[src:warp_sdk/src/fluid/ocean.rs|chunks, and the water and the particles see the change.]]

```rust
if let Some(t) = ocean.terrain_mut() { t.dig(p.into(), 1.5); }
```

`Ocean::step` and `Ocean::draw` are the two halves of `Ocean::encode`, for a game that needs the simulation without the draw, or a target other than the engine HDR view.

## The frame path

`Ocean::encode` belongs in Renderer::scene_underlay. The engine encodes that hook after the HDR clear and before the scene pass, so the scene layers draw over it.[[src:warp_core/src/lib.rs|Draw an optional UNDERLAY into the HDR scene.]] The result is in the HDR target, ahead of the post effects. The hook receives a SharedGpu, from which `Ocean::encode` takes the device and queue. The `fluid` example calls `Ocean::encode` there and does all game work, including splats and digs, in Renderer::render.

The subject of the commit that added `Ocean` calls this wiring "the RTX path". The source has no code path by that name, no vendor test, and no ray tracing in this module. `Ocean` takes the same path on every adapter. The same commit message records measurements on an RTX 4060 Ti in a release build: a Medium solver at 0.16 ms of GPU time, and 100,000 particles at about 0.32 ms of wall time per frame for the step and draw, with the GPU part estimated. These numbers come from the commit message, and a game on another device will see other numbers. The fluid GPU tests ask for the high-performance adapter, so that the solver and particle timings come from the same GPU.[[src:warp_sdk/src/fluid/testgpu.rs|HIGH-PERFORMANCE adapter and prints the adapter name]]

## Configuration

`OceanConfig::new` takes the world rect of the water as `[min_x, min_y, max_x, max_y]`. Start from it and change fields.

| Field | Default | Meaning |
|---|---|---|
| `quality` | Quality::Medium | The solver quality |
| `particles` | 100,000 | The particle capacity |
| `vorticity` | 1.5 | The vorticity of the water, 0 turns it off |
| `velocity_dissipation` | 0.4 | Velocity loss per second |
| `gpu_budget_ms` | 2.0 | The GPU budget for the solver and the particles together |
| `cpu_budget_ms` | 0.5 | The CPU budget for the record work of `Ocean::encode` |

Water that a body pushed comes to rest in about `1 / velocity_dissipation` seconds. `OceanConfig::solver_config` builds the `SolverConfig` from these values, and the solver gets half of the GPU budget. The default dissipation here is 0.4, which is twice the `SolverConfig` preset of 0.2.

`Ocean::new` also sets the particle bounds to the world rect plus 10% on each side, so a particle dies shortly after it leaves the water.[[src:warp_sdk/src/fluid/ocean.rs|particles.bounds = [r[0] - mx, r[1] - my, r[2] + mx, r[3] + my];]]

## Rect conventions

The solver and the particles take a rect as `[min_x, min_y, max_x, max_y]`. The terrain gives its rect as `[min_x, min_y, size_x, size_y]`. `Ocean` converts at the boundary with `size_rect_to_bounds`, and a game that wires the parts by hand must call the same function.[[src:warp_sdk/src/fluid/ocean.rs|that wires the parts by hand must call the same function.]]

A wrong form can go unseen. With a world origin of zero the two forms are equal, so the test `a_point_maps_to_the_same_texel_in_both_rect_forms` uses a non-zero origin on purpose. It compares texels through `texel_of`, the function that states the mapping that the solver and the particle shaders use: `uv = (p - min) / (max - min)`. Row 0 is the min y row.

## Performance

`Ocean::new` registers two `perf` budgets.

| Channel | Constant | Budget | Fed by |
|---|---|---|---|
| `fluid.ocean.gpu` | `PERF_GPU` | `gpu_budget_ms` | The measured GPU time of the solver |
| `fluid.ocean.cpu` | `PERF_CPU` | `cpu_budget_ms` | The CPU record time of `Ocean::step` and `Ocean::draw` |

The solver measures its own GPU time when the device has TIMESTAMP_QUERY. The particles have no timestamps, so the particle part of the budget is a fixed allowance in the default config.[[src:warp_sdk/src/fluid/ocean.rs|particle part of the budget is a fixed allowance in the default config.]] The `PERF_GPU` channel therefore shows only the solver time, against a budget that covers both.

`Ocean::over_budget` is true when the solver time is over its half of the budget, and it is always false with no timestamps. The game then makes a new ocean with a lower `quality`.[[src:warp_sdk/src/fluid/ocean.rs|with a lower `quality`.]] An `Ocean` does not lower its quality alone.

## Failure

`Ocean::solver_error` returns the error from the solver creation, for example a device with no compute. With an error the particles still run, with no water.[[src:warp_sdk/src/fluid/ocean.rs|With an error the particles still run, with no water.]] The step also prints a line to standard error. `Ocean::solver` returns `None` before the first step and after a failure.

## Interaction with other kits

`Ocean::with_terrain` takes a `Terrain` by value, and its SDF becomes the solver obstacle field and the particle collision field. `Ocean::terrain` and `Ocean::terrain_mut` give it back. See [[world-terrain]]. The terrain view does not change after the first bake, so the solver keeps the obstacle bind group and reads new texels each step.[[src:warp_sdk/src/fluid/ocean.rs|The terrain view does not change after the first bake]]

The drawing of the rock stays with the game. The `fluid` example draws rect runs through RenderContext and rebuilds them after a dig. Cells outside the terrain rect are open water, so the terrain rect and the water rect need not match.

Dye is available through `Ocean::splat_dye`. The solver config from `OceanConfig::solver_config` uses the preset value of 4 dye channels, and `OceanConfig` has no field to change that. `Ocean` does not draw dye. A game reads it from `Ocean::solver` and `Solver::dye_view`.

## Limitations

- `OceanConfig` exposes a subset of `SolverConfig`. For other solver settings, wire a `Solver` and `Particles` by hand.
- With no solver, `Ocean::splat` and `Ocean::splat_dye` keep adding to the pending list, because the list drains only when a solver is made. A game on a device with no compute should test `Ocean::solver_error` before it splats each frame.
- Submit the encoder between calls of `Ocean::step`, as `Solver::step` and `Particles::step` require.

## History

Commit `a8c7f540` added the module on 2026-10-29. Before it, the solver, the particles and the terrain SDF existed but were not connected. The same commit added `fluid/testgpu.rs` and a crate-level lock for GPU tests, because the SDK tests made several devices on parallel threads and crashed the test process.
