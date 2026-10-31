---
title: Game shell
short: Ready title, pause, settings, tutorial and HUD around any game
category: Getting started
order: 20
module: shell, shell::theme, shell::tutor, shell::widgets
see: renderer, smoke, front, teach, squircle, scale
---
**The game shell** is a ready player-facing layer that wraps a game in a title screen, a pause menu, a settings screen, a guided tutorial and a HUD at the correct scale. It lives in the `warp_sdk::shell` module. A game implements `ShellGame` in place of `Renderer`, starts with `run_shell` in place of `run`, and supplies content and no styling. The shell suits a game that wants those screens with no further design. The [[front]] kits are the parts for a game that builds its own.

## Design

`ShellGame` splits the render method of `Renderer` into `update` (the step) and `draw` (the paint), so a menu can freeze the world and cover it.[[src:warp_sdk/src/shell/mod.rs|the old render into `update` (step) and `draw` (paint), so a menu freezes and]] `Chrome<G>` is the `Renderer` that the engine drives. It owns the screen state and runs the game only in play and tutorial.

The look is in `shell::theme` (tokens) and `shell::widgets` (components), and the tutorial is in `shell::tutor`. The curve of each menu comes from the shared [[squircle|squircle kit]], so a shell button and a deck key have the same corner.

## ShellGame

| Method | Default | Purpose |
|---|---|---|
| `new()` | Required | Construct the game |
| `about()` | Required | The `About` name and tagline on the title |
| `actions()` | Required | The static [[bindings]] table. The shell registers it |
| `input(input, width, height)` | Required | Read input, in play and tutorial only |
| `update()` | Required | Step the rules, in play and tutorial only |
| `draw(ctx)` | Required | Paint the world, on every screen |
| `hud(ui)` | Required | Draw the HUD, in play and tutorial |
| `reset()` | Required | Start a clean game |
| `tutorial()` | Empty slice | The lessons, in order. Empty skips the tutorial |
| `begin_tutorial()` | Calls `reset` | Arrange a safe teaching scenario |
| `milestone(flag)` | `false` | Report a named teaching milestone |

```rust
use warp_sdk::shell::{About, ShellGame};

struct Game { /* rules */ }
impl ShellGame for Game {
    fn new() -> Self { Game {} }
    fn about() -> About { About { title: "REEF", tagline: "Grow the colony" } }
    fn actions() -> &'static [warp_sdk::bindings::Action] { &[] }
    fn input(&mut self, _: &warp_sdk::winit_input_helper::WinitInputHelper, _: u16, _: u16) {}
    fn update(&mut self) {}
    fn draw(&mut self, _ctx: &mut warp_sdk::RenderContext) {}
    fn hud(&mut self, _ui: &mut warp_sdk::egui::Ui) {}
    fn reset(&mut self) {}
}
fn main() { warp_sdk::run_shell::<Game>(warp_sdk::Config::default()); }
```

## Screens

`Chrome` moves between five modes, and each reports a screen name to the editor's Storyboard.[[src:warp_sdk/src/shell/mod.rs|Mode::Paused => "pause",]]

| Mode | Screen name | Reached from | Game runs |
|---|---|---|---|
| Title | `title` | Start, or Quit to title | `draw` only |
| Tutorial | `tutorial` | Play, when lessons exist | `input`, `update`, `draw`, `hud` |
| Play | `play` | Play, Resume, Restart, or the end of the tutorial | `input`, `update`, `draw`, `hud` |
| Paused | `pause` | Escape in play | `draw` only |
| Settings | `settings` | Title or Pause | `draw` only |

`update` runs inside the `render` of `Chrome`, on the primary viewport only. `draw` runs for every viewport, in every mode, so the world shows behind each menu.

Escape has one meaning per mode. In play it pauses, and in pause it resumes. In settings it returns to the screen that opened settings. In the tutorial it drops the sandbox, calls `reset` and starts a clean game. On the title it does nothing.[[src:warp_sdk/src/shell/mod.rs|// Skipping drops the sandbox and starts a clean game.]] The tutorial starts each time the player presses Play on the title, because no flag records that it was seen. Restart in the pause menu calls `reset` and returns to play.

The settings screen has Master, Music and Sound sliders and an interface scale. The values go in a plain `key=value` file named after the title, in the current directory, and each change saves the file.[[src:warp_sdk/src/shell/mod.rs|// ── Settings, saved beside the game as plain key=value lines]]

## Tutor

`shell::tutor` is a tutorial that walks the player through play by making them do it. The game runs live under the lesson. A lesson names a goal that the shell can watch, and it does not advance until the player reaches that goal.[[src:warp_sdk/src/shell/tutor.rs|names a goal the shell can watch, and it does not advance until the player]]

A `Lesson` has a title, a body, a `Goal` and a `Spotlight`. The body may hold `[Key]` tokens, which draw as pulsing key-caps.

| Goal | Advances when |
|---|---|
| `Goal::Press { actions, times }` | Any of these actions was pressed `times` times |
| `Goal::Hold { action, frames }` | This action was held for `frames` frames in total |
| `Goal::Milestone { flag }` | `milestone` reports the flag true |
| `Goal::Beat { frames }` | The player watched for `frames` frames |

After a goal is met, the tutor holds for 42 frames, so the player watches the effect that they caused before the next lesson arrives.[[src:warp_sdk/src/shell/tutor.rs|const OBS_FRAMES: u32 = 42; // the observation hold after a goal is met]] Input is not counted during the hold.

Spotlight::Named points at a target through a registry that is rebuilt every frame. A widget or HUD element calls `publish_rect` with a name in `hud`, the lesson names it, and an amber ring paints over it. Spotlight::None leaves the cue to the key-cap in the coach card, since a key is not on screen. The coach card shows progress dots and a Skip tutorial button. At the end of the last lesson, the shell calls `reset` and starts a clean game.

## Theme

`shell::theme` holds the tokens of a dark chassis: a background ladder, one teal accent, one gold, a text ramp and signal colours.[[src:warp_sdk/src/shell/theme.rs|pub const ACCENT: [u8; 3] = [50, 180, 200]; // teal — the "this one" colour]] `theme::apply` pushes the tokens into the widget table of egui once per frame, so a slider that a game draws in `hud` matches the menus. It also installs JetBrains Mono at the front of both font families, and the same call runs the scale.

| Token | Value (points) |
|---|---|
| `DISPLAY` | 44 |
| `TITLE` | 27 |
| `HEADING` | 21 |
| `BUTTON` | 18 |
| `BODY` | 16 |
| `SMALL` | 14 |
| `MICRO` | 12 |

Sizes go through `scale::px` at use: `theme::font` and `theme::mono` do this. `theme::c` and `theme::ca` make an egui colour from a token, and `theme::mix` blends two tokens.

## Widgets

`shell::widgets` holds the components that the default egui theme lacks.

| Component | Purpose |
|---|---|
| `button` | A squircle button with Btn::Primary (gold) or Btn::Normal weight |
| `ghost` | A text-only button for a quiet action |
| `panel` | A framed card |
| `keycap` | A key glyph whose accent pulses |
| `section` | A section rule in mono |
| `slider_row` | A labelled slider. Returns true while the value changes |
| `dim` | Darkens the window and adds a soft vignette |
| `cue_ring` | The amber pulsing ring of the tutor |
| `menu` | A squircle that unfolds out of a key |

`menu` puts a screen in a squircle that unfolds from a small key at its centre, over the Structural motion token. The contents lay out at their settled place at once, and the chrome clips them, so the animated geometry is the clip and nothing fights the layout.[[src:warp_sdk/src/shell/widgets.rs|So the animated geometry is the clip, not the layout, and nothing fights]] Clicks inside are muted until the unfold ends.

When a screen stops calling `menu`, `retract_menus` shrinks that chrome back into its key. It is called once per frame, after the screens. The retracting chrome is empty, because the screen no longer runs. Reduced or off motion snaps both moves.

## Testing

`shell::boot` boots a shell game headlessly and returns a `smoke::Report`.

```rust
#[test]
fn the_shell_boots_on_its_unfolding_title() {
    let report = boot::<Probe>(30);
    assert_eq!(report.frames, 30);
    assert!(report.actions_registered >= 1, "no actions: {report:?}");
}
```

## Limitations

- `Chrome` reports its screens through the hostlink function `report_screen`, not `smoke::report_screen`. `smoke::play` records only names sent through `smoke::report_screen`, so a `PlayReport` for `Chrome` holds no screens.[[src:warp_sdk/src/smoke.rs|//! while an editor is attached, so `play` cannot see a name sent there.]]
- The three audio values in the settings are stored, and nothing in the shell applies them to a sink.
- `ShellGame` has no close hook, and Quit on the title calls `std::process::exit`. A game that must save on exit needs another route.
- The shell has no save slots, no end screen and no way to return to the title from a game rule. A game that needs them uses [[front]].
- `Chrome` returns false from `auto_style` and runs the zoom keys itself, or the engine would step the scale a second time on one press.
