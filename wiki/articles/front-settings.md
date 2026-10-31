---
title: Settings
short: One typed settings model, its file, and a six-tab page to edit it
category: Front end
order: 40
module: front::settings
example: settings
see: front, front-menu, post, display-mode, bindings, cine
---
**Settings** are the settings model of a game, its file, and the page that edits it, in the `warp_sdk::front::settings` module. `Settings` holds typed values in six groups, and `Page` draws them on six tabs with one call. The title menu and the pause menu embed the same page, so a game writes the settings screen once. A game reads the fields directly, every frame.

## Usage

The order in `new` matters. Register the key bindings, so the Controls tab lists them. Set the post look, so that load can mask it. Load the settings. Then add the game rows, because a value from the file wins over a default.[[src:warp_sdk/examples/settings.rs|*  2. Set the post look, so load can mask it with the graphics switches.]]

```rust
use warp_sdk::front::settings::{Page, Settings};

// In `new`: set the look first, then load. Load applies the post switches.
warp_sdk::post::replace(warp_sdk::post::Post::underwater());
let mut settings = Settings::load("reef");
let mut page = Page::new();

// In `gui`, inside the pause menu or the title menu:
let ev = page.show(ui, &mut settings);
if ev.back { /* close the settings screen */ }
if ev.display_changed() { /* send the display values to display_mode */ }
let music = settings.audio.gain(warp_sdk::front::settings::Channel::Music);
```

## The model

`Settings` has six public groups: `display`, `graphics`, `audio`, `controls`, `accessibility` and `gameplay`. Each value also has a key, for example `audio.music`. The key is the name in the file, the name in `SettingsEvent::changed`, and the name that a row on the page edits, so one table holds all three uses.[[src:warp_sdk/src/front/settings.rs|//! The key is the name in the file, the name in [`SettingsEvent::changed`],]]

`Settings::value` and `Settings::set_value` work by key. `set_value` clamps a number to the range of its row and returns true when the value changed. `flag`, `number` and `pick` read one row, and give false, 0.0 or 0 for a key of another type.

### Display

| Key | Default | Range or choices |
|---|---|---|
| `display.screen` | Borderless | Windowed, Borderless, Fullscreen |
| `display.resolution` | 1920 by 1080 | Display::resolutions, plus the current size |
| `display.vsync` | On | |
| `display.frame_cap` | 0, no cap | 30, 60, 120, 144, 165, 240, unlimited |
| `display.ui_scale` | 1.0 | 0.75 to 2.0 |
| `display.brightness` | 1.0 | 0.5 to 1.5 |

A game sets Display::resolutions from the monitor list before it shows the page. `Settings::exposure` multiplies a base gain by the brightness.

### Graphics

| Key | Default | Range or choices |
|---|---|---|
| `graphics.preset` | High | Low, Medium, High, Ultra, Custom |
| `graphics.particles` | 1.0 | 0.25 to 2.0 |
| `graphics.fluid` | High | Low, Medium, High, Ultra |
| `graphics.bloom` | On | |
| `graphics.anti_alias` | On | |
| `graphics.depth_of_field` | On | |
| `graphics.motion_blur` | Off | |
| `graphics.retro` | On | The CRT tube |

A preset sets the quality values at once.[[src:warp_sdk/src/front/settings.rs|Quality::Ultra => (1.5, FluidRes::Ultra, true, true, true, true),]] A change to one of those values picks the matching preset, or Custom when none matches. The retro switch is not part of a preset.

| Preset | Particles | Fluid | Bloom | Anti-alias | Depth of field | Motion blur |
|---|---|---|---|---|---|---|
| Low | 0.5 | Low | Off | On | Off | Off |
| Medium | 0.75 | Medium | On | On | Off | Off |
| High | 1.0 | High | On | On | On | Off |
| Ultra | 1.5 | Ultra | On | On | On | On |

`FluidRes::cells` gives the grid cells on the long side: 128, 256, 384 or 512.

### Audio

| Key | Default |
|---|---|
| `audio.master` | 0.8 |
| `audio.music` | 0.7 |
| `audio.effects` | 0.8 |
| `audio.ambience` | 0.8 |
| `audio.interface` | 0.6 |
| `audio.mute_unfocused` | On |

`Audio::gain` gives the gain to play a channel at, master times the channel, clamped to the range 0 to 1.

### Controls, accessibility and gameplay

| Key | Default | Range or choices |
|---|---|---|
| `controls.sensitivity` | 1.0 | 0.1 to 3.0 |
| `controls.invert_y` | Off | |
| `controls.vibration` | On | |
| `access.text_size` | 1.0 | 0.8 to 2.0 |
| `access.captions` | Off | |
| `access.reduce_motion` | Off | |
| `access.screen_shake` | 1.0 | 0.0 to 1.0 |
| `access.colour_blind` | Off | Off, Protanopia, Deuteranopia, Tritanopia |
| `access.hold_to_toggle` | Off | |
| `gameplay.difficulty` | Normal | Story, Normal, Hard |
| `gameplay.hints` | On | |
| `gameplay.autosave` | On | |
| `gameplay.pause_unfocused` | On | |

The Controls tab also lists one row for each action in the [[bindings]] catalog, under the group of that action. The key bindings keep their own file. `Settings::text_scale` multiplies the interface scale by the text size.

## Game rows

`add_toggle`, `add_slider` and `add_choice` add a row to the Gameplay tab, under a key of `game.<name>`. A value from the file wins over the default. Adding a key twice keeps the first row.[[src:warp_sdk/src/front/settings.rs|/// Add a toggle row to the Gameplay tab. A value from the file wins over]] A row's bare name also works in `flag`, `number` and `pick`.

```rust
fn add_game_rows(s: &mut Settings) {
    s.add_toggle("motes", "Show motes", "Draw the small particles in the water.", true);
    s.add_slider("drift", "Current speed", "Change the speed of the water.", 0.25, 2.0, 1.0, Unit::Times);
    s.add_choice("lamp", "Lamp colour", "The colour of the lamp light.", &["Amber", "Cyan", "White"], 0);
}
```

`Unit` sets how a slider writes its value: Percent shows 0.75 as 75%, Times shows 1.25 with a multiplication sign, and Plain shows the number. A slider made this way has a keyboard step of a tenth of its span and a fine step of a hundredth.

## The file

`Settings::load` reads `settings.cfg` in the game's folder under the application data root, at the path that `path_for` gives. The file is one `key = value` per line, with a `version` line first and `#` comments. Toggles write `on` or `off`, and choices write their label. A missing or broken file gives the defaults, and a missing key keeps its default.[[src:warp_sdk/src/front/settings.rs|/// Load a game's settings and apply the post switches. A missing or]]

An unknown key stays in the model and goes back into the file on save, so an older build does not delete the values of a newer build.[[src:warp_sdk/src/front/settings.rs|//! the file on save, so an older build does not delete the values of a newer]] The same mechanism carries game rows: a value for `game.tracers` waits as an unknown key until `add_toggle` claims it. `unknown_keys` lists them.

`Settings::save` writes the file that `load` read. It writes nothing for a model that did not come from `load`. `save_to` writes to a temporary file and then renames it, so a crash does not leave half a file. `Settings::from_text` and `to_text` parse and write the text with no file and no change to `post`.

## The post switches are a mask

The graphics switches for bloom, anti-aliasing, depth of field, motion blur and retro can only remove an effect from the look of the game. They never add an effect that the look does not use.[[src:warp_sdk/src/front/settings.rs|//! retro filter) can only remove an effect from the game's look. They never]] A switch that is off turns that effect off, and a switch that is on keeps the value of the look. This is why retro can default to on while the CRT stays off in a look that does not use it.

`load` captures the look from `post::get`, so a game sets the look before it loads, or calls `set_look` afterwards. `apply_post` writes the masked look to [[post]], and `post_for` gives the masked look with no side effect. Depth of field masks both depth-of-field effects.

## The page

`Page::show` draws the page in a `Ui`, runs its input and returns a `SettingsEvent`. The page applies the post switches and saves the file by itself. It saves after a change, when no pointer button is down, so a drag does not write on every frame.[[src:warp_sdk/src/front/settings.rs|if s.dirty && !dragging && s.path.is_some() {]] Display and audio changes are only reported, and the game wires them.

`SettingsEvent` has the `changed` list of keys and a `back` flag. A rebind appears as `bind.<action id>`. `changed(key)`, `tab_changed`, `display_changed` and `audio_changed` query the list.

```rust
let ev = page.show(ui, &mut settings);
if ev.changed("audio.music") { music.set_volume(settings.audio.gain(Channel::Music)); }
```

The example embeds the page in an area over a dimmed scene:

```rust
egui::Area::new("settings_menu").fixed_pos(rect.min).show(ctx, |ui| {
    ui.set_min_size(size);
    ui.set_max_size(size);
    ev = self.page.show(ui, &mut self.settings);
});
if ev.back {
    self.open = false;
}
```

### Keys

| Key | Action |
|---|---|
| Up, Down | Move the focus |
| Left, Right | Change the value. Shift gives the fine step |
| Enter, Space | Toggle, cycle, start a rebind, or press a button |
| Delete | Put the row back to its default |
| Q, E, Tab | Change the tab |
| Escape | Set `back` |

A gamepad kit sends the same moves as `Nav` values through `Page::push`, which queues them for the next `show`. `Page::apply` runs one move with no drawing. While a rebind row waits for a key, `is_listening` is true, and the game should not run game input on that key. Escape cancels a rebind, and Delete or Backspace clears it.

The page reads no keys while another egui widget wants the keyboard. A game that opens the page on Escape must not show it in the same frame, because it reads the same press and closes at once.[[src:warp_sdk/examples/settings.rs|// Do not show the page in this frame. It reads the same]]

Each tab ends with a Restore defaults row. `Settings::restore` resets one tab and returns the keys that changed. On the Controls tab it also resets every key binding. Game rows return to the defaults given when they were added.

### Style

`SettingsStyle` sets the page's font families, its base size and its colours. `Page::style` installs it. The page itself obeys `text_size` and `reduce_motion`.[[src:warp_sdk/src/front/settings.rs|/// Accessibility values. The page itself obeys `text_size` and]]

```rust
let style = SettingsStyle { numbers: egui::FontFamily::Monospace, ..Default::default() };
Self { settings, page: Page::new().style(style), open: false }
```

## Interaction with other kits

| Setting | What the game does |
|---|---|
| Display values | Sends them to [[display-mode]] when `display_changed` is true. This module stores them and does not change the window |
| Audio values | Applies `Audio::gain` to its sinks, for example [[soundtrack]] |
| `access.reduce_motion` | Passes it to `cine::set_reduce_motion` |
| `graphics.fluid` | Reads `FluidRes::cells` for [[fluid-solver]] |
| `access.screen_shake`, `access.colour_blind`, `access.captions` | Reads the field. The module draws no filter and no caption |

## Limitations

- Version 1 is the first format, so there is no migration. A newer version keeps the keys that this build knows.
- Most values take effect only where the game reads them. The page changes `post` and nothing else in the engine.
- Display::resolutions has a fixed default list until the game supplies the monitor list.
