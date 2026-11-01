---
title: Getting started
short: New project, the starter game, cargo run, the panels, and the smoke test
category: Introduction
order: 20
example: starter, pong, snake
see: scrap, renderer, building-a-game, smoke, shell, manifest
---
**Getting started** with SCRAP means making a Rust crate that depends on `warp_sdk`, implements `Renderer`, and starts the engine with `run`. The usual route is to copy the worked starter, which the editor's New Project command also writes. The starter is a small complete game, so a new project begins with a title screen, a pause menu, saves and passing tests. This article covers the project layout, the first run, the editor panels, and the headless test loop.

## A new project

The editor's New Project command writes four files: `Cargo.toml`, `src/main.rs`, `.gitignore` and `warp_app.toml`.[[src:warp_core/src/panels/editor/project/scaffold.rs|The bodies of a new project's files: Cargo.toml, src/main.rs, .gitignore,]] The Cargo manifest and the source are the code half of the project. `warp_app.toml` is the data half: see [[manifest]].

The generated manifest makes three decisions. It holds an empty `[workspace]` table, so that cargo stops walking up the directory tree and no parent folder claims the package as a member. It names `warp_sdk` by path, because the engine is a checkout and not a published crate. It names no second copy of egui or ultraviolet, because `warp_sdk` re-exports both.[[src:warp_core/src/panels/editor/project/scaffold.rs|`ultraviolet` AT THE ENGINE'S OWN VERSION.]]

```toml
[workspace]

[dependencies]
warp_sdk = { path = "<engine root>/warp_sdk" }
```

A game that plays over a network adds `features = ["net"]` to that line. See [[net]].

The engine root is the checkout that the editor found. When the editor finds no checkout, the path is a placeholder, and a comment in the file tells the author to replace it.

## The starter

The source that New Project writes is kept verbatim in `warp_sdk/examples/starter.rs`, which the compiler builds. The generator stamps the project name into `const GAME` and the second window title. A test named `generator_matches_the_compiled_example` fails when the two copies differ.[[src:warp_core/src/panels/editor/project/scaffold.rs|`generator_matches_the_compiled_example` fails when]]

```bash
cargo run  -p warp_sdk --example starter
cargo test -p warp_sdk --example starter
```

The starter is a game about a drifter that grabs sparks and brings them home, with two verbs: move and grab. Its header lists one line for each kit that it uses, so it also works as an index of the SDK. The rule stated there is to change the rules and keep the structure.[[src:warp_sdk/examples/starter.rs|grab. Change the rules, keep the structure.]]

| Kit | Use in the starter |
|---|---|
| [[front-menu]] | Title and Pause, real buttons, keys and mouse |
| [[front-save]] | Continue reads the latest slot, Pause then Save writes it |
| [[front-settings]] | The settings page, from Title and from Pause |
| [[fonts]], [[palette-kit]] | Faces and colours from one mood |
| [[visual]], [[semiotics]] | One colour per role, and icons in the deck panels |
| [[cine]] | Every screen change is a film transition |
| [[squircle]] | The deck: panels open only when the player asks |
| [[hud-progress]], [[hud-cues]], [[hud-minimap]] | The stage meter, the cause of each forced change, the map |
| [[teach]] | Glyph prompts for the two verbs |
| [[juice]] | Feedback on a grab and a delivery |
| [[post]] | The look, from a preset |
| [[soundtrack]] | The player's own music, and the game's effects |
| [[smoke]] | The screen names, and the playability test |

Its `main` sets the window icon and calls `run`:

```rust
fn main() {
    // The game icon, drawn from its name and seed, on every window.
    warp_sdk::icon::set_window_icon(&warp_sdk::icon::IconSpec::from_name(GAME, SEED));
    warp_sdk::run::<Game>(Config {
        window_mode: WindowMode::Windowed(1280, 720),
        window_title: GAME,
        secondary_window_title: "starter — second view",
    });
}
```

## The smallest game

A game needs only the four required methods of `Renderer`. This one draws a circle:

```rust
use warp_sdk::{egui, run, Config, DisplaySettings, RenderContext, Renderer, ViewportId};
use warp_sdk::winit_input_helper::WinitInputHelper;

struct Game { x: f32 }
impl Renderer for Game {
    fn new() -> Self { Game { x: 0.0 } }
    fn input(&mut self, _: ViewportId, _: &WinitInputHelper, _: u16, _: u16) {}
    fn render(&mut self, _: ViewportId, ctx: &mut RenderContext) {
        ctx.draw_circle(warp_sdk::ultraviolet::Vec2::new(self.x, 0.0), 0.5, [240, 240, 250, 255]);
    }
    fn gui(&mut self, _: ViewportId, _: &egui::Context, _: &mut DisplaySettings) {}
}
fn main() { run::<Game>(Config { window_title: "Game", ..Default::default() }); }
```

A bare `Renderer` fills the Game view and leaves every other panel dead. For a game that a player starts, pauses and quits, the choices are the [[front]] kits, as the starter uses them, or [[shell]], which wraps a game in ready screens.

Three whole games serve as patterns. Each is complete, needs no assets, and carries its own headless boot test.

| Example | Pattern |
|---|---|
| `pong` | Continuous motion, collision, scoring |
| `snake` | A discrete grid, growth, a tick clock |
| `observatory` | A scientific viewer on the squircle kit |

## The panel checklist

Each editor panel that a game drives is one channel, re-exported through `warp_sdk`. A game publishes to the channels it has data for and ignores the rest.[[src:warp_sdk/examples/starter.rs|census_wanted]]

| Panel | Channel | How a game feeds it |
|---|---|---|
| Hierarchy and Inspector | [[census]] | Publish `Census` rows each frame, gated on `census_wanted` |
| Control Map | [[bindings]] | `register` a static table of actions, and read verbs with `held` and `pressed` |
| Console | [[devconsole]] | `publish` lines, `publish_words` for completions, and drain `take_submissions` |
| Audio Scope | [[audio]] | Play through the audio bus, or write samples to the scope |
| Storyboard | [[hostlink]] | Name the current screen. `smoke::report_screen` does this and also records it for tests |
| Perf and Profiler | [[profile]] | Record per-frame spans. The loop timings need no code |
| A panel of your own | [[window]] | Implement WarpWindow and register it before `run` |

The starter wires the Hierarchy, the Control Map, the Console and the Storyboard. The recipes for each channel are in [[building-a-game]].

## The test loop

A game is not done until something has run it. That check needs no window and no GPU, because `smoke` drives the whole frame loop in a test.

```rust
#[test]
fn it_boots() {
    let report = warp_sdk::smoke::boot::<Game>(120);
    assert!(report.drove_a_panel(), "the game wired no panels");
}
```

The boot test proves that the game constructs and survives its frames. It sends no input, so a second test proves that a player can leave the title:

```rust
use warp_sdk::smoke::{self, Key, Script};

#[test]
fn title_to_play() {
    let report = smoke::play::<Game>(Script::new().wait(30).press(Key::Return).wait(60));
    assert!(report.reached("play"), "Enter did not start a run: {report:?}");
}
```

The game must name its screens with `smoke::report_screen` for that assertion to hold. `cargo test` is then the whole check: write the game, run the tests, read the failure, fix it, and stop on green. The tests do not prove pixels. See [[smoke]] for what each report holds.

## Next steps

[[building-a-game]] gives the reading order, the kit for each need, and the recipes for drawing and for the panels. The art direction rules in [[art-direction]] apply before the first screen is drawn, and they cover text, menus, fonts, lighting and density.
