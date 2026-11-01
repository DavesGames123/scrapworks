---
title: Shader library
short: WGSL building blocks that a game composes into its own shaders
category: Shader library
order: 10
module: shaderlib, shaderlib::core, shaderlib::creature, shaderlib::material, shaderlib::noise, shaderlib::organic, shaderlib::pattern, shaderlib::post, shaderlib::sdf, shaderlib::terrain, shaderlib::water
example: lit2d
see: lit2d, shader-noise, shader-material, shader-sdf, post, renderer
demo: shaderplay
---
**Shader library** is the collection of WGSL function files that a SCRAP game composes into its own shaders. It lives in the module `warp_sdk::shaderlib`, with one `.wgsl` file for each block under `warp_sdk/shaderlib/`, embedded at compile time and validated by `cargo test`. A game names the files it wants, receives one WGSL string, and appends its own entry points. The library holds functions and structs only. It holds no pipelines, no bind groups and no entry points.


{{demo:shaderplay}}

## Design

WGSL has no import statement, so the library supplies one by convention. Each file states its dependencies in a comment, and the `compose` function concatenates the files in dependency order.[[src:warp_sdk/src/shaderlib/mod.rs|pub fn compose(paths: &[&str]) -> String]] The Rust side knows nothing about the WGSL it carries beyond those comments.

No file in the library declares anything at module scope except `fn` and `struct`. There is no `@group` binding, no `var<uniform>`, no `override` and no module `const`. A function therefore receives everything through its arguments: time as a `time: f32` parameter, a texture as a `texture_2d<f32>` parameter and a sampler as a `sampler` parameter. As a result, no file expects a uniform layout, and a game is free to keep its own bind groups. The time value and any other animated input are the game's to supply.

The files are grouped into ten categories, each a submodule that holds one `SNIPPETS` slice:

| Category | Module | Article | Contents |
|---|---|---|---|
| core | `shaderlib::core` | this article | The MaterialSample record |
| noise | `shaderlib::noise` | [[shader-noise]] | Hashes, value, gradient, simplex and cellular noise, fBm, curl, warp, dither |
| sdf | `shaderlib::sdf` | [[shader-sdf]] | 2D distance shapes, operators, relief, vector fields, polar maps |
| material | `shaderlib::material` | [[shader-material]] | Procedural surfaces that return MaterialSample |
| water | `shaderlib::water` | [[shader-water]] | Caustics, fog, plumes, flow, refraction, simulation display |
| post | `shaderlib::post` | [[shader-post]] | Bloom, tonemapping, grading, colour science, sampling, beams, fire |
| organic | `shaderlib::organic` | [[shader-organic]] | Corals, plants and growth patterns |
| creature | `shaderlib::creature` | [[shader-creature]] | Layered 2D body plans for sea life and a submersible |
| terrain | `shaderlib::terrain` | [[shader-terrain]] | Caves, heightfields, strata, reveal, map shading |
| pattern | `shaderlib::pattern` | [[shader-pattern]] | Per-pixel line art, tilings and seamless motion |

The file `warp_sdk/shaderlib/CATALOG.md` lists every file on one line, with its function names and tags.

## How compose works

### The Snippet record

A `Snippet` holds a `path` and a `src`, both `&'static str`. The path is relative to `warp_sdk/shaderlib/`, always with a forward slash and the `.wgsl` extension, for example `"noise/hash.wgsl"`.[[src:warp_sdk/src/shaderlib/mod.rs|/// One embedded WGSL file. `path` is relative to `warp_sdk/shaderlib/`.]] Each category module builds its slice with the crate-private `snippet!` macro, which calls `include_str!`. The source text is thus part of the Rust binary, and a game needs no shader files at runtime.

`all()` chains every category slice in category order. `get()` finds one snippet by exact path with a linear search through `all()`.

### Dependency lines

A dependency is one comment line of the form below.

```wgsl
// requires: noise/hash.wgsl
```

`requires` scans every line of a file, not only the header. It trims the line, keeps it only if it starts with `// requires:`, and trims what follows.[[src:warp_sdk/src/shaderlib/mod.rs|src.lines().filter_map(|l| l.trim().strip_prefix("// requires:")).map(str::trim)]] The remainder must be exactly one path. A file with several dependencies has one line for each, and a trailing remark on the same line would become part of the path.

### Resolution

`compose` walks the list depth first. For each path it looks up the snippet, returns at once if the snippet is already in the `seen` list, adds it to `seen`, visits each dependency, and only then writes the file. The result has these properties:

- Each file appears once, however many files require it.
- A dependency appears before the file that requires it.
- The requested files keep their given order, apart from what their dependencies pull forward.
- Each file is preceded by a marker line, `// ---- shaderlib/<path>`, so that a line number in a compiler message can be traced to its source file.
- The `seen` entry is added before the dependencies are visited, so a dependency cycle ends the walk and does not recurse forever.

An unknown path panics with `shaderlib: no snippet at <path>`. The doc comment gives the reason: "a typo fails the game's own boot test and not a GPU pipeline at runtime."[[src:warp_sdk/src/shaderlib/mod.rs|/// game's own boot test and not a GPU pipeline at runtime.]]

### Name prefixes

All files share one WGSL namespace after composition, so the library avoids collisions by naming. Every function starts with its category: `noise_`, `sdf_`, `material_`, `water_`, `post_`, `organic_`, `creature_`, `terrain_` or `pattern_`. The core file also uses `material_`, for `material_default`. Structs carry the prefix in one of two styles, as in SdfProfile and `sdf_FieldCell`. Sub-prefixes follow the file, such as `post_beam_`, `post_fire_`, `water_snow_` and `pattern_grid_`.

The rule is a convention. No test enforces it. A game that appends its own functions should keep clear of these prefixes.

## Validation

The test module in `warp_sdk/src/shaderlib/mod.rs` has three tests, and they run under naga 0.12 with all validation flags on:

| Test | What it checks |
|---|---|
| `every_snippet_composes_and_validates` | Each file, composed alone with its dependencies, parses and validates |
| `every_requirement_resolves` | Every `// requires:` line names an existing snippet |
| `paths_are_unique` | No two snippets share a path, so `get` and `compose` are unambiguous |

The first test is the reason that a dependency line cannot be forgotten: a file that calls another file's function without requiring it fails to validate.[[src:warp_sdk/src/shaderlib/mod.rs|/// Every snippet, composed with its requirements, is valid WGSL.]]

The tests check each file alone. They do not check a game's combination of files, and they check no entry point. A game validates its own shader with naga in a test. The `lit2d` example does this for its material in `the_material_validates`, and `compose_gbuffer_wgsl` exists for that purpose.[[src:warp_sdk/src/lit2d/mod.rs|/// validate a material with naga before it reaches a device.]]

## The MaterialSample record

`core/material.wgsl` defines the one surface record that "every material and every lit2d pass agrees on".[[src:warp_sdk/shaderlib/core/material.wgsl|struct MaterialSample]] A material function returns it, the [[lit2d]] G-buffer stores it, and the lighting pass shades it. The material, organic and creature categories, and the `sdf_relief_material` function, all return this type.

| Field | Type | Meaning | `material_default` |
|---|---|---|---|
| `albedo` | `vec3<f32>` | Linear RGB base colour, 0..1 | 0.5 grey |
| `normal` | `vec3<f32>` | Tangent-space unit normal, +z faces the camera | (0, 0, 1) |
| `height` | `f32` | 0..1, for parallax and contact shadows | 0 |
| `roughness` | `f32` | 0 is a mirror, 1 is chalk | 0.8 |
| `metallic` | `f32` | 0 is dielectric, 1 is metal | 0 |
| `emissive` | `vec3<f32>` | Linear RGB added after lighting, can exceed 1 and so feeds bloom | 0 |
| `alpha` | `f32` | Coverage, 0..1 | 1 |

## Conventions

The categories were written from different sources and do not share every convention. These points hold across the library:

- **Colour** is linear RGB unless a name or comment says sRGB. The colour maps in `post/color_science.wgsl` and the fire ramps in `post/fire.wgsl` return sRGB-encoded values.
- **Normals** use +z toward the camera.
- **Signed distances** are negative inside a shape.
- **Coverage** is 0..1. Pixel size is usually an argument named `px` or `aa`, in the same units as the position.
- **Noise position** is in cells. One unit is about one feature, so a caller scales `p` to set the feature size.
- **Seeds** differ by category. The noise, post, terrain and pattern files take `seed: u32`. The material, organic, creature and water files take a float seed. `noise_hash11` and similar functions hash raw float bits.
- **Private noise** exists in several categories. `material_vnoised`, `organic_vnoise`, `creature_vnoise`, `pattern_vnoise` and `water_vnoise` are separate functions, each with the range its own category documents.
- **Fragment stage only.** Functions that call `fwidth`, `dpdx` or `dpdy` work only in a fragment stage. Those calls appear in code only in `sdf/eval.wgsl` and in the pattern category. Other files take a pixel size as an argument. Texture reads use `textureSampleLevel` or `textureLoad`, so they are legal in any stage.
- **Comment headers.** Each file starts with a header that gives its parameters and output ranges. Many list `grep -n` targets for their main functions.

## Usage

### In a render pass

A game composes the files, appends its own entry points and creates the module. Sample adapted from `API.md`, with a path that exists:

```rust
let mut src = warp_sdk::shaderlib::compose(&["material/rock.wgsl", "post/bloom.wgsl"]);
src.push_str(MY_ENTRY_POINTS);
let module = device.create_shader_module(warp_sdk::wgpu::ShaderModuleDescriptor {
    label: Some("stone"),
    source: warp_sdk::wgpu::ShaderSource::Wgsl(src.into()),
});
```

The string MY_ENTRY_POINTS holds the game's `@vertex` and `@fragment` functions and its bindings. The bind group layout and the pipeline belong to the game, as in any other pass on the [[renderer]].

### In a lit sprite

The [[lit2d]] kit takes a material as one WGSL function, and `Material::with_shaderlib` lists the files it calls.[[src:warp_sdk/src/lit2d/mod.rs|pub fn with_shaderlib(mut self, paths: &[&'static str]) -> Self {]] `compose_gbuffer_wgsl` always includes `core/material.wgsl`, then the listed files, the material function and the G-buffer template.

```rust
let material = lit.add_material(Material::new("lit2d example", MATERIAL).with_shaderlib(&["noise/fbm.wgsl"]));
```

The material function has a fixed signature. The body below calls one library material, using the world position and the instance seed:

```wgsl
fn lit2d_material(uv: vec2<f32>, world: vec2<f32>, inst: Lit2dInstance) -> MaterialSample {
    return material_rock(world, 2.0, 0.6, 0.4, vec3<f32>(1.0), inst.seed);
}
```

## Limitations

- WGSL has no function pointers. Functions that need a scene distance take samples from the caller, as described in [[shader-sdf]].
- WGSL has no recursion. `organic_tree` grows into a fixed array, and several pattern sources were not ported because they need state or recursion.
- The tests use naga 0.12, which accepts `sdf_polygon8`. Newer WGSL parsers read part of that function as a template list. See [[shader-sdf#Limitations|SDF shaders]].

## History

The skeleton, `compose` and the naga validation test were added on 2026-10-29 in commit `46a630b3`. The categories followed on the same day, in the order noise, sdf, post, water, material, organic, creature and terrain. A later commit ported further tables (`sdf/field.wgsl`, `sdf/polar.wgsl`, `post/fire.wgsl` and others), and the pattern category came after it. The last change of that day, `1f02df0c`, added `water/plume.wgsl` and `post/volumetric.wgsl` to correct low-resolution plumes and a rectangular headlamp cone.
