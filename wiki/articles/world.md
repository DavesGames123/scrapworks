---
title: World kit
short: terrain as a surface field, with collision, biomes, and reveal
category: World and simulation
order: 10
module: world
example: world
see: world-terrain, world-collide, world-biome, world-reveal, fluid, procgen
---
**World kit** is the family of Warp SDK modules that models a playable place as a surface field, with terrain, collision, biomes, and exploration state. It lives in `warp_sdk::world`, which holds no code of its own and only declares four submodules. Each submodule has one owner, and games use the full path, for example `warp_sdk::world::biome`.[[src:warp_sdk/src/world/mod.rs|Each submodule has one owner]]

## Submodules

| Module | Article | What it holds |
|---|---|---|
| `world::terrain` | [[world-terrain]] | A chunked density field that the player can dig, with an exact surface and signed distance |
| `world::collide` | [[world-collide]] | Rays, sweeps and a circle body against any signed distance field |
| `world::biome` | [[world-biome]] | Places defined by rewards, costs, drag and light before looks |
| `world::reveal` | [[world-reveal]] | A grid of what the player has seen, and what the player sees now |

## Design

The common idea is that one signed distance function answers every spatial question. `Terrain::sdf` is negative inside solid, and `world::collide` reads only that function, so a closure `Fn(Vec2) -> f32` can stand in for terrain.[[src:warp_sdk/src/world/collide.rs|Every query reads one function]] The same distance reaches the GPU as a texture, where [[fluid-ocean|the Ocean]] uses it for both the water obstacles and the particle floor.

The other two modules are looser. `world::biome` takes a point and knows nothing of terrain. `world::reveal` takes its line of sight through a closure `solid(p) -> bool` that the game gives, so the grid works with any terrain.[[src:warp_sdk/src/world/reveal.rs|so the grid works with any terrain]]

## Usage

This sample from the SDK reference makes a seeded cave world, moves a body through it, and digs.

```rust
use warp_sdk::ultraviolet::Vec2;
use warp_sdk::world::collide::CircleBody;
use warp_sdk::world::terrain::{Terrain, TerrainConfig};

let mut t = Terrain::generate(TerrainConfig::side(7));    // a seeded cave world
let mut body = CircleBody::new(Vec2::new(20.0, 50.0), 0.4);
// Each frame:
body.step(&t, Vec2::new(0.0, -9.8), dt);
t.dig(Vec2::new(20.0, 30.0), 2.5);                        // the player digs
for c in t.take_dirty_chunks() { let mesh = t.chunk_mesh(c); /* upload */ }
```

The `world` example is a full game built on this loop. A circle body falls and slides on the rock, the left mouse button digs a disc, and the right button fills one.[[src:warp_sdk/examples/world.rs|digs a disc, the right button fills one]] Run it with this command.

```bash
cargo run -p warp_sdk --example world
```

## Interaction with other kits

[[fluid|The fluid kit]] takes a `Terrain` by value through `Ocean::with_terrain`. [[lit2d]] can draw a chunk with one quad and a material that reads the terrain SDF, and [[shader-terrain]] holds the WGSL for that material and for the fog of war. [[procgen]] is separate. It places props through closures and does not depend on these modules, although a game often uses both from one seed.

## History

`world::terrain` and `world::collide` landed in commit `4e564d42`, and `world::biome` and `world::reveal` in commit `ccc8f737`, both dated 2026-10-29. An earlier commit that day, `3258f8c5`, registered the module names as placeholders.
