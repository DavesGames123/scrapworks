---
title: Gamepad
short: one verb layer over keyboard, mouse and pad, with input feel helpers
category: Game systems
order: 60
module: gamepad
see: bindings, teach, hud, juice, front-settings
---
**Gamepad** is the input feel layer of the Warp SDK: one set of named verbs over keyboard, mouse and gamepad, with input buffering, coyote time, tap and hold gestures, dead zones, rumble and device-aware button prompts. It lives in the `gamepad` module of `warp_sdk`. A game names its verbs once, and each frame it asks about a verb and never about a device. Each part also works alone, with plain `f64` seconds.

## Design

A game names its verbs with the same ids as its [[bindings]] actions. The keyboard side of each verb comes from `bindings`, so a rebind in the settings screen also moves the verb. The pad side and the mouse side come from the verb itself. There is one table of keyboard truth and no second copy to keep in step. [[src:warp_sdk/src/gamepad.rs|actions. The keyboard side of each verb comes from `bindings`, so a]]

warp_core links no gamepad crate. The `gilrs` dependency is in the SDK's manifest, so the engine core stays free of it, and the backend is one small trait that a game can replace. [[src:warp_sdk/src/gamepad.rs|warp_core links no gamepad crate. The gilrs line is in warp_sdk/Cargo.toml.]]

## Usage

```rust
use warp_sdk::gamepad::{self, PadBackend, PadButton, Rumble, Stick, Verb, Verbs};

// In Game::new:
let mut verbs = Verbs::new(vec![
    Verb::new("jump").pad(PadButton::South),
    Verb::new("fire").pad(PadButton::RightTrigger).mouse(0),
    Verb::new("dash").pad(PadButton::East).hold_time(0.3).double_time(0.25),
]);
let mut pad: Box<dyn PadBackend> = gamepad::default_backend();
// In Game::input:
verbs.update(input, pad.as_mut());
if verbs.buffered("jump") { /* jump */ }
let walk = verbs.move2("left", "right", "down", "up", Stick::Left);
let prompt = verbs.prompt("jump");     // "Space" or "A", from the last device
verbs.rumble(Rumble::hit());
```

`default_backend` should be called once, in Game::new, and the box kept. `Verbs::update` runs once per frame from Game::input. It polls the backend, reads the keyboard from `bindings`, and sends queued rumble to the backend.

## Verbs

A `Verb` has an id, pad buttons, an optional axis with a threshold, mouse buttons, and three timings.

| Field | Builder | Default | Meaning |
|---|---|---|---|
| `hold` | `Verb::hold_time` | 0.35 s | Seconds down before a press is a hold |
| `double` | `Verb::double_time` | 0 | Double-tap window. 0 turns double taps off |
| `buffer` | `Verb::buffer_time` | 0.12 s | Window for `Verbs::buffered` |

A verb is down when its key, any mouse button, any pad button or its axis is down. For `Verb::axis`, a negative threshold means the verb is down when the axis is at or below it, so `Verb::new("left").axis(PadAxis::LeftX, -0.5)` works as a direction. Axis tests use the raw value. `Verbs::value` gives 1 for digital input and the dead-zoned value for an axis, so a light push walks.

| Query | Answer |
|---|---|
| `Verbs::held` | The verb is down |
| `Verbs::pressed` | The verb went down this frame |
| `Verbs::released` | The verb came up this frame |
| `Verbs::value` | The verb from 0 to 1 |
| `Verbs::buffered` | Use a recent press, once |
| `Verbs::gesture` | The gesture that finished this frame |

`Verbs::step` is the same frame from plain data: a time, a `PadState`, and closures for keys and mouse. It exists for tests and for input that does not come from winit. A caller of `step` drains rumble itself with `Verbs::take_rumble`.

`Verbs::move2` builds a move vector from four verbs and a stick. The stick wins when it is out of its dead zone. Otherwise the digital vector is used, normalized to length 1 on diagonals. `Verbs::stick` gives one stick after the dead zone and the smoothing.

## Feel parts

### Input buffer

`InputBuffer` keeps a press for a short window, so a press made a little early still fires. The default window is 0.12 s. `InputBuffer::take` uses the press and returns true once. `InputBuffer::peek` tests with no use. `Verbs::buffered` wraps one buffer per verb and is meant to be called where the action can happen. [[src:warp_sdk/src/gamepad.rs|Keeps a press for a short window, so a press made a little early still]]

### Coyote time

`Coyote` keeps a jump possible for a short window after the player leaves the ground, 0.10 s by default. `Coyote::update` should be called each frame, before `Coyote::ready`. `Coyote::consume` marks the jump as used, so the window does not give a second jump. `try_jump` combines the two parts and returns true once, when the jump must start. It tests the coyote window first, so a press stays in the buffer while the player is in the air and fires on landing within its window. [[src:warp_sdk/src/gamepad.rs|if coyote.ready(now) && buffer.take(now) {]]

```rust
coyote.update(on_ground, now);
if gamepad::try_jump(&mut buf, &mut coyote, now) { vel.y = JUMP; }
```

### Gestures

`TapHold` sorts presses into a `Gesture`: Tap, DoubleTap or Hold. A tap fires after the double-tap window closes, or at release when the window is zero. This is why `Verb` defaults the window to 0: a verb with no double tap has no delay. A Hold fires while the input is still down, once per press. A tap followed by a hold gives one Hold, and the first tap is dropped. The standalone default is 0.35 s hold and 0.25 s double. [[src:warp_sdk/src/gamepad.rs|A short press. It fires after the double-tap window closes, or at]]

### Sticks

`DeadZone` is a radial dead zone with scaled output. Inside `inner` the output is zero. From `inner` to `outer` the length goes from 0 to 1, so the smallest move past the dead zone is a small output and not a jump. Past `outer` the length is 1, and the direction stays. The defaults are 0.15, 0.95 and a linear curve. `DeadZone::with_curve` sets a response exponent, where 2 gives finer control near the center. `DeadZone::apply_1d` handles one axis or a trigger. [[src:warp_sdk/src/gamepad.rs|goes from 0 to 1, so the smallest move past the dead zone is a small]]

`Smooth2` is exponential smoothing of a 2D value. Verbs::smoothing sets it for both sticks. The default of 0 turns smoothing off, and Verbs::dead_zone is the dead zone that the layer uses.

## Prompts and the last device

`DeviceKind` records the device that the player used last: Keyboard, Mouse or Gamepad. `Verbs::prompt` follows it and returns a `Prompt`, which holds a label and a `PromptShape` that tells a HUD what art to draw. On a gamepad the label comes from `PadButton::label` under Verbs::pad_style, a `PadStyle` of Xbox, PlayStation or Nintendo. Pad buttons are named by position, so PadButton::South shows "A", "Cross" or "B". On the keyboard the label comes from the first chord in `bindings`. A verb with no input on the device gives PromptShape::Unbound. [[src:warp_sdk/src/gamepad.rs|A pad button, by position. `South` is the bottom face button.]]

A button press, or a large stick or trigger move, selects the pad. A key press selects the keyboard. A mouse button, or mouse motion of at least Verbs::mouse_motion_switch pixels in a frame (4 by default), selects the mouse. When several happen in one frame, the order is mouse, then keyboard, then pad. Each source has its own edge, so a key press counts even while a pad button holds the same verb. `Verbs::device_changed` is true on the frame of a change, when prompts need a redraw. [[src:warp_sdk/src/gamepad.rs|a pad button holds the same verb. Order: mouse < keyboard < pad.]]

## Rumble

A `Rumble` has a heavy motor strength `low`, a light motor strength `high`, and a length. `Rumble::tick`, `Rumble::hit` and `Rumble::heavy` are presets. `Verbs::rumble` queues one, scaled by Verbs::rumble_scale, and a scale of 0 drops it. That field belongs in the settings screen. Rumble reaches the pad on the next `Verbs::update`.

## Backends

`PadBackend` is the trait behind the layer. `PadBackend::poll` gives a `PadState` once per frame, and `PadBackend::rumble` starts one rumble. The default rumble does nothing, so a backend need only poll.

| Backend | Where | Behavior |
|---|---|---|
| `GilrsPad` | Desktop only | Real pads on the `gilrs` crate |
| `NoPad` | Everywhere | Always reports no pad |
| `ScriptedPad` | Tests and demos | Plays recorded states, keeps every rumble |

`default_backend` gives `GilrsPad` where gilrs starts, else `NoPad`. The browser and Android builds do not link gilrs, so `GilrsPad`, `gilrs_button` and `gilrs_axis` do not exist there.

`GilrsPad` follows every connected pad. `poll` gives the state of the pad that sent the last input, so a second player who picks up a pad takes over. A pad plugged in or pulled out during play is handled, and a new connection alone does not take the active slot from a pad in use. Rumble uses force feedback on the active pad where the pad and the platform support it. The backend keeps up to 8 effect handles, because gilrs stops an effect when its handle drops. [[src:warp_sdk/src/gamepad.rs|the pad that sent the last input, so a second player who picks up a pad]]

## Interaction with other kits

`Verbs` reads [[bindings]] for keys and prompts, and a rebind needs no code here. A [[hud]] picks its art from the prompt shape. Verbs::rumble_scale and Verbs::pad_style are natural [[front-settings]] entries.

## Limitations

- `GilrsPad` keeps one active pad, and `PadBackend::poll` gives one state. The layer has no local multiplayer with one pad per player.
- A verb has one axis. `Verb::axis` replaces any earlier axis.
- Verb ids are `&'static str`. A query for an unknown id returns false or an unbound prompt, with no error.
- The first update sets `Verbs::dt` to 0.

## History

The module was added to the SDK on 2026-10-29. The `gilrs` backend came later on the same day, with a commit that added a window icon to every Warp window.
