---
title: HUD cues
short: cause and effect shown with icon sentences, pulses, tints and ghost paths
category: Information
order: 20
module: hud::cues
example: hud_progress
see: hud, hud-progress, semiotics, visual, teach
---
**HUD cues** are short non-verbal signals that show a player why a forced change of state happened. The kit lives in `warp_sdk::hud::cues`. Its premise is that a forced change with no visible cause reads as a bug: the light goes out, the controls freeze, the camera jumps home, and the player does not know why [[src:warp_sdk/src/hud/cues.rs|A forced change of state with no visible cause reads as a bug.]]. A cue answers that with no words.

## Overview

One cue combines up to four signals.

- An icon sentence near the bottom of the screen, for example energy, then low energy, then lamp off.
- A pulse of rings at the source of the change, in world position.
- A tint on the screen edge in the colour of the cue.
- For a relocation such as a respawn, a tow or a teleport, a ghost path from the old position to the new one, with an icon for the reason.

## The rule

Every forced change of state must emit a cue. A forced change is one the player did not ask for: loss of control, darkness, respawn, damage, death. `Kind::is_forced` names the standard ones.

After the change, a game calls `debug_assert_cued` with the same kind. In a debug build it panics when no cue of that kind reached the global state in the last second, so a missing cue fails in a test and not in front of a player [[src:warp_sdk/src/hud/cues.rs|no cue of that kind came in the last second, so a missing cue fails in a]]. A release build does nothing. The function reads only the global state. A game that owns a `Cues` value makes the same check with `Cues::was_cued`, as the `hud_progress` example does:

```rust
self.cues.push(Cue::new(Kind::EnergyOut, self.pos));
debug_assert!(self.cues.was_cued(Kind::EnergyOut, 1.0));
```

## Cues and kinds

A `Cue` has a `Kind`, the world position of the change, and optional cause and effect icons. `Cue::new` fills the default icons of the kind. `Cue::cause` and `Cue::effect` replace them, and `Cue::from` sets the old position of a relocation, which draws the ghost path. `Cue::sentence` returns the icons in order: cause, kind, effect.

The standard kinds set the icon, the role and the priority. Kind::Custom sets its own name, `Sym`, `Role` and priority.

| Kind | Priority | Forced | Role | Default sentence |
|---|---:|---|---|---|
| Kind::Death | 100 | yes | Role::Danger | Dying |
| Kind::Respawn | 95 | yes | Role::Info | Dying, Respawn |
| Kind::Towed | 92 | yes | Role::Warn | LowEnergy, hook |
| Kind::EnergyOut | 80 | yes | Role::Warn | Energy, LowEnergy, lamp off |
| Kind::Damaged | 70 | yes | Role::Danger | Danger |
| Kind::Stunned | 65 | yes | Role::Warn | Stun, Danger |
| Kind::Starving | 60 | yes | Role::Warn | food, Starving, Danger |
| Kind::Unlocked | 50 | no | Role::Gain | New |
| Kind::ObjectiveDone | 40 | no | Role::Good | Complete |
| Kind::Discovered | 30 | no | Role::Gain | Reveal |

`Kind::is_relocation` is true for Kind::Respawn and Kind::Towed, and those kinds should get `Cue::from`. No default icon is a house, because in the semiotic standard the house frame means Build [[src:warp_sdk/src/hud/cues.rs|No default uses a house: in the standard the house frame means Build.]].

## One look for one meaning

The cues follow the [[semiotics|semiotic standard]]. Each standard kind has one `semiotics::Action`, given by `Kind::action`. The cue paints that action with the frame of its class, and the colour of the class role comes from a `visual::Language`. `Kind::visual_role` gives the role of the tint, the pulse and the sentence frame, so the colour and the icon frame agree [[src:warp_sdk/src/hud/cues.rs|the role of the action class, so the colour and the icon frame agree.]].

`hud::cues::Role` is the coarser cue role. Role::Danger and Role::Warn both map to the Danger visual role, because the standard makes a recoverable loss a warning. Role::Info and Role::Good map to UiAccent, and Role::Gain maps to Discovery [[src:warp_sdk/src/hud/cues.rs|Role::Danger | Role::Warn => visual::Role::Danger,]]. `Role::color` reads the default language, and `Role::color_in` reads a given one.

`Cues::with_language` and `Cues::set_language` give the game's language. Without one, `Cues::language` returns `visual::default_language`.

## Icons

`Sym` is a small vector icon drawn with egui shapes, so it needs no texture and takes any colour. Sym::Action puts any icon of the standard in a sentence, where it gets the frame and role colour of its class. Sym::Char uses one character as an icon. The other values are small glyphs for things the standard does not name, such as a lamp, a hook or food. `paint_sym` draws one icon outside a cue, and for Sym::Action it paints the glyph only, in the given colour.

## Rate limit, priority and queue

`Cues::push` applies three rules and reports the result as an `Emit` value.

A cue of a kind seen inside `Config.min_gap` merges into the cue on screen. The pulse starts again, a small count goes up, and the source moves to the new position. The merge does not extend the life of the sentence, because that life runs from when the sentence first showed. A cue that merges with a waiting cue of its kind changes nothing further, and `push` still returns Emit::Merged [[src:warp_sdk/src/hud/cues.rs|if self.queue.iter().any(|q| q.kind == cue.kind) {]].

Up to `Config.max_active` sentences show at one time. When those places are full, a cue at `URGENT` priority (90) or higher replaces the lowest active cue, if that cue has a strictly lower priority. Any other cue waits in a queue in priority order.

A queue past `Config.max_queue` drops its lowest cue. `push` returns Emit::Dropped only when that cue is the new one. `Cues::tick` ends old sentences and shows waiting ones, highest priority first.

| `Config` field | Default | Meaning |
|---|---:|---|
| `min_gap` | 1.5 | Seconds in which a second cue of a kind merges |
| `max_active` | 2 | Sentences on screen at one time |
| `max_queue` | 6 | Cues that wait |
| `life` | 2.6 | Seconds a sentence stays on screen |
| `path_time` | 1.2 | Seconds the ghost takes to travel a path |

`Config` can change at any time through the `config` field. On the global state, `cues::with` gives that access:

```rust
cues::with(|c| c.config.max_active = 3);
```

## Drawing

`Cues::draw` paints everything in one call from the current clock.

The edge tint is four gradient bands, with the colour at the edge and clear inside. Their depth is 12 percent of the shorter screen side, at least 24 points. The strongest recent cue wins, with a rise over 0.08 seconds and a fall over one second.

The pulse is three rings at the source, 0.18 seconds apart, each growing from 10 to 70 points over 0.9 seconds. A floating icon rises above the source for 1.4 seconds.

Sentences stack upward from a line 90 points above the bottom of the screen, centred. Each sits on a plate of the language paper colour, because the role colours have their contrast on it [[src:warp_sdk/src/hud/cues.rs|The plate is the paper of the language: the role colours have]]. Its icons arrive 0.14 seconds apart, with arrows between them, and the count shows as `x2` and so on when a cue has merged.

### Ghost paths

A `GhostPath` is a quadratic arc from the old position to the new one. Its control point is the midpoint offset by a quarter of the path length along the normal. A dashed line traces the arc as a ghost travels it over `Config.path_time`, a ring marks the old position, and the reason icon appears at the middle of the path once the ghost has gone 30 percent of the way. The path fades during the last half second of the sentence. `Cues::ghost_paths` returns the paths on screen, and `GhostPath::sample` and `GhostPath::points` read the arc.

## Global and owned state

`Cues` is the whole state as a plain value, for a game that keeps its own and for tests [[src:warp_sdk/src/hud/cues.rs|is the state as a plain value, for a game that keeps its own and]]. Such a game calls `Cues::push`, `Cues::tick` and `Cues::draw`, or `Cues::show`, which ticks by the egui frame time and draws on the foreground layer.

The free functions use one global `Cues` behind a mutex. `emit` adds a cue from any thread, `show` ticks and draws once per frame, and `with` runs a closure on the state. `with` holds the mutex while its closure runs, so the closure must not call `emit` or `show`.

## Usage

```rust
use warp_sdk::hud::cues::{self, Cue, Kind, Sym};
use warp_sdk::ultraviolet::Vec2;

// In the game logic, at the moment the light goes out:
cues::emit(Cue::new(Kind::EnergyOut, sub_pos));
// When the tow brings the sub home:
cues::emit(Cue::new(Kind::Towed, home).from(sub_pos));

// In `gui`, once per frame. The closure maps a world position to screen points.
cues::show(ctx, |p| to_screen(p));
```

A respawn with the rule check looks like this:

```rust
fn respawn(&mut self) {
    let old = self.pos;
    self.pos = self.spawn;
    cues::emit(Cue::new(Kind::Respawn, self.pos).from(old));
    cues::debug_assert_cued(Kind::Respawn);
}
```

## Limitations

- Positions are in world units of type `ultraviolet::Vec2`, and they need a closure to reach the screen.
- Sizes and timings in the drawing code are fixed values in points and seconds, and they do not read the interface scale.
- The kit does not read the shell motion preference, so its animations run under MotionPref::Reduced.
- `debug_assert_cued` checks one second back. A check made later than that fails even if the cue did fire.
