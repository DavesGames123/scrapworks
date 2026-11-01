---
title: HUD markers
short: icons pinned to world points, with edge arrows for points off screen
category: Information
order: 21
module: hud::markers
example: hud_map
see: hud, hud-minimap, squircle, camera
---
**HUD markers** are icons pinned to world points, with an edge arrow and a distance for any point off screen. The kit lives in `warp_sdk::hud::markers`. A marker shows where a thing is. When its world point is on screen, the icon sits on the point. When the point is off screen, the icon moves to the screen edge on the line from the screen centre to the point, an arrow points out toward the thing, and a number gives its distance [[src:warp_sdk/src/hud/markers.rs|screen edge, on the line from the screen centre to the point. An arrow on]].

## How it works

A game keeps one `Markers` value in its state and calls `Markers::show` in `gui` every frame with a slice of `Marker` values. `Markers::show` calls `Markers::layout`, which places the markers with no drawing, and then paints them on the middle egui layer. A test or a custom painter can call `Markers::layout` alone. Its result is one `Placed` per shown marker.

### Choosing

Not more than `max` markers show. Objectives come first, then the higher priority, then the nearer marker [[src:warp_sdk/src/hud/markers.rs|// Choose: objectives, then priority, then the nearer.]].

### Placing

`edge_point` clamps a target onto the edge of a rect along the line from the rect centre, and it returns the edge point and the unit direction to the target. A target inside the rect comes back unchanged. `Markers::layout` applies it to the screen less `edge_margin`. `Placed.on_screen` is true when the point falls inside that inner rect.

### Fading

A far marker fades by a smoothstep from `fade_near` to `fade_far`, down to `min_alpha`. An objective never fades below `OBJECTIVE_FLOOR` (0.75), because an objective must stay readable [[src:warp_sdk/src/hud/markers.rs|The lowest alpha of a far objective. An objective must stay readable.]].

### Objectives

`Marker::objective` makes a marker an objective. An objective shows before every other marker, pulses for `pulse_secs` after it first shows, and shows its distance on screen as well as off it. Its colour becomes the `Look.warn` hue if the colour is still the default white [[src:warp_sdk/src/hud/markers.rs|let base = if m.objective && m.color == Color32::WHITE { look.warn } else { m.color };]].

The pulse is kept per id, so `Marker.id` must stay stable between frames. `Markers::layout` forgets the pulse of an id that is gone, so an objective that leaves the list and returns pulses again.

## Configuration

`Markers::new` sets these defaults. `Markers::max`, `Markers::fade` and `Markers::unit` are builder forms, and every field is public.

| Field | Default | Meaning |
|---|---:|---|
| `max` | 8 | Most markers that show |
| `fade_near` | 30.0 | Full opacity up to this world distance |
| `fade_far` | 200.0 | Lowest opacity from this world distance on |
| `min_alpha` | 0.35 | Opacity of a far marker that is not an objective |
| `edge_margin` | 28.0 | Space between an edge arrow and the screen edge, in points |
| `size` | 9.0 | Half-size of an icon, in points |
| `pulse_secs` | 3.0 | How long a new objective pulses |
| `distance_scale` | 1.0 | World distance times this gives the shown distance |
| `unit` | empty | Text after the distance number, for example `m` |

`Marker::new` gives a white dot at priority 0. `distance_text` writes the number, in the form `42`, `980` or `1.2k`.

## Icons

`MarkIcon` is a small icon drawn with plain shapes, shared with the [[hud-minimap|minimap]]. The variants are MarkIcon::Dot, MarkIcon::Ring, MarkIcon::Diamond, MarkIcon::Square, MarkIcon::Triangle for a threat, MarkIcon::Star for an objective, MarkIcon::Cross, and MarkIcon::Custom, which holds a game's own painter function. `MarkIcon::paint` draws one icon anywhere. A marker draws its icon on a dark disc, so that it reads on any scene.

## The camera

The world to screen map is a closure, so any camera works. `Camera` is the small default. It matches the SCRAP 2D view: `set_view_pos` and `set_view_scale` show the scale in world units from the screen centre to the top edge, with world y up [[src:warp_sdk/src/hud/markers.rs|`set_view_scale(s)` show `s` world units from the screen centre to the top]]. `Camera::view` builds one from the same values that `render` sends, and `Camera::world_to_screen` applies it. This `Camera` is separate from the [[camera|camera kit]].

## Usage

```rust
use warp_sdk::egui::{pos2, Color32};
use warp_sdk::hud::markers::{Camera, MarkIcon, Marker, Markers};

// Keep one `Markers` in the game state.
let mut markers = Markers::new("hud_markers");
// In `gui`, every frame:
let cam = Camera::view(player, view_scale); // the same values `render` sends
let screen = ctx.screen_rect();
markers.show(ctx, player, |p| cam.world_to_screen(p, screen), &[
    Marker::new(1, pos2(40.0, 12.0)).icon(MarkIcon::Star).objective(),
    Marker::new(2, pos2(-8.0, 3.0)).icon(MarkIcon::Diamond).color(Color32::LIGHT_BLUE),
]);
```

The `hud_map` example shows known points of interest as markers and adds a goal as an objective. It hides the markers while the full map covers the screen, by a check on `Minimap::is_expanded`.

## Limitations

- `Marker.pos` and the `from` argument are `egui::Pos2` values in world units, unlike [[hud-cues]], which uses `ultraviolet::Vec2`.
- `size`, `edge_margin` and the marker text size are used raw and do not pass through `Look::s`, so they do not follow the interface scale.
- `Markers::show` needs `&mut self`, because the first-seen time of each objective is state.
- A marker with a world point behind another surface still draws. The kit paints on the middle layer and takes no account of decks or panels.
