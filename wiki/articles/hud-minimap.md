---
title: HUD minimap
short: corner map with fog of war that unfolds to a full-screen map
category: Information
order: 22
module: hud::minimap
example: hud_map
see: hud, hud-markers, squircle, world-reveal
---
**The HUD minimap** is a corner map in a squircle frame that unfolds to a full-screen map on a click or a key. It lives in `warp_sdk::hud::minimap`. The compact map follows the player from under the key row of a [[squircle|squircle deck]]. The full map pans with a drag and zooms with the wheel. The map key, Escape, or the close key in its corner retracts it [[src:warp_sdk/src/hud/minimap.rs|with the wheel. The map key, Esc, or the close key in its corner retracts]].

## How it works

A game keeps one `Minimap` in its state, because that value owns the terrain cache. It samples the terrain once with `Minimap::paint_terrain`, calls `Minimap::reveal` each frame with the player position and its sight radius, and calls `Minimap::show` each frame with a `MapFrame`. `MapFrame` holds what changes every frame, and every field but `player` can stay empty.

### Draw order

The map draws in a fixed order.

1. The squircle frame and its shadow, from the context `Look`.
2. The terrain texture: open space and a solid silhouette with a soft lit rim.
3. The trail, the points of interest, the threats, the objectives with a pulse, and the heading arrow of the player on top.

### Known and unknown

The map never claims what the player has not seen. A cell the player has not seen draws as hatched unknown, never as open water, so the map never says "empty" where it does not know [[src:warp_sdk/src/hud/minimap.rs|draws as open water, so the map never says "empty" where it does not]]. Space outside the world bounds draws as plain unknown.

`Minimap::reveal` makes the cells near a point known, with a soft edge over the outer 30 percent of the radius, and a known cell stays known. `Minimap::is_known` treats a cell as known past half. `Minimap::set_known` replaces the whole mask from a closure, which suits a loaded save.

The marks obey the same rule. A `Poi` shows only on a known cell, unless `Poi::always` is set. `MapFrame.threats` also need a known cell, and they draw as triangles in the bad hue. `MapFrame.objectives` always draw, with a pulse. In the compact map an objective out of view draws as a tick on the frame edge, placed with `markers::edge_point`.

### The texture cache

The terrain and the revealed mask live in one egui texture, one texel per cell, with a one-texel border of unknown. `Minimap::paint_terrain` and `Minimap::paint_region` sample the terrain closure, where 0 is open, 1 is solid, and the edge is at 0.5. `Minimap::reveal` and `Minimap::set_known` change the mask.

Each change grows a dirty box, and `Minimap::show` uploads only that box with `TextureHandle::set_partial`. A frame with no change uploads nothing [[src:warp_sdk/src/hud/minimap.rs|with `TextureHandle::set_partial`. A frame with no change uploads nothing.]]. `Minimap::paint_region` resamples only one world rect, for example after a dug tunnel. `Minimap::dirty_region` reports the pending box, and `Minimap::pixel` gives the colour of one cell.

### Unfold and retract

A click on the compact map, or the map key, opens the full map. Opening through either of these centres the pan on the player. `Minimap::set_expanded` opens or closes it from code, and it resets the zoom to the whole world on an open but does not move the pan.

The move runs along Curve::EaseInOut over the Motion::Structural token, and it uses the squircle motion rules, so reduced motion snaps it. The view blends between following the player and the pan and zoom of the full map as the unfold runs. The corner radius also blends from a key radius to twice `Look.radius`.

The full map pans only once the unfold has finished. The wheel zooms about the pointer, so the world point under the pointer stays still [[src:warp_sdk/src/hud/minimap.rs|// Keep the world point under the pointer still.]]. The span is limited to between a quarter of `compact_span` and 1.5 times the larger world side, and the pan stays inside the world bounds.

## Configuration

`Minimap::new` sets these defaults. `Minimap::grid`, `Minimap::corner`, `Minimap::compact_span` and `Minimap::key` are builder forms, and the public fields can also be set directly.

| Setting | Default | Meaning |
|---|---|---|
| Grid | 128 x 128 | Cells; each side clamps to 2 through 2046, and `Minimap::grid` clears the cache |
| `y_up` | true | World y grows up, as in the SCRAP 2D view |
| `corner` | Corner::TopRight | Corner of the compact map |
| `below_keys` | true | Sit below the key row of a deck in the same corner |
| `side` | 0.0 | Side of the compact map; zero takes three deck keys wide |
| `compact_span` | 0.3 of the shorter world side | World units across the compact map |
| `key` | `Key::M` | Key that unfolds and retracts the map; `None` leaves only the click |
| `colors` | `MapColors` | A dark sea |

`MapColors` sets the known open space, the solid terrain, the lit rim, the unknown cells and the hatch lines. The marks take their hues from the context `Look`.

## Trail and response

`Trail` samples the past path of the player. `Trail::push` keeps a point only when it is at least `spacing` world units from the last one, and the oldest point goes first past `max`. `Trail::points` feeds `MapFrame.trail`, and older segments draw fainter.

`Minimap::show` returns a `MapResponse`. Its `hovered` field should stop viewport picking under the map. `hover_world` gives the world point under the pointer, and `hovered_poi` gives the index in `MapFrame.pois` of the point under the pointer, so that a game can show detail for it. `Poi.kind` is the game's own tag. `Minimap::expansion` gives the linear unfold, and `Minimap::is_expanded` is true while the map is open or opening.

## Usage

```rust
use warp_sdk::egui::{pos2, Color32, Rect};
use warp_sdk::hud::markers::MarkIcon;
use warp_sdk::hud::minimap::{MapFrame, Minimap, Poi};

// In `new`: the world bounds and a terrain sampler (0 open, 1 solid).
let mut map = Minimap::new("map", Rect::from_min_max(pos2(-100.0, -100.0), pos2(100.0, 100.0)));
map.paint_terrain(|p| world.solidity(p));
// In `gui`, every frame:
map.reveal(player, 18.0);
let pois = [Poi::new(0, pos2(20.0, 5.0)).icon(MarkIcon::Diamond)];
map.show(ctx, &MapFrame { player, heading, pois: &pois, objectives: &[goal], ..Default::default() });
```

`MapFrame.heading` is in radians. Zero points along world +x, and a positive angle turns toward world +y.

## Interaction with other kits

The compact map reads `Look.key`, `Look.gap` and `Look.margin` to sit under a deck in the same corner, and it draws on the middle layer, so deck panels pass over it. Once the unfold begins it moves to the foreground layer. The [[hud-markers]] kit supplies `MarkIcon` and `markers::edge_point`.

The map key is ignored while a text field has keyboard focus. The kit reads the map key and Escape without consuming them, so another surface can also see the same press.

## Limitations

- The compact rect and the mark sizes use the `Look` tokens raw and do not pass through `Look::s`, so they do not follow the interface scale.
- A map with objectives asks for a repaint every frame, because the objective pulse never settles [[src:warp_sdk/src/hud/minimap.rs|if !self.prog.settled() || self.hover != h_target || !f.objectives.is_empty() {]].
- `Minimap::grid` clears the terrain and the known mask, so it belongs before the first `Minimap::paint_terrain`.
- A click on the full map outside its close key does not retract it.
