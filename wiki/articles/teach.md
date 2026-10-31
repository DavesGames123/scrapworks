---
title: Teach kit
short: tutorials with control glyphs, verb-keyed steps and purpose cues
category: Information
order: 30
module: teach
example: teach
see: bindings, semiotics, visual, hud-cues, squircle, gamepad
---
**The teach kit** is a set of tools that teach a game by playing it, with pictures in place of a list of words. It lives in `warp_sdk::teach`. A player learns a game when the game shows them what to do, at the place where they do it, and then shows them that they did it [[src:warp_sdk/src/teach.rs|A player learns a game when the game shows them what to do, at the place]]. The kit gives a game three tools for that: `Glyph`, `Course` and `Cues`.

## Overview

| Tool | What it does |
|---|---|
| `Glyph` | Draws a control as a vector picture: a keycap with the bound key, a mouse button that blinks or fills, a wheel, a gamepad button |
| `Course` | Runs ordered steps keyed by verbs, with one glyph prompt at a time at a world point or a screen point |
| `Cues` | Shows purpose: a moving dotted path from a thing to where it is used, and a first-encounter callout |

The `Glyph` of this kit differs from the squircle `squircle::Glyph` and from `hud::cues::Sym`. It draws an input control and not an object or a key face.

## Design

### The game reports done

The kit does not watch keys, because a key press is not the lesson. "Grab" is learned when an orb is in the claw, not when the button went down far from any orb. Only the game knows that, so only the game says it [[src:warp_sdk/src/teach.rs|that, so only the game says it. A verb the player does before its step]]. A verb the player does before its step comes is learned too, and its prompt never shows.

### Prompts read the binding at paint time

`Glyph::action` keeps the action id, not the key. The painter asks `chords` each frame, so a player who rebinds grab to F sees F on the next frame [[src:warp_sdk/src/teach.rs|`bindings::chords` each frame, so a player who rebinds grab to F sees F]]. An action with no binding shows a `?` keycap. See [[bindings]].

## Glyphs

A `Glyph` is one control, drawn as a picture and never as a line of text. `Glyph::action` is the preferred form, because it follows a rebind.

| Constructor | Shows |
|---|---|
| `Glyph::action` | The bound control of an action, pressed |
| `Glyph::action_hold` | The bound control of an action, held |
| `Glyph::cross` | Four actions as an inverted T of keycaps, for movement |
| `Glyph::key` | A keycap with a fixed label, for a key that is not an action |
| `Glyph::mouse` | A mouse with one `MouseButton` marked |
| `Glyph::pad` | A gamepad control, one of the `Pad` values |
| `Glyph::row` | Alternatives side by side, for example keyboard and gamepad |
| Glyph::Wheel | A mouse with the wheel marked, for a `Scroll` direction |

`Gesture` sets how the player must work the control, and the glyph animates the difference. Under Gesture::Press the glyph blinks down and up with a ripple. Under Gesture::Hold it stays down and a ring fills. `Pad` names controls by position and not by brand letter, so Pad::South is the bottom face button.

`Glyph::from_chord` builds the glyph for one chord, and `Glyph::resolved` replaces every Glyph::Action with its bound control now. `paint_glyph` paints a glyph in a game's own panel, and `glyph_size` measures one.

## Courses

A `Course` is an ordered tutorial with one prompt at a time. `Step::new` pairs a verb with a glyph, and `Step::at` sets its first `Anchor`. `Course::step` adds a step at the end.

### Lifecycle

Each frame, in the game logic, a game does three things in this order.

1. It calls `Course::anchor` for a verb whose thing moves.
2. It calls `Course::done` when the player has done a verb. Calling it each frame is cheap, because a learned verb returns at once.
3. It calls `Course::tick` once with the frame time.

In `gui` it calls `Course::show` with a projection closure.

A prompt moves through these phases.

| Phase | Default time | What happens |
|---|---:|---|
| Gap | 0.6 s at the start, 0.25 s after a confirm, 0.3 s after a skip | No prompt; the next prompt waits for any confirm animation |
| Show | 8 s | The prompt pops in, then fades during its last 0.4 s |
| Rest | 4 s | The prompt is gone; it then returns with a bounce |

`Course::timeout` sets the show and rest times, with a show time of at least 0.5 seconds. `Course::reshows` counts how many times the current prompt came back, so a game can add help for a stuck player.

When `Course::done` names the current step, the prompt shows a check pulse and flies away over `CONFIRM_SECONDS` (0.7), and the next step comes after that animation. Only a prompt the player could see flies away. A verb done during the gap, before its prompt came, just counts [[src:warp_sdk/src/teach.rs|the gap, before its prompt came, just counts.]]. When `Course::done` names a later step, that step is learned and never shows. The function returns true the first time a verb is learned.

A confirm reaches the game in two ways. `Course::on_confirm` sets a hook, for a particle burst or a sound. `Course::take_confirms` returns the `Confirm` values since the last call. `Confirm.world` is set when the step's anchor was a world point.

### Skipping and replay

`Course::show` paints a small skip mark at the corner of the prompt, and a click on it skips the step. `Course::skip` does the same from code, and `Course::skip_all` skips every remaining step. A skipped step counts as learned and does not come back, and it sends no `Confirm`. `Course::relearn` forgets every learned verb and starts from the first step.

`Course::current` gives the verb the course teaches now, `Course::is_learned` tests one verb, `Course::finished` is true when no step remains and no animation runs, and `Course::visible_prompts` reports the number on screen. The course keeps that at 0 or 1.

### Anchors

An `Anchor` says where a prompt points. Anchor::World is a world point, and the prompt sits above it with a tail that points down. Anchor::Screen is a fraction of the screen, and the default is `[0.5, 0.78]`. Anchor::Rect is a screen element: the prompt sits above it and a ring marks it.

## Purpose cues

`Cues` shows what things are for. Most games use the global one through the free functions `begin`, `kind`, `link`, `reveal`, `tick` and `show`. A separate `Cues` value has the same methods. `with` runs a closure on the global cues, and `begin_with` replaces them, for example with an in-memory set in a test. The global cues start in memory if `begin` never ran, so nothing persists until it does [[src:warp_sdk/src/teach.rs|Run `f` on the global cues. They start in memory if `begin` never ran.]].

### Kinds and roles

A `Kind` is a kind of thing in the game, with an id, a `Role` and a short name. `Kind::new` cuts a longer name to two words. A link or a reveal of an unregistered id uses Role::Unknown.

Each teach `Role` is one action of the [[semiotics|semiotic standard]]. The action class gives the frame and the colour role, and the colour comes from a `visual::Language`. A game that uses the same language in its HUD teaches the player what a colour and a frame mean [[src:warp_sdk/src/teach.rs|HUD teaches the player what a colour and a frame mean.]].

| Role | Standard action | Meaning |
|---|---|---|
| Role::Collect | Collect | Pick it up |
| Role::Home | Deliver | Bring things here |
| Role::Danger | Danger | Keep away, or fight it |
| Role::Ally | Health | It helps the player |
| Role::Food | Energy | It keeps something alive |
| Role::Tool | Interact | Use it on something |
| Role::Unknown | New | Not known yet |

Role::Home is not a house, because in the standard the house frame means Build. `Cues::with_language` and `Cues::set_language` give the game's language, and the default is `visual::default_language`. `Cues::set_icon` paints kind icons with a game's own closure of type `IconFn`, which returns false to keep the role icon. `paint_role_icon` draws a role glyph outside the cues.

### Links

`link` draws a moving, dotted path from a thing to the place where it is used, the first few times only. A game calls it every frame while the link applies, for example while the player carries an orb. One unbroken run of frames is one showing. After `Cues::link_shows` showings of a kind (default 3), later runs draw nothing [[src:warp_sdk/src/teach.rs|showings of `kind`, later runs draw nothing. Returns true while the]]. A link started counts in `Cues::tick`, so `link` calls must come before the tick of that frame. The path fades in over a quarter second and out over a third.

### Reveals

`reveal` introduces a kind the first time the player meets it, with a ring, the role icon and the name, for `REVEAL_SECONDS` (3.2). A game calls it each frame while the thing is in view, and the callout follows the thing. After the first time, the call does nothing. `Cues::introduced` tests whether a kind has had its callout, and `Cues::relearn` forgets every count.

## World to screen

Every paint call takes a `project` closure from a world point to an optional egui point. `World` is `[f32; 2]` with +y up, and `ultraviolet::Vec2` converts with `.into()`.

`View2` is a small camera that matches the engine 2D view: `half_height` is the same number a game gives to `set_view_scale`. `View2::projector` returns the closure, and `View2::project` maps one point. A closure that returns `None` leaves that frame's anchor or link undrawn.

## Persistence

Learned state goes to `<app data>/teach/<game>.course` and `<game>.cues`, as one `key<TAB>count` line per entry [[src:warp_sdk/src/teach.rs|`<app data>/teach/<game>.course` and `<game>.cues`, one `key<TAB>count`]]. `store_path` gives the path, and it replaces any character other than ASCII letters, digits, `-` and `_` in the game name.

| Constructor | Storage |
|---|---|
| `Course::new`, `Cues::new` | Under app data for the game |
| `Course::in_memory`, `Cues::in_memory` | None; for tests and demos |
| `Course::stored_at`, `Cues::stored_at` | One named file |

Learned verbs persist, so a second session starts at the first verb the player has not done yet. On a platform with no app data folder the state stays in memory. The store writes the whole file on each count change and ignores write errors. A line that does not parse is skipped when the file loads.

## Usage

```rust
let mut course = teach::Course::new("reef")
    .step(teach::Step::new("move", teach::Glyph::cross("up", "left", "down", "right")))
    .step(teach::Step::new("grab", teach::Glyph::action_hold("grab")));
teach::begin("reef");
teach::kind(teach::Kind::new("orb", teach::Role::Collect, "Orb"));

// each frame, in game logic:
course.anchor("move", teach::Anchor::World(player));
if moved { course.done("move"); }
teach::reveal("orb", orb_pos);
if carrying { teach::link(player, base, "orb"); }
course.tick(dt);
teach::tick(dt);

// in gui:
let project = teach::View2::new(cam_pos, cam_half_height).projector(ctx);
course.show(ctx, &project);
teach::show(ctx, &project);
```

The `teach` example builds its lesson from three steps and offers keyboard and stick at once:

```rust
fn lesson(course: Course) -> Course {
    let walk = Glyph::row(vec![
        Glyph::cross("up", "left", "down", "right"),
        Glyph::pad(Pad::LeftStick, Gesture::Hold),
    ]);
    course
        .step(Step::new("move", walk.clone()))
        .step(Step::new("grab", Glyph::action_hold("grab")))
        .step(Step::new("deliver", walk).at(Anchor::World(w(BASE))))
}
```

Its game `step` method holds all of the game logic and takes plain controls, so the tests run the lesson with no window. Its second run starts where the player stopped.

## Interaction with other kits

- [[bindings]] supplies the chord of each Glyph::Action, read each frame.
- [[semiotics]] and [[visual]] supply the role actions, frames and colours.
- [[hud-cues]] uses the same standard for forced changes. A `teach` prompt asks for an action, and a cue explains something that happened.
- A `Pad` glyph names a position only. It is a fixed picture and is not read from a binding or from [[gamepad]].

## Limitations

- There is no global `Course`. A game owns its `Course` value, and `Course::show` needs `&mut self`.
- The kit does not read the shell motion preference, and its painted sizes are fixed points.
- `Course::done` records any verb, including one that is in no step.
- Prompts are one at a time by design, so a course cannot teach two verbs in parallel.

## History

The kit was added on 2026-10-29, after a placeholder registration, and a later commit of that day aligned it with the semiotic standard.
