---
title: Boot splash and screenshots
short: The native splash a game owns, and PNG screenshots on every platform
category: Front end
order: 80
module: boot, boot::shot
see: icon, renderer, display-mode, smoke
---
**Boot splash and screenshots** are the kit for the first thing that a person sees and for capturing frames, in the `warp_sdk::boot` module. `Splash` sets the look of a small native window that shows while the main window waits for its first present. `boot::shot` saves a frame as a PNG, from the F12 key or from game code. The module re-exports the `bootsplash` module of `warp_core` and part of its `shot` module.

## Why a splash exists

The main window is built hidden and is shown on its first present. On DX12 that present waits for every render pipeline, and FXC compiles them again at each launch. The boot log measured that wait at about 35 seconds, with no window and no taskbar button, which reads as a game that did not start.[[src:warp_core/src/bootsplash.rs|*  again at each launch. The bootlog measured that wait at about 35 s, and a]]

The splash opens on its own thread at the top of `run`, before the GPU. It has its own message loop, so the blocked main thread cannot make it "Not Responding". It closes when the main window becomes visible, or when a fatal error box opens.

## Usage

Set the look with one call before `run`.

```rust
use warp_sdk::boot::{Icon, Layout, Progress, Splash, Status};

fn main() {
    Splash::new("REEF")
        .palette([4, 18, 28], [80, 220, 200], [220, 240, 240])
        .icon(Icon::from_fn(64, 64, |_x, y| [40, 120 + (y * 2) as u8, 200, 255]))
        .layout(Layout::Centered)
        .progress(Progress::Ring)
        .status(Status::words(["Waking the reef", "Lighting the water"]))
        .install();
    warp_sdk::run::<Game>(warp_sdk::Config { window_title: "Reef", ..Default::default() });
}
```

A game that does not call `install` gets the default: a dark window with the application name, the engine stage word and a thin bar. It has no long sentence and no seconds counter.[[src:warp_sdk/src/boot.rs|//! A game that does not call `install` gets the default: a dark window with]]

## Splash

The game owns the look, and the engine supplies only the stage text and the step count.[[src:warp_core/src/bootsplash.rs|*  the installed `Splash` once. The engine supplies only the stage text and]]

| Builder | Default | Meaning |
|---|---|---|
| `Splash::new(title)` | The application name | The wordmark |
| `font(bytes)` | Segoe UI | TTF or OTF bytes for the wordmark |
| `palette(background, accent, text)` | 12, 14, 20; 96, 168, 255; 226, 230, 238 | The dim text and the track are mixes of these |
| `icon(icon)` | None | RGBA pixels |
| `layout(layout)` | Layout::Centered | Where the parts go |
| `progress(progress)` | Progress::Bar | The progress mark |
| `status(status)` | Status::Engine | The status line |
| `size(width, height)` | 480 by 220 | Pixels at 96 dpi. The minimum is 240 by 140 |
| `seconds(show)` | Off | Show the seconds since launch |

| Value | Effect |
|---|---|
| Layout::Centered | The icon, the wordmark, the status and the progress in one centre column |
| Layout::Corner | Icon and wordmark at the top left, status and progress at the bottom right |
| Layout::FullBleed | The icon fills the window as art, with the text at the bottom left |
| Progress::Bar | A thin bar |
| Progress::Ring | A ring that fills clockwise from the top |
| Progress::Dots | Five dots that fill from the left |
| Status::IconOnly | No text |
| Status::Engine | The engine stage words, for example "Drawing the first frame" |
| Status::Words | Short lines from the game |

`Status::words` makes the Words form from a list. The splash shows line `n` at boot stage `n`, and keeps the last line for every later stage.[[src:warp_core/src/bootsplash.rs|/// Short lines from the game. The splash shows line `n` at boot stage]]

`Icon::from_fn` builds art from a function of the pixel position, and `Icon::from_rgba` takes straight RGBA bytes and returns `None` when the length is wrong. `Splash::install` stores the look, and the free function `install` does the same. `installed` gives the current look. `Splash::text_lines` gives the lines for a stage, as pure code.

## Where it runs

The splash runs on Windows only, and only for a standalone game. A hosted game's window is never shown, so a splash would never close. On every other target each function is a no-op, so a call site needs no `cfg`.[[src:warp_core/src/bootsplash.rs|*  never shown, so a splash would never close. On every other target each]]

A person can close the splash with the X button, the taskbar or Alt+F4. That ends the process at once with exit code 0. No frame is drawn yet, so there is nothing to save. Before this behaviour, closing the splash destroyed only the splash, and the game opened its main window later anyway.

## Screenshots

`boot::shot` has two capture paths.[[src:warp_core/src/shot.rs|Two capture paths write a PNG of the game.]]

| Path | Used by | Holds |
|---|---|---|
| Readback | Game code on every platform, and F12 off macOS | The scene target, with no egui layer and no CRT pass |
| Screencapture | F12 on macOS | The window rect, with the CRT pass and every egui layer |

Game code asks for a frame with `request`, so a one-shot agent can look at its own game:

```rust
// In Renderer::render:
self.frame += 1;
if self.frame == 120 {
    warp_sdk::boot::shot::request(Some("target/shots/title.png".into()));
}
```

`request(None)` writes to `screenshots_dir`, under the application data folder, with a tag and the UTC time in the file name. When the platform has no application data folder, the kit uses a folder in the temporary directory. A request with a path writes to that path and makes the parent folders.

After the next present, the render loop copies the scene target to a buffer, and a worker thread writes the PNG. The readback stalls the render thread for one frame, once per request, and the encode is not part of the stall. The PNG is on disk some milliseconds after the frame, and `last_saved` gives its path. `pending` is true while a request waits.[[src:warp_core/src/shot.rs|*  The readback stalls the render thread for one frame, once for each]]

Requests do not queue. Two requests before one frame give one picture, at the path of the last request.

macOS F12 keeps screencapture so that both sides of a before-and-after pair go through the same capture path. The cost is the Screen Recording permission of macOS: until the user gives it, macOS writes a picture of the desktop with no game window in it. Game code on macOS still uses the readback.[[src:warp_core/src/shot.rs|*  Until the user gives it, macOS writes a picture of the desktop with no]]

Two lower-level calls are public. `save_texture` reads one texture back and writes a PNG at once. The texture needs `COPY_SRC` and 4 bytes per pixel. `write_png` writes tight RGBA8 bytes as a PNG and makes the parent folders.

## History

The native progress window was added to the engine on 2026-10-18, and the change that ends the process on a person's close followed on 2026-10-25. The `boot` module of the SDK dates from 2026-10-29.
