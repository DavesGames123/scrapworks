---
title: App manifest
short: warp_app.toml, the file that states what a project is and how it looks
category: Engine
order: 27
module: manifest
see: project-settings, image, assets, display-mode, boot, building-a-game
---
**The app manifest** is `warp_app.toml`, the UTF-8 TOML file through which a hosted application tells the engine its identity, window, assets, atlases and build targets. The `manifest` module of `warp_core`, re-exported by `warp_sdk`, parses and validates the file. The format is the boundary between the engine and one application, so the engine carries no application name of its own.[[src:warp_core/docs/app_manifest.md|The manifest is the boundary between the engine and one hosted application.]] The manifest does not replace `Cargo.toml`: it records targets and feature sets and compiles nothing.

:: The format specification is `warp_core/docs/app_manifest.md`, format version 1.

## Consumers

The manifest has several readers, and not all fields reach the engine at run time.

- `run` calls a boot step that discovers the file, reads it through `Manifest::read_model`, installs the `settings` table, and sets the frame cap from `window.frame_cap_hz`.[[src:warp_core/src/lib.rs|set_frame_cap_hz(m.window.frame_cap_hz);]]
- The editor reads and writes the whole file.
- `warp_manifest_check` validates a file and exits with 0 or 1, so a build script can gate on it.

```bash
cargo run --bin warp_manifest_check              # discovered manifest
cargo run --bin warp_manifest_check ../my-game   # a project directory
cargo run --bin warp_manifest_check other.toml   # an explicit file
```

Through this path, `run` takes only `settings` and `window.frame_cap_hz`. Other fields have narrower readers. See [[#Limitations|Limitations]].

## Discovery

`Manifest::discover` looks in three places on native targets:[[src:warp_core/src/manifest/load.rs|Find the manifest. WARP_APP_MANIFEST first, then the directory that]]

1. The path in `MANIFEST_ENV_VAR`, which is WARP_APP_MANIFEST. The variable may name a directory.
2. `warp_app.toml` beside the executable.
3. `warp_app.toml` in the working directory, then in each parent.

The variable name is owned by the engine and carries no application name.

`resolve` turns a directory into the manifest path inside it, and returns anything else unchanged. A project is named by its directory because the file name is a constant. `resolve` does not walk upward and does not check that the result exists. Searching was removed from the startup of the editor on purpose, because a project found by walking is a project nobody chose.[[src:warp_core/src/manifest/load.rs|because a project found by walking is a project nobody chose]]

The browser has no file system. There, the host crate embeds the file with `include_str!` and passes the string to the parser.

## Loading

| Function | Behaviour |
| --- | --- |
| `Manifest::parse` | Parse, check the version, then run every rule. A broken rule is an error. |
| `Manifest::load` | Read a file, then parse. Native only. |
| `Manifest::read_model` | Parse and check the version, but accept a file that breaks rules. |
| `Manifest::problems` | Every rule violation, not only the first. |

`read_model` exists because the editor must draw the fields of a file that someone is part way through fixing. If it could not, the section with the mistake would disappear and take the only control that could correct it.[[src:warp_core/src/manifest/load.rs|The read model of text that parses, whatever rules it breaks.]]

`ManifestError` separates four failures: a read failure, a syntax failure, an unsupported version, and broken rules. Only the last carries a list. Every struct is `deny_unknown_fields`, so an undeclared key fails to parse.

A minimal valid file, from the test suite of the module:[[src:warp_core/src/manifest/tests.rs|const MINIMAL: &str = r#"]]

```toml
manifest_version = 1
[app]
id = "demo_app"
name = "Demo App"
[window]
size = [800, 600]
[build]
package = "demo-app"
bin = "demo-app"
```

Absence means the default throughout the format.

## Top level and identity

`manifest_version` is required and must equal `SUPPORTED_VERSION`, which is 1.

`[app]`:

| Field | Required | Default | Use |
| --- | --- | --- | --- |
| `id` | yes | | Lowercase ASCII letters, digits and underscore. The environment prefix derives from it. |
| `name` | yes | | Human name and default window title. |
| `version` | no | none | Version text, copied by hand from the Cargo package. |

## Window

`[window]`:

| Field | Required | Default | Use |
| --- | --- | --- | --- |
| `title` | no | `app.name` | Window title |
| `mode` | no | `"windowed"` | `"windowed"` or `"fullscreen"` |
| `size` | when windowed | | Width and height in physical pixels |
| `monitor_fraction_max` | no | `0.70` | Largest share of the monitor |
| `center_on_primary_monitor` | no | `true` | Centre the window |
| `frame_cap_hz` | no | `60.0` | The CPU-side frame gate, native only |

The manifest states the default, and saved user preferences win at run time. For run-time changes, see [[display-mode]].

`[web]` is required when a target names a `wasm32` triple. `canvas_id` is required and is the DOM id of the canvas. `fallback_size` defaults to `[1280, 720]`, and `asset_base_url` defaults to `"assets"`.

## Assets

`[assets]`:

| Field | Default | Meaning |
| --- | --- | --- |
| `env_prefix` | `app.id` uppercased | Prefix for `_ASSETS`, `_PREFER_PAK` and `_NO_CACHE` |
| `resolution_order` | `["env", "dev", "exe", "bundle"]` | Candidate order |
| `dev_root` | `"src/assets"` | The dev candidate, relative to the working directory |
| `exe_root` | `"assets"` | The exe candidate, relative to the executable |
| `bundle_root` | `"Resources/assets"` | The bundle candidate |
| `pak_dir` | `"packed"` | Directory of pak files |

`Manifest::env_prefix` and `Manifest::env_var` derive the names. `env_var("ASSETS")` gives DEMO_APP_ASSETS for the sample above. Application code calls `asset_path` and does not join paths itself. See [[assets]].

## Atlases

Each `atlas` array table is one mega-atlas, and it maps field for field onto `AtlasDesc`. See [[image]].

| Field | Required | Default | Use |
| --- | --- | --- | --- |
| `id` | yes | | Engine name and lookup key |
| `index` | yes | | Slot number |
| `resolution` | no | `256` | Square layer size |
| `source` | no | `"groups"` | `"groups"` or `"placeholder"` |
| `pak_name` | no | `id` | Base name of the pak file |
| `dir` | no | none | Directory for an atlas with no groups |
| `manifest` | no | none | Side-car index, relative to the asset root |

Each `atlas.group` table is one texture family, with required `name`, `base_id`, `paths` and `max_variants`, and with `normals` and `masks` that default to true. A family with two variant caps splits into two groups. `Manifest::atlas`, `Manifest::atlas_by_index` and `Manifest::group` look these up.

An `image_atlas` table declares a single-directory atlas with required `id` and `dir`. `normals` and `masks` default to true, `pak_name` defaults to `id`, `pack_resolution` defaults to 1024, and `pack_max_textures` defaults to 256.

### Pak names

The `pak_name` field exists because shipped trees hold `structural.pak` and `assets.pak` for the atlases that the engine calls `structures` and `environment`. Both the native loader and the browser fetch ask for `pak_name`. The browser stores the bytes under the atlas id, and it looks them up by that id.[[src:warp_core/src/image/mega_atlas.rs|The desktop tree ships each pak under the name `pak_name`]] An atlas that stays without textures while the others load points first to this field.

## Runtime environment

A `runtime_env` table names an environment variable to set before device creation, with required `name` and `value`, and with optional `os` and `reason`. The format exists for platform knowledge: on Linux, the specification records `WGPU_BACKEND=vulkan`, because DX12 through vkd3d-proton renders a blank frame on AMD integrated GPUs.[[src:warp_core/docs/app_manifest.md|vkd3d-proton renders a blank frame on AMD integrated GPUs]]

## Build

`[build]` requires `package` and `bin`.

A `build.feature` table declares a Cargo feature, with `name`, `default`, `requires` and `description`. The known capabilities are `filesystem`, `threads` and `c_toolchain`.

A `build.target` table declares a target.

| Field | Default | Use |
| --- | --- | --- |
| `id` | required | Target name |
| `triple` | host | Rust target triple |
| `profile` | `"release"` | Cargo profile |
| `default_features` | `true` | `false` emits `--no-default-features` |
| `features` | empty | Extra features |
| `capabilities` | empty | What the platform provides |
| `command` | none | A program that builds the target in place of cargo |
| `args` | empty | Arguments for `command` |
| `toolbar` | none | Label of a launch button on the editor strip |
| `toolbar_icon` | `"launch"` | `launch` or `launch-debug` |
| `entry`, `out_dir`, `bindgen_target` | none | Entry point, output directory, wasm-bindgen target |

A target with no `command` is a cargo target, and `Manifest::cargo_args` builds its argv. A target with `command` is a command target. `Manifest::invocation` gives the program and arguments for either kind, as an `Invocation`, so a caller needs no branch.

The capability lists are the important part. They turn an unstated reason, such as a feature that cannot run in a browser, into a conflict that the loader reports by name.

### Platform tables

`[build.macos]`, `[build.windows]`, `[build.linux]` and `[build.android]` say how to ship, where a target says how to compile. Each field has a default, so a project with none of these tables still builds.

| Table | Field | Default |
| --- | --- | --- |
| `macos` | `artifact` | `"Warp"` |
| | `out_dir` | `"dist/macos"` |
| | `universal` | `true` |
| | `deployment_target` | `"10.15"` |
| | `sign` | `true` |
| | `identity` | `"-"` (ad-hoc) |
| `windows` | `artifact` | `"warp.exe"` |
| | `out_dir` | `"dist/windows"` |
| | `static_crt` | `true` |
| | `toolchain` | `"xwin"` |
| `linux` | `artifact` | `"warp"` |
| | `out_dir` | `"dist/linux"` |
| | `route` | `"zigbuild"` |
| | `glibc` | `"2.28"` |
| | `format` | `"tar.gz"` |
| `android` | `out_dir` | `"dist/android"` |
| | `package` | derived |
| | `label` | `app.name` |
| | `renderer` | `"Game"` |
| | `min_sdk` | 23 |
| | `target_sdk` | 35 |
| | `abis` | `["arm64-v8a"]` |
| | `orientation` | `"landscape"` |
| | `keystore`, `key_alias` | empty |

Each table also has `target`, which names the `build.target` that compiles it. An empty Android `package` derives `com.warp.<app.id>.android`.

`zigbuild` is the Linux default because the dependency graph no longer asks for distribution development packages.[[src:warp_core/src/manifest/format.rs|`zigbuild` is the default because the graph no longer asks for a]]

No secret is a field of any table. `keystore` is a path and `key_alias` is a name, and passwords resolve at build time. Because of `deny_unknown_fields`, a project that writes `keystore_password` fails to parse and does not commit the secret.

## Settings

The manifest declares one free table, `settings`, and learns no section name.[[src:warp_core/src/manifest/format.rs|pub settings: toml::Table,]] Every other section says what the project is, and a build reads it. `[settings.*]` says how the project looks, and a frame reads it.

```toml
[settings.display]
pp_enabled  = true     # exposure, bloom, colour
dof_enabled = true     # depth of field
```

:: Main article: [[project-settings]]

## Validation rules

`Manifest::problems` reports all of these:

- `manifest_version` equals 1. This check runs before the others.
- `app.id` is non-empty and uses the allowed characters, and `app.name` is non-empty.
- `window.size` is present and non-zero when the mode is windowed.
- `monitor_fraction_max` is in the range above 0 up to 1, and `frame_cap_hz` is above zero.
- `[web]` is present, with a non-empty `canvas_id`, when a target names a `wasm32` triple.
- Atlas indices are unique and fill 0 through n-1, within `MAX_ATLAS_SLOTS`.
- Atlas ids are present and unique.
- Each groups atlas has a group, each group has paths, and `max_variants` is not 0.
- Group type id ranges do not overlap in one atlas.
- The worst-case layer count stays within `MAX_MEGA_ATLAS_LAYERS`.
- Target ids are unique, each feature name has a `build.feature` table, and capabilities are known.
- Each capability that an enabled feature requires is in the capability list of the target.
- `args` has a `command`, and `command` is not empty.
- A `toolbar` label is non-empty and unique, and `toolbar_icon` names a value in `TOOLBAR_ICONS` and has a `toolbar` beside it.

The atlas limits are engine limits. The module reads them directly from `image` and does not copy them.

## Limitations

The specification leaves open the moment of consumption: a read at run time, an embed, or generated code. Three consumers need the atlas taxonomy at different moments, and only part of the file has a run-time reader so far. `asset_root` reads a fixed environment variable and its own candidate list, not `env_prefix` or `resolution_order`. No engine code outside the manifest module and the editor reads `monitor_fraction_max` or `center_on_primary_monitor`.[[src:warp_core/src/panels/assets/mod.rs|std::env::var("STELLA_NOVA_ASSETS")]]

Localization, audio, save files, Steam packaging and the simulation rate are out of scope for version 1. The application shader and input binding exclusions in the specification are older than the [[render]] layer registry and the [[bindings]] table.

## History

The specification file dates from 2026-07-31, the commit that split the engine out of the game.
