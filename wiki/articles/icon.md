---
title: Application icon
short: An icon drawn in code for the window, the files, and the executable
category: Front end
order: 70
module: icon
example: icon
see: boot, renderer, semiotics, visual
---
**The application icon** kit draws an icon in code, so that no SCRAP application ships without one, in the `warp_sdk::icon` module. `IconSpec::from_name` makes a distinct icon from the application name, and a game that wants its own look sets the fields of an `IconSpec`. One drawing goes to three places: the window, the `.png` and `.ico` files, and the `.exe` file. The renderer runs on the CPU and needs no GPU and no image crate.

## Usage

```rust
use warp_sdk::icon::{self, Glyph, IconSpec, Shape};

fn main() {
    let spec = IconSpec::new()
        .shape(Shape::Squircle)
        .gradient([40, 190, 210], [20, 70, 150])
        .glyph(Glyph::Star { points: 5 })
        .glyph_color([255, 250, 235]);
    icon::set_window_icon(&spec);                     // or IconSpec::from_name("Reef", 0)
    warp_sdk::run::<Game>(warp_sdk::Config { window_title: "Reef", ..Default::default() });
}
```

The starter uses the one-line form, with its game name and seed:

```rust
warp_sdk::icon::set_window_icon(&warp_sdk::icon::IconSpec::from_name(GAME, SEED));
```

## The three places an icon goes

| Place | Call | Result |
|---|---|---|
| Files | `write_set` | `icon_16.png` to `icon_256.png`, and one multi-size `icon.ico` |
| The window | `set_window_icon` | The engine puts the icon on every window it opens |
| The executable | `embed_windows_icon` | The icon goes into the `.exe`, so Explorer shows it |

`SIZES` lists the sizes that `write_set` makes: 16, 24, 32, 48, 64, 128 and 256. Windows uses 16 to 48 in Explorer and on the task bar, and 256 for large tiles. 64 and 128 are for store pages and the dock.[[src:warp_sdk/src/icon.rs|pub const SIZES: [u32; 7] = [16, 24, 32, 48, 64, 128, 256];]]

## IconSpec

`IconSpec::new` gives a squircle with a blue gradient, a white star, a rim light and a shadow.

| Field | Builder | Default | Meaning |
|---|---|---|---|
| `shape` | `shape` | Shape::Squircle | Background shape |
| `top`, `bottom` | `gradient` | 74, 144, 226 and 32, 64, 150 | Gradient colours |
| `glyph` | `glyph`, `glyph_sdf` | `Star { points: 5 }` | Foreground mark |
| `glyph_color` | `glyph_color` | 255, 255, 255 | Colour of the glyph |
| `glyph_scale` | `glyph_scale` | 1.0 | Multiple of the built-in size |
| `rim` | `rim` | 0.6 | Light on the top edge, 0 to 1 |
| `shadow` | `shadow` | 0.5 | Opacity of the drop shadow, 0 to 1 |

`Shape` has three forms: Squircle, a superellipse and the default; Circle; and RoundedSquare(r), with a corner radius from 0 to 1.

`Glyph` has the built-in marks Dot, Ring, Diamond, Plus, Play, Star, Chevron, Crescent, Bars and Wave, and `None` for a shape with no mark. Star clamps `points` to the range 3 to 12. `Sdf` holds a glyph of the game's own.

### A distinct icon from a name

`IconSpec::from_name` takes a name and a seed. The same pair always gives the same icon, and a new seed gives a different icon for the same name. The hue, the hue shift of the gradient, the saturation, the shape and the glyph come from a hash of the name.[[src:warp_sdk/src/icon.rs|/// The hue, the hue shift of the gradient, the shape and the glyph come]] About one icon in four is a circle, and the others are squircles. The glyph colour is white or near black, whichever has the higher contrast with the worse end of the gradient, measured as a WCAG contrast ratio.

## How an icon is drawn

Each pixel takes 4x4 to 8x8 samples, so the edges are smooth without a GPU. Each sample evaluates three signed distance functions (SDF): the background shape, the glyph and the shadow. A negative distance is inside.[[src:warp_sdk/src/icon.rs|//! The renderer runs on the CPU. Each pixel takes 4x4 to 8x8 samples, so the]]

Small sizes get three changes, because a 16 px icon is a different drawing and not a smaller one.[[src:warp_sdk/src/icon.rs|//! Small sizes get three changes, because a 16 px icon is a different]]

- The shape inset is a whole number of pixels, so the straight edges land on pixel boundaries and stay sharp.
- The glyph grows by a fraction of a pixel, so thin strokes stay visible.
- The drop shadow is off at 24 px and below, because it only makes the edge muddy.

### A glyph of your own

A glyph SDF takes a point in shape space: the origin is the centre of the shape, x goes right, y goes down, and 1.0 is the edge of the shape. The built-in glyphs fit in a radius of about 0.55. The `sdf` module holds helpers: `circle`, `boxed`, `segment` and `star`.

```rust
use warp_sdk::icon::{sdf, IconSpec, Shape};
use warp_sdk::ultraviolet::Vec2;

IconSpec::new()
    .shape(Shape::Squircle)
    .gradient([46, 196, 214], [18, 62, 140])
    .glyph_color([255, 246, 228])
    .glyph_sdf(|p: Vec2| {
        let body = sdf::circle(Vec2::new((p.x + 0.08) * 0.8, p.y), 0.30);
        let t = p - Vec2::new(0.36, 0.0);
        // A wedge that opens to the right, cut at x = +-0.14.
        let tail = (t.x.abs() - 0.14).max((t.y.abs() - (t.x + 0.14)) * 0.7);
        body.min(tail)
    })
```

## Images and files

`render` draws a spec at one size and gives an `IconImage` of RGBA bytes. `IconSet::render` draws every size in `SIZES`, and `IconSet::render_sizes` draws a chosen list. `png_bytes` and `ico_bytes` encode to memory.

warp_core links `image`, but warp_sdk does not export it, so this module has its own small PNG encoder, with stored deflate blocks, and its own ICO encoder.[[src:warp_sdk/src/icon.rs|//! warp_core links `image`, but warp_sdk does not export it. This module]] Icons are small, so the files are a few hundred kilobytes at most.

```rust
use warp_sdk::icon::{write_set, IconSpec};
let files = write_set(&IconSpec::from_name("Reef", 0), "target/icons".as_ref()).unwrap();
println!("{}", files.ico.display());
```

`write_set` creates the directory if it does not exist, and returns the paths in an `IconFiles`.

## The window

`set_window_icon` renders the spec at `ENGINE_ICON_PX`, 64 pixels, and gives it to the engine. Call it once, before `run`. A game that does not call it still gets an icon: the engine draws a plainer default from the window title, a rounded square with a gradient and one of four glyphs.[[src:warp_core/src/lib.rs|//   2. Else `default_window_icon(window_title)`: a rounded square with a]] The icon is not a field of `Config`, for reasons given in [[renderer#Config|Config]].

`window_icon` gives a winit icon at `WINDOW_ICON_PX`, 32 pixels, for a window that a game makes itself. `window_icon_px` takes a size. `rgba_icon` gives the plain `(rgba, width, height)` form.

## The executable

`embed_windows_icon` runs in the `build.rs` of a game. It reads `OUT_DIR` and the target variables that cargo sets, so it works from `build.rs` only. It writes `app.ico`, `app.rc` and `app.res` into `OUT_DIR`.[[src:warp_sdk/src/icon.rs|pub fn embed_windows_icon(spec: &IconSpec) -> io::Result<EmbedFiles> {]]

On the MSVC toolchain no other dependency is necessary. `link.exe` reads `.res` files directly, so the function tells cargo to link `app.res` into every binary of the package, and sets `linked` in the returned EmbedFiles.

```rust
fn main() {
    let spec = warp_sdk::icon::IconSpec::from_name("Reef", 0);
    warp_sdk::icon::build::embed_windows_icon(&spec).unwrap();
}
```

The game also lists `warp_sdk` under `[build-dependencies]`, with `default-features = false`.

On the GNU toolchain the linker does not read `.res` files. The function writes `app.rc` for that case, and the game compiles it with `embed-resource`:

```rust
let files = warp_sdk::icon::build::embed_windows_icon(&spec).unwrap();
if !files.linked {
    embed_resource::compile(&files.rc, embed_resource::NONE);
}
```

`write_files` writes the same three files to any directory, and the example `icon` uses it.

## History

The kit was added on 2026-10-29.
