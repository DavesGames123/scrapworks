---
title: Building a game
short: Reading order, the kit map, drawing, the one-shot loop, and what to avoid
category: Guides
order: 10
example: starter, pong, snake, observatory
see: getting-started, renderer, smoke, art-direction, squircle, census
---
**Building a game** in SCRAP is a guide to the order of work for an application on `warp_sdk`, from the first plan to a passing test suite. It collects what to read, which kit answers which need, how to draw and move things, and which paths to leave alone. The method is a one-shot loop: build a playable path first, prove it with a headless test, and then add systems one at a time.

## Reading order

The recommended order puts the rules of the look before any code.[[src:docs/building-a-game-in-warp.md|The order to read things]]

1. [[art-direction]], which sets the rules for text, menus, fonts, lighting and density. A game that runs but ignores it looks generated.
2. This guide, and [[smoke]] for the proof that a game runs.
3. The reference article for each kit that the plan uses. Read those and no others.
4. The worked example for each kit in `warp_sdk/examples`. Each example is complete and has tests.
5. [[semiotics]] and [[shaderlib]], when the game draws icons or writes WGSL.

## The kit map

Each need has one kit, and the rule is to use it and not to write a second version in the game.[[src:docs/building-a-game-in-warp.md|Each need has one kit. Use the kit.]]

| Need | Kit | Example |
|---|---|---|
| A window and a frame loop | [[renderer|run, Renderer]] | `starter` |
| Title, pause, settings and a tutorial at once | [[shell]] | |
| Proof that the game boots and can be played | [[smoke]] | every example |
| A title screen, a pause menu, an end screen | [[front-menu]] | `front` |
| Save slots | [[front-save]] | `front` |
| A settings screen and its file | [[front-settings]] | `settings` |
| Fonts that are not the stock egui font | [[fonts]] | `fonts` |
| Animated changes between screens | [[cine]] | `cine` |
| The application icon | [[icon]] | `icon` |
| The boot splash and screenshots | [[boot]] | |
| One colour and one shape for each role | [[visual]] | `visual` |
| Icons that carry the rules in place of words | [[semiotics]] | `semiotics` |
| A palette from a mood word | [[palette-kit]] | |
| Bloom, grade, depth of field, CRT | [[post]] | |
| Lit sprites with normals and point lights | [[lit2d]] | `lit2d` |
| WGSL noise, SDF, materials, water | [[shaderlib]] | |
| A camera that follows, shakes and frames | [[camera]] | `camera` |
| Feedback on a hit or a correct action | [[juice]] | `juice` |
| The application's corner keys, panels and toasts | [[squircle]] | `observatory` |
| A minimap, world markers, a progress meter, cause cues | [[hud]] | `hud_map`, `hud_progress` |
| Teaching the controls and the purpose of things | [[teach]] | `teach` |
| Terrain to dig, collision, biomes, fog of war | [[world]] | `world` |
| Water that moves, and particles that ride it | [[fluid]] | `fluid` |
| A seeded world that is the same on every run | [[procgen]] | |
| Enemies, damage kinds, tools, a pace director | [[challenge]] | `challenge` |
| Resources, stores, costs, flows | [[economy]] | |
| Objectives and goal chains | [[quest]] | |
| Unlocks, stages, upgrades, a codex | [[metaprog]] | |
| Keyboard, mouse and gamepad as one set of verbs | [[gamepad]] | |
| The player's music, ambience, sound effects | [[soundtrack]] | |
| Window mode, vsync, frame cap | [[display-mode]] | `settings` |
| Frame budgets and automatic quality | [[perf]] | |

## The one-shot loop

1. **Plan.** Write down the core verb, the screens (title, play, pause, end), the kits from the map, and what the player sees that tells them what to do. Do not plan prose for the screen.
2. **Build the playable loop first.** Make the title, one playable screen and the way back. Name each screen with `smoke::report_screen`, and prove the path with `smoke::play`:

   ```rust
   use warp_sdk::smoke::{self, Key, Script};
   #[test]
   fn title_to_play() {
       let r = smoke::play::<Game>(Script::new().wait(30).press(Key::Return).wait(60));
       assert!(r.reached("play"), "{r:?}");
   }
   ```

   Do not start other work until this test passes. A game that compiles but cannot leave its title screen is not a game.[[src:docs/building-a-game-in-warp.md|A game that compiles but]]
3. **Fan out.** Add the systems one at a time, and run `cargo test` after each one. Give each costly system a `perf::budget`.
4. **Join delegated work.** When parts of the work run in parallel, wait for all of them, then run `cargo test` on the joined result.
5. **Stop on green.** The work is done when `cargo test` passes, the play test reaches each screen, and no `placeholder!` remains.

## Drawing and moving things

The game draws in `render`, into the `RenderContext`. Coordinates are those of the view: at `set_view_scale` 1.0 the window is two units tall, from -1 at the bottom to +1 at the top, and as many units wide as the aspect gives. Colours are `[r, g, b, a]` bytes. What `render` submits is what shows, unless the game opts into a post effect.[[src:docs/building-a-game-in-warp.md|post effect.]]

### Shapes

Shapes need no assets, and they cover most 2D ideas with nothing to load.

```rust
ctx.set_view_pos(Vec2::zero());          // camera centre
ctx.set_view_scale(1.0);                 // 1.0 = window two units tall
ctx.set_view_rotation(0.0);              // radians, CCW

ctx.draw_rect(min, max, [40, 44, 52, 255]);                 // axis-aligned
ctx.draw_rotated_rect(center, half_extent, angle, color);   // spins on the GPU
ctx.draw_line(a, b, [90, 90, 90, 255]);
ctx.draw_circle(pos, radius, [220, 90, 60, 255]);
ctx.draw_glow_circle(pos, radius, color);                   // soft edge
```

The worked example `pong` keeps its field at x in -1.5 to 1.5 and y in -1 to 1, and it needs nothing else to load.

### Many entities

Many entities are a plain loop. The game holds its state in its own struct, steps it, and draws each item, with no engine registration.

```rust
struct Game { balls: Vec<Ball>, /* ... */ }

fn render(&mut self, _v: ViewportId, ctx: &mut RenderContext) {
    for b in &mut self.balls {
        b.pos += b.vel;                                     // step
        ctx.draw_circle(b.pos, b.r, [230, 230, 120, 255]);  // draw
    }
}
```

### Input and time

Input is read as verbs in `input` through `bindings::pressed`, `bindings::held` and `bindings::released`. The game keeps its own clock, because `render` is handed no delta.[[src:docs/building-a-game-in-warp.md|Keep the game's clock yourself]]

### Sprites

Textured art needs an atlas. The game registers an atlas set before `run` and draws by index. This is the asset-dependent step, and a game with no art ships on shapes alone.

```rust
// before run: warp_sdk::image::register_atlas_set(descriptor)
ctx.draw_image_simple(pos, size, texture_index);            // one sprite
ctx.draw_image(pos, size, rotation, texture_index, tint, flags);
```

See [[image]] and [[assets]]. A few named draw verbs, such as `draw_planet_circle`, belong to one game, Stella Nova, and a new game should not use them.

## Proving what is drawn

`smoke::boot` proves that a game runs and not what it draws. `RenderContext::frame_fingerprint` closes part of that gap with no GPU. It returns a stable count of instances per bucket in a fixed order, so a test can assert a fixed scene against a golden array.[[src:warp_core/src/context/digest.rs|pub fn frame_fingerprint(&self)]]

```rust
let mut ctx = RenderContext::new();
game.render(PRIMARY_VIEWPORT, &mut ctx);
assert_eq!(ctx.frame_fingerprint(), GOLDEN);
```

A change that moves a draw to another bucket fails the test until the golden is updated on purpose. The fingerprint reads what the game submits and not the rendered image, so it catches a draw regression and not a shading one.

## The application's own interface

The interface a game draws over its own viewport is the [[squircle|squircle kit]], and it is the default for every new application. The editor panels are the editor's surfaces, and the squircle kit is the application's own surface, drawn in `Renderer::gui`. An application uses both.

Each surface has its own corner, because the kit does not move one surface out of the way of another.[[src:docs/building-a-game-in-warp.md|surface out of the way of another.]]

| Corner | Surface | Contents |
|---|---|---|
| TopRight | `Deck` "tools" | Data sources, view, layers, filters, actions |
| TopLeft | `Deck` "scene" | Selection, inspector, object detail, with `.auto_open` |
| BottomLeft | `Tray` | `Readout` chips for live values |
| BottomRight | Toasts | Notices from `squircle::toast` |
| At the pointer | `hovercard` | The hovered data point |

## The rule the panels follow

The editor draws the panels, and the game feeds them. Nothing in the editor reads a game's memory.[[src:docs/building-a-game-in-warp.md|The editor draws the panels; the game feeds them.]] A panel shows something about a game because the game published it, over a channel that costs nothing when no panel listens. A game therefore wires the channels it has data for and ignores the rest, and the same binary runs inside the editor and on its own.

The channels are described in [[census]], [[bindings]], [[devconsole]], [[audio]], [[profile]] and [[window]]. Three practices recur:

- Gate a census build on `census::census_wanted`, because a large scene should not assemble rows that no panel draws.
- Give a census row the same id on every publish. The panel keeps which rows are open and selected by id, so an id taken from a list position makes the tree open and shut by itself.
- Name the screen each frame. The Storyboard makes one card for each name it hears and photographs the frame under that name.

## What not to reach for

- **`warp_core` directly.** Everything a game needs is in `warp_sdk`. A path into `warp_core` reaches the editor's own internals.
- **A second copy of egui, wgpu, winit or ultraviolet.** A second dependency line splits one type into two, and every call becomes a type error.[[src:docs/building-a-game-in-warp.md|dependency line splits one type into two and every call becomes a type error.]]
- **CRT by default.** It is one optional look. Leave it off unless the art calls for it. It is one line in `gui`, `display.crt_enabled = true`, and absent otherwise. See [[post]].
- **egui panel chrome for the application's own interface.** Docked panels and a free window are not the default, because a docked bar takes screen area from the data at all times. A deck panel takes screen area only while it is open.
