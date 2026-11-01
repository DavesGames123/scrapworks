---
title: Panel widgets
short: the editor's standard inspector controls, for a game's own tool panel
category: Information
order: 40
module: widgets
see: window, squircle, palette, editor-panels
---
**Panel widgets** are the standard inspector controls of the SCRAP editor, re-exported for a game's own tool panel. The module is `warp_sdk::widgets`, a re-export of a chosen set from `warp_core/src/ui/widgets`. Each control takes the full width and reads its colour from the style the engine installs, so a game panel matches the chrome around it [[src:warp_sdk/src/lib.rs|width and reads its color from the Style the engine installs for a game by]]. It is for a panel docked in the editor. What a player sees over the game belongs to the [[squircle|squircle kit]] or to [[front]].

## Purpose

A game panel on raw egui gets egui's defaults, and two of them read wrong against the rest of the interface. A slider is a fixed 96 pixels and does not reach the edge of the panel, so it sits in a column of blank space. A button, a toggle and a label each carry a different frame, so a column of controls does not line up [[src:warp_sdk/src/lib.rs|button, a toggle and a label each carry a different frame, so a column of]].

The module is not [[palette|`palette`]] either. These are finished controls, and `palette` is the box a game draws its own shapes in.

## Design

The look is dense and quiet. A widget paints a flat rect and then its text, and it does not call the framed egui widget. There are two reasons. egui frames a button with rounded corners and a margin that this chrome does not want. A hand-painted rect can also span the full panel width, so a list row highlights across the panel and not only behind its text [[src:warp_core/src/ui/widgets/mod.rs|span the full panel width, so a list row highlights across the panel and]].

Every strip widget takes the full available width and a fixed height, so a column of them stacks with no ragged edge. All button widgets paint through one function, `face_of`, so a button, a toggle and an icon button cannot drift apart. Every metric is a design unit read through `px`, so controls grow with the chrome.

| Metric | Design units | Meaning |
|---|---:|---|
| ROW_H | 18 | Height of one inspector row |
| LABEL_W | 128 | Width of the label column |
| Strip height | 22 | Height of a header bar or a foldout header |
| Button height | 18 | Height of a toolbar button |

## The controls

The SDK re-exports twelve functions. `warp_core/src/ui/widgets` holds more, such as tables and number fields, and the SDK does not re-export those.

| Function | Signature in short | Purpose |
|---|---|---|
| `row` | `row(ui, label, add)` | A fixed-width label, then whatever the caller adds |
| `header` | `header(ui, text)` | A section title on a filled bar, with a rule along its bottom edge |
| `foldout` | `foldout(ui, id, title, open_default, body)` | A collapsing section; returns `Some` only while open |
| `set_foldout` | `set_foldout(ui, id, open)` | Opens or closes a foldout from outside it |
| `slider` | `slider(ui, value, range)` | A full-width slider with the number in a fixed column |
| `tool_button` | `tool_button(ui, text, enabled)` | A toolbar button with a raised face |
| `toggle_button` | `toggle_button(ui, text, active, enabled)` | A button that holds an on state |
| `icon_button` | `icon_button(ui, glyph, tooltip, enabled)` | A square button with one glyph |
| `dropdown` | `dropdown(ui, id, trigger, width, add)` | A panel that hangs below a button |
| `hint` | `hint(ui, text)` | Dim helper text |
| `label_text` | `label_text(ui, text)` | Plain text that does not react to the pointer |
| `separator_h` | `separator_h(ui)` | A single-pixel rule across the panel |

### Rows

`row` gives one label column width to every row, so a column of fields lines up down the panel even when the labels differ in length. It lays out left to right with vertical centering, so a field shorter than the row sits on the middle line [[src:warp_core/src/ui/widgets/container.rs|left to right with vertical centering, so a field shorter than the row]]. The body's return value comes back from `row`.

### Foldouts

`foldout` is the main grouping device. Its open state lives in egui memory under `id`, so the section keeps its state across frames and across a rebuild of the panel, and `id` must be unique inside the parent `Ui`. The body runs only while the section is open.

`set_foldout` takes the same id string and must use the same `Ui`, because the id hashes the parent. An id built in a different `Ui` names a different foldout, and the call does nothing. The write lands on the next frame, so a caller can set the state before the group draws or after it [[src:warp_core/src/ui/widgets/container.rs|The write lands on the next frame, which is what makes the order safe: a]].

### Sliders

`slider` replaces `egui::Slider` for three reasons the source gives. The egui rail is one fixed width. Its handle is a circle, and every other control in this chrome is a square face. Its value reads `0` at zero and `0.035` elsewhere, so a column changes shape as the numbers pass through zero [[src:warp_core/src/ui/widgets/slider.rs|changes its shape as the numbers pass through zero is hard to scan.]].

The rail is measured from what the row has left, so it ends where the number column starts and every rail in a panel has the same length. The value box prints the same decimals at every value: three for a span up to 1, two up to 10, and one above that.

| Gesture | Effect |
|---|---|
| Drag the handle | The value follows the pointer with no jump at the press |
| Press the rail | The handle jumps to the pointer and the drag begins |
| Shift while dragging | A tenth of the distance |
| The command modifier while dragging | Snap to a step read from the span of the range |
| Arrows, when focused | One step; with Shift, a tenth of one |
| Page Up, Page Down | Ten steps |
| Home, End | The ends of the range |
| The value box | Drag for fine work, or click to type a number |

The snap step is 0.1 for a span up to 2.1, 1 up to 21, and 10 above that. Shift takes it down one decade. The behaviour borrows the press offset from Dear ImGui, the span-based snap from Blender, the fewest-decimals aim from egui, and the keyboard pattern from the W3C slider pattern [[src:warp_core/src/ui/widgets/slider.rs|Three editors have already solved this widget, and each of them solved a]]. The response is the union of the rail and the box, so `.changed()` is true for a move made either way.

### Buttons

`tool_button` has a face much lighter than a toolbar strip, so that the button carries a visible edge before the pointer arrives. A disabled button senses hover only, so a caller never reads a click from it [[src:warp_core/src/ui/widgets/button.rs|value to theme::bg_active(). A disabled button senses hover only, so a]].

`toggle_button` paints the one saturated value in the palette for its on state, so the choice that is showing is obvious across the toolbar. It exists because callers had been writing the state into the label as `[Grid]`, which reads as text and not as a state. `icon_button` requires a tooltip, because a glyph alone cannot say what the button changes.

### Dropdowns

`dropdown` shows a panel below a trigger button at a width the caller picks. The click on the trigger opens and closes it, Escape closes it, and a click anywhere else closes it. It returns `None` while shut, so the body costs nothing then. It takes a `&Ui`, an `egui::Id` and the trigger `egui::Response`. It avoids `egui::popup::popup_below_widget`, which sets the panel width to the width of the button that opened it.

`label_text` exists so that a value in a toolbar does not look clickable, which a button would suggest.

## Usage

```rust
use warp_sdk::widgets;
widgets::header(ui, "Colony");
widgets::row(ui, "Growth", |ui| widgets::slider(ui, &mut growth, 0.0..=1.0));
```

`row` supplies the fixed label column and a full-width body, so the slider spans to the right edge with its value in a column at the end. The controls go inside the `ui` of a panel, which a game gets by implementing WarpWindow. See [[window]].

```rust
use warp_sdk::window::{self, Group, WarpWindow, WindowSpec};

struct Meter;
impl WarpWindow for Meter {
    fn spec(&self) -> WindowSpec {
        WindowSpec::new("meter", "Meter").group(Group::Debug)
    }
    fn ui(&mut self, ui: &mut warp_sdk::egui::Ui) {
        ui.label("mine");
    }
}

window::register(Box::new(Meter)).ok();              // once, before run
```

## Limitations

- The controls depend on the style the engine installs, so they suit a panel in the editor and not a game's own screen.
- `slider` takes an `f32` value only.
- `foldout` and `set_foldout` must share a parent `Ui` to name the same section.
