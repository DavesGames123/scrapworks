---
title: Display mode
short: window mode, vsync, frame cap and windowed size at run time, from any thread
category: Engine
order: 20
module: display_mode
see: renderer, perf, types, front-settings, hostlink, gpu
---
**Display mode** is the run-time state of the primary window: its window mode, vsync, frame cap and windowed size. The `display_mode` module of `warp_sdk` reads and changes that state from any thread. A game calls it from `new`, from `gui`, from a settings menu or from a worker thread, and the engine applies the change at its next frame.

## Design

The `window_mode` field of `Config` sets the first window mode and is read once, at `run`. Before this module existed, the present mode was fixed when the surface was built, and a game that wanted a frame cap wrote its own. The store is the one run-time path for all four values.[[src:warp_core/src/types/display_store.rs|This store is the one runtime path for all four]] It follows the same pattern as the post-effect store: a mutex that never waits for a frame.

A game needs no frame limiter of its own, because the engine frame gate keeps the `frame_cap` field.[[src:warp_sdk/src/display_mode.rs|frame gate keeps `frame_cap`]]

## The state

`DisplayMode` is a small copyable struct with four fields. All of them apply together at the next frame.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `window` | `WindowMode` | Windowed | How the primary window covers the screen. |
| `vsync` | `bool` | `false` | `true` makes present wait for the monitor refresh. |
| `frame_cap` | optional `u32` | none | The most frames per second the engine renders. |
| `resolution` | optional `[u32; 2]` | none | The windowed size in physical pixels, and the exclusive video mode size. |

The default `DisplayMode` describes the window that `run` opened with no change. A `frame_cap` of none keeps the manifest value `window.frame_cap_hz`, which is 60 when the [[manifest]] has none. A cap of zero is the same as none.[[src:warp_core/src/types/display_store.rs|`Some(0)` is the same as `None`.]] A `resolution` of none keeps the current size.

`WindowMode` is the name that this module gives to `DisplayWindow`. It has three variants:

- Windowed is a window with a frame, sized by `resolution`.
- BorderlessFullscreen is a frameless window that covers the monitor. The desktop video mode stays, so Alt-tab is fast.
- ExclusiveFullscreen changes the monitor to a video mode. `resolution` picks the mode when the monitor has one of that size, and otherwise the desktop size is used. If the monitor has no video mode at all, the engine uses borderless.[[src:warp_core/src/types/display_store.rs|With no video mode at all, the engine uses borderless.]]

## Usage

```rust
use warp_sdk::display_mode::{self, WindowMode};

display_mode::set(|m| {
    m.window = WindowMode::BorderlessFullscreen;
    m.vsync = false;
    m.frame_cap = Some(144);
});
let sizes = display_mode::resolutions();      // for the settings menu
```

`get` returns a copy of the newest value. `set` changes it through a closure, and `replace` swaps the whole value. `revision` counts the `set` and `replace` calls of the process, so a different number since the last read means that the mode changed.

The store is locked while the closure of `set` runs, so that closure must not call another function of the module.[[src:warp_sdk/src/display_mode.rs|The store is locked while `f` runs, so `f` must not call another function]]

### Monitors and resolutions

`monitors` returns one `MonitorInfo` per monitor: name, desktop size, refresh rate, scale and exclusive video mode sizes. The engine reads the list on the main thread at the first frame and after each change, so the list is empty before the first frame and in a headless test.

`resolutions` returns the exclusive video mode sizes of the monitor that holds the window, unique and largest first. It is empty when the engine knows no monitor. A settings menu passes one of these sizes in the `resolution` field.

## When a change shows

`set` writes the store in `warp_core` and never waits for a frame. The rest happens in the primary viewport:[[src:warp_core/src/types/display_store.rs|THE ORDER IN ONE FRAME]]

1. Any thread updates the store, and the revision goes up.
2. The primary viewport syncs the display store next to the post store. A new revision gives the new value once.
3. The frame writes the window mode and size requests, which the event loop applies to the winit window. It sets the engine frame cap at once.
4. The frame marks the present mode. The next frame applies that mode before it gets the surface texture, because a surface is not reconfigured while one of its textures is out.
5. The frame refreshes the monitor list after each change, on the main thread.

The frame cap therefore applies at once, and vsync applies one frame later. When no update arrived, the frame copies the real window state back, so F11 and the Settings panel show in `get`.

## Present mode choice

`present_mode_for` returns the present mode that the engine uses for a `vsync` value on a surface with a given list of supported modes. Vsync on is Fifo. Vsync off is Mailbox, else Immediate, else a mode that the surface has.

```rust
use warp_sdk::wgpu::PresentMode as P;
assert_eq!(present_mode_for(false, &[P::Fifo, P::Immediate]), P::Immediate);
```

With vsync off, the frame cap sets the rate.

## Limitations

A game hosted in the editor's Game panel gets the frame cap and vsync, but its window follows the panel, so window mode and size do nothing there.[[src:warp_sdk/src/display_mode.rs|but its window follows the panel, so window mode and size do nothing.]] See [[hostlink]].

## History

The module was added on 2026-10-29 with the second pass of `warp_sdk` kits.
