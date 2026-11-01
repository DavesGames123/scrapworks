---
title: Visual language
short: One colour, shape and icon set per game role, checked by rule
category: Look
order: 10
module: visual
example: visual
see: semiotics, palette-kit, hud-cues, teach, hud-minimap, art-direction
---
**Visual language** is the SCRAP system that gives each kind of thing in a game one role, and each role one colour and one shape, so that a game shows meaning without words. It lives in `warp_sdk::visual` and its main type is `Language`. The same role always looks the same, in the world, in the HUD and on the map.[[src:warp_sdk/src/visual.rs|colour and one shape. The same role always looks the same, in the world,]] The module also holds a vector icon set, colour-blindness simulation, and the bridge to the [[semiotics]] icon standard. It implements the [[art-direction#Gameplay you can see|art direction rule]] that colour has one meaning.

## Roles

`Role` has twelve values. Give every visible thing one role. Each has a fixed shape, and all shapes differ, so a player who cannot see the colour still sees the role.[[src:warp_sdk/src/visual.rs|not see the colour still sees the role.]]

| Role | Meaning | `Role::shape` | Default icon |
|---|---|---|---|
| Player | the player and what they control | circle | Target |
| Ally | friends, the colony, helpers | shield | Colony |
| Resource | things to collect | hexagon | Food |
| Energy | power, fuel, light, battery | bolt | Energy |
| Danger | enemies and attacks | triangle | Danger |
| Hazard | the world can hurt the player here | diamond | HazardHeat |
| Interactable | doors, switches, stations | capsule | Unlock |
| Objective | the current goal | star | Home |
| Discovery | something new or hidden | ring of ten dashes | Discovery |
| Neutral | background things with no game meaning | bar | Unknown |
| Upgrade | things that make the player stronger | house | Upgrade |
| UiAccent | interface chrome | square | Arrow |

`Role::default_icon` gives the icon for a role with no better one. `Role::ALL`, `Role::index` and `Role::name` iterate and name them.

## The language

A `Language` holds twelve role colours, a `paper` colour and a dark casing colour for one game. `Language::new` takes a mood and a seed, and is `palette_kit::pick` followed by `Language::from_swatch`. A game can also pass its own `Swatch`. The default `Language` is mood "dark" with seed 0, and `default_language` shares one such value, made once, for kits that take no language.

### How the colours are built

`Language::from_swatch` works in OKLCH.

1. **Paper.** The swatch background moves to a usable paper. A mid-lightness paper cannot hold twelve role colours at `MIN_CONTRAST`, so it moves to dark (L 0.24) or light (L 0.93). A lightness at or below 0.30 or at or above 0.90 stays. The hue stays and the chroma drops to `PAPER_MAX_CHROMA` or less, because a more colourful paper takes hue space from the roles and a red paper breaks the danger band.[[src:warp_sdk/src/visual.rs|space from the roles, and a red paper breaks the danger band.]]
2. **Levels.** The paper sets three lightness levels: 0.70, 0.80, 0.90 on dark paper and 0.42, 0.51, 0.60 on light paper.
3. **Plan.** Each role has an anchor hue, a lightness step and a saturation target, where saturation is chroma as a part of the sRGB limit at that lightness and hue.
4. **Turn.** The inks set a chroma scale and a small hue turn, and the seed adds a little more. The danger hues do not take the turn: red stays red.[[src:warp_sdk/src/visual.rs|The danger hues do not turn: red stays red.]]
5. **Contrast.** Each colour passes through `ensure_contrast`.
6. **Separation.** Up to 24 rounds move the later role of a near pair by one lightness step, until each pair has the required distance.

The role plan is the hue wheel of the system.

| Role | Anchor hue | Saturation target |
|---|---|---|
| Danger | 27 | 0.95 |
| Hazard | 60 | 0.95 |
| Objective | 90 | 0.85 |
| Resource | 130 | 0.80 |
| Ally | 158 | 0.70 |
| Player | 194 | 1.00 |
| Energy | 222 | 0.80 |
| Interactable | 250 | 0.70 |
| UiAccent | 278 | 0.60 |
| Discovery | 306 | 0.80 |
| Upgrade | 336 | 0.80 |
| Neutral | 250 | 0 |

Neutral is built apart at a low chroma, darker than every role on dark paper and lighter on light paper, so that it stays quieter than the rest.

### Reading colours

`Language::color` returns an `Rgb`. `Language::egui` returns an egui colour. `Language::casing` is the dark outline of every marker and icon, which keeps a marker clear on a bright or busy world.[[src:warp_sdk/src/visual.rs|a marker clear on a bright or busy world.]] `Language::paper_egui` is the paper. Draw the language `paper` field, not the swatch `bg` field, behind markers and the HUD.

## The rules

`Language::check` returns an `Issue` for each broken rule. An empty list means the language is good. A test runs every mood across seeds and requires an empty list.

| Rule | Limit | Issue |
|---|---|---|
| Only Danger and Hazard use the warm red and orange band | `DANGER_BAND`, 15 to 72 degrees | InDangerBand, OutOfDangerBand |
| Each pair of roles is apart in OKLab | `MIN_DISTANCE`, 0.06 | TooClose |
| Each role reads on the paper | `MIN_CONTRAST`, 3.0 | LowContrast |
| Player has the highest saturation | | MoreSaturatedThanPlayer |
| Neutral has a low chroma | `NEUTRAL_MAX_CHROMA`, 0.04 | NeutralTooColourful |
| Each role has its own shape | | SameShape |

Red means danger, and nothing else is red.[[src:warp_sdk/src/visual.rs|Red means danger, and nothing else is red.]] `BAND_MARGIN` is the hue gap that other roles keep when the language is built. `check` flags a role only inside half of that gap, and a colour with chroma under 0.035 has no hue that a player sees, so the band rule does not apply to it.

## Colour blindness

`simulate` gives the colour that a player with a `Vision` sees, using the Machado 2009 matrices at full severity in linear RGB. `Language::confusable` lists the role pairs that are closer than `MIN_DISTANCE` after simulation.

```rust
for (a, b) in lang.confusable(Vision::Deuteranopia) { assert_ne!(a.shape(), b.shape()); }
```

Colour alone can fail for such a player, and `Language::check` does not forbid those pairs. The role shape separates them, so meaning never depends on colour only.[[src:warp_sdk/src/visual.rs|only. [`Language::confusable`] gives the pairs that a colour-blind]]

## Shapes

`Shape` has fifteen values. Twelve are role shapes. Drop, Chevron and Plus have no role now. `Shape::outline` gives the outline in the unit box, with coordinates from -1 to 1 and y down, and `Shape::contains` tests a point. Ring is ten dashes around a hole of radius `RING_HOLE`.

## Icons

`Icon` is a set of 29 vector icons in a unit box, so each draws at any size with the same stroke ratio (`STROKE_RATIO`) and the same corner cut (`CORNER`). `Icon::role` gives the usual role of an icon, and `Icon::name` its name. Danger and Warning draw the same art.

| Function | Paints |
|---|---|
| `icon` | an icon in a rect with the colour of a role |
| `icon_with` | an icon with a fill and a casing of your own |
| `marker` | the role shape, filled and cased, for legends, minimap points and small world markers |
| `shape_with` | any shape with your own colours |
| `badge` | a role shape at a screen point, with an optional inner icon |

`badge` places the inner icon in the widest part of each shape. The caller maps the world position to the screen. On a Danger triangle with the Danger icon inside, it draws only the exclamation mark, because the badge is the triangle already.

## Link to the semiotic standard

Role shapes and [[semiotics]] frames agree. When a role is the colour of a meaning class, the role shape is the frame of that class: Resource is a hexagon, Upgrade a house, Discovery a dashed ring, Interactable a capsule and UiAccent a square.[[src:warp_sdk/src/visual.rs|a hexagon, Upgrade a house, Discovery a dashed ring, Interactable a]] `Shape::frame` gives that mapping. A test checks it.

Neutral is the one exception. Neutral is the colour of the Prohibition class, but a Neutral world marker is a background thing, not "you cannot do this", so it keeps the bar.[[src:warp_sdk/src/visual.rs|Neutral is the one exception. Neutral is the colour of the]]

`Icon::action` gives the `semiotics::Action` with the same meaning, or `None`. When it is `Some`, the icon role is the role of that action class, so Lock is Neutral, Stun is Player and BatteryLow is Danger. Energy and Light have no action, because the standard puts energy in the Vital class and the Energy role has no class.

`action_icon` paints a standard icon in the colours of a language: frame, role colour and glyph, at rest, with a fade. `action_glyph` paints only the glyph in one colour, for use inside a frame of your own or next to text. [[hud-cues|HUD cues]] and [[teach]] use these, so one meaning has one look in every kit.

## Usage

```rust
use warp_sdk::visual::{self, Icon, Language, Role};

let lang = Language::new("ocean calm", 42);      // or Language::from_swatch(&sw, 42)
assert!(lang.check().is_empty());
// In `gui`:
visual::icon(&painter, Icon::Food, rect, &lang, Role::Resource);
visual::badge(&painter, screen_pos, 24.0, &lang, Role::Danger, Some(Icon::Danger));
let enemy_red = lang.egui(Role::Danger);         // use the same colour in `render`
```

Make one `Language` at start. Give every visible thing a `Role`. Draw world markers with `badge` and HUD icons with `icon`. The `visual` example shows a role board and an icon grid for three moods.

## History

The module was added on 2026-10-29 in the commit "sdk: add visual, semantic colour roles, shapes and an icon set". The commit "sdk: align visual, hud cues and teach with the semiotic standard" later moved its role shapes and some icon roles to match [[semiotics]].
