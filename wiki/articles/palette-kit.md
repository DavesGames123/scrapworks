---
title: Palette kit
short: Mood-driven palettes, OKLab colour maths and taste rules
category: Look
order: 40
module: palette_kit
see: visual, fonts, semiotics, shader-pattern, art-direction, palette
demo: harmony
---
**Palette kit** is the SCRAP module of palettes, colour maths and taste rules, which turns a mood word and a seed into a checked set of colours. It lives in `warp_sdk::palette_kit`. `pick` returns a `Swatch` with one paper colour (`bg`) and one to five inks, and the seed changes the palette choice, the ink order and a small hue and chroma turn, so two games with two seeds do not get the same look.[[src:warp_sdk/src/palette_kit.rs|two seeds do not get the same look.]] It is not `warp_sdk::palette`, the [[palette|editor chrome palette]]. The module is a port of the Pattern Designer tool: its palette table, its colour functions, its density limits and its taste rules.

## Colour

`Rgb` is one sRGB colour with gamma-encoded channels in the range 0 to 1. `Rgb::from_hex` is a `const fn` and `Rgb::to_hex` and `Rgb::to_u8` go the other way. `Rgb::linear` returns linear-light RGB for a shader uniform or a vertex colour, and `Rgb::from_linear` clamps on the way back. `Rgb::luminance` is WCAG 2 relative luminance with Rec. 709 weights. `contrast` is the WCAG ratio, 1 to 21.

| Function | Result |
|---|---|
| `oklab`, `from_oklab` | OKLab: L in 0..1, a and b about -0.4..0.4 |
| `oklch`, `from_oklch` | OKLCH: `[L, C, h]`, h in degrees |
| `delta_e` | Euclidean OKLab distance of two colours |
| `ensure_contrast` | an ink moved in lightness until its contrast reaches a minimum |
| `palette_distance` | how far apart two palettes look |

`from_oklch` handles a colour outside sRGB by keeping its lightness and hue and bisecting chroma over 18 steps until it fits.[[src:warp_sdk/src/palette_kit.rs|and loses chroma (by bisection) until it fits.]] An OKLab distance of 0.02 is about the smallest step an eye sees, which the kit names `MIN_STEP`.

`ensure_contrast` keeps hue and chroma and steps lightness away from the paper, up when the paper luminance is under 0.18 and down otherwise, in steps of 0.025 for at most 40 tries. If none reach the target, it returns white or black. `score` gives the lowest contrast of the first `n` inks on the paper, and a high score is a strong palette.

`palette_distance` sorts each ink set by OKLab L. With equal ink counts the inks pair up in that order. With unequal counts each ink takes its nearest in the other set, both ways. The paper counts as much as one ink pair.

## Moods and the palette table

`Mood` has seventeen tags, from Calm to Print. `Mood::parse` reads one word, a mood name or a common synonym in any case, and returns the moods of that word. "spooky" and "space" are Dark, "reef" and "water" are Oceanic, and "riso" is Print. An unknown word gives an empty list.

`PALETTES` holds 90 palettes in ten groups (`Group`), and a test asserts the count. Each `Palette` has an `id`, a `name`, a paper colour, inks as hex values and mood tags. Ink slot k is `ink[k % len]`, so slots wrap. The tags come from the group, the paper lightness, the mean ink chroma and the mean ink hue.[[src:warp_sdk/src/palette_kit.rs|tags come from the group, the paper lightness (dark or light), the mean]] `by_id` finds a palette.

## How a pick works

`pick` runs these steps.[[src:warp_sdk/src/palette_kit.rs|pub fn pick(mood: &str, seed: u64) -> Swatch]]

1. `suited` splits the phrase into words, parses each, and keeps the palettes with the most matching tags. With no known word, every palette stays.
2. Each palette gets a `score` over up to its first three inks. The pool keeps those with a score of `MIN_CONTRAST` (3.0) or more. If none qualify, the pool is the top five by score.
3. A weighted draw selects a palette, with each weight capped at 12, so the pick favours high contrast.
4. `vary` makes the colours of this seed its own.

`vary` applies a hue turn of up to 12 degrees, a chroma scale of 0.9 to 1.1 and a new ink order. The order comes from up to 24 Fisher-Yates shuffles and prefers a first ink with contrast 3 or more. The first ink then gets a contrast repair. If the result breaks a taste rule, `vary` tries half and a quarter of the change. If all fail, the inks keep their table colours in the new order.[[src:warp_sdk/src/palette_kit.rs|Try the full change, then half and a quarter of it.]]

The same phrase and seed always give the same swatch. `Rng` is a seeded SplitMix64, which gives the same values on every platform.[[src:warp_sdk/src/palette_kit.rs|A small seeded random source (SplitMix64).]] A test runs 200 seeds across five phrases, requires that every result passes the taste check, and requires at least 970 distinct swatches of the 1000.

## Taste rules

`check` tests a table palette and `check_swatch` tests a swatch. An empty list means a pass. Each failure is a `TasteIssue`.

| Issue | Rule |
|---|---|
| InkCount | no ink, or more than five |
| LowContrast | the first ink has contrast under `MIN_CONTRAST` on the paper |
| DuplicateInks | two inks closer than `MIN_STEP` |
| InkOnPaper | an ink closer to the paper than `MIN_STEP` |

Only the first ink has a contrast rule. Later inks can be low in contrast. `Swatch::ink` wraps like `Palette::ink`, and the `base` field names the table palette the swatch came from, or `"custom"` for a harmony. `Swatch::hex` lists the colours, paper first.

## Harmonies

{{demo:harmony}}

`harmony` builds a palette from one seed colour instead of the table. `Harmony` is a set of hue offsets.

| Kind | Offsets (degrees) |
|---|---|
| Complementary | 0, 180 |
| Analogous | -30, 0, 30 |
| Triadic | 0, 120, 240 |
| Split | 0, 150, 210 |
| Tetradic | 0, 90, 180, 270 |

`n` is clamped to 2 to 5 inks. `dark` sets the paper, and `None` chooses from the seed, so a light seed gets dark paper. The inks take the harmony hues at a spread of lightness, and inks past the hue set repeat the hues at another lightness and half the chroma. The first ink then moves in lightness until its contrast on the paper is 3.2 or more.

## Density and pattern picks

The kit also carries the limits that the Pattern Designer applied to its patterns. `DENSITY` is the limit set: a density factor from 0.5 to 4.0, default 2.2, with a phone cap of 2.4 and phone default of 1.8. Density is a linear frequency factor, so a density of 2 gives twice the cells per side and about four times the motifs on a 2D lattice.[[src:warp_sdk/src/palette_kit.rs|lattice gets about four times the motifs.]] `density_cap` chooses the cap for a device class, and `clamp_density` applies it.

`densify` scales one pattern value by a `DensityRule`. Pow multiplies by a power of density up to a limit, and Step adds a logarithmic step for recursion depth. A value already past its limit keeps that value. `thin_factor` gives finer lines as motifs shrink.

`taste_param`, `taste_density` and `taste_mods` make seeded picks within taste limits. `taste_mods` returns at most two mild `ModPick` values whose fields match the `pattern_mod_*` functions in `shaderlib/pattern/modifiers.wgsl`. A mask skips the families with large bands, a mask and a dash do not go together, and `LINE_FAMILIES` names the families that take a mirror or a dash well. See [[shader-pattern]].

## Usage

```rust
use warp_sdk::palette_kit::{self, pick, Rgb};

let sw = pick("ocean calm", 42);
assert!(palette_kit::check_swatch(&sw).is_empty());
let paper: [f32; 3] = sw.bg.linear();      // the clear colour
let first_ink: Rgb = sw.ink(0);
let readable = palette_kit::ensure_contrast(first_ink, sw.bg, 4.5);
```

## Interaction with other kits

`Language::from_swatch` in [[visual]] builds role colours from a swatch, and `Language::new` is `pick` plus that call. The swatch paper may move there, because a mid-lightness or colourful paper cannot hold the twelve role colours. A game that draws role markers uses the language `paper` field and not the swatch `bg` field. `fonts::pair` in [[fonts]] takes a `Mood`, so one mood can drive colour and type.

## History

The module was added on 2026-10-29 in the commit "sdk: add palette_kit, palettes and taste rules picked by mood".
