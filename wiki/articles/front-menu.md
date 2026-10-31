---
title: Menu screens
short: Title, pause and end screens, painted buttons, five layouts, one focus
category: Front end
order: 20
module: front::menu
example: front
see: front, front-save, front-settings, fonts, cine, gamepad
---
**Menu screens** are the title, pause and end screens of a game, with the button that they share, in the `warp_sdk::front::menu` module. A game keeps one `Title`, `Pause` or `End` value, calls `show` each frame from `gui`, and gets an optional `MenuAction` back. The kit paints with the egui painter and uses no stock egui button. It handles focus, the mouse, the keyboard and a gamepad, and the game decides what each action does.

## Rules

The kit keeps four rules, stated in its header.[[src:warp_sdk/src/front/menu.rs|//! THE RULES THE KIT KEEPS]]

- Every screen is real buttons. The mouse, the keyboard and a gamepad all move the same focus.
- A title always leads into play. New game is always on the title, and no builder removes it. Continue shows only when `has_save` is true. The rule answers a known failure: a title with no way in is a game that cannot start.
- The wordmark uses the display font family of the game by name. An unknown name falls back to the proportional family, so the call never panics. egui itself panics on an unknown family, so every family goes through this check.[[src:warp_sdk/src/front/menu.rs|/// registered under that name. egui panics on an unknown family, so every]]
- A glow is layered strokes of the same shape, or the same text galley drawn on a ring of offsets. It is never a blurred sprite, so it stays aligned with the button and the text.

## Usage

```rust
use warp_sdk::front::menu::{End, Layout, MenuAction, Outcome, Pause, Title};

// In the game state:
let title = Title::new("PEARL DIVER").tagline("twenty pearls save the reef").has_save(has_save);
let pause = Pause::new().layout(Layout::LeftRail);
let end = End::new(Outcome::Lost, "");
```

In `gui`, show the current screen and carry out the action:

```rust
title.has_save = slots.latest().is_some();
match title.show(ctx) {
    Some(MenuAction::NewGame) => start_new(),
    Some(MenuAction::Continue) => continue_latest(),
    Some(MenuAction::Quit) => std::process::exit(0),
    _ => {}
}
```

Call `Pause::reset_focus` when play pauses, so the focus returns to Resume.

## Screens

Every screen has `actions`, `label` to replace the text of one action (for example, a translation), `show`, `show_with` or an equivalent for extra input, and `step`. `step` applies one frame of input with no painting, so a test or a headless driver can use it.

### Title

| Position | Action | Present |
|---|---|---|
| 1 | Continue | Only while `has_save` is true |
| 2 | New game | Always |
| 3 | Load | Unless `without_load` |
| 4 | Settings | Unless `without_settings` |
| 5 | Quit | Unless `without_quit` |

`without_load` suits a game with one save slot, and `without_quit` suits a platform that has no quit, such as a browser or a phone. The title has no back action, so Escape does nothing. `display_font` names the registered family for the wordmark. `tagline` sets a line under it. On a fresh title with no save, Enter gives New game.[[src:warp_sdk/src/front/menu.rs|fn enter_on_a_fresh_title_starts_a_new_game() {]]

### Pause

The order is Resume, Settings, Save, Load, Quit to title, Quit. Resume and Quit to title are always present, and `without_save`, `without_load`, `without_settings` and `without_quit` drop the others. Escape gives Resume.[[src:warp_sdk/src/front/menu.rs|/// Apply one frame of input with no painting. Escape gives `Resume`.]] `heading` replaces the word "Paused".

### End

`End::new` takes an `Outcome` and a headline. The screen has Try again, New game and Title, all always present, and no back action. It uses the bottom bar layout. `left_aligned` moves the screen to the left.

`stat` adds a row with a glyph, and `stat_painted` adds a row with an icon that a painter function draws. The rows fade in one after the other. `accent` gives `victory` for a win and `danger` for a loss.

```rust
self.end = End::new(outcome, head).stat("◆", self.pearls).stat("⏱", format!("{:.0}s", self.playtime));
```

`show` paints a scrim in the outcome accent. `show_with_scene` takes a closure that paints under the kit, with the painter, the screen rect and the fade-in value. The game supplies the scene treatment, and the kit supplies the layout, the stats and the actions.[[src:warp_sdk/src/front/menu.rs|/// The game supplies the scene treatment in `show_with_scene`: the closure]]

## Input

`MenuInput` is one frame of menu input: `up`, `down`, `left`, `right`, `confirm` and `back`. `MenuInput::from_egui` reads the keys and consumes them, so a later check in the same frame does not see them again. Arrows and WASD move, Enter and Space push, and Escape goes back.[[src:warp_sdk/src/front/menu.rs|/// Read and consume this frame's menu keys from egui. Arrows and WASD]]

A game adds its gamepad by building a second `MenuInput` and passing it to `show_with`. `merge` combines two inputs, with each field true when either is true.

```rust
let pad = MenuInput { down: pad.dpad_down_pressed, confirm: pad.south_pressed, ..Default::default() };
let action = title.show_with(ctx, pad);
```

Focus wraps at both ends of the list. On a pointer hover, the focus moves to the hovered button, but only when the pointer moved in that frame. A resting pointer therefore does not hold the focus against the keyboard.[[src:warp_sdk/src/front/menu.rs|/// The pointer is over the button and moved this frame.]]

## Layouts

`Layout` says where a screen puts its wordmark and buttons. `place` is the pure function behind it: it returns a `Placement` of rects for `n` buttons of a given height, so a game can place its own extra content beside the buttons.

| Layout | Arrangement | Scrim |
|---|---|---|
| CenteredColumn | Wordmark above a centred column. The default | Flat, over the whole screen |
| LeftRail | Wordmark and buttons on the left | Gradient on the left half |
| BottomBar | Wordmark centred high, buttons in one row | Gradient over the bottom 30 percent |
| `Diegetic { anchor }` | A small column at a fraction of the screen, inside the live scene | None |
| Split | Wordmark on the left half, buttons on the right | Flat, over the right half, with a divider |

The scrim is dark where the text sits and clear where the scene shows. In the bottom bar, Placement::row is true, so left and right move the focus along the row.

## Look

`MenuStyle` holds the look of every screen, and a game sets it once from its palette.

| Field | Default | Meaning |
|---|---|---|
| `display_family` | `None` | Family for the wordmark and headlines |
| `body_family` | `None` | Family for labels and stats |
| `ink` | 236, 240, 246 | Text colour |
| `accent` | 120, 210, 255 | Plate, ring and underline of a focused button |
| `glow` | 80, 180, 255 | Glow around focused buttons and the wordmark |
| `scrim` | 4, 10, 22 at alpha 170 | Colour behind the menu |
| `plate` | 20, 32, 52 at alpha 200 | Plate of an unfocused button |
| `danger` | 255, 104, 88 | End accent for a loss |
| `victory` | 255, 206, 112 | End accent for a win |
| `button` | ButtonStyle::Squircle | Button shape |
| `button_height` | 52 | Height in points. Labels scale from it |

```rust
let style = MenuStyle {
    display_family: Some("reef-display".into()),
    accent: Color32::from_rgb(255, 170, 120),
    ..MenuStyle::default()
};
let title = Title::new("REEF").style(style);
```

### Buttons

`ButtonStyle` has three shapes. Squircle is a filled superellipse plate with a ring of the same curve. Underline is text on open ground, with a line that grows on focus. Bracket is text between four corner brackets that close in on focus.

`Button` is public, for a game that places its own. It eases its hover, press and focus values on its own clock.

```rust
let r = Button::new("start", "Start").focused(true).show(ui, rect, &style);
if r.clicked { start(); }
```

`squircle_points` gives the outline of a superellipse-cornered rect, with each corner following the curve |x|^4 + |y|^4 = r^4. The focus ring and the glow use this function on an expanded rect, so they stay aligned with the button.[[src:warp_sdk/src/front/menu.rs|/// The outline of a superellipse-cornered rect, clockwise from the top]]

## Limitations

- `show` must run from `gui`, because it reads egui input. Only one screen should show per frame: each screen consumes the menu keys.
- With no family registered, the wordmark and labels use the proportional family. A game installs faces with [[fonts]] to avoid the stock font.
- The kit has no transition of its own beyond a fade-in on first show. A game routes screen changes through [[cine]].
- The kit opens no save list. MenuAction::Load is an action for the game to answer, and the example `front` answers it by loading the latest slot.
