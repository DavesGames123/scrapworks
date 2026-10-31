---
title: Assets
short: the asset root, path joins and the atlas loader
category: Engine
order: 26
module: assets
see: image, manifest, boot
---
**Assets** is the module of `warp_core`, re-exported by `warp_sdk`, that resolves the asset root directory and joins paths under it. It lets an application run from any working directory or distribution layout. All code that uses an asset calls `asset_path` and does not build a path by hand.[[src:warp_core/src/panels/assets/mod.rs|Centralizes asset path resolution]] The module holds no asset names: which directories exist is application data that arrives through the [[image|atlas set descriptor]].

## Usage

```rust
let p = asset_path("resources/iron_ore");
// → "{asset_root}/resources/iron_ore"
```

`warp_sdk` states the rule in the doc comment of the re-export: never join a path onto the root by hand.[[src:warp_sdk/src/lib.rs|Never join a path onto the root by hand; call `asset_path`.]]

## Resolution order

`asset_root` checks four candidates in order, then falls back. Each candidate must exist on disk, or the search continues. The result is cached on the first call and does not change for the life of the process.[[src:warp_core/src/panels/assets/mod.rs|Resolve the asset root directory. Cached after first call.]]

| Step | Candidate | Layout |
| --- | --- | --- |
| 1 | The STELLA_NOVA_ASSETS environment variable | Custom or distribution override |
| 2 | `src/assets/` relative to the working directory | Development, `cargo run` from the repository root |
| 3 | `assets/` beside the executable | Windows and Linux distributions |
| 4 | `Resources/assets` under the grandparent of the executable | A macOS `.app` bundle |
| 5 | `src/assets/`, unchecked | Fallback when nothing exists |

The module prints the chosen root and the step that found it.

The environment variable name is fixed in the source of this function. The [[manifest]] format also has `env_prefix` and `resolution_order` fields, which the editor and `warp_manifest_check` read, but `asset_root` does not read them.[[src:warp_core/src/panels/assets/mod.rs|std::env::var("STELLA_NOVA_ASSETS")]]

## The loader

The `loader` submodule loads atlases from the descriptor. `MegaAtlasSet` holds the loaded mega-atlases, one per slot, always `MAX_ATLAS_SLOTS` long.[[src:warp_core/src/panels/assets/loader.rs|pub struct MegaAtlasSet]] Its list is private, so each reader goes through `MegaAtlasSet::get` or `MegaAtlasSet::mapping` and gets the clamp on the slot number.

`load_ship_atlas` loads the primary single-directory atlas that the application declared. `ship_image_names` returns the sorted filename stems of that atlas directory, and an empty list when nothing is declared or the directory is missing. The names are leaked to `&'static str`.

## Interaction with other kits

Each path in the [[manifest]] is relative to the asset root. The [[image]] cache writes under this root, and pak files sit in `packed` below it.
