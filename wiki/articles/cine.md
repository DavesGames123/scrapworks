---
title: Cine
short: Film-grammar transitions between screens, easing, and hover animation
category: Front end
order: 60
module: cine
example: cine, starter
see: front, front-menu, squircle, juice, post, front-settings
---
**Cine** is a kit of animated transitions between screens and hover animations for buttons, drawn in egui over any game, in the `warp_sdk::cine` module. A game holds one `Cine` for its screen enum, asks for a change with one call, and draws each visible screen through a `Layer` that the kit gives it. The module also holds 22 easing curves and a critically damped `Spring`. Its premise is that a transition is a sentence in film language and not decoration.[[src:warp_sdk/src/cine.rs|//! A transition is a sentence in film language, not decoration. Each]]

## Usage

```rust
use warp_sdk::cine::{Cine, Dir, Kind};

#[derive(Clone, Copy, PartialEq, Debug)]
enum Screen { Title, Play, Pause }

// In `new`:
let mut cine = Cine::new(Screen::Title);
// When the player presses Esc:
cine.go(Screen::Pause, Kind::Push(Dir::Left));
// In `gui`, every frame:
cine.update(ctx);
for (screen, layer) in cine.layers() {
    layer.draw(ctx, |ctx| draw_screen(ctx, screen));
}
cine.paint(ctx);
```

The call order in a frame is `update`, then `layers`, then `paint`. `update` reads the frame step, the screen rect and the motion preference, and advances the clock. `paint` draws the matte on a foreground layer after the screens.

`go` returns the `Transition`, which takes `.secs` and `.ease`:

```rust
cine.go(Screen::Pause, Kind::Push(Dir::Left)).secs(0.4);
```

`Cine::screen` gives the screen the game is on, or is going to, and input should route there. `busy` is true while a transition runs. A `go` during a transition starts from the screen that transition was going to. A `go` to the current screen does nothing.[[src:warp_sdk/src/cine.rs|/// transition was going to. A `go` to the screen the game is on does]]

## The film grammar

Each `Kind` states when an editor uses it. The default is the cut, and most menu changes are cuts.

| Kind | When | Seconds | Curve | Matte |
|---|---|---|---|---|
| Kind::Cut | The action continues, and the player must not wait | 0 | Linear | |
| Kind::DipToBlack | Time passes, a chapter ends, death, respawn, a load | 0.7 | QuadInOut | Yes |
| Kind::DipToColor | A flash: white for impact, red for damage | 0.45 | QuadInOut | Yes |
| Kind::Crossfade | The same place at another time, or pause over play | 0.35 | Linear | |
| Kind::Push | The screens are neighbours in space | 0.5 | CubicInOut | |
| Kind::Slide | A card on the table: a modal panel, an inventory | 0.42 | ExpoOut | |
| Kind::Iris | The scene ends on one subject that matters | 0.9 | QuadInOut | Yes |
| Kind::Wipe | A change of place or story line. A clock wipe says time passes | 0.7 | CubicInOut | Yes |
| Kind::DollyThrough | The player goes deeper: menu into level | 0.65 | QuartInOut | |
| Kind::RackFocus | The attention changes and the place does not | 0.7 | QuadInOut | |
| Kind::MatchCut | Continuity of a thing: a button grows into its panel | 0.5 | CubicInOut | |
| Kind::NoiseDissolve | A dream, a teleport, a signal lost, decay | 0.8 | Linear | Yes |

The values come from `Kind::default_secs` and `Kind::default_ease`.[[src:warp_sdk/src/cine.rs|/// The duration a film editor would give this kind, in seconds.]] `Dir` is the way the content moves: Left moves the old screen out to the left, and the new one comes in from the right. Push left goes forward, and push right goes back. Kind::Iris takes an `IrisShape` (circle, diamond or square) and an optional point, with `None` at the centre. Kind::Wipe takes a `WipeShape`: a straight edge, a radial growth, or a clock hand from twelve o'clock.

`Kind::showcase` gives one of every form, 16 in all, for a demonstration or a test. The example `cine` cycles through them.

## How it draws

`cine` draws on egui only, so it works over any game.[[src:warp_sdk/src/cine.rs|//! `cine` draws on egui only, so it works over any game. Each screen draws]]

Each screen draws inside `Layer::draw`. That call runs the closure, then fades and moves every shape that the screen painted, and it mutes the widgets of the screen while the screen moves. A `Layer` has an `offset`, an `alpha`, a `scale`, a `pivot` and a `live` flag. `live` is true when no transition moves the screen, and only then do its widgets take input.

The kinds fall into two groups. `Kind::uses_matte` is true for dip, iris, wipe and noise dissolve. A matte kind closes over the old screen, switches screens at the half, and opens over the new one, so only one screen is visible at a time. The other kinds move two layers.

| Kind | Old screen | New screen |
|---|---|---|
| Kind::Crossfade | Fades out | Fades in |
| Kind::Push | Moves out by the screen size | Moves in beside it |
| Kind::Slide | Moves a fifth of the way and dims | Slides over it |
| Kind::DollyThrough | Scales up and fades | Scales from 0.7 and fades in |
| Kind::RackFocus | Scales slightly and fades | Scales slightly and fades in |
| Kind::MatchCut | Fades out early | Fades in late |

`Phase` reports where a transition is: Out below one half, In from one half, and Done at one.

Cine::matte sets the matte colour, and a Kind::DipToColor uses its own. Cine::accent sets the fill of the match cut shape, whose rect `morph_rect` gives. Two directors in one context need different `id` values.

`Cine::blur` gives the softness of the old plane during a rack focus. A game with depth of field feeds it to [[post]]:

```rust
let b = cine.blur();
warp_sdk::post::set(|p| { p.dof.enabled = b > 0.0; p.dof.max_blur = 12.0 * b; });
```

For a match cut, the game passes the screen rects. The example takes `from` from the rect of the button that was pressed.

## Easing

`Ease` holds 22 curves as a value that a transition can hold: linear, then in, out and in-out forms of quad, cubic, quart, expo, back, elastic and bounce. `Ease::apply` clamps its input to 0 to 1. Each curve gives 0 at 0 and 1 at 1, and back and elastic go outside that range between.[[src:warp_sdk/src/cine.rs|/// 0 at 0 and 1 at 1. Back and elastic go outside 0..1 between.]] Each curve also exists as a free function, such as `cubic_out`.

## Spring

`Spring` is a critically damped spring: the fastest move to a target with no overshoot. It suits a value whose target changes at any time, such as a hover amount. The step is the exact solution, so ten steps of 1/600 s land where one step of 1/60 s lands, and the result does not change with the frame rate.[[src:warp_sdk/src/cine.rs|/// The step is the exact solution, so ten steps of 1/600 s land where one]]

```rust
let mut s = cine::Spring::new(0.0).settle_secs(0.25);
s.target = 1.0;
s.step(dt);
let amount = s.value;
```

`settle_secs` sets the time for the spring to come within 1 percent of a new target from rest, by setting `omega` to 6.64 over the seconds. `snap` puts it on the target at rest, and `settled` tests whether it is within a tolerance and nearly still. [[juice]] has a spring of its own for feedback.

## Hover animation

`Hover` is a library of ten animations, and a button takes several at once.

| Hover | When |
|---|---|
| Hover::Lift | The main action, a card |
| Hover::GlowSweep | A rare or magic item, a "new" badge |
| Hover::UnderlineGrow | A text link, a quiet menu entry |
| Hover::BracketClose | A selection in a tactical or sci-fi menu |
| Hover::SquircleExpand | A friendly, soft interface |
| Hover::LetterBreathe | A title-screen entry |
| Hover::Shimmer | A premium or locked item |
| Hover::Magnetic | A large, playful button that leans to the pointer |
| Hover::Ripple | Every pressable thing that needs feedback on press |
| Hover::FocusRing | Keyboard and gamepad focus. Always give focus a visible ring |

`cine::Button` is a button with these animations. Its default styles are lift, ripple and focus ring, and `.hover` adds one.[[src:warp_sdk/src/cine.rs|/// A button with hover and press animations. The default styles are lift,]]

```rust
if ui.add(cine::Button::new("Play").hover(Hover::Lift).hover(Hover::Ripple)).clicked() {
    cine.go(Screen::Play, Kind::DipToBlack);
}
```

`cine::hover` decorates a button that exists already, with a body that stays in place:

```rust
let r = ui.button("Inventory");
cine::hover(ui, &r, &[Hover::BracketClose, Hover::Ripple], accent);
```

`hover_fx` advances the springs of a response and gives a `HoverFx`. A custom widget reads `offset`, `grow` and `spacing` to place its content, then paints with `paint_back`, `paint_mid` and `paint_front`. The springs live in egui memory under the widget id.

## Reduced motion

The motion preference of `cine` is the context preference of the [[squircle|squircle kit]]. `set_reduce_motion` writes it, so the deck, the toasts and `cine` follow one switch.[[src:warp_sdk/src/cine.rs|/// This writes the squircle kit motion preference, so the deck, the toasts]]

Under reduced motion, each transition becomes a linear crossfade of at most `REDUCED_SECS`, 0.15 seconds, and a cut stays a cut. Each hover becomes a static highlight. `Cine::reduce_motion` forces the mode for one director. A game typically passes `access.reduce_motion` from [[front-settings]] to `set_reduce_motion`.

## Limitations

Layer::scale cannot scale egui shapes. `Layer::draw` applies only the alpha and the offset. A game that draws its world in `render` reads `scale` and `offset` for its camera, and egui content reads `Layer::transform_rect`.[[src:warp_sdk/src/cine.rs|//! `Layer::scale` cannot scale egui shapes in this egui. A game that draws]] Kind::DollyThrough and Kind::RackFocus therefore move egui content only through alpha unless the screen places itself. `Cine::new` starts with an area of 1280 by 720 until the first `update`.

## History

The kit was added on 2026-10-29.
