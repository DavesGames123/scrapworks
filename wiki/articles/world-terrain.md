---
title: Terrain
short: chunked density field with a dig brush, exact surface, and SDF texture
category: World and simulation
order: 11
module: world::terrain
example: world
see: world, world-collide, fluid-ocean, shader-terrain, lit2d, procgen
---
**Terrain** is a chunked density field that the player can dig, with an exact surface and an exact signed distance near that surface. It is the type `Terrain` in `warp_sdk::world::terrain`. A game uses it for a seeded cave or island world, for a Terraria style brush, and as the one source of collision and GPU distance data for the rest of the [[world|world kit]].

## Overview

The world is a grid of density values at the grid nodes. A density above 0.5 is solid, and the surface is the 0.5 contour, found per cell by marching squares with linear interpolation on each cell edge.[[src:warp_sdk/src/world/terrain.rs|A density above]] Node (i, j) sits at `origin + (i, j) * cell`. The module has no half-cell offset, so the mesh, the signed distance, the collision and the GPU texture all read the same segments.[[src:warp_sdk/src/world/terrain.rs|half-cell offset anywhere]]

A chunk is a square of cells. Chunks exist for dirty tracking, meshing and partial uploads. They are not streamed. `Terrain::generate` and `Terrain::from_fn` fill every node of the world when they run, and the world size stays fixed after that.

## Lifecycle

The order of calls for a game is as follows.

1. Make a `TerrainConfig`, usually from `TerrainConfig::side` or `TerrainConfig::top_down`.
2. Call `Terrain::generate`, or `Terrain::from_fn` for a shape of your own.
3. Each frame, query `Terrain::sdf`, `Terrain::normal` or `Terrain::is_solid`, or pass the terrain to [[world-collide]].
4. On player input, call `Terrain::dig` or `Terrain::fill`.
5. Call `Terrain::take_dirty_chunks` and rebuild the mesh of each returned chunk with `Terrain::chunk_mesh`.
6. If a GPU kit reads the terrain, call `Terrain::sdf_texture`. The call re-bakes only the dirty chunks.

```rust
use warp_sdk::world::terrain::{Terrain, TerrainConfig};
use warp_sdk::ultraviolet::Vec2;
let mut t = Terrain::generate(TerrainConfig::side(7));   // a seeded cave world
t.dig(Vec2::new(20.0, 30.0), 2.5);                       // the Terraria brush
let d = t.sdf(Vec2::new(20.0, 30.0));                    // > 0 in open water
for c in t.take_dirty_chunks() { let mesh = t.chunk_mesh(c); /* upload */ }
```

Generation is deterministic. The same seed and settings give the same density and material values, and a test compares two runs.[[src:warp_sdk/src/world/terrain.rs|The same seed and settings give the same world.]]

## How it works

### Marching squares

Each cell reads its four corner densities. An edge point is interpolated from its solid node, so the two cells that share an edge get the same point.[[src:warp_sdk/src/world/terrain.rs|so the two cells that share the edge get the same point]] A cell yields up to two polygons and two surface segments. The module caches the segments for each cell, and a brush stroke rebuilds only the cells that it touched.

A saddle cell, with solid on two opposite corners, is ambiguous. The module breaks the tie with the mean of the four corners. If the mean is at or below 0.5, the cell gets two separate corner triangles. Otherwise the cell gets one joined polygon.[[src:warp_sdk/src/world/terrain.rs|let centre = (d[0] + d[1] + d[2] + d[3]) * 0.25 > 0.5]]

Segments have a fixed direction. Solid is on the left of `a -> b`, both in `outline` and in `Terrain::surface_segments`.[[src:warp_sdk/src/world/terrain.rs|Solid is on the left of]]

### Signed distance

`Terrain::sdf` returns the distance from `p` to the nearest surface segment, negative inside solid. The sign comes from the same marching-squares polygons that the mesh draws, so the sign and the distance never disagree.[[src:warp_sdk/src/world/terrain.rs|so the sign and the distance never disagree]]

The search scans square rings of cells around `p`, up to `SDF_REACH_CELLS` rings, which is 4. Farther from the surface, the magnitude is that reach. The value is then a lower bound, and a lower bound keeps sphere tracing safe.[[src:warp_sdk/src/world/terrain.rs|which is a lower bound, so sphere tracing stays safe]] The cap is deliberate. A segment found in the last ring can lie past the reach while an unscanned one is nearer, and an uncapped value once let a raycast step into rock. A regression test, `sdf_is_a_lower_bound_far_from_the_surface`, covers that case.[[src:warp_sdk/src/world/terrain.rs|Cap at the reach to keep a lower bound.]]

Outside the world rect, `sdf` grows with the distance to that rect. `Terrain::density` is bilinear between nodes, and outside the world the edge value continues. `Terrain::nearest` returns the nearest surface point if one is in reach. `Terrain::normal` gives the unit direction out of the solid. Near the surface it uses the nearest point, and with no surface in reach it falls back to the density gradient.

Tests check these claims against an analytic circle. Surface vertices lie within 0.05 cell of the circle, `sdf` agrees with the true distance within 0.05 near the surface, and the mesh area is within 1% of the circle area.

### The brush

`Terrain::dig` removes solid in a disc, and `Terrain::fill` adds solid of material `m`. The cut is a smooth circle at any position, not cell steps, because the brush writes a density ramp and combines it with the old density by a minimum for a dig or a maximum for a fill.[[src:warp_sdk/src/world/terrain.rs|The cut is a smooth]]

Density is linear inside a band of 2 cells on each side of the surface, which keeps the edge interpolation accurate.[[src:warp_sdk/src/world/terrain.rs|is linear inside this band]] A chord of a dug circle sags by less than 0.05 cell at a radius of 6 cells, according to the test `dig_cuts_a_disc_and_marks_chunks`.

A brush stroke marks two separate dirty lists. The mesh list covers the edited cells. The GPU list covers those cells plus `SDF_REACH_CELLS + 1` more, because an edit changes the distance of texels that are several cells away.[[src:warp_sdk/src/world/terrain.rs|self.mark_dirty(i0 - 1, j0 - 1, i1, j1, SDF_REACH_CELLS + 1, false);]] `Terrain::take_dirty_chunks` drains only the mesh list. Its first call names every chunk. `Terrain::sdf_texture` drains the GPU list.

### The generator

The side-view field combines these parts: a fractal noise surface line, a domain warp, worm tunnels, caverns, strata and a bedrock frame.[[src:warp_sdk/src/world/terrain.rs|The side-view field: fBm surface line, domain warp, worm tunnels,]] The warp displaces x by a noise term that depends mostly on height, so a cliff can lean and form a true overhang. Tunnels are the near-zero contour of the absolute value of a noise field. Caverns are a high contour of a lower-frequency field. Both fade in between half of `cave_depth` and all of it, so caves do not break the surface near the top.

Material follows from position. The frame is mat::BEDROCK, a noisy layer under the surface is mat::SAND, and the rest cycles through mat::ROCK, mat::SOFT_ROCK and mat::DARK_ROCK in wavy bands of thickness `strata`.

The top-down field is warped noise islands in open water, with a frame on all four sides. In side view the frame covers only the left, right and bottom edges. The top-down sampler reads `seed`, `scale`, `warp`, `ground`, `soil` and `frame`, and ignores the other generator fields.

Both samplers use a private hash and gradient noise, not `procgen::Rng`.

## Configuration

`TerrainConfig` holds every setting, and all lengths are world units. `default()` for `TerrainConfig` is `TerrainConfig::side(1)`. `TerrainConfig::top_down` starts from the side preset and changes three fields.[[src:warp_sdk/src/world/terrain.rs|TerrainConfig { view: View::TopDown, ground: 0.4, relief: 1.0, scale: 1.0 / 20.0, ..Self::side(seed) }]]

| Field | `side` | `top_down` | Meaning |
|---|---|---|---|
| `view` | View::Side | View::TopDown | The camera the world is made for |
| `cell` | 0.5 | 0.5 | The side of one cell |
| `chunk_cells` | 32 | 32 | Cells per chunk side |
| `chunks` | [8, 4] | [8, 4] | Chunk count, which gives 128 x 64 world units |
| `origin` | zero | zero | The min corner of the world |
| `ground` | 0.72 | 0.4 | Mean surface height fraction, or about the land fraction |
| `relief` | 9.0 | 1.0 | The height of hills above and below `ground` |
| `scale` | 1/30 | 1/20 | Hills per world unit, about |
| `warp` | 0.6 | 0.6 | 0..1, leans cliffs and makes overhangs |
| `tunnels` | 0.8 | 0.8 | 0..1, how much rock worm tunnels remove |
| `tunnel_width` | 0.08 | 0.08 | Tunnel width in noise units, 0.02..0.2 |
| `cave_depth` | 5.0 | 5.0 | The depth where tunnels and caverns start |
| `caverns` | 0.5 | 0.5 | 0..1, how much rock large caverns remove |
| `strata` | 3.0 | 3.0 | The thickness of one strata band |
| `soil` | 1.5 | 1.5 | The depth of the sand cap |
| `frame` | 1.5 | 1.5 | The thickness of the bedrock frame |

Change a field with struct update syntax.

```rust
let cfg = TerrainConfig { chunks: [24, 10], ..TerrainConfig::side(42) };
let t = Terrain::generate(cfg);
```

### Materials

Module `mat` names the material ids, which are `u8` constants. A node keeps one id.

| Constant | Value | Use |
|---|---|---|
| mat::SAND | 0 | Loose sand and soil on top of the rock |
| mat::ROCK | 1 | Hard rock, the first strata band |
| mat::SOFT_ROCK | 2 | Soft rock, the second band |
| mat::DARK_ROCK | 3 | Dark rock, the third band |
| mat::BEDROCK | 4 | The frame at the world edges |
| mat::FILL | 5 | Material that the player put down with `fill` |

### Custom shapes

`Terrain::from_fn` builds a world from a field `f(p)`, and each node gets mat::ROCK. The function must return about the signed distance in world units, and its sign is the opposite of `sdf`: it is positive inside solid.[[src:warp_sdk/src/world/terrain.rs|surface in world units, POSITIVE inside solid.]]

```rust
let c = Vec2::new(16.0, 16.0);
let t = Terrain::from_fn(TerrainConfig::side(0), |p| 5.0 - (p - c).mag());
```

## The GPU contract

`Terrain::sdf_texture` gives an R16Float texture view of the signed distance in world units, negative inside solid, and a rect `[min_x, min_y, size_x, size_y]`. The shader samples it with `uv = (p - min) / size`. Row 0 is the min y row, so there is no flip, and texel centres sit at `min + (texel + 0.5) * size / dims`.[[src:warp_sdk/src/world/terrain.rs|Row 0 is the MIN y row, so there is no flip.]]

The texture has `SDF_TEXELS_PER_CELL` texels per cell side, which is 2. The first call makes the texture and bakes all chunks. Later calls bake dirty chunks on the CPU and write them with `Queue::write_texture`. The view stays the same after the first call. `Terrain::sdf_texels` gives the same data as `SdfTexels` on the CPU, without clearing any dirty state.

```rust
let (view, rect) = terrain.sdf_texture(&device, &queue);
// WGSL: let d = textureSample(sdf, samp, (p - rect.xy) / rect.zw).r;
```

The fluid kit uses a different rect form. See [[fluid-ocean#Rect conventions|rect conventions]].

## Drawing

The game draws. There are two supported routes.[[src:warp_sdk/src/world/terrain.rs|The game draws.]]

- **Mesh.** `Terrain::chunk_mesh` returns a `ChunkMesh` of counter-clockwise triangles with a material id per vertex, plus the outline segments. This route suits flat colour or an outline pass.
- **Lit quad.** For [[lit2d]], submit one quad per chunk at `Terrain::chunk_rect`. Its material reads the SDF texture and calls `terrain_material_side` from `terrain/shade.wgsl` with the id from `Terrain::material_at`. See [[shader-terrain]].

The `world` example uses neither route. It draws a rect for each cell with four solid corners, and it draws `Terrain::surface_segments` as lines over them.

## Limitations

- `Terrain::dig` does not protect bedrock. The `world` example checks `Terrain::material_at` first, and it digs only when the point is not mat::BEDROCK.[[src:warp_sdk/examples/world.rs|if self.world.material_at(p) != mat::BEDROCK]]
- A dig leaves node materials as they were, so `Terrain::material_at` still gives the old id in open water. `Terrain::fill` sets a new id only on a node that crosses from open to solid.
- The distance is exact only within `SDF_REACH_CELLS` cells of the surface.
- `Terrain::sdf_texture` bakes on the CPU, and each texel of a dirty chunk costs one `sdf` query.

## History

Commit `4e564d42` added the module on 2026-10-29. Its stated aim was terrain that explores like 2D Terraria terrain. The commit message also records the `sdf` reach bug and its regression test.
