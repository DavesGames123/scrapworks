---
title: Juice
short: Hit-stop, springs, number pops, rings and rumble in one value
category: Look
order: 50
module: juice
example: juice
see: camera, cine, gamepad, audio, teach, art-direction
demo: spring
---
**Juice** is the SCRAP feedback kit, a single value that turns game events into short, time-based effects such as hit-stop, squash and stretch, flash, number pops, rings, button punch, rumble requests and sound requests. It lives in `warp_sdk::juice` and its hub type is `Juice`. A game holds one `Juice`, calls one method per event, advances it once per frame, and paints what it reports. The module header states the purpose as feedback that tells the player "that was correct", which [[art-direction#Teach by play|the art direction]] requires when a player does an action correctly.

## Design

Every effect counts seconds and not frames, so one game looks the same at 30 fps and at 144 fps.[[src:warp_sdk/src/juice.rs|Every effect counts seconds, not frames.]] Effects also follow one reduce-motion switch. The kit does no audio and no controller output. `Rumble` and `Sound` are plain data that the game collects and hands to its own [[gamepad]] and [[audio]] code. The kit has no camera shake. Screen shake belongs to [[camera]], through `Camera2d::add_trauma`.

Effects keyed to an object take any `Hash` value as the `id`. The hash goes into an egui `Id` scoped with the string `"juice"`, so ids from a game do not collide with egui widgets.[[src:warp_sdk/src/juice.rs|Id::new(("juice", id))]] Spring, flash and punch state exist only while the effect runs: `Juice::tick` removes settled springs and spent flashes.

## The frame

A game uses the kit in three places.

1. On a game event, it calls an effect method or a bundle such as `Juice::impact`.
2. In `render`, it calls `Juice::tick` with the real frame time and moves the game with the time that comes back. It then reads `Juice::scale` and `Juice::tint` for each affected object.
3. In `gui`, it calls `Juice::show` to paint pops and rings, and drains `Juice::take_rumble` and `Juice::take_sounds`.

## Hit-stop and game time

`Juice::tick` takes the real frame time and returns game time. Game time is zero while a hit-stop holds, and all other effects continue to move on real time.[[src:warp_sdk/src/juice.rs|zero while a hit-stop holds, and pops, rings and buttons keep moving.]] When a freeze ends part of the way through a frame, the rest of that frame comes back as game time, so the return value can be a value between zero and `dt`.

`Juice::hit_stop` computes the freeze from `impact`: `HIT_STOP_PER_IMPACT` (0.05 s, three frames at 60 fps) per unit of impact, capped at `HIT_STOP_MAX` (0.25 s), then scaled by `Juice::motion`. A second hit during a freeze does not add time. The remaining freeze becomes the larger of the two values.[[src:warp_sdk/src/juice.rs|self.stop_left = self.stop_left.max(secs);]] `Juice::frozen` reports whether a freeze is active. `tick` treats a remainder under 1e-5 s as zero, so float residue from many small frames does not read as a freeze. A non-finite `dt` counts as zero.

## Springs

{{demo:spring}}

`Spring` is a public damped spring with `value`, `velocity`, `target`, `freq` in oscillations per second and a `damping` ratio. `Spring::step` uses the exact solution of an underdamped oscillator and not numerical integration, so the curve does not change with the frame rate.[[src:warp_sdk/src/juice.rs|`step` uses the exact solution, so the curve does not change with the]] A test runs one spring at 30 and 144 fps and requires values within 1e-4.

With angular frequency *w* = 2 pi *f*, damping *z* and damped frequency *wd* = *w* sqrt(1 - *z*^2), one step computes the offset from the target as an exponential decay times a sine and cosine pair. `step` clamps `freq` to at least 0.01 and `damping` to the range 0.01 to 0.99, which keeps *wd* above zero. It ignores a `dt` that is zero, negative or not finite.

| Constructor | Frequency | Damping | Character |
|---|---|---|---|
| `Spring::bouncy` | 4 Hz | 0.25 | overshoots and wobbles; used for squash |
| `Spring::snappy` | 6 Hz | 0.5 | overshoots once and stops; used for pops |
| `Spring::new` | any | any | starts at rest at `value`; UI punch uses 5 Hz and 0.3 |

`Spring::kick` adds velocity. `Spring::settled` is true when the offset is under 1e-3 and the speed is under 1e-2.

```rust
let mut s = Spring::bouncy(0.0);
s.kick(4.0);
s.step(dt);
let offset = s.value;
```

This spring is distinct from `smooth_damp` in [[camera]], which is critically damped and never overshoots a still target. Juice wants the overshoot. The camera must not have it.

## Squash, stretch and flash

`Juice::squash` pushes a stored spring value down and `Juice::stretch` pushes the same value up. The value stays between -0.7 and 2.0. Both use one bouncy spring per `id`, and `tick` returns it to zero. `Juice::scale` returns `[1.0 / y, y]` where `y` is one plus the spring value, so the area of the object stays constant and a flat squash is also wide.[[src:warp_sdk/src/juice.rs|The area stays the same: a flat]] An unknown `id` gives `[1.0, 1.0]`.

`Juice::flash` flashes an object for `FLASH_SECS` (0.12 s) and `Juice::flash_for` takes a duration. The strength starts at the current `Juice::motion` and falls linearly to zero. `Juice::flash_amount` gives the strength for a shader. `Juice::tint` mixes a base `[u8; 4]` toward the flash colour and keeps the base alpha. A new flash on the same `id` replaces the old one.

## Number pops

`Juice::pop` shows a signed number that rises `POP_RISE` (46 screen points), grows and fades over `POP_LIFE` (0.9 s). Alpha holds at 1 for the first 65 percent of the life, then falls to zero. The rise eases out on a quadratic curve.

A new pop merges into a live pop when both have the same colour and sign, the two world points are nearer than `POP_MERGE_DIST` (0.75 units) and the live pop last received a value less than `POP_MERGE_SECS` (0.3 s) ago. The values add, the age resets and the text grows again, so fast hits read as one large number.[[src:warp_sdk/src/juice.rs|fast hits read as one big number.]] The kit keeps 64 pops at most and removes the oldest beyond that. A game that paints pops itself reads `Juice::pops`, which returns `PopView` values.

## Rings and pulses

`Juice::ring` draws a ring that grows to 48 points in 0.45 s. `Juice::ring_sized` takes a radius and a duration. `Juice::pulse` draws a filled disc that swells a little to 26 points and fades in 0.25 s. It reads as "here". A ring starts at 15 percent of its radius and a pulse at 60 percent. The radius eases out on a cubic curve, and alpha is the square of the remaining life.[[src:warp_sdk/src/juice.rs|self.from_r + (self.to_r - self.from_r) * (1.0 - (1.0 - t).powi(3))]] Radii are in screen points, not world units. `Juice::ring_radii` exposes the current radii.

## UI punch

`Juice::punch` makes a UI element jump in size and spring back. `Juice::ui_scale` returns the size multiplier of that element. `Juice::punch` clamps the stored spring value to the range -0.5 to 0.6.

`Juice::button` replaces an egui button. It takes the space of a normal button and paints at the punch scale, so layout does not move. On hover it punches by 0.06 and sends a `"hover"` sound at gain 0.5. On a click it pushes in by 0.12, then kicks the spring so that the button passes its size. It also sends a `"click"` sound and a `Rumble::tap`.[[src:warp_sdk/src/juice.rs|Press in first. The spring throws the button past its size.]]

## Bundles

Two methods combine effects for the common cases.

| Method | Effects |
|---|---|
| `Juice::impact` | hit-stop, squash of 0.25 times strength (at most 0.6), white flash, white ring of 30 plus 20 points per unit of strength (strength counted up to 3) over 0.3 s, `Rumble::thud`, `"impact"` sound with gain capped at 2 |
| `Juice::success` | `SUCCESS` green pulse, a 54-point ring, an 80-point ring delayed by 0.1 s, `Rumble::success`, `"success"` sound |

`Juice::success_in` is the same bundle in a colour that the game chooses, which suits a game that takes its success colour from a [[visual]] `Language`.

## Rumble and sound

`Rumble` holds the strength of the `low` and `high` motors and a duration. `Rumble::tap` is a light tap, `Rumble::thud` scales with strength up to 2, and `Rumble::success` is a light double tap. `Sound` holds a static `name`, an optional world point and a `gain`. The names that the kit sends are `"impact"`, `"success"`, `"hover"` and `"click"`, and `Juice::sound` adds others.

```rust
for r in juice.take_rumble() { pad.rumble(r.low, r.high, r.secs); }
for s in juice.take_sounds() { audio.play(s.name, s.gain); }
```

Each take call empties its queue.

## Reduce motion

`Juice::set_reduce_motion` sets a switch on the value. `Juice::show` also reads the motion preference of the egui context, the same preference that `cine::set_reduce_motion` writes. When either asks for less motion, `Juice::motion` returns `REDUCED` (0.25) and each effect uses that part of its full size: shorter freezes, smaller squash, weaker flashes, smaller rings and weaker rumble.[[src:warp_sdk/src/juice.rs|shorter freezes, smaller squash, weaker flashes, smaller rings and rumble.]] The context preference takes effect only after the first `show`, because that call is where the kit reads it. `motion` is public, so game code can scale its own effects with it.

## Usage

```rust
use warp_sdk::juice::{Juice, Rumble};
let mut juice = Juice::new();
juice.set_reduce_motion(settings.accessibility.reduce_motion);

// On a hit: freeze frames, squash, white flash, ring, rumble, sound.
juice.impact([x, y], enemy_id, 1.0);
juice.pop([x, y], -12, Color32::from_rgb(255, 90, 80));
// On a correct action: pulse, two rings, a "success" sound, a light tap.
juice.success([x, y]);

// In `render`, once per frame. Move the game with the dt that comes back.
let game_dt = juice.tick(frame_dt);
let [sx, sy] = juice.scale(enemy_id);       // squash and stretch
let rgba = juice.tint(enemy_id, base_rgba);  // impact flash

// In `gui`: paint pops and rings, and use buttons that punch.
juice.show(ctx, &project);                   // project: world -> screen
if juice.button(ui, "Play").clicked() { /* ... */ }
for r in juice.take_rumble() { /* give to the gamepad kit */ }
for s in juice.take_sounds() { /* play s.name at s.gain */ }
```

A world point is a `World`, which is `[f32; 2]`, the same type as `teach::World`. `Juice::show` takes a closure that returns the screen point of a world point, or `None` when it is off screen, so `teach::View2::projector` works as it is.[[src:warp_sdk/src/juice.rs|`teach::View2::projector` works as it is.]] `Juice::active` is true while anything still moves. `show` requests its own repaint in that case.

The `juice` example fires each effect from a button row. Its `step` method shows the split: effects move with real time and the block spins with game time, so a hit-stop shows as a stop.

## Limitations

The kit paints pops and rings with egui on the foreground layer, so they sit above the scene and are not part of it. Pop text uses a proportional egui font unless the game paints pops itself through `Juice::pops`. A rumble or sound does nothing until the game drains and plays it.

## History

The module was added on 2026-10-29 in the commit "sdk: add juice, hit-stop, springs, pops and success feedback".
