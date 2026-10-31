---
title: Image atlases
short: mega-atlases, the atlas set descriptor, the disk cache and pak files
category: Engine
order: 25
module: image, image::cache, image::pak
see: assets, manifest, render, scene, gpu, renderer
---
**Image atlases** are the texture arrays from which Warp draws sprites, and the `image` module of `warp_core`, re-exported by `warp_sdk`, manages them. It holds two atlas kinds, the descriptor through which an application declares them, a disk cache of processed layers, and the packed file format of distribution builds. Which atlases exist and which directories fill them is application data, not engine data.

## Design

A `MegaAtlas` holds many texture families in one array texture, addressed by a type id and a variant through a `TextureMapping`. An `ImageAtlas` holds one directory.[[src:warp_core/src/image/mod.rs|Two atlas kinds live here.]]

The engine once carried the asset taxonomy of Stella Nova in source, as a slot enum and const arrays. The application now builds an `AtlasSetDescriptor` and registers it before the engine creates a device, and every consumer reads that descriptor.[[src:warp_core/src/image/atlas_set.rs|The engine used to carry the Stella Nova asset taxonomy in source]] The descriptor is the in-memory form of the `atlas` and `image_atlas` sections of the [[manifest]], and its field names match them.

Each atlas owns a slot number. The slot is the index of its instance buffer, bind group and texture mapping, so each step in the frame path is a plain `usize`. The render path allocates `MAX_ATLAS_SLOTS` slots, which is 4, and a slot that the application did not declare holds a placeholder.

## The atlas set

An application declares the set in three levels.

| Type | Declares |
| --- | --- |
| `AtlasSetDescriptor` | The whole set |
| `AtlasDesc` | One mega-atlas: id, slot, resolution, source and groups |
| `AtlasGroupDesc` | One texture family, with one `MegaAtlasEntry` per path |
| `ImageAtlasDesc` | One single-directory atlas |

In a group, the entry at position `i` gets `type_id = base_id + i`. Each directory holds `albedo/`, and `normal/` and `mask/` when those flags are set.

`AtlasDesc::groups` starts an atlas at resolution 256. `AtlasDesc::placeholder` builds a 1×1 layer and ignores the groups, so that the render path can bind something while real textures arrive by another route. `AtlasSource` records which of the two applies. `AtlasDesc::tiling` marks all layers as tiles, and that one flag changes two things: the sampler repeats, and the mip chain is reduced over the torus. Repeat addressing over a clamped mip chain tiles at mip zero and seams at each lower level. The flag is per atlas because a sampler belongs to a set.[[src:warp_core/src/image/atlas_set.rs|Every layer of this atlas is a TILE, not a sprite.]]

`AtlasDesc` has these fields, each with a matching `with_` builder where one applies:

| Field | Meaning |
| --- | --- |
| `id` | The engine name of the atlas |
| `index` | Slot number, and the array index in the render path |
| `resolution` | Square layer size; source images scale to it |
| `source` | Groups or placeholder |
| `pak_name` | Base name in the shipped tree, not always `id` |
| `dir` | Directory for an atlas with no groups |
| `manifest` | Side-car index, relative to the asset root |
| `groups` | Texture families, in type id order |
| `tiling` | Every layer is a tile |

`ImageAtlasDesc` has its own `id` and directory, `with_normals` and `with_masks`, `with_pak_name`, and `with_pack_size` for the sizes that the packer writes.

`AtlasSetDescriptor` provides the lookups. `AtlasSetDescriptor::atlas` is a list index by slot, `AtlasSetDescriptor::atlas_by_id` and `AtlasSetDescriptor::slot_of` search by id, and `AtlasGroupDesc::type_id_range` and `AtlasGroupDesc::worst_case_layers` report one group.

### Registration

`register_atlas_set` validates the set, sorts it by slot, and stores it. The first call wins. `atlas_set` returns the registered set, or an empty one. All problems are reported together, so a wrong descriptor takes one run to fix.[[src:warp_core/src/image/atlas_set.rs|Returns every problem found, so a wrong descriptor needs one run to fix]]

```rust
use warp_sdk::image::{register_atlas_set, AtlasDesc, AtlasGroupDesc, AtlasSetDescriptor};

let set = AtlasSetDescriptor::new().with_atlas(
    AtlasDesc::groups("a", 0)
        .with_group(AtlasGroupDesc::new("g", 10, 4, &["x", "y", "z"])),
);
register_atlas_set(set).expect("a valid atlas set");
```

### Validation

The validator rejects:

- more atlases than `MAX_ATLAS_SLOTS`, and slot indices that are not 0 through n-1
- two atlases with one slot or one id, or an empty id
- a resolution of 0
- a groups atlas with no groups, a group with no paths, or a variant cap of 0
- two groups whose type id ranges overlap
- an atlas above the layer budget
- an image atlas with an empty id, an empty directory, or a repeated id

`MAX_MEGA_ATLAS_LAYERS` is 512. The worst-case layer count of an atlas is the sum over its groups of `max_variants` times the path count. Validation fails and does not truncate.[[src:warp_core/src/image/atlas_set.rs|Validation fails; it does not truncate.]]

## Loading and addressing

`MegaAtlas::load_multi` loads the entries into one array. It computes a fingerprint from source file metadata and uses the disk cache on a hit. On a miss, it runs the full decode and resize. Progress goes to the `LoadEvent` queue in [[gpu#Load events|gpu]].

`TextureMapping` turns a type id and variant into a layer index. `TextureMapping::get_index` returns 0 for an unknown type and wraps an out-of-range variant, so any variant is safe to hold.[[src:warp_core/src/image/mapping.rs|Returns 0 if type not found, wraps variant if out of range.]]

`ImageAtlas` carries a source comment that calls it a legacy API preserved for compatibility. `ImageInstance` is the vertex data of one sprite: position, size, rotation, texture index, tint, flags and depth.

## Flags

The `flags` word of an instance selects shader behaviour.

| Flag | Bit value | Effect |
| --- | --- | --- |
| `IMAGE_FLAG_USE_MASK` | 1 | Use the mask map |
| `IMAGE_FLAG_USE_NORMALS` | 2 | Use the normal map |
| `IMAGE_FLAG_USE_LIGHTING` | 4 | Apply lighting |
| `IMAGE_FLAG_UV_CROP` | 8 | Crop UVs to remove edge padding |
| `IMAGE_FLAG_OVERLAY_TINT` | 16 | Overlay blend for the tint, in place of multiply |
| `IMAGE_FLAG_RECEIVE_SHADOW` | 32 | Darken by the shadow coverage buffer |
| `IMAGE_FLAG_ENV_REFLECT` | 64 | Take the matcap reflection |
| `IMAGE_FLAG_CONSTRUCT` | 128 | Draw as a module under construction |

Higher bits hold packed fields. `construct` and `construct_quiet` build the flag bits of a construction draw, from a progress clamped to 0 to 1 and a start edge, and `construct_of` reads them back.[[src:warp_core/src/image/flags.rs|The flag bits for a construction draw]] `tiles`, `research` and `forge` follow the same pattern with their `_of` readers.

## The disk cache

`image::cache` saves the result of PNG decode and Lanczos3 resize to a binary file, so that later launches skip that work. Each atlas gets a file under `.cache/` in the asset root. The fingerprint covers the target resolution, the texture count, and the path, size and modification time of each source texture.

Companion textures are not tracked individually. If only a normal or mask file changes, the `.cache/` directory must be deleted by hand.[[src:warp_core/src/image/cache.rs|Companion textures (normals, masks) are NOT individually tracked.]] A failed save does not propagate, and the next launch regenerates the data. `image::cache::is_enabled` returns false when STELLA_NOVA_NO_CACHE is set.

## Pak files

`image::pak` replaces raw PNG directories with one binary file per atlas in a distribution build. At run time, the loaders try a pak when the raw `albedo` directory is absent, or when a pak is preferred. Release builds always prefer the pak, because a distribution can ship loose albedo and mask directories that would otherwise replace the complete packed materials. Debug builds keep the raw PNGs for art iteration, unless STELLA_NOVA_PREFER_PAK is set.[[src:warp_core/src/image/mega_atlas.rs|Release builds always prefer the pak when one exists.]]

A pak has a 40-byte header with the magic SNPAK001, a manifest of `PakManifestEntry` rows in clear text, and a payload of albedo, normal, mask, metallic, roughness and emission for each layer. The payload is XORed with a 256-byte rotating key compiled into the binary. The source states that this is not cryptographic: it stops casual browsing and tools that scan for image headers, and a debugger defeats it in minutes.[[src:warp_core/src/image/pak.rs|This is NOT cryptographic security.]]

`write_pak`, `build_pak_from_entries` and `build_pak_from_directory` create paks in the `pack_assets` tool. `try_load_pak` reads one and returns a `PakLoadResult`. `read_pak_stem_names` returns the stem names and skips the payload. On wasm32 there is no file system, so the fetch task stores the bytes in `PAK_STORE` and `try_load_pak` reads them there.

## Limitations

The slot count is fixed by the NUM_MEGA_ATLASES constant, which sets the length of the render path arrays. The name mismatch between pak names on native and browser paths is described in [[manifest#Pak names]].
