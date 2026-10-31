---
title: Reveal grid
short: fog of war state with line of sight, save data, minimap, and GPU textures
category: World and simulation
order: 14
module: world::reveal
see: world, world-terrain, shader-terrain, hud-minimap, world-biome
---
**Reveal grid** is the Warp SDK structure that records what the player has seen and what the player sees now. It is the type `RevealGrid` in `warp_sdk::world::reveal`, and it drives fog of war, a minimap, and cut-away rock. The grid covers a world rectangle with square cells, and each cell keeps two soft values from 0 to 1.[[src:warp_sdk/src/world/reveal.rs|keeps two soft values, 0..1]]

## Overview

The two values have different lives. `explored` means seen at any time, and it goes into the save file. `visible` means seen in this frame, and it is never saved. Each is one byte per cell, in row-major order with row 0 at `origin.y`.

A `Source` reveals the cells in its radius that it has line of sight to. Line of sight goes through a closure `solid(p) -> bool` that the game gives, so the grid works with any terrain. A game with a [[world-terrain|Terrain]] passes `|p| terrain.is_solid(p)`, or a function of its own.

## Usage

This sample is the module doc test. Call `RevealGrid::begin_frame` once per frame before the reveal calls.

```rust
use warp_sdk::world::reveal::{RevealGrid, Source};
use warp_sdk::ultraviolet::Vec2;

let mut grid = RevealGrid::new(Vec2::new(0.0, 0.0), 1.0, 64, 64);
let wall = |p: Vec2| p.x > 40.0;
// once per frame:
grid.begin_frame();
grid.reveal(&Source::light(Vec2::new(32.0, 32.0), 12.0), wall);
assert!(grid.visible_at(Vec2::new(33.0, 32.0)) > 0.9);
assert!(grid.explored_at(Vec2::new(60.0, 32.0)) == 0.0);
let save: Vec<u8> = grid.to_bytes();
let back = RevealGrid::from_bytes(&save).unwrap();
```

## Sources

`Source::light` makes a source of kind SourceKind::Light, which sets `visible` and `explored`. `Source::sonar` makes a SourceKind::Sonar source, which sets `explored` only: the player learns the shape, not the present.[[src:warp_sdk/src/world/reveal.rs|The player learns the shape, not the present.]]

| Field | Default | Meaning |
|---|---|---|
| `eye` | given | The position of the source |
| `radius` | given | The reach, in world units |
| `feather` | a quarter of the radius | The width of the soft edge, inside `radius` |
| `skin` | 0 | How deep into solid cells the source sees |

`Source::feather` clamps its value to the radius, and `Source::skin` clamps below at 0.

## How it works

`RevealGrid::reveal` visits each cell whose centre is inside the radius. The value of a cell is the product of a reach term and a line of sight term, stored as a byte. Values only go up, so several sources in one frame keep the brightest value.[[src:warp_sdk/src/world/reveal.rs|several sources in one frame keep the brightest value]]

The reach term is 1 inside `radius - feather` and falls with a smoothstep to 0 at the radius. The line of sight term marches from the eye to the cell centre in half-cell steps and adds up the solid length on the way. The target cell does not count, so a rock face is seen.[[src:warp_sdk/src/world/reveal.rs|The target cell does not count, so a rock face is seen.]] The term is 1 with no solid and falls to 0 between `skin` and `skin` plus one step of solid length. With the default skin of 0, one solid sample on the way hides the cell.

The doc comment gives the cost as one `solid` call per half cell along each ray, for each cell in the radius, or about 25,000 calls at a radius of 20 cells.[[src:warp_sdk/src/world/reveal.rs|A radius of 20 cells is about 25 000 calls.]]

`RevealGrid::revision` changes each time the grid changes. A game can use it to skip work, and `RevealGpu` uses it to skip uploads. `RevealGrid::clear` resets both values for a new map.

`RevealGrid::explored_at` and `RevealGrid::visible_at` read bilinearly between cell centres. A sample outside the grid reads 0. `RevealGrid::cell` gives the raw pair of a cell, and `RevealGrid::cell_of` maps a point to a cell or `None`.

## How hidden rock must look

The module header sets a rule for the look. Hidden rock reads as unknown, never as broken geometry. A player who sees rock with holes, rock that pops in by cells, or rock drawn at low alpha reads a bug, not a secret.[[src:warp_sdk/src/world/reveal.rs|Hidden rock reads as UNKNOWN, never as broken geometry.]] The header gives four steps.

1. Draw all rock always. Do not discard or skip the fragments of hidden rock. Change only its colour.
2. Colour hidden rock with `terrain_cutaway` from `shaderlib/terrain/reveal.wgsl`: a flat ink fill, sparse hatching, and an edge line where the view stops. The surface line of the rock stays.
3. Colour open space with `terrain_fog_of_war`: fog where never explored, and a grey memory where explored but not visible now.
4. Sample the grid textures with a linear sampler. The cell values are already soft, so a linear sampler gives a smooth edge, not cell steps.

## GPU

`RevealGpu` holds two `R8Unorm` textures, `explored` and `visible`, sized like the grid. Call `RevealGpu::new` once, and call `RevealGpu::upload` each frame after the reveal calls. The upload writes only when the grid changed since the last upload, and it returns true when it wrote.[[src:warp_sdk/src/world/reveal.rs|It writes only when the grid changed.]] A grid of a different size is not written. Make a new `RevealGpu` for it.

`RevealGrid::uv_rect` gives `[x, y, 1/width, 1/height]`. The fragment shader combines the pieces as follows.

```wgsl
let uv = (world_p - reveal_rect.xy) * reveal_rect.zw;
let seen = textureSample(explored_tex, linear_samp, uv).r;
let now = textureSample(visible_tex, linear_samp, uv).r;
var c = terrain_fog_of_war(lit_colour, now, seen, fog_colour);
c = terrain_cutaway(c, world_p, rock_sd, max(now, seen), 0.1, ink, edge);
```

`rock_sd` comes from the terrain SDF. See [[shader-terrain]] for the shader file.

## Minimap

`RevealGrid::minimap_rgba` gives one RGBA pixel per cell, row 0 first. Each pixel mixes the `unknown`, `remembered` and `seen` colours by the cell values. Give the result to `egui::ColorImage::from_rgba_unmultiplied`.[[src:warp_sdk/src/world/reveal.rs|from_rgba_unmultiplied]]

## Save format

`RevealGrid::to_bytes` writes a 24-byte header and a run-length body, so a large dark map is small. `visible` is not saved, because it is for one frame only.[[src:warp_sdk/src/world/reveal.rs|is not saved: it is for one frame only.]]

| Offset | Size | Content |
|---|---|---|
| 0 | 4 | The tag `"WRV1"` |
| 4 | 4 | Width in cells, little-endian u32 |
| 8 | 4 | Height in cells, little-endian u32 |
| 12 | 8 | Origin x and y, little-endian f32 |
| 20 | 4 | Cell size, little-endian f32 |
| 24 | rest | Pairs of run length (1 to 255) and value |

`RevealGrid::from_bytes` returns a `RevealError`: RevealError::BadMagic for a wrong tag, RevealError::BadLength for data that stops early or runs long, and RevealError::BadHeader for a size of 0, a cell size that is not positive, or an origin that is not finite. A loaded grid has `visible` clear.

## Limitations

- The cost of `RevealGrid::reveal` grows with the source area and the ray length, and all of it runs on the CPU.
- `RevealGrid::begin_frame` is the only call that clears `visible`. A game that skips it keeps the old values.
- `RevealGpu` has no resize. A new grid size needs a new value.

## History

Commit `ccc8f737` added the module on 2026-10-29, together with `world::biome`.
