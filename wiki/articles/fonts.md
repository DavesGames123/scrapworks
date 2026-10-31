---
title: Fonts
short: A library of 50 open font families, and a pair picked from a mood
category: Front end
order: 50
module: fonts
example: fonts
see: palette-kit, front-menu, art-direction, visual
---
**Fonts** is a library of 50 open font families and a rule set that picks three faces for a game from a mood and a seed, in the `warp_sdk::fonts` module. Each game gets a `display` face for titles, a `text` face for body text and a `mono` face for numbers and code. Its reason is that a game that uses the stock font of egui looks like every other game.[[src:warp_sdk/src/fonts.rs|//! A game that uses egui's stock font looks like every other game. This]] The same mood and seed always give the same pair, and two moods or two seeds give two looks.

## Usage

Install once, from the first `gui` call, and draw from the next frame.

```rust
use warp_sdk::{egui, fonts, palette_kit::Mood};
let pair = fonts::pair(Mood::Oceanic, 7);
fonts::install(ctx, &pair).ok();      // registers "display", "text", "mono"
fonts::use_in_style(ctx);             // optional: egui's own text styles use them
// In `gui`, from the next frame:
ui.label(egui::RichText::new("REEF").font(fonts::display(48.0)));
ui.label(egui::RichText::new("Score 0012").font(fonts::mono(18.0)));
```

`display`, `text` and `mono` return a `FontId` of the given size. The families are named by the constants `DISPLAY`, `TEXT` and `MONO`, and `Title::display_font` in [[front-menu]] takes the first of those names.

`pair_for` takes a mood phrase, for example "neon arcade". The first word that `Mood::parse` knows sets the mood, and with no known word the mood is Calm.[[src:warp_sdk/src/fonts.rs|/// `Mood::parse` knows sets the mood. With no known word, the mood is `Calm`.]] The starter takes its fonts and its colours from one mood and one seed, so the type and the palette agree. See [[palette-kit]].

## The library

`CATALOG` lists every `Face`: its name, folder, files, roles, class, mood tags, weights, and whether its digits have one width. The files are under `warp_sdk/assets/fonts/<dir>/`, each folder with its `OFL.txt`. All 50 families are SIL Open Font License faces from the Google Fonts repository.[[src:warp_sdk/src/fonts.rs|/// Every face of the library: 50 families, all SIL Open Font License.]] A variable font draws at its default instance, which is the regular weight.

| Query | Result |
|---|---|
| `by_name(name)` | One `Face`, for example Lato |
| `suited(mood, role)` | Every face with that mood and role |
| `Face::has(role)`, `Face::suits(mood)` | Tests on one face |
| `Face::read()`, `Face::read_bold()` | The bytes of the regular or bold file |

`Role` says what a face can do: `Display`, Text, Mono or Numeric. `Class` is the visual class, and the pairing rules compare it. The classes are DisplaySerif, DisplaySans, Geometric, Humanist, Grotesque, Slab, Condensed, Rounded, Techno, Handwritten, Decorative, Pixel, Mono and TextSerif. `Class::loud` is true for handwritten, decorative and pixel faces, because two loud faces in one pair fight.[[src:warp_sdk/src/fonts.rs|/// True for a class that draws attention. Two loud faces in one pair fight.]]

## The pairing rules

`pair` applies these rules, and the seed chooses among the faces that obey them.[[src:warp_sdk/src/fonts.rs|//! THE PAIRING RULES ("pub fn pair")]]

- `display` is a Display face with the mood tag.
- `text` is a Text face with the mood tag, of a different class from `display`. A loud display class gets a quiet text class.
- `mono` is a Mono face with the mood tag, or any face of the Mono class if none has the tag. A pixel mono beside an unrelated mood looks like a mistake, so the fallback excludes it.
- The three faces are three different families when the catalog allows it.

When no face fits the mood for a role, the rule falls back to all faces of that role and keeps the other filters.

## Where the families go

`install` adds three named families to the font definitions of the context. Each family is the chosen face, then the stock chain of egui as a fallback, so glyphs that the face lacks, such as emoji and symbols, still draw. It keeps every font that the context already has, and replaces the faces of an earlier install.[[src:warp_sdk/src/fonts.rs|//! `install` adds three named families to the context's font definitions.]]

Before the first frame, the base is the egui default definitions. A call after the first frame keeps the engine's chrome font. `install` rebuilds the glyph atlas, so it runs once and not each frame.

`install` reads only the three chosen files. When a face does not load, `install` returns a `FontError`, and the family still exists with the stock fonts in place of the face.

`use_in_style` points the text styles of egui at the families: Heading at display, Body, `Button` and Small at text, and Monospace at mono. The sizes stay. It suits a game that owns its context.

## How a game gets the bytes

There is one mechanism in two steps.[[src:warp_sdk/src/fonts.rs|//! HOW A GAME GETS THE BYTES (ONE MECHANISM, TWO STEPS)]]

During development, `Face::read` looks in these folders, in this order. No font goes into the binary.

1. The folder in `$WARP_FONTS_DIR`.
2. `assets/fonts` beside the executable.
3. `./assets/fonts`.
4. The SDK folder `DIR`, fixed when `warp_sdk` builds, which works with no setup on the machine that built it.

To ship, call `bundle` once. It copies the three faces and their licences into the game's own `assets/fonts`. Then either ship that folder beside the executable, or embed the files with the `embed_font!` macro and call `install_embedded`. The macro reads from the assets folder of the calling crate, so the binary holds only the fonts that the game uses.

```rust
let bytes = fonts::Embedded {
    display: warp_sdk::embed_font!("bebasneue/BebasNeue-Regular.ttf"),
    text:    warp_sdk::embed_font!("lato/Lato-Regular.ttf"),
    mono:    warp_sdk::embed_font!("ibmplexmono/IBMPlexMono-Regular.ttf"),
};
fonts::install_embedded(ctx, &bytes);
```

```rust
fonts::bundle(&pair, concat!(env!("CARGO_MANIFEST_DIR"), "/assets/fonts"))?;
```

`bundle` copies from the SDK folder, so it runs on a machine with the SDK and not on a player's machine.

## Limitations

- egui applies new fonts from the next frame. Drawing with `fonts::display`, `fonts::text` or `fonts::mono` in the frame that calls `install` makes egui panic, because the family is not bound yet.[[src:warp_sdk/src/fonts.rs|/// egui applies new fonts from the NEXT frame. Do not draw with]] The example `fonts` returns from `gui` in the frame that installs.
- A `FontId` with a family that is not installed also panics.
- `install` needs an `egui::Context`, which `Renderer::new` does not receive.
- Only the regular file of a face goes into the three families. `read_bold` gives bytes for a game that registers its own.

## History

The kit was added on 2026-10-29, with the 50 families and the mood pairing.
