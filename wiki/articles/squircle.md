---
title: Squircle kit
short: the default app UI: corner keys, unfolding panels, toasts, readouts
category: Information
order: 10
module: squircle, squircle::anim, squircle::form, squircle::shape
example: observatory, hud_map
see: hud, hud-minimap, widgets, teach, front, window
demo: squircle
---
**The squircle kit** is the default user interface of a Warp application, drawn over the viewport as corner clusters of squircle keys that unfold into panels. It lives in `warp_core/src/ui/squircle` and reaches games as `warp_sdk::squircle`. At rest the screen shows only the viewport and a small cluster of keys. A press on a key unfolds a panel out of it, and a second press retracts the panel into the key. Notices arrive as toasts, live values sit in readout chips, and a hovered data point gets a card that fades in beside it.

## Overview

The kit began as one shared copy of a look that several surfaces had built in private [[src:warp_core/src/ui/squircle/mod.rs|This module is the one shared copy]]. It is the surface an application draws for itself in `gui`. It does not replace the editor panels or the channels that feed them, and an application normally uses both.

The kit is not [[widgets|`widgets`]]. Those are the editor's inspector rows, for a panel docked in the editor through [[window|`window`]]. For what a player sees in a shipped front end, see [[front]].

| Surface | Type or function | Purpose |
|---|---|---|
| Key cluster and panels | `Deck`, `Panel` | Tools, views, selection detail, actions |
| Stand-alone key | `squircle::key` | A toggle or tool key inside a `Ui` |
| Toasts | `toast`, `toast_tone`, `toast_for` | Short notices |
| Readout chips | `Readout`, `Tray` | Live values with an optional sparkline |
| Hover card | `hovercard` | Detail for the thing under the pointer |
| Curve | `squircle::shape` | The one superellipse and its hit test |
| Motion | `squircle::anim` | Clocks over the shell motion tokens |
| Form factor | `squircle::form` | Phone dock, safe area, touch, make-room rules |

## App UI rules

The Warp project documentation sets six rules for every new application, and most of all for a scientific visualisation tool.

1. Tools go in one deck at Corner::TopRight: data sources, view, layers, filters and actions.
2. Data-following panels go in a deck at Corner::TopLeft, with `Panel::auto_open`, so that they open when there is data for them and retract when there is none.
3. Live values go in a `Tray` of `Readout` chips at Corner::BottomLeft, and toasts use Corner::BottomRight.
4. A hovered data point gets a `hovercard`, not a tooltip window.
5. The application avoids `egui::SidePanel`, `egui::TopBottomPanel`, `egui::CentralPanel` and a free `egui::Window` unless the design calls for one. A docked bar takes screen area from the data at all times, and a deck panel takes it only while open.
6. Keys use `Icon` glyphs, not Glyph::Text symbols, because an icon is drawn as shapes and never shows a missing-glyph box [[src:warp_core/src/ui/squircle/key.rs|`Icon` is drawn as shapes, so it never falls back to a missing-glyph box.]].

Each surface needs its own corner because the kit does not move one surface out of the way of another.

## Decks and panels

:: See also: [[hud-minimap]], which sits under the key row of a deck

A `Deck` is a row of keys in one corner, rebuilt every frame and drawn by `Deck::show`. The deck's source calls it the whole menu system of an application [[src:warp_core/src/ui/squircle/deck.rs|THE DECK IS THE WHOLE MENU SYSTEM OF AN APP]]. A key with a body owns a panel. A key with no body is an action: a press reports its title in `DeckResponse::clicked` and flashes the key.

`Panel::new` builds a key with a panel, and `Panel::action` builds a key with none. `Deck::add` takes either, `Deck::panel` is the short form of adding `Panel::new`, and `Deck::action` is the short form for an action with a glyph. Keys read left to right in the declared order, so a right corner puts the last key in the corner.

The title is the key label, the panel heading and the state key at once [[src:warp_core/src/ui/squircle/deck.rs|The title is the key label, the panel heading and the state key.]]. Two panels in one deck must not share a title, and a renamed title starts as a closed panel. Two decks need two ids.

### Unfold and retract

At the start of an unfold the panel chrome is the key rect. The chrome eases to the panel rect along Curve::EaseOut over the Motion::Structural token. The contents lay out at their settled place at once, and the chrome clips them, so the panel reveals as it grows and no row slides under its neighbour.

A panel refuses clicks until it settles. While it moves, the rect the contents occupy differs from the rect they will occupy, so the deck mutes egui interaction around the body and a half-shown button takes no click [[src:warp_core/src/ui/squircle/deck.rs|A PANEL REFUSES CLICKS UNTIL IT SETTLES]].

### Stacking and floating

Open panels stack along the corner edge in key order, downward for a top corner and upward for a bottom corner. A body taller than the free space scrolls, and a panel never squeezes below 80 design points. When a panel higher in the column opens or shuts, the panels after it ease to their new place through a RectTween. A drag on a header takes the panel out of the column to float where it is dropped, and a double-click on the header puts it back.

### Builder options

| Method | Effect | Default |
|---|---|---|
| `Deck::corner` | Corner of the key row | Corner::TopRight |
| `Deck::look` | A `Look` for this deck only | Context look |
| `Deck::exclusive` | At most one panel open; the newest wins | false |
| `Deck::draggable` | A header drag floats a panel | true |
| `Deck::light_dismiss` | A click outside shuts every panel | false |
| `Deck::escape_closes` | Escape shuts the top panel | true |
| `Deck::within` | Lay out inside a rect | Whole screen |
| `Deck::focus` | Report a focus rect for make-room | None |
| `Panel::glyph` | Glyph above the label | None |
| `Panel::hint` | Full-phrase tooltip | None |
| `Panel::width` | Panel width in design points | `Look.panel_width` |
| `Panel::max_height` | Height at which the body scrolls | None |
| `Panel::auto_open` | Open and shut on the edges of a condition | None |
| `Panel::shortcut` | A key that toggles the panel or fires the action | None |
| `Panel::dot` | Small status mark on the key corner | None |
| `Panel::pinned` | Starting pin state | false |

`Deck::light_dismiss` is off by default because a data tool keeps its panels up while the viewport is used [[src:warp_core/src/ui/squircle/deck.rs|does. Default false, because a data tool keeps its panels up while the]]. `Panel::auto_open` reads edges, not levels: the panel opens when the condition turns true and shuts when it turns false, and the key still toggles it between those edges. A shortcut is ignored while a text field has keyboard focus.

Escape shuts the most recently touched panel, unless a text field has focus. The deck consumes the key, so a second deck does not shut a panel of its own for the same press [[src:warp_core/src/ui/squircle/deck.rs|deck does not shut one of its own for the same press.]].

### The response and outside control

`Deck::show` returns a `DeckResponse`. `DeckResponse::clicked`, `DeckResponse::just_opened`, `DeckResponse::just_closed` and `DeckResponse::is_open` report by title. `DeckResponse::key_rect` gives the resting rect of a key and `DeckResponse::drawn` the drawn rect of a panel. The `hovered` field is true when the pointer is over a key or a visible panel, and viewport picking should be gated on it so that a press on the deck does not also pick the scene. The `arrangement` field gives the layout, and the `probe` field gives the point a hover card describes.

`Deck::open`, `Deck::close`, `Deck::toggle` and `Deck::close_all` take the context, the deck id and, except for `close_all`, the title. They change the state from outside the builder, for example from a viewport pick, and the panel moves on the next `Deck::show`. `Deck::is_open`, `Deck::unfold`, `Deck::opacity`, `Deck::is_pinned` and `Deck::panel_rect` read it. `Deck::panel_rect` returns the settled rect, which a guide or a spotlight can point at.

## Keys

A key grows about its centre under the pointer, so the row around it does not reflow. Its fill runs from glass to the accent as its panel opens, so that the key and the panel read as one object [[src:warp_core/src/ui/squircle/key.rs|to the accent as its panel opens, so the key and the panel read as one]]. A key with a glyph is square and widens only when its label is wider than the square. A key with a label only is a pill as wide as the label.

`squircle::key` is the same face as a stand-alone widget with its own hover and active clocks, and it returns an ordinary click response. `paint_key` is the pure painter, and `key_size` gives the resting size. `Glyph` is the key content: Glyph::None, Glyph::Text or Glyph::Icon. `Panel::glyph` accepts an `Icon`, a `&str` or a `String`, because `Glyph` implements `From` for each.

## Toasts

A toast is a small pill with a tone dot and one line of text. Any code that holds the egui context can push one, and the context is thread-safe, so a worker thread can push too [[src:warp_core/src/ui/squircle/toast.rs|`Clone` and thread-safe, so a worker thread can push too.]]. `toast` pushes an information notice, `toast_tone` adds a `Tone`, and `toast_for` sets the hold time as well.

`Deck::show` draws the stack once per frame. An application with no deck must call `show_toasts` once per frame, or no toast shows. A frame-number guard makes a second call in one frame a no-op, so both together are safe.

A toast holds for `TOAST_DWELL` seconds (3.2), then fades over the Motion::Emphasis token. Five toasts show at most, and a burst past that drops the oldest. A toast stores the egui time at which it was pushed, not an age that frames add to, so its life is the same at any frame rate and a stalled frame does not lengthen it. The newest toast sits nearest the corner. `Look.toast_corner` selects the corner, and `toast_count` reports the number live.

A deck passes its safe area to the stack, less its bottom dock on a phone, so a toast clears a notch, a home indicator and the dock.

## Readouts and trays

A `Readout` is a chip with a caption, a value in monospace digits, a unit and an optional sparkline. The source describes it as the scientific counterpart of a key: a key is a verb, and a readout is a measurement [[src:warp_core/src/ui/squircle/readout.rs|counterpart of a key: a key is a verb, a readout is a measurement.]]. It implements `egui::Widget`, so it goes through `ui.add`.

`Readout::new` shows four significant digits unless `Readout::digits` changes that. `Readout::spark` takes samples oldest first and draws them scaled to their own range. Fewer than two finite samples draw no line. `Readout::tone` colours the value and the line for a value out of range.

`format_value` prints exponent form at or above 1e5 and under 1e-3, for example `6.674e-11`, and fixed form between. It prints `nan`, `inf` and `-inf` for those values, and clamps the digit count to 1 through 12. The digits are monospace so that a changing value does not make the chip shake.

A `Tray` anchors a row or a column of any widgets in a corner, with `Tray::corner`, `Tray::vertical` and `Tray::within`. Its default corner is Corner::BottomLeft, and it should sit in a corner no deck uses.

## Hover cards

`hovercard` answers "what is this?" for a thing under the pointer. The application passes `Some((point, key))` while a thing is hovered and `None` when nothing is. The card fades in beside the point, follows it, and fades out at the last point after the hover ends.

The fade-out runs after the application has stopped naming a thing, so the card keeps the last key in egui memory and hands it to the contents closure [[src:warp_core/src/ui/squircle/hovercard.rs|keeps the last key in egui memory and hands it to the contents closure.]]. The key should be a small value the application can look its data up by, such as an index, an id or a `String`.

The card sits on the tooltip layer and is not interactable. A card under the pointer would take the hover from the thing it describes, and the card would flicker. It opens to the right of the point, 18 design points away, and flips to the left when it does not fit. The function returns true while the card is visible.

## Look

{{demo:squircle}}

`Look` is a flat struct of tokens: colours, sizes in design points, and a motion pace. No surface holds a literal colour or size, so an application changes the whole kit with one value [[src:warp_core/src/ui/squircle/look.rs|one reads a `Look`, so an app changes the whole kit with one value.]].

There are two override levels. `set_look` sets the default for one egui context, and `Deck::look` overrides it for one deck. A key, a readout, a toast and a hover card read the context default. `Look::dark` is the default, `Look::light` suits a tool over a light plot, and `Look::from_palette` maps the project palette onto the tokens, so that a `[settings.theme]` edit reaches the kit. `Look::from_palette` is absent on Android, where the project palette is not compiled.

`Look::dark` is tuned for scientific visualisation. Its surfaces stay below the luminance of a plotted point, so the data stays the brightest thing on the screen, and its accent is a sky cyan that does not read as a status [[src:warp_core/src/ui/squircle/look.rs|luminance of a plotted point, so the data stays the brightest thing on]].

| Token | `Look::dark` value | Meaning |
|---|---|---|
| `key` | 40.0 | Side of a key |
| `key_round` | 0.32 | Key corner radius as a fraction of its side |
| `radius` | 14.0 | Corner radius of a panel, toast, card and chip |
| `gap` | 6.0 | Space between keys, and between a key row and a panel |
| `margin` | 12.0 | Space between a cluster and the screen edge |
| `pad` | 12.0 | Inner padding of a panel and a card |
| `panel_width` | 264.0 | Width of a panel with no width of its own |
| `card_width` | 240.0 | Widest a hover card grows before its text wraps |
| `text` | 12.5 | Body text size |
| `hover_grow` | 0.10 | Key growth under the pointer, as a fraction of its side |
| `pace` | 1.0 | Multiplier on every motion token duration |
| `toast_corner` | BottomRight | Corner the toast stack grows from |
| `scale` | `None` | Pinned interface scale; `None` reads `ui_scale` |

Sizes are design points, and the scale applies at draw time. The engine locks egui to one point per physical pixel, so a literal 40 is half size on a retina panel [[src:warp_core/src/ui/squircle/look.rs|The engine locks egui to one point per physical pixel, so a literal 40 is]]. `Look::s` multiplies a token by the interface scale. `Look::with_accent`, `Look::with_scale`, `Look::with_pace` and `Look::with_toast_corner` return a changed copy. `Tone` selects a hue through `Look::tone`, and `mix` blends two colours in straight RGBA.

## Motion

`squircle::anim` adds no second motion system. Every duration is a shell `Motion` token, every curve a `Curve`, and the viewer preference comes from the shell [[src:warp_core/src/ui/squircle/anim.rs|This file adds no second motion system.]]. `Look.pace` multiplies the token durations.

| Token | Seconds | Used for |
|---|---|---|
| Motion::Quick | 0.09 | Key hover and press |
| Motion::Standard | 0.16 | Hover card, stand-alone key activation, panel drag fade |
| Motion::Structural | 0.22 | Panel unfold and layout moves |
| Motion::Emphasis | 0.30 | Toast fade and the action key flash |

`Progress` is a linear clock from 0 to 1 that runs toward a boolean target. Its step is `dt / duration`, so one frame at 30 Hz and four frames at 120 Hz land on the same value, and a reversal mid-flight continues from the current value. `approach` is an exponential follow for a value with no fixed end, such as the y of a toast slot. It snaps onto the target inside a tolerance, because without the snap a value stays just short of its target and the surface asks for a repaint forever [[src:warp_core/src/ui/squircle/anim.rs|short of its target, and the surface asks for a repaint forever.]].

`anim::dt` clamps the frame step to 0.1 seconds, so a longer stall slows an animation and does not skip it.

The kit's rule for reduced motion is stricter than the shell's. Each squircle motion is geometric, so MotionPref::Reduced and MotionPref::Off both give a zero duration from `anim::secs`, and every surface lands at its target in one frame [[src:warp_core/src/ui/squircle/anim.rs|slides. `Pref::Reduced` and `Pref::Off` therefore both give a zero duration,]]. `set_motion` sets the preference for one context.

A surface of an application's own can move at the same tempo as the deck, in the way the minimap does:

```rust
self.prog.step(self.open, anim::secs(ctx, Motion::Structural, look.pace), dt);
let t = self.prog.eased(Curve::EaseInOut);
```

## The shape

A squircle here is the Lamé curve `|x/a|^n + |y/b|^n = 1`. An exponent of 2 gives an ellipse, 4 gives the squircle, and a large value gives a rectangle. The constant `shape::N` is 4.0 [[src:warp_core/src/ui/squircle/shape.rs|pub const N: f32 = 4.0;]]. The implicit form cannot walk a vertex path, so `shape::points` uses the parametric form: `x(t) = a * sgn(cos t) * |cos t|^(2/n)`, and the same with `sin t` for y.

The curve applies per corner, not to the whole rect. One superellipse fitted to a tall rect gives an oval, so each corner gets a quarter superellipse of radius r and straight edges join the corners. A square rect with r equal to half its side collapses to the true squircle. A key and the tall panel that unfolds out of it therefore share one curve at every frame of the unfold [[src:warp_core/src/ui/squircle/shape.rs|square rect with r = side / 2 collapses to the true squircle. Thus a key and]].

Each corner arc uses ten steps. The radius clamps to half the shorter side, so a large radius gives the fully rounded shape and never a self-intersection. Points closer than 0.01 weld into one, because two coincident vertices make the tessellator draw a hard slash across the fill [[src:warp_core/src/ui/squircle/shape.rs|make the tessellator draw a hard slash across the fill.]].

`shape::fill`, `shape::stroke`, `shape::paint` and `shape::shape` draw the outline, and `shape::points_corners` and `shape::fill_corners` take one radius per corner, ordered top left, top right, bottom right, bottom left. `shape::points_with` takes an explicit exponent. `shape::shadow` paints three widening layers offset downward. `shape::fill_textured` clips a texture to the curve as a triangle fan, because `Painter::image` emits an axis-aligned quad that keeps square corners.

`shape::contains` is the hit test, solved through `shape::x_span` from the implicit form. A press in a cut-away corner of a shape it guards falls through to the scene below.

The SDK shell draws through this module. Two editor panels still keep older private copies of the curve, which the module header marks for a later move [[src:warp_core/src/ui/squircle/mod.rs|Two older copies of the squircle curve stay in place.]].

## Phones and touch

`squircle::form` holds pure rules that a deck reads every frame. It depends only on egui and the shell motion module, so it compiles for every target the engine builds for, and a test of it needs no window and no GPU [[src:warp_core/src/ui/squircle/form.rs|rule is a pure function, so a test needs no window and no GPU.]].

### Layout

`form::layout` turns a `Form` into a `Layout`. The form is the screen, the safe-area insets, the scale and the `PointerKind`. The dock is chosen for a safe area narrower than `form::NARROW` design units, or for a finger on a portrait screen. Everything else gets corners.

Under Arrangement::Dock the keys sit in one row on the bottom edge, in the thumb zone. A panel unfolds upward as a bottom sheet, and one sheet shows at a time, because a docked deck is exclusive. A drag on the sheet header moves it between the peek, half and full `Detent` heights. Half is the default. A narrow window with a mouse also gets the dock.

| Constant | Value | Meaning |
|---|---|---|
| `form::MIN_TOUCH` | 44.0 | Smallest key height for a finger |
| `form::NARROW` | 600.0 | Safe width below which the dock is chosen |
| `form::SHEET_MAX_W` | 560.0 | Widest bottom sheet |
| `form::LONG_PRESS_S` | 0.45 | Seconds of rest that make a long press |
| `form::COAST_S` | 0.18 | Seconds of coast a released drag projects forward |
| `form::FLING` | 900.0 | Design units per second past which a release is a fling |
| `form::DRAG_FADE` | 0.22 | Opacity of an unpinned panel during a viewport drag |
| `form::PRESS_SHRINK` | 0.08 | Shrink of a key under a finger |

`form::pointer_kind` returns the kind set by `form::set_pointer`, else PointerKind::Coarse on Android or once a touch event has arrived, else PointerKind::Fine. No key and no panel goes under a notch, a home indicator or a system bar. The application reports those strips with `form::set_insets`, and they are zero until then. `Insets::from_content_rect` turns a host content rect into insets, and the Android host calls it each frame.

### Touch gestures

A finger has no hover and a fat contact, so a press shrinks a key where a mouse hover grows it (`form::press_scale`). `form::sheet_release` decides where a released sheet goes: to the detent nearest its projected height, or closed. A release closes when its projected height falls below half the peek height, or when a fast downward fling starts at or below the half detent [[src:warp_core/src/ui/squircle/form.rs|if vy > FLING * scale.max(0.01) && height <= l.detent_h(Detent::Half) + 1.0 {]].

Under a finger, a released header drag coasts and snaps to a corner anchor (`form::coast_to_anchor`), and a fast fling toward the keys retracts the panel (`form::flung_home`). `form::probe` gives the point a hover card describes: the hover of a mouse, or the long press or sticky tap of a finger. A tap probe lasts until the next tap or Escape. The result reaches applications as `DeckResponse.probe`.

### Making room

The application reports what the user acts on, and an open panel moves off it. `form::report_focus` and `Deck::focus` report a rect, and a frame with no report clears the focus. `form::report_viewport_drag` reports a viewport drag. Both must run before any deck draws, because a deck reads them in the same frame [[src:warp_sdk/examples/observatory.rs|them in the same frame.]].

`form::make_room` applies a fixed order. A pinned panel or a clear panel stays. Otherwise the panel takes the nearest clear place one step past a side of a focus rect. Failing that it folds to its header at the wanted place, if that is clear, and last to the header at the nearest clear step. `form::make_room_sheet` is simpler: a sheet over a focus rect drops to peek. `Room` names the four outcomes. `form::step_off` is the same rule for a surface with no header, and `form::anchored_at` places a surface beside a moving anchor, never up and to the left, because that covers the subject [[src:warp_core/src/ui/squircle/form.rs|one step past an occluder. Up-left covers the subject, so it is not tried.]].

During a reported viewport drag each unpinned panel fades to `form::DRAG_FADE` and takes no clicks, so the picture under it shows. The pin mark in a panel header stops both behaviours, and `Panel::pinned` sets the starting state.

## Usage

The full recipe from the Warp documentation places every surface in its own corner:

```rust
use warp_sdk::egui;
use warp_sdk::squircle::{self, Corner, Icon, Panel, Readout, Tone, Tray};

fn gui(&mut self, _v: ViewportId, ctx: &egui::Context, _d: &mut DisplaySettings) {
    // 1. Tools: one key per panel, plus actions with no panel.
    let (gain, layers) = (&mut self.gain, &mut self.show_grid);
    let tools = squircle::Deck::new("tools")
        .corner(Corner::TopRight)
        .add(Panel::new("Data", |ui| {
            ui.add(egui::Slider::new(gain, 0.0..=1.0).text("gain"));
        }).glyph(Icon::Find).hint("Data sources"))
        .add(Panel::new("Layers", |ui| {
            ui.checkbox(layers, "grid");
        }).glyph(Icon::OverlayGrid).shortcut(egui::Key::L))
        .action("Reset", Icon::Refresh)
        .show(ctx);
    if tools.clicked("Reset") {
        squircle::toast_tone(ctx, "View reset", Tone::Ok);
    }

    // 2. Data-following panels: open when there is data, retract when not.
    let sel = self.selected;
    let scene = squircle::Deck::new("scene")
        .corner(Corner::TopLeft)
        .add(Panel::new("Selection", |ui| {
            if let Some(i) = sel { ui.label(format!("body {i}")); }
        }).glyph(Icon::Eye).auto_open(sel.is_some()))
        .show(ctx);

    // 3. Live values.
    Tray::new("telemetry").corner(Corner::BottomLeft).show(ctx, |ui| {
        ui.add(Readout::new("Energy", self.energy).unit("J").digits(5).spark(&self.energy_history));
    });

    // 4. The hovered data point. Pass None when nothing is hovered.
    let hit = self.hovered.map(|i| (self.screen_pos[i], i));
    squircle::hovercard(ctx, "body", hit, |ui, &i| { ui.label(format!("body {i}")); });

    // 5. The viewport gets the pointer only when no deck has it.
    if !(tools.hovered || scene.hovered) { /* viewport picking */ }
}
```

Before any deck draws, an application on a phone reports its form:

```rust
use warp_sdk::squircle::{self, form, Insets};

form::set_insets(ctx, Insets { top: 47.0, right: 0.0, bottom: 34.0, left: 0.0 });
if let Some(r) = selected_rect {
    form::report_focus(ctx, r);
}
if panning {
    form::report_viewport_drag(ctx);
}
```

The `observatory` example is the worked precedent. A panel body there writes to a `Cell` declared before the deck and not to `self`, so that two panels of one deck never borrow the same field [[src:warp_sdk/examples/observatory.rs|`self`. Two panels of one deck then never borrow the same field.]]. Its `render` queues events, and `gui` turns them into toasts, because only `gui` has the egui context.

## State

The application holds no state for any surface. Every clock, open flag, measured height and float place lives in egui memory under the deck id, and the builder is rebuilt every frame [[src:warp_core/src/ui/squircle/deck.rs|lives in egui memory under the deck id. The builder is rebuilt every frame.]]. Panels are keyed by title, so a panel that appears on a condition keeps its own state and does not take another panel's. A key, a hover card and the toast feed key their state by their own ids.

## Limitations

- The kit does not prevent collisions between surfaces. Each surface needs its own corner.
- Every deck on a phone docks on the same bottom edge, so an application should show one deck there. A 390-point dock holds about seven keys, and the kit does not wrap a full dock. A row wider than the dock keeps its left edge, so the first key stays reachable. `observatory` shows one deck on a phone and moves its tray to the top left, and it reads `form::layout` before it builds a deck.
- A tray does not read the safe area, so it stays where its corner places it unless `Tray::within` says otherwise.
- The `boot` entry point of [[smoke]] runs `gui` on every frame, so a deck that panics fails `cargo test`, but the boot does not prove pixels.

## History

The kit was added on 2026-10-23, and its commits of that day also let it compile for Android, laid the deck out for touch and phones, added make-room for the focus, and reported the Android safe area to it.
