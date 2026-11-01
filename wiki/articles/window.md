---
title: Custom windows
short: an application panel in the editor, from two methods
category: Editor channels
order: 90
module: window
see: editor-panels, widgets, palette, scale, renderer
---
**Custom windows** are panels that an application adds to the SCRAP editor without editing the editor. The `window` module of `warp_core`, re-exported by `warp_sdk`, holds the facts of a window as one struct and one trait, and keeps a process-wide table of them. An author implements `WarpWindow`, with its two methods `spec` and `ui`, calls `register` before `run`, and gets a tab, a row in the View menu, a place in the layout, and a tear-off to a real OS window.[[src:warp_core/src/window/mod.rs|A warp window is a title, a placement, a few permissions and a body that]]

## Usage

```rust
use warp_sdk::window::{Group, WarpWindow, WindowSpec};

#[derive(Default)]
pub struct MeterWindow {
    samples: u32,
}

impl WarpWindow for MeterWindow {
    fn spec(&self) -> WindowSpec {
        WindowSpec::new("meter", "Meter")
            .group(Group::Debug)
            .summary("What the frame cost, as a number.")
    }

    fn ui(&mut self, ui: &mut warp_sdk::egui::Ui) {
        ui.label(format!("{} samples", self.samples));
    }
}
```

Register it from `main`, before `run`:

```rust
warp_sdk::window::register(Box::new(MeterWindow::default())).ok();   // once, before run
```

`WarpWindow::spec` is read each frame, so a title can carry live state. `WarpWindow::on_close` is an optional third method for a window that holds something to release.

## The spec

`WindowSpec::new` takes a bare name and a title. The id gets the `KIND_PREFIX`, `window.`, added once, whether or not the caller wrote it.

| Builder | Effect |
| --- | --- |
| `WindowSpec::group` | Which View menu group it is filed under |
| `WindowSpec::pinned` | It cannot be closed |
| `WindowSpec::primary_only` | It cannot leave the primary window |
| `WindowSpec::standalone` | It may become its own process |
| `WindowSpec::undocked` | Kept out of a reset layout; the View menu still has it |
| `WindowSpec::source` | The file that the Windows panel shows beside it |
| `WindowSpec::summary` | One line about its purpose |

The defaults are closable, tearable, docked and not standalone. `Group` has Scene, Assets, Code, Debug and Tools, and Tools is the default. The engine names no menu: these are coarse kinds that an editor maps to its groups.

## Design

The dock was always open. It holds a panel id, which is a string, and asks a host for everything else. The closed part was the host: one panel's facts were written at fourteen `match` sites in the editor, and each site ended in a default arm. A forgotten site returned the wrong answer and still compiled.[[src:warp_core/src/window/mod.rs|so a site somebody forgets returns the WRONG ANSWER and does not fail to]] A `WindowSpec` answers all fourteen from one value, so a registered window is complete or absent, with no state between.

`window` is published and `dock` is not, and that is one decision. An author wants to say what a panel is called and to draw it. `dock` is the same want with a tree of rects, a drag protocol and a tear-off across processes attached.[[src:warp_sdk/src/lib.rs|`window` IS IN AND `dock` IS OUT, WHICH IS ONE DECISION]]

The table is global, like the other things that an application declares, such as the atlas set in [[image]] and the scene layers in [[render]]. The engine must not name the application, so the application hands its declarations in. A window must be sendable between threads, because the table is a static reachable from any thread. Nothing draws off the main thread.

## Registration

`register` returns a result. It fails for an empty name, and for a name with a `:`, which the dock reads as an instance separator. So the full kind is `window.hello`, never `window:hello`.

A second window of a name already registered replaces the first and returns an error. Two windows of one id would give the dock a panel that it could show twice and close once, and silently keeping the first is the failure that takes longest to see.[[src:warp_core/src/window/mod.rs|A second window of a name already registered REPLACES the first and says]]

The host uses `owns`, `specs`, `spec_of`, `count`, `draw` and `close_all`. `owns` tests the prefix and nothing else, so a host holds no list of ids.

`draw` holds the lock for the body of one window, and it uses `try_lock`. A window that drew itself from inside itself would deadlock, so it gets a line of text saying which window did it.[[src:warp_core/src/window/mod.rs|DRAWING TAKES THE LOCK, AND WILL NOT WAIT FOR IT]]

`register_disable` and `disable` hold a closure per panel kind that releases reopenable GPU resources, because freeing a tool's texture id needs the egui renderer. A tool that owns a target need not be a `WarpWindow`. A second disabler replaces the first and returns an error, the same contract as `register`.

## What it is not

It is not dynamic loading. There is no `libloading`, `dlopen` or wasm host in the workspace. A registered window is code compiled into the binary that runs it, so a rebuild is part of authoring, and there is no reload.[[src:warp_core/src/window/mod.rs|It is not dynamic loading.]]

## The surface a window may name

A window keeps to the published surface of `warp_sdk`. A window that keeps to it builds in a crate of its own, and a window that reaches past it cannot leave the repository. Widening what a window may name means one reviewed line of `warp_sdk/src/lib.rs`.[[src:docs/warp-windows.md|The rule is what separates a window from a patch to the editor.]]

Windows that ship with the editor sit in `warp_editor/src/windows/`, one file each. They name `warp_core`, and a test still holds them to the published surface by reading the allow-list from `warp_sdk/src/lib.rs`.

The **Windows** panel of the editor lists registered windows. It shows the source of the selected window beside the window itself, running, as the same registered object that the dock draws. Its API tab draws `warp_sdk/API.md`. Pressing Create writes a file from a template, and adds the lines that declare it. The panel prints the build command and does not run it, because a binary cannot replace itself while it is the running process.

## Limitations

- A rebuild is part of authoring.
- There is one window per name.
- A window must be sendable between threads.
- The scaffold needs a source tree, so a shipped binary with no `warp_editor/src/windows` beside it has nowhere to write.

## History

The module was added on 2026-08-20.
