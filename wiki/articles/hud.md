---
title: HUD
short: in-game information: cause cues, world markers, minimap, progress
category: Information
order: 11
module: hud
example: hud_map, hud_progress
see: hud-cues, hud-markers, hud-minimap, hud-progress, squircle, teach
---
**The HUD kit** is the family of Warp modules that show a player in-game information with icons and motion in place of prose. It lives in `warp_sdk::hud`, which holds four submodules that a game reaches by full path, for example `warp_sdk::hud::cues` [[src:warp_sdk/src/hud/mod.rs|`warp_sdk::hud::cues`.]]. The `hud` module has no items of its own. Each submodule answers one question a player asks during play.

## Overview

| Submodule | Article | Question it answers | Main types |
|---|---|---|---|
| `hud::cues` | [[hud-cues]] | Why did that just happen? | `Cue`, `Cues` |
| `hud::markers` | [[hud-markers]] | Where is that thing? | `Marker`, `Markers` |
| `hud::minimap` | [[hud-minimap]] | What is around me? | `Minimap`, `MapFrame` |
| `hud::progress` | [[hud-progress]] | How far am I, and what do I do now? | `Meter`, `Objectives` |

The Warp documentation groups the family with the [[squircle|squircle kit]] and [[teach]] as the information kits of the SDK. The squircle kit is the interface an application operates. The HUD kits report the game state to a player, and `teach` shows the player how to play.

## Design

The kits avoid words. The progress module states the need directly: the player must see how far they are and what to do now, and neither display uses prose [[src:warp_sdk/src/hud/progress.rs|Neither uses prose. A stage name is optional and one or two words.]]. The cues module makes the same choice for cause and effect, in the form of an icon sentence [[src:warp_sdk/src/hud/cues.rs|not know why. A cue tells them with no words:]].

All four kits draw with egui shapes in `gui`, so none needs a texture from the game. The minimap builds its own terrain texture at run time from a closure.

Two icon sets serve the family. `hud::cues::Sym` is the set that `hud::cues` and `hud::progress` use. `hud::markers::MarkIcon` is the set that `hud::markers` and `hud::minimap` use.

## Shared patterns

Each kit keeps its state in a plain value that the game owns. `Minimap`, `Markers`, `Meter`, `Objectives` and `Cues` are all kept in the game state between frames. `hud::cues` also offers one global `Cues` behind free functions, for a game with many systems.

The kits with their own clock offer two forms. A `show` method ticks by the egui frame time and draws on a foreground layer. For a game that runs its logic with no window, separate `tick` and `draw` methods let the game step the state from its own clock, as the `hud_progress` example does [[src:warp_sdk/examples/hud_progress.rs|`Meter`, one `Objectives` and one `Cues`, ticks them with the game clock,]].

World positions reach the screen through a closure. `Cues::show` and `Markers::show` take a function from a world point to a screen point, so any camera works. `markers::Camera` is a small default that matches the Warp 2D view, and the minimap builds its own view from the player position.

## Colour

Colour comes from two sources. `hud::cues` uses a `visual::Language` under the [[semiotics|semiotic standard]], so a colour keeps one meaning across a game. `Cues::with_language` gives the game's language, and without one the cues use `visual::default_language`. `hud::markers` and `hud::minimap` read the context `Look` of the squircle kit: an objective takes `Look.warn`, and a threat takes `Look.bad`. `hud::progress` takes its default colours from `hud::cues::Role`.

## Usage

The `hud_map` example shows the per-frame loop of the map and the markers:

```rust
self.map.reveal(self.player, SIGHT);
self.trail.push(self.player);
let pois = self.pois();
self.map.show(
    ctx,
    &MapFrame {
        player: self.player,
        heading: self.heading,
        pois: &pois,
        threats: &[pos2(50.0, 20.0)],
        objectives: &[GOAL],
        trail: self.trail.points(),
    },
);

// World markers, hidden while the full map covers the screen.
if !self.map.is_expanded() {
    let cam = Camera::view(self.player, VIEW);
    let screen = ctx.screen_rect();
    let list = self.marker_list();
    self.markers.show(ctx, self.player, |p| cam.world_to_screen(p, screen), &list);
}
```

The `hud_progress` example shows a stage meter, a goal list and cause cues in a small game with its logic in a window-free `step`.

## Interaction with other kits

`hud::markers` and `hud::minimap` depend on the squircle kit for `Look`, and the minimap also takes its motion clock and its outline from it. The minimap sits under the key row of a deck in the same corner by default. When the viewport is picked with a pointer, a game should also respect `MapResponse.hovered`, in the same way as `DeckResponse.hovered`.

`hud::cues` and [[teach|`teach`]] share the semiotic standard, but they differ in purpose. A cue explains a change that just happened to the player, and a `teach` prompt asks the player to do something.

## History

The family was added on 2026-10-29: a placeholder registration, then the progress meters and cause cues, then the minimap and world markers. A later commit of the same day aligned the cues with the semiotic standard.
