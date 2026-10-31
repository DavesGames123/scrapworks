---
title: Front end
short: Title and pause menus, save slots, and the settings model and page
category: Front end
order: 10
module: front
example: front, settings
see: front-menu, front-save, front-settings, shell, cine, fonts
---
**The front end** is the family of kits that a game uses for its title screen, pause menu, end screen, save slots and settings. It lives in the `warp_sdk::front` module, which holds three submodules and nothing else: `front::menu`, `front::save` and `front::settings`. Each submodule has one owner, and a game uses the full path.[[src:warp_sdk/src/front/mod.rs|//! Each submodule has one owner; games use the full path, for example]] The family supplies parts that a game composes, and the game keeps its own screen state.

## Parts

:: Main articles: [[front-menu]], [[front-save]], [[front-settings]]

| Kit | Holds | Writes to disk |
|---|---|---|
| [[front-menu]] | `Title`, `Pause`, `End`, the shared `Button` and five layouts | Nothing |
| [[front-save]] | `Slots`, numbered save files with metadata, and the `Fields` payload helper | `saves/slot-<k>.save` |
| [[front-settings]] | `Settings`, a typed model of six groups, and `Page`, a page with six tabs | `settings.cfg` |

Save files and the settings file share one root, under the per-user application data folder, at `games/<game>/`.

## How the parts meet

The worked example `front` shows the pattern. The screens are one enum in the game. `gui` asks the menu of the current screen for a `MenuAction` and moves to the next screen, and `render` steps the world only in play, so a menu freezes the game.[[src:warp_sdk/examples/front.rs|*  `render` steps the world only in `Screen::Play`, so a menu freezes play.]]

```rust
fn frame(&mut self, ctx: &egui::Context) {
    let action = match self.screen {
        Screen::Title => self.title.show(ctx),
        Screen::Paused => self.pause.show(ctx),
        Screen::End => self.end.show(ctx),
        Screen::Play => {
            if ctx.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::Escape)) {
                self.pause.reset_focus();
                self.screen = Screen::Paused;
            }
            None
        }
    };
    if let Some(a) = action {
        self.act(a);
    }
}
```

A menu returns an action and does nothing else, so each action is the game's to carry out.

| Action | Usual result |
|---|---|
| MenuAction::NewGame, MenuAction::TryAgain | Start a run |
| MenuAction::Continue, MenuAction::Load | Read a slot through [[front-save]] |
| MenuAction::Save | Write a slot |
| MenuAction::Settings | Show the [[front-settings]] page |
| MenuAction::Resume | Return to play |
| MenuAction::QuitToTitle, MenuAction::Title | Show the title |
| MenuAction::Quit | End the process |

The kits connect at two points. `Title::has_save` comes from `Slots::latest`, so Continue shows only when a slot holds a save. The title menu and the pause menu embed the same settings page, so a game writes the settings screen once.[[src:warp_sdk/src/front/settings.rs|//! One model, six tabs, one call to draw it. The title menu and the pause]]

## Relation to the shell

[[shell]] also provides a title, a pause menu and settings, as one wrapper with a fixed look. The two do not share code. `front` is for a game that owns its screens and its look: it adds save slots, an end screen, five layouts and six tabs of settings. The starter uses `front`, and it runs each screen change through [[cine]].

## History

The menu and save kits were added on 2026-10-29, in one commit whose subject records the rule of the title screen: a title that always leads in. The settings page followed the same day.
