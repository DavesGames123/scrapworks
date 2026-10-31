---
title: Palette roles
short: the fifteen named colours a game draws with, and the box it draws them in
category: Editor channels
order: 60
module: palette
see: palette-kit, project-settings, widgets, scale, hud, visual
---
**Palette roles** are a closed vocabulary of fifteen named colours with open values, held by the `palette` module of `warp_core` and re-exported by `warp_sdk`. A game asks for a role and gets a colour. The Theme panel writes the same table, and `[settings.theme]` in the [[manifest]] carries it between runs, so a theme swap is one edit and not a pass over the source.[[src:warp_core/src/panels/palette/mod.rs|One table of named roles.]]

:: For generating a palette from a mood and a seed, see [[palette-kit]]. That kit is colour mathematics and taste rules. This module is the live table of roles that a game reads at draw time.

## Design

This is not the theme module of `warp_core`. That module is the palette of the editor chrome, with roles such as `bg_panel` and `bg_row_alt`, the vocabulary of a tool with tab strips. A game has grounds, ink and status, and it has no rows. One project built its whole interface on the chrome palette, because it was the only palette on offer.[[src:warp_sdk/src/lib.rs|This is NOT `ui::theme`, which is the editor chrome's own palette]]

The roles are closed and the values are open. `Role` is an enum, so each game names the same fifteen things, and a game written against them picks up any palette. The source says that the fifteen came from what four games converged on independently.[[src:warp_core/src/panels/palette/mod.rs|The fifteen are not invented.]]

Each role is one atomic holding packed RGBA, because each draw call reads this table and a lock there would serialise the frame. `palette` returns the table as a copy, so that a loop over several roles avoids repeated atomic loads.

## Roles

| Group | Roles |
| --- | --- |
| Grounds | Background, Surface, SurfaceRaised, SurfaceSunken |
| Ink | Ink, InkDim, InkStrong, InkInverted |
| Attention | Highlight, Accent |
| Status | Ok, Warn, Bad |
| Rules | Line, LineStrong |

Highlight means "this one": selection, focus, the hovered row. Accent is the colour of the game, used sparingly. The key of a role is stable across builds, because a rename orphans the override of everyone who made one.

## Usage

```rust
use warp_sdk::palette::{self, Role};
ctx.draw_rect(min, max, palette::color(Role::Surface).bytes());
ui.label(egui::RichText::new(name).color(palette::color(Role::Ink).egui()));
```

`color` is one relaxed load with no branch or allocation. It returns an `Rgba`, whose `Rgba::bytes` gives the `[u8; 4]` that each `RenderContext` primitive takes, and whose `Rgba::egui` gives an egui colour. One definition therefore serves both. An `Rgba` serialises as a hex string, such as `"#1a1a1f"`, because a person can read and paste that.

`set_color` puts a colour on a role for this process. The Theme panel calls it during a drag, and it does not write the manifest. `set_palette` installs a whole table, and `reset` restores the default.

## The box

A colour alone does not make a panel readable. Text straight on a moving scene is unreadable in any colour, and the fix is a filled box with a border and padding. Those numbers are `Metric`, and they live beside the colours.[[src:warp_core/src/panels/palette/mod.rs|THE BOX IS PART OF THE THEME]]

| Metric | Meaning |
| --- | --- |
| Rounding | Corner radius |
| Border | Border width; zero draws none |
| PadX | Horizontal padding |
| PadY | Vertical padding |
| Gap | Space between boxes |

Metrics are design units, so `metric` values turn into pixels through [[scale]], and a themed box answers the zoom keys.

`frame` builds an egui frame for a HUD, and `frame_raised`, `frame_sunken` and `frame_of` choose the fill. `gap` gives the space between boxes. The aim is that `palette::frame().show(ui, ..)` is fewer characters than the bare call, so the box is the shortest path.[[src:warp_core/src/panels/palette/box_draw.rs|So the box becomes the SHORTEST path rather than the remembered one.]]

In the scene, `draw_panel` on `RenderContext` fills and outlines a rect. The scene has no pixels, because the view is two units tall at scale one. So that call takes padding from the rect of the caller and reads only colours from the table.

## Project settings

`section` is the `[settings.theme]` block. It is a built-in of [[project-settings]], so a game that calls nothing still gets the palette of its project, because the engine loaded it before the first frame.[[src:warp_core/src/panels/palette/mod.rs|Registered as a builtin rather than by the application, and that is the]]

`Palette` is the serialised view, with one named field per role and metric. `project_settings::merge` writes only the keys that differ from `Palette::DEFAULT`, so a block lists only what a project changed.

`Palette::DEFAULT` is dark and low chroma, with one blue for each "this one". The source calls it a starting point and not a house style.

```toml
[settings.theme]
accent = "#1a1a1f"
```

## Limitations

The `frame` functions are native only, because they read the editor `ui` theme. The browser game draws its own frames.

For finished controls, see [[widgets]].
