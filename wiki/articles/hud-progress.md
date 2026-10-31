---
title: HUD progress
short: a stage meter and a short goal list, icon first
category: Information
order: 23
module: hud::progress
example: hud_progress
see: hud, hud-cues, quest, metaprog
---
**HUD progress** is a pair of displays, a stage meter and a short goal list, that show a player how far they are and what to do now. The kit lives in `warp_sdk::hud::progress`. `Meter` shows the first, and `Objectives` shows the second. Neither uses prose, and a stage name is optional and one or two words [[src:warp_sdk/src/hud/progress.rs|Neither uses prose. A stage name is optional and one or two words.]].

## The meter

A `Meter` runs from 0 to a maximum. Thresholds cut the bar into segments, one per `Stage`. `Meter::stage` adds a stage from a threshold and a `Sym`, and `Meter::with_stage` adds a full `Stage`. Stages keep value order whatever the order of the calls.

`Stage::name` sets an optional name, and `Stage::flies_to` sets the screen point where the reward applies. On unlock the icon flies to that point. With no target, the icon arcs from the tick to a point 90 points below it and fades.

### Fill

`Meter::set` sets the value, clamped to the range. `Meter::tick` eases the shown fill toward it. The step is exponential at the rate of the `ease` field (default 4 per second), with a floor of 5 percent of the maximum per second, so the end of the move does not crawl. The step never passes the value, so the fill only moves one way while the value moves one way [[src:warp_sdk/src/hud/progress.rs|value and never overshoots, so it only moves one way while the value moves]].

`Meter::value` reads the value given, and `Meter::fill` reads the eased fill. `Meter::stage_fill` gives the fill inside the current segment, from 0 to 1.

### Unlocks

When the fill reaches a tick, that stage unlocks once. The value can fall and rise again, and the stage does not unlock a second time [[src:warp_sdk/src/hud/progress.rs|this step. A stage unlocks once, also when the value falls and rises again.]]. `Meter::tick` and `Meter::show` return the indices of the stages that unlocked in that step, so a game gives the reward there.

`Meter::current_stage` counts the stages passed, `Meter::next` returns the next stage to unlock, and `Meter::is_unlocked` tests one. The fill cannot exceed the maximum, so a stage placed above the maximum never unlocks.

### Drawing

Passed icons sit below the bar, lit. The icon of the next unlock sits above its tick, dim, on a disc, and bobs. The name of the last passed stage sits to the left of the bar.

An unlock plays for 1.2 seconds: a burst of twelve dots and a ring at the tick for 0.6 seconds, and the icon's flight, which starts 0.1 seconds after the unlock and lasts 0.9 seconds. The bar itself pulses for 0.5 seconds.

`Meter::show` draws on a foreground layer. With no rect set by `Meter::at_rect`, the bar goes at the top centre, 12 points high and 40 percent of the screen width, clamped to 160 through 440 points.

The fill colour is the public `color` field, which defaults to the colour of Role::Gain in the default visual language.

## The objectives

`Objectives` shows up to `MAX_ROWS` goals (3), each an icon, a count and a small bar. More goals wait in order, and a waiting goal takes the place of a finished one.

`Objectives::add` adds a goal with a game-chosen id, an icon and the count that completes it, which is at least 1. `Objectives::set` sets the count, and `Objectives::bump` adds to it. `Objectives::goal` reads a `Goal`, on screen or waiting, and `Objectives::visible` lists the ids on screen.

`Objectives::tick` and `Objectives::show` return the ids of the goals done in that step. A done goal draws a check, then slides away, and it leaves the rows 1.6 seconds after completion. After that, `Objectives::goal` no longer finds it. A waiting goal that already meets its count completes on the first tick after it reaches a row.

`Objectives::show` draws on a foreground layer. The public `origin` field places the list, and its default is 20 points from the left edge and 70 from the top.

## Usage

```rust
use warp_sdk::hud::progress::{Meter, Objectives};
use warp_sdk::hud::cues::Sym;

// In `new`:
let mut meter = Meter::new(100.0)
    .stage(25.0, Sym::Lamp)
    .stage(60.0, Sym::Bolt)
    .stage(100.0, Sym::Star);
let mut goals = Objectives::default();
goals.add(1, Sym::Gem, 5);

// In the game logic:
meter.set(score);
goals.set(1, gems);

// In `gui`, once per frame:
for stage in meter.show(ctx) { /* stage `stage` unlocked: give its reward */ }
for id in goals.show(ctx) { /* goal `id` done */ }
```

The `hud_progress` example keeps the state in a window-free Sim, which owns one `Meter`, one `Objectives` and one `Cues` and ticks them with the game clock. Its `gui` only draws, with `Meter::draw` and `Objectives::draw` [[src:warp_sdk/examples/hud_progress.rs|and pushes a cue at the moment of each forced change. `gui` only draws.]]. That split lets a test step the game with no window. `Meter::animating` and `Objectives::animating` tell a caller of the `draw` forms whether to request a repaint.

## Interaction with other kits

The kit uses `Sym`, `paint_sym` and `Role` from [[hud-cues]]. An unlock or a finished goal is not a forced change, but the `hud_progress` example still pushes Kind::Unlocked and Kind::ObjectiveDone cues for them. A game feeds the kit plain numbers.

## Limitations

- Sizes and timings are fixed values in points and seconds, and they do not read the interface scale or the shell motion preference.
- `Objectives` always uses the default visual language for its colours, and it has no language setting.
- `Meter::show` and `Objectives::show` tick the state, so a game must not also call `Meter::tick` or `Objectives::tick` in the same frame, or time runs at double speed.
