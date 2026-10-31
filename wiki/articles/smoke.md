---
title: Smoke test
short: Boot a game with no window, and play it from a script
category: Getting started
order: 30
module: smoke
example: starter, pong
see: renderer, getting-started, building-a-game, shell, census, perf
---
**The smoke test** is the headless proof that a Warp game runs and that a player can play it, with no window and no GPU requirement. It lives in the `warp_sdk::smoke` module. `boot` drives the frame loop of a `Renderer` for a number of frames, and `play` also sends a `Script` of keys and mouse events and reports which screens the game went through. A panic fails the run, and a clean return is a game that runs.

## Design

A game made from an idea is done only when something has run it. `run` opens a window and a GPU, which a test and a build agent do not have. `smoke` needs neither for the core loop. `RenderContext::new` allocates CPU-side draw buffers and touches no device, so `render` records its shapes into memory exactly as it would before the upload. `egui::Context::run` is a whole `gui` frame, and it also wants no window.[[src:warp_sdk/src/smoke.rs|//! `RenderContext::new()` allocates the CPU-side draw buffers and touches no]]

The module draws a line between two claims: boot proves that a game runs, and play proves that it can be played. A game can compile, pass every test and still not start. In one case a menu was a stub that drew nothing, so no input could leave the title. `boot` sends no input and cannot see that.[[src:warp_sdk/src/smoke.rs|//! BOOT PROVES IT RUNS. PLAY PROVES IT CAN BE PLAYED.]]

## Usage

### Boot

```rust
#[test]
fn it_boots() {
    let report = warp_sdk::smoke::boot::<Game>(120);
    assert!(report.drove_a_panel(), "the game wired no panels");
}
```

The starter asserts more. A game that publishes a census can assert on that field, so the test fails if the wiring is dropped.

```rust
let report = smoke::boot::<Game>(120);
assert!(report.drew_something(), "the game drew nothing: {report:?}");
assert!(report.census_published, "the Hierarchy stayed empty: {report:?}");
assert!(report.actions_registered >= 5, "the Control Map stayed empty: {report:?}");
assert!(report.placeholders.is_empty());
```

### Play

A game names its screen each frame with `smoke::report_screen`. The name goes to the Storyboard, as the hostlink function of the same name does, and a run also records it. Games use this function in place of the hostlink call, because the hostlink function keeps the name only while an editor is attached.[[src:warp_sdk/src/smoke.rs|/// [`PlayReport::reached`] can see it. Use it in place of the hostlink call.]]

```rust
use warp_sdk::smoke::{self, Key, Script};

#[test]
fn title_to_play() {
    let report = smoke::play::<Game>(Script::new().wait(30).press(Key::Return).wait(60));
    assert!(report.reached("play"), "Enter did not start a run: {report:?}");
    assert!(report.path_contains(&["title", "play"]));
}
// In the game, when the screen changes:
// warp_sdk::smoke::report_screen("play");
```

### Probing state

`play_with` calls a closure after each frame with the game and the frame index, so a test can assert that the state changed. The starter uses it to prove that a held key moved the player.

```rust
let script = Script::new().wait(20).press(K::Return).wait(40).hold(K::Right, 40).press(K::Escape).wait(40);
let mut xs = Vec::new();
let report = smoke::play_with::<Game>(script, |g, _| xs.push(g.world.pos.x));
assert!(report.path_contains(&["title", "play", "pause"]), "screens: {:?}", report.screens());
let (start, end) = (xs[20], *xs.last().unwrap());
assert!(end > start, "holding Right did not move the drifter: {start} -> {end}");
```

## Script

A `Script` is a timeline of input, one entry for each frame. Each step adds frames, and the events of a step arrive at the start of its first frame, before `input` and `gui` run.[[src:warp_sdk/src/smoke.rs|/// first frame, before `input` and `gui` run:]] An empty script runs no frame.

| Step | Frames | What `input` sees |
|---|---|---|
| `wait(f)` | f | No new events |
| `press(k)` | 1 | `key_pressed(k)`, and `k` stays held |
| `release(k)` | 1 | `key_released(k)` |
| `hold(k, f)` | f + 1 | `k` held on f frames, released on the last |
| `mouse_to(xy)` | 1 | `mouse()` is `xy` |
| `click(b)` | 2 | `b` pressed, then released |
| `hold_mouse(b, f)` | f + 1 | `b` held on f frames, released on the last |

Mouse coordinates are pixels of `SIZE`, 1280 by 720, with the origin at the top left. The script drives the same `WinitInputHelper` that `input` reads and the egui input that `gui` reads, so a menu button that waits for a click sees it. `Key` is the winit key code and `Button` is the winit mouse button. Only the keys a menu uses reach egui: letters, digits, the arrows, Enter, Escape, Space, Tab, the function keys and a few others. Other keys reach `input` only.[[src:warp_sdk/src/smoke.rs|/// The egui key for a winit key, for the keys a menu uses. Other keys reach]]

## Reports

`boot` returns a `Report`. `play` returns a `PlayReport`, which holds a `Report` and dereferences to it.

| Field | Meaning |
|---|---|
| `frames` | Frames driven without a panic |
| `census_published` | The game published at least one census snapshot |
| `console_published` | The game published at least one console scrollback |
| `actions_registered` | The number of actions in the Control Map catalog |
| `shapes_drawn` | The peak of shapes recorded in one frame, not the sum |
| `underlay_drew` | Whether `scene_underlay` changed a pixel. `None` with no headless device |
| `frame_ms` | CPU time of each frame in milliseconds |
| `placeholders` | The placeholders that ran, in name order |

Three methods read those fields. `drove_a_panel` is the weakest useful assertion: a census, a console or an action exists. `drew_something` is true for a CPU shape or an underlay pixel. `p95_ms` gives the 95th percentile of `frame_ms`. A budget check reads a percentile and not the maximum, because the first frames build fonts and pipelines.[[src:warp_sdk/src/smoke.rs|/// The first frames build fonts and pipelines, so a budget check reads]]

`PlayReport` adds `screens`, in order, with a name that repeats on the next frame kept once. `reached` tests one name. `path_contains` tests that the given names occur in order, and other screens may occur between them.

## Placeholders

`warp_sdk::placeholder!("menus")` marks unfinished work. It goes where the real code will go, such as the body of a menu that draws nothing yet. Every `boot` and `play` that runs past it panics and names it, so a stub cannot ship as a game that compiles and passes its tests.[[src:warp_sdk/src/smoke.rs|/// `smoke::boot` and `smoke::play` that runs past it fails with the name, so]] `Script::allow_placeholders` lets a run finish while placeholders ran, and the report still lists them. In a shipped game the macro only records the name.

To boot an unfinished game, use a script:

```rust
smoke::play::<Game>(Script::new().wait(120).allow_placeholders());
```

## The GPU pass

When a headless device exists, each frame also calls `scene_underlay` into an HDR target cleared to zero, and the report tells whether it drew. A [[lit2d]] game draws in the underlay, so without this pass it reads as a game that drew nothing.[[src:warp_sdk/src/smoke.rs|//! reads as a game that drew nothing. Where no adapter answers, or where]] Where no adapter answers, or where the environment sets `WARP_SMOKE_GPU=0`, the pass is skipped and `underlay_drew` is `None`. The engine pipelines are built once per process for this pass.

## How a run differs from the real loop

A run drives `new`, then `input`, `render`, the underlay and `gui` on the calling thread. That is a close copy of the frame and not the same frame:

- `gui` runs after the underlay. The real loop runs `gui` before it. See [[renderer#Frame order|frame order]].
- Each frame gets a fresh `RenderContext`, so `frame_reset` is not called.
- `game_gui`, `scene_overlay`, `touch` and `set_crt_params` are not called, and `auto_style` has no effect.
- `gui` receives a local copy of `DisplaySettings::DEFAULT`, not the global block.
- Time advances at a fixed 60 frames per second in the egui input.

## Process-global state

The census, the bindings and the console exist once per process. A run stands in for a listening editor, so the game's gated publishes run. `census_published` and `console_published` are deltas against the values at the start of the run, because an earlier run in the process may already have moved those globals.[[src:warp_sdk/src/smoke.rs|//! are one per process. A run stands in for a listening editor so the game's]] `actions_registered` reads the whole catalog, so it is not a delta. Screens and placeholders are kept per thread, and a run drives the game on the thread that called it, so parallel tests do not see each other's screens.

## Limitations

A run proves that the game constructs, survives its frame loop, answers input and drives the panels it wired. It does not prove what the frame looks like: the CPU draw lists are not uploaded, and the underlay check tells only that some pixel changed.[[src:warp_sdk/src/smoke.rs|//! It proves the game constructs, survives its frame loop, answers input and]] `RenderContext::frame_fingerprint` guards the submitted draws. A game that needs a loaded atlas to avoid a panic still has to open in the editor.

## History

The headless boot harness was added on 2026-09-06.
