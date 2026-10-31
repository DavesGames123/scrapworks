---
title: Fluid solver
short: GPU stable-fluids solver with obstacles, dye, and budgets
category: World and simulation
order: 21
module: fluid::solver
example: fluid
see: fluid, fluid-ocean, fluid-particles, world-terrain, perf, gpu
---
**Fluid solver** is a stable-fluids simulation that runs on wgpu compute shaders. It is the type `Solver` in `warp_sdk::fluid::solver`. The solver keeps a velocity field and up to 16 dye channels on a grid that covers one world rect, and it publishes the result as textures.[[src:warp_sdk/src/fluid/solver.rs|The solver keeps a velocity field and up to 16 dye channels on a grid]] Most games reach it through [[fluid-ocean|Ocean]], which makes and steps a solver for them.

## Overview

Each fixed substep runs these compute passes.[[src:warp_sdk/src/fluid/solver.rs|Each fixed substep runs these compute passes]]

1. Advection of the velocity, by the semi-Lagrangian or the MacCormack method. The same pass adds the fade, the velocity splats and the obstacles.
2. Vorticity confinement: a curl pass, then a force pass.
3. Divergence, a warm-started pressure solve, then the projection with free-slip walls and obstacles.
4. Advection of the dye with the projected velocity, with the dye splats.

All the work goes into the encoder of the game, and the CPU never reads the fields back. The module exists because a CPU fluid proved too slow in an earlier game. The commit that added it records that history.

## Usage

The module header shows one frame. `Solver::new` takes the device as an Arc, because the solver keeps a clone: `Solver::set_obstacles` makes a bind group later.[[src:warp_sdk/src/fluid/solver.rs|The solver keeps a clone of the device]]

```rust
use warp_sdk::fluid::solver::{Solver, SolverConfig};
// gpu.device is an Arc<wgpu::Device>, for example from SharedGpu.
let mut fluid = Solver::new(&gpu.device, SolverConfig::medium([-8.0, -4.5, 8.0, 4.5]))?;
fluid.splat([0.0, 0.0], [2.0, 0.0], 0.4);       // push the water
fluid.splat_dye(0, [0.0, 0.0], 1.0, 0.4);       // and give it colour
fluid.step(&gpu.device, &gpu.queue, &mut encoder, dt);
let vel = fluid.velocity_view();                // Rgba16Float, .xy = world units per second
if fluid.over_budget() { /* make the next solver with a lower Quality */ }
```

Submit the encoder before the next `Solver::step`.[[src:warp_sdk/src/fluid/solver.rs|Submit the encoder before the]]

## Configuration

`SolverConfig` holds all the settings. Start from a preset and change fields. `SolverConfig::preset` takes a `Quality`, and `SolverConfig::low`, `SolverConfig::medium` and `SolverConfig::high` are short forms. `default()` for `SolverConfig` is `medium` over the world rect `[-1, -1, 1, 1]`.

| Quality | Cells on the long side | Pressure iterations | MacCormack |
|---|---|---|---|
| Quality::Low | 128 | 16 | no |
| Quality::Medium | 256 | 24 | no |
| Quality::High | 512 | 32 | yes |

The long side of the world rect gets the preset cell count. The short side gets the count that keeps the cells square, clamped to at least 8.[[src:warp_sdk/src/fluid/solver.rs|The short side gets the count that keeps the]] A rect of 32 x 18 at Quality::Medium is 256 x 144 cells.

All presets share the other values.

| Field | Preset value | Meaning |
|---|---|---|
| `dye_channels` | 4 | Dye channels, 0 to 16 |
| `pressure_solver` | PressureSolver::RedBlack | The pressure method |
| `pressure_warm_start` | 0.9 | The part of the last pressure that starts the next solve |
| `vorticity` | 1.5 | Confinement strength, 0 turns it off |
| `velocity_dissipation` | 0.2 | Velocity loss per second |
| `dye_dissipation` | 0.3 | Dye loss per second |
| `fixed_dt` | 1/60 | The fixed time step in seconds |
| `max_substeps` | 2 | The most substeps in one `Solver::step` |
| `max_splats` | 64 | The most splats between two substeps |
| `gpu_budget_ms` | 1.0 | The GPU time that one step may use |

`Solver::set_vorticity` changes the strength after creation.

## How it works

### Fixed substeps

`Solver::step` takes the frame time and runs a fixed step. A non-finite `dt` counts as 0, and a larger one clamps to 0.25 s. The time goes into an accumulator, and the call runs at most `max_substeps` substeps. The solver drops the rest of the frame time, so the fluid slows down but the frame does not.[[src:warp_sdk/src/fluid/solver.rs|rest of the frame time, so the fluid slows down but the frame does not.]] A slow frame thus cannot make the next frame slower. `time_dropped` reports the loss.

If the accumulator holds less than one fixed step, the call runs no substep and copies nothing. Queued splats wait for the next substep.

### Grid and textures

One texel is one cell. Texel (0, 0) is the cell at the world rect minimum, and +y in texels is +y in the world.[[src:warp_sdk/src/fluid/solver.rs|and +y in texels is +y in the world.]] Cell centres are at texel coordinate `i + 0.5`. The velocity and dye textures are Rgba16Float, and the scalar fields (solid, curl, divergence and pressure) are R32Float.

The solver ping-pongs between pairs of textures, and it makes every bind group once in `Solver::new`. After the substeps, it copies the newest fields into separate output textures. The views of those outputs do not change during the life of the solver, so a game can keep a bind group that uses them.[[src:warp_sdk/src/fluid/solver.rs|The views do not change during the life of the solver]]

`Solver::velocity_view` gives the velocity, with `.xy` in world units per second. Dye channel `c` is component `c % 4` of `dye_view(c / 4)`, and `Solver::dye_groups` gives the number of dye textures.

### Advection

The semi-Lagrangian pass reads each field at the point that the cell velocity traces back to, with a bilinear read built from `textureLoad`. This pass also applies the fade and the splats and clears solid cells.[[src:warp_sdk/src/fluid/solver_advect.wgsl|Semi-Lagrangian advection, then fade, splats and obstacles.]]

MacCormack keeps more detail and costs two more passes for each field. It runs a forward step, a backward step, and a correction `hat + 0.5 * (phi - bar)`. The result is clamped to the four cells at the back position, and the clamp keeps it stable.[[src:warp_sdk/src/fluid/solver_advect.wgsl|The clamp keeps the result stable.]]

### Splats

`Solver::splat` adds velocity around a world point at the next substep, with a Gaussian of world `radius`. `Solver::splat_dye` does the same for one dye channel, and a channel that does not exist does nothing. A splat with a value that is not finite is dropped, and a splat past `max_splats` is dropped too. `splats_dropped` counts them. Call `Solver::splat` each frame while a body pushes the water.

```rust
fluid.splat(boat.pos, boat.vel, 0.6);
```

The splats apply in the first substep of a step only. The second substep gets a splat count of 0.[[src:warp_sdk/src/fluid/solver.rs|queue.write_buffer(&self.res.params, self.res.params_stride, &self.params_bytes(0));]]

### Vorticity confinement

The curl pass measures the rotation of each cell, and the force pass pushes along the gradient of its magnitude, scaled by `vorticity` and the cell size.[[src:warp_sdk/src/fluid/solver_project.wgsl|let f = P.vorticity * h * vec2<f32>(n.y * w, -n.x * w);]]

### Pressure projection

The projection subtracts the pressure gradient from the velocity to remove divergence. PressureSolver::Jacobi uses one pass per iteration. PressureSolver::RedBlack uses two passes, red cells then black cells, and it converges about two times faster than Jacobi for the same number of passes.[[src:warp_sdk/src/fluid/solver.rs|about two times faster than Jacobi for the same number of passes.]]

Each solve starts from `pressure_warm_start` times the last pressure, so few iterations give a good result. Because storage textures here are write-only, each red-black pass also copies the cells that it does not update.

A wall or obstacle cell has zero velocity, and its pressure is the pressure of the fluid cell beside it, which gives a zero normal gradient.[[src:warp_sdk/src/fluid/solver_project.wgsl|A wall or obstacle cell has zero velocity.]]

### Obstacles

`Solver::set_obstacles` takes a signed distance texture and its own world rect `[min_x, min_y, max_x, max_y]`. The texture is R16Float or R32Float, in world units, negative inside a solid, at any resolution. Cells outside the rect are open water.[[src:warp_sdk/src/fluid/solver.rs|Cells outside `sdf_rect` are open water.]]

The solver resamples the texture into a grid-resolution solid field once per `Solver::step`, before the substeps. A game can therefore draw moving obstacles into the same texture each frame. `Solver::clear_obstacles` removes them, and only the grid walls stay.

Walls are free-slip: water slides along them but does not go in. In `project`, a cell within two cells of an obstacle loses the part of its velocity that goes into the obstacle, using a normal from the distance gradient. The grid edges apply the same rule on each axis.[[src:warp_sdk/src/fluid/solver_project.wgsl|Free slip: near an obstacle, remove the part of v that goes into it.]]

[[world-terrain|Terrain]] gives its rect as origin and size, not as min and max. Convert it with `size_rect_to_bounds`.

```rust
let (view, rect) = terrain.sdf_texture(&device, &queue);
solver.set_obstacles(view, size_rect_to_bounds(rect));
```

## Metrics

`Solver::stats` returns `SolverStats` on every device: the substeps, the dispatches, the dropped time and splats, and the CPU record time.

GPU time needs the TIMESTAMP_QUERY feature. Two timestamps surround each step, and a ring of three buffers reads them back, so the CPU never waits for the GPU.[[src:warp_sdk/src/fluid/solver.rs|A ring of three buffers reads them]] `Solver::last_gpu_ms` is `None` with no such feature, and its result comes two or three frames late. `Solver::over_budget` compares a smoothed time with `gpu_budget_ms`, and it is always false with no timestamps. The solver does not lower its own quality. The game makes a new solver with a lower `Quality`.

## Errors

`Solver::new` returns a `SolverError`.

- SolverError::NoCompute means that the device has no compute shaders or too few storage textures, for example a GLES or WebGL2 device. The check asks for a workgroup of 8 x 8, at least 2 storage textures, 1 storage buffer and 5 sampled textures per stage.
- SolverError::BadConfig means a value out of range: a grid under 2 x 2 or over the device limit, a world rect with no area, more than `MAX_DYE_CHANNELS` dye channels, a `fixed_dt` that is not positive, or `max_substeps` of 0.

```rust
match Solver::new(&device, cfg) {
    Ok(s) => Some(s),
    Err(SolverError::NoCompute(why)) => { eprintln!("no GPU fluid: {why}"); None }
    Err(e) => panic!("{e}"),
}
```

## Limitations

- The velocity and pressure live at cell centres on one grid. The commit that added the solver states that this collocated grid reduces divergence but does not remove all of it. The test `projection_removes_most_divergence` asks for a fall to under 35% of the start value.
- A resolution change needs a new `Solver`.
- The solver has no public read back of its fields.
- The header target of under 1 ms for Medium applies to a mid-range GPU.[[src:warp_sdk/src/fluid/solver.rs|targets less than 1 ms on a mid-range GPU.]]

## History

Commit `d905e000` added the module on 2026-10-29. A measurement in that commit gives a Medium step as 0.15 ms of GPU time on an RTX 4060 Ti.
