---
title: Semiotics
short: One functional standard for game icons, across fonts
category: Look
order: 20
module: semiotics
example: semiotics
see: visual, fonts, hud-cues, teach, palette-kit, art-direction
---
**Semiotics** is the Warp standard for game iconography, a small visual language in which each action has one meaning class, and each class owns a frame shape, a colour role and a motion. Its code is `warp_sdk::semiotics` and its text is the document `docs/visual-semiotics.md`, which requires that a disagreement between the two is fixed in one commit.[[src:docs/visual-semiotics.md|the two disagree, fix the code or change this document in the same commit.]] A one-shot game has almost no text, so its icons carry the rules of the game.[[src:warp_sdk/src/semiotics.rs|A one-shot game has almost no text. Its icons carry the rules.]] A player who learns one icon can read the next icon of the same class without help.

## Grounding

The standard draws on several fields, and each gives it a concrete rule.

**Peirce.** An icon looks like its object, an index points to its object by a physical link, and a symbol has an agreed meaning only. The standard uses icons first and indexes for every direction and every cause. It uses symbols only where the player already knows them from other software, such as confirm, cancel, pause, menu and help. A new symbol costs a lesson, and the medium has no space for lessons, so the standard does not invent symbols.[[src:docs/visual-semiotics.md|lessons, so the standard does not invent symbols.]]

**Bertin.** Each visual variable carries a different kind of data.

| Variable | Carries | Use in the standard |
|---|---|---|
| Shape | category | the frame gives the class, the glyph the item |
| Hue | category | the class colour role, same as the frame |
| Value | order | disabled state, fill against outline |
| Size | rough quantity | priority only, never a category |
| Orientation | direction | arrows; up is gain, down is loss or descent |
| Position | relation | modifier slots, inline place in text |
| Texture | weak category | the dashed ring of Perception only |

Frame shape and hue both carry the class. This redundant coding lets a colour-blind player, or a player on a bad screen, read the class from the shape alone.

**ISO 7001 and ISO 3864.** Safety signs join one shape and one colour into one class: a triangle warns, a circle commands, a slashed ring prohibits and a square informs. The standard takes those shapes but not the red for prohibition. Here red means "this hurts you" and nothing else, which `Language` already enforces.

**AIGA and US DOT.** The 1974 set gives four rules: one idea per symbol, a consistent stroke and corner across the set, a silhouette readable at a distance, and a negation that is the base symbol with a slash and not a new drawing.

**Game conventions.** RTS and MOBA command cards put verbs in one fixed frame, show cooldown as a dark clockwise sweep and show charges as a count in a corner. Zelda and Hollow Knight show the minimum: vitals as a row of icons with no text, and motion only when a value changes. The standard keeps the modifiers of the first and the restraint of the second.

**Gestalt and preattentive features.** A player finds a different shape, hue, size or motion in a crowd in under 250 ms without a search. Thus each class owns one shape and one hue, and only states that need attention move. Similar frames group, so a row of hexagons reads as "my resources" before the player reads one glyph.

## Meaning classes

`Class` has ten values. Each owns three fixed channels: a `Frame`, a `visual::Role` and a `Motion`. A game never changes them, and the glyph inside the frame names the item.[[src:docs/visual-semiotics.md|`visual::Role`, and a motion. A game never changes them. The glyph inside]]

| Class | Frame | Role | Motion | Meaning to the player |
|---|---|---|---|---|
| Action | circle | Player | breathe | a verb available now in the world |
| Exchange | hexagon, flat top | Resource | rise | things to get, carry and give |
| Build | house, peak up | Upgrade | spin | making or changing the world |
| Perception | dashed ring | Discovery | flash | sensing or finding something |
| Command | capsule | Interactable | still | a menu or system button |
| Information | square | UiAccent | still | a read-out that asks nothing |
| Vital | shield, point down | Ally | breathe | the player's own body: hull and power |
| Warning | triangle, point up | Danger | pulse | something will hurt the player soon |
| Hazard | diamond | Hazard | slow pulse | the place hurts the player |
| Prohibition | slashed ring | Neutral | shake | the player cannot do this |

Four rules govern classes.

- Only Warning and Hazard are red or orange, and a red icon always means harm.
- Prohibition is grey, because "you cannot" is not "you are hurt". The slash and the shake carry the meaning.
- A Prohibition glyph can be the glyph of another action. This is the negation rule. No other class reuses a glyph.
- The frame is the class. A glyph never moves to another frame for effect. A new meaning gets a new action in the right class.

## Action vocabulary

`Action` holds 62 actions in seven groups.

| Group | Actions |
|---|---|
| Navigation | move, jump, dash, dive, surface, enter, exit, map |
| Acquisition | collect, carry, deliver, drop, store, trade, cargo full |
| Construction | build, plant, grow, upgrade, repair, demolish, growing |
| Combat | attack, defend, aim, fire, charge, stun, flee, interact |
| Perception | scan, sonar, look, reveal, track, hidden, new |
| System | confirm, cancel, back, pause, settings, save, load, menu, help |
| Status | health, energy, low energy, starving, dying, danger, heat, pressure, time, depth, cooldown, complete, respawn, locked, failed, blocked |

The groups are not classes. `Action::class` gives the class: navigation and combat are the Action class, except that Map is a Command. Status splits across Vital, Warning, Hazard, Information and Prohibition. `Action::frame`, `Action::role` and `Action::motion` come from the class. `Action::meaning` gives two or three words for a tooltip or a developer, and is not for the screen of a game that shows no text.

### Glyphs

`Action::glyph` returns a list of `Prim` values in a unit box, with x right, y down and coordinates from -1 to 1. A primitive is an open stroke, a closed stroke, a convex fill, a disc, a stroked circle or an arrow with an open head. All share the stroke of the `Style`. Tests check that each glyph stays in the unit box, that every Fill is convex, and that glyphs differ within a class.

Direction carries meaning where the standard says so. Down in Dive means deeper, and up in Jump means against gravity. The standard records such orientations action by action.

### Negation

`Action::negates` gives the base of a Prohibition action. Failed is Complete with a slash and Blocked is Move with a slash. A negation is the base glyph with a slash, not a new drawing.[[src:warp_sdk/src/semiotics.rs|slash. A negation is the base glyph with a slash, not a new drawing.]]

### Confusable pairs

`Action::confusable_with` returns the actions that a player can take for this one, from one table of pairs. It serves as a review list: two confusable actions must never sit side by side in one HUD row without their frames.[[src:docs/visual-semiotics.md|as a review list: two confusable actions must never sit side by side in one]] A test requires that every action has at least one such pair.

## Modifiers

A `Modifier` is a small overlay on any icon. Each owns one `Slot`, and two modifiers never share a slot.

| Modifier | Slot | Drawing |
|---|---|---|
| Cooldown | overlay | dark clockwise sweep from 12 o'clock; the value is the part left |
| Progress | overlay | arc on the frame edge, clockwise from 12 o'clock |
| Hold | bottom | bar under the glyph that fills left to right |
| New | top right | Discovery dot with a casing edge |
| Count | top right | 1 to 3 pips; from 4, a disc with the number |
| Locked | bottom right | small padlock on a paper disc |
| DangerCorner | top left | small red triangle |
| Disabled | whole | grey luma colours at half opacity |

`stack` turns a list into the legal stack: at most `MAX_MODIFIERS` (2), one per slot, and never Locked with Disabled, because locked already says "not now". The first in the list wins.[[src:warp_sdk/src/semiotics.rs|never Locked with Disabled. The first in the list wins.]] The paint functions apply `stack` themselves, so a game can pass any list. A count above 99 shows "99". The number of a count disc is text, so `shapes` leaves it out and `paint_with` adds it.

## Motion

`Motion` gives each state a time curve and a meaning.

| Motion | Meaning | Duration | Amplitude |
|---|---|---|---|
| Still | nothing to do | none | none |
| Breathe | idle, available | 3.2 s loop | scale 2.5 percent either way, opacity 85 to 100 percent |
| Pulse | needs attention | 1.0 s loop | scale +6 percent, flash 25 percent |
| SlowPulse | the place needs care | 2.0 s loop | scale +4 percent, flash 15 percent |
| Spin | working | 1.6 s per turn | a 70 degree arc turns on the frame |
| Shake | refused, blocked | 0.4 s once | x 5 percent of half size, 3 cycles, quadratic decay |
| Rise | gained | 0.8 s once | y -35 percent on a cubic-out curve, fades out |
| Fall | lost | 0.8 s once | y +35 percent on a quadratic-in curve, fades out |
| Flash | hit, changed | 0.25 s once | white mix from 100 percent to 0, scale +4 percent |

`Motion::pose` returns a `Pose` at a given time, and `Pose::amplitude` reports the distance from rest. The class motion is what an icon uses when it asks for attention. A game event such as a gain, a loss or a hit uses `paint_with` with the event motion. The standard gives two prohibitions: never loop a one-shot motion, and never move an icon that asks nothing, so Command and Information stay still.[[src:docs/visual-semiotics.md|motion. Never loop a one-shot motion. Never move an icon that asks]]

## Typographic harmony

Icons are type. Their stroke, ends, joins and corners come from the face next to them, so a pixel game gets pixel icons and a serif game gets modulated icons.[[src:docs/visual-semiotics.md|next to them, so a pixel game gets pixel icons and a serif game gets]] `Style::from_class` maps a `fonts::Class` to a `Style`.

| Font class | Stroke | Terminal | Join | Corner | Contrast | Fill | Aspect |
|---|---|---|---|---|---|---|---|
| DisplaySerif | 0.075 | butt | miter | 0.02 | 0.60 | duotone | 1.00 |
| DisplaySans | 0.110 | square | miter | 0.06 | 0.00 | solid | 1.00 |
| Geometric | 0.080 | round | miter | 0.06 | 0.00 | outline | 1.00 |
| Humanist | 0.085 | round | round | 0.14 | 0.15 | duotone | 0.96 |
| Grotesque | 0.080 | butt | miter | 0.08 | 0.05 | outline | 1.00 |
| Slab | 0.100 | square | miter | 0.03 | 0.10 | solid | 1.00 |
| Condensed | 0.090 | butt | miter | 0.05 | 0.00 | solid | 0.84 |
| Rounded | 0.100 | round | round | 0.30 | 0.00 | solid | 1.00 |
| Techno | 0.080 | square | bevel | 0.00 | 0.00 | outline | 1.00 |
| Handwritten | 0.090 | round | round | 0.16 | 0.35 | outline | 0.98 |
| Decorative | 0.100 | butt | miter | 0.05 | 0.50 | duotone | 1.00 |
| Pixel | 0.125 | square | miter | 0.00 | 0.00 | solid | 1.00 |
| Mono | 0.080 | butt | miter | 0.04 | 0.00 | outline | 1.00 |
| TextSerif | 0.075 | butt | miter | 0.04 | 0.40 | outline | 1.00 |

Contrast 0 is a uniform stroke. Above 0 the stroke is a broad nib at 30 degrees: segments across the nib are thick and segments along it are thin. `FillPolicy` decides how the frame and glyph take colour.

| Policy | Frame | Edge | Glyph |
|---|---|---|---|
| Solid | role | casing | casing |
| Outline | paper | role | role |
| Duotone | tint | role | role |

`Style::from_face` reads the class of one face. `Style::from_pair` takes the stroke, ends and joins from the text face, because icons sit next to labels, and the fill from the display face, which is the voice of the game. A loud display face (handwritten, decorative or pixel) also gives its ends, corners and pixel grid.[[src:warp_sdk/src/semiotics.rs|fill from the display face. A loud display face also gives its ends,]] `Style::weighted` scales the stroke by the square root of weight over 400. The default `Style` is the Humanist style.

### Optical sizes

`optical` is the factor that small icons need for a heavier stroke: 1.35 at 12 px, 1.2 at 16 px, 1.0 at 24 px, 0.9 at 48 px and 0.85 at 128 px, linear between. `Style::stroke_px` applies it. The stroke is never under 1 px, and a pixel style rounds it to whole pixels and snaps points to the grid.

### Inline with text

`inline_rect` puts the frame on the text baseline and makes the frame height equal to the cap height of the face. `paint_inline` paints there and returns the advance, which is the icon width plus 0.2 em. The cap and x-height ratios of a `Style` are class averages and not read from the font file, so a face that differs by more than 5 percent needs its own value.[[src:docs/visual-semiotics.md|class averages, not read from the font file; a face that differs by more]]

## Accessibility

- **Never colour alone.** Every class has its own frame and every action in a class has its own glyph.
- **Minimum size.** The standard gives 16 px for a HUD icon that the player must read in play and 12 px only for an inline icon next to its label. Below 16 px the dashed ring reads as a plain ring.
- **Contrast.** Role colours have a WCAG contrast of 3:1 or more on the paper, and the casing edge gives the frame its own edge on any background.
- **Reduce motion.** `Style::reduced` gives every motion zero amplitude. The state then shows as a static `Mark` from `Motion::static_mark`: pulse and flash give a doubled frame edge, spin a fixed quarter arc, rise an up chevron and fall a down chevron. Shake and breathe need no mark.[[src:docs/visual-semiotics.md|top, fall a down chevron at the bottom. Shake and breathe need no mark]]

## Usage

```rust
use warp_sdk::{fonts, palette_kit::Mood, visual::Language};
use warp_sdk::semiotics::{self, Action, Modifier, Motion, Style};

let lang = Language::new("ocean calm", 7);
let style = Style::from_pair(&fonts::pair(Mood::Oceanic, 7));
// In `gui`. `t` is the time in seconds since the state started.
semiotics::paint(&painter, Action::LowEnergy, rect, &lang, &style, &[], Some(t));
semiotics::paint(&painter, Action::Fire, rect, &lang, &style, &[Modifier::Cooldown(0.4)], None);
semiotics::paint_with(&painter, Action::Collect, rect, &lang, &style, &[], Motion::Rise, t);
```

Make one `Language` and one `Style` at start, from the same mood as the fonts. `paint` uses the class motion when given a time, and rests when given `None`. `shapes` returns the egui shapes of one icon, with no text, for a layer of your own or to test bounds. The `semiotics` example shows a specimen sheet of five font pairs.

## Interaction with other kits

`Class::role` returns a `visual::Role`, so an icon takes its colours from a `Language`. `action_icon` and `action_glyph` in [[visual]] paint standard icons at rest for other kits, and [[hud-cues|HUD cues]] and [[teach]] use them. Role shapes in [[visual]] are the class frames where the two overlap. `Style` reads `fonts::Pair` and `fonts::Face` from [[fonts]].

## History

The module and its document were added on 2026-10-29 in the commit "sdk: add semiotics, a functional standard for icons across fonts". When the standard appeared, `visual`, `hud::cues` and `teach` disagreed with it in shapes, palettes and icon roles. The commit "sdk: align visual, hud cues and teach with the semiotic standard" resolved those differences, and section 8 of the document keeps the list as a record.[[src:docs/visual-semiotics.md|Where the existing kits disagree]]
