---
title: Renderer and run
short: The entry point, the frame loop, RenderContext, viewports, and DisplaySettings
category: Getting started
order: 10
module: (root)
example: starter, pong
see: scrap, getting-started, shell, smoke, post, display-mode
---
**Renderer and run** are the entry point of a SCRAP game: `Renderer` is the trait that a game implements, and `run` is the function that opens the window and calls it once per frame. Both are re-exported at the root of `warp_sdk`, with `Config`, `RenderContext`, `DisplaySettings` and `SharedGpu`. A game is one type that implements `Renderer`. For a game with title and pause screens, [[shell]] offers `run_shell` as an alternative to writing those screens.

## Starting a game

```rust
fn main() { run::<Game>(Config { window_title: "Game", ..Default::default() }); }
```

`run` does a fixed series of steps before the first frame. It sets the application name before any window or GPU work, so that a failure dialog raised during startup can name the product.[[src:warp_core/src/lib.rs|Store the app name before any window or GPU work, so a failure dialog]] It installs boot crash reporting, then loads the project's settings. The settings load before the editor link, because the link reports the display settings to the editor as its first message. Then `run` attaches to an editor if one launched the process. Every application boots through this function, so a project needs no code to be hostable.

### Config

`Config` is `Copy`, and every string in it is supplied by the application, because the engine must not name any product.[[src:warp_core/src/lib.rs|/// Startup configuration. Every string here is app-supplied, because the]]

| Field | Default | Meaning |
|---|---|---|
| `window_mode` | WindowMode::Windowed(1280, 720) | How the primary window opens |
| `window_title` | `"Application"` | Title of the primary window, also stored as the application name |
| `secondary_window_title` | `"Application — Secondary View"` | Title of the secondary window, opened on request |

The window icon is not a field. More than twenty call sites write `Config` as a full struct literal, and a winit icon is not `Copy`, so the icon is a process-wide setting instead. See [[icon]].

### WindowMode

| Variant | Behaviour |
|---|---|
| Windowed(w, h) | A window of this many physical pixels, centred on the primary monitor |
| Maximized | Fills the work area. The title bar, the menu bar and the dock stay visible |
| Fullscreen | Takes a space of its own and hides all three |

The request for a windowed size goes in as logical units. A physical size at window creation is divided by the scale factor of whichever screen the window server last called main, so a desk with a retina laptop and a 1x monitor would open the same request at two sizes.[[src:warp_core/src/lib.rs|/// WHY THE REQUEST GOES IN AS LOGICAL UNITS]] Runtime changes to the mode, vsync and the frame cap belong to [[display-mode]].

## The Renderer trait

Four methods are required. The rest have default bodies, and a game overrides only what it needs.[[src:warp_core/src/lib.rs|pub trait Renderer {]]

### Required

| Method | Purpose |
|---|---|
| `new()` | Construct the game. It takes no arguments and receives no GPU or egui context |
| `input(viewport, input, width, height)` | Read input for this frame. `width` and `height` are the render size |
| `render(viewport, ctx)` | Record draw calls into the `RenderContext`. A game usually steps its world here too |
| `gui(viewport, ctx, display)` | Draw egui in window space. `display` is a borrow of the global `DisplaySettings` |

### Provided: drawing

| Method | Default | Purpose |
|---|---|---|
| `scene_underlay` | No-op | GPU passes into the HDR scene, before the scene pass |
| `scene_overlay` | No-op | GPU passes into the HDR scene, after the scene pass and before post-processing |
| `game_gui` | No-op | egui inside the game image, on a second context. Called only in embedded mode |
| `frame_reset` | Calls `clear_frame` | Reset the draw buffers for a new frame |
| `auto_style` | `true` | Whether the engine styles the chrome egui of this game |

### Provided: input and viewports

| Method | Default | Purpose |
|---|---|---|
| `touch` | No-op | Platform-neutral multitouch contacts. The Android host calls it |
| `set_crt_params` | No-op | Curvature and resolution, for mouse correction through the CRT distortion |
| `set_mouse_scale` | No-op | Remap factors from window pixels to render pixels |
| `set_active_viewport` | No-op | Which viewport has input focus |
| `set_secondary_camera` | No-op | Initial camera of the secondary viewport, when its window is first created |
| `scroll_secondary_camera` | No-op | Scroll-zoom for the secondary camera |
| `pan_secondary_camera` | No-op | Pan offset for the secondary camera |

### Provided: lifecycle

| Method | Default | Purpose |
|---|---|---|
| `on_close_requested` | No-op | Called once when the process is about to end. This is where a game saves |
| `on_transport_stop` | No-op | Called once on the edge where the editor's transport moves to Stopped |

Every quit gesture reaches `on_close_requested`: the X button, Alt+F4, and the menu or Cmd+Q, which sends no close event to any window. It runs first in the engine's teardown, because the event loop of winit 0.28 ends in `process::exit` and no destructor runs.[[src:warp_core/src/lib.rs|winit 0.28's event loop ends in `process::exit`, so no destructor runs.]]

`on_transport_stop` exists because a host stops a game by no longer calling `render`, `input` and `game_gui`. That suppresses the frame and releases nothing: an audio sink plays on its own thread and keeps playing. A host cannot tear down through hooks that it just stopped calling, so the application gets this edge. It runs before the host clears its running flag.[[src:warp_core/src/lib.rs|So a host]]

## Frame order

One primary frame on the desktop loop runs in this order:

1. `set_crt_params`. The curvature is zero while the CRT is off.
2. `set_mouse_scale`.
3. `input`.
4. `frame_reset`.
5. `render`.
6. Upload of the draw buffers to the GPU.
7. `gui`, after the engine style when `auto_style` is true.
8. `game_gui`, in embedded mode only.
9. `scene_underlay`.
10. The scene pass, which loads the underlay and draws the submitted layers over it.[[src:warp_core/src/viewport/frame.rs|// Scene pass (HDR + Z MRT) — LoadOp::Load preserves the underlay]]
11. `scene_overlay`, which therefore inherits the post chain.
12. The post-process chain and the present.

`gui` runs after `render` in the same frame and before the GPU hooks. Both GPU hooks are skipped while a debug buffer channel is active.

The engine paces frames against a budget. The default is about 60 Hz, 16,667 microseconds, and `window.frame_cap_hz` in the manifest moves it.[[src:warp_core/src/lib.rs|/// This was a constant at 16_667 us, so 60 Hz was the ceiling every]] A hosted game whose panel is not on screen drops to 5 Hz. It is a throttle and not a stop, because the Storyboard reads the last published frame and a resize must still reach the window.[[src:warp_core/src/lib.rs|/// A THROTTLE AND NOT A STOP, WHICH IS THE WHOLE CHOICE HERE]]

## RenderContext

`RenderContext` collects draw commands during a frame and batches them for GPU submission. It holds CPU-side buffers and touches no device, which is why [[smoke]] can drive `render` with no GPU.[[src:warp_core/src/context/mod.rs|RenderContext collects draw commands during a frame and batches them for]]

### View

`set_view_pos`, `set_view_scale` and `set_view_rotation` set the camera. A scale of 1.0 makes the window two units tall. Rotation is in radians, counter-clockwise positive, and zero is north up. `set_render_origin` sets a floating origin, subtracted from the view position, so that the world-to-screen subtraction in the shaders runs on small numbers. The world-space draw helpers apply it to each position that they store. A caller that emits its own instance positions must subtract the same origin.[[src:warp_core/src/context/mod.rs|/// A floating render origin, subtracted from the view position so the]]

### Shapes

| Call | Result |
|---|---|
| `draw_rect(min, max, color)` | Axis-aligned filled rectangle |
| `draw_rotated_rect(center, half_extent, rotation, color)` | Rectangle rotated in the vertex shader |
| `draw_line(src, dst, color)` | Line |
| `draw_circle(position, radius, color)` | Disc shaded as a sphere |
| `draw_flat_circle(position, radius, color)` | Disc in the instance colour, flat to the edge |
| `draw_glow_circle(position, radius, color)` | Disc with a soft edge |

`draw_circle` pushes a texture index that the fragment shader answers with a planet path, so a bullet or a spark comes out as a small ball. `draw_flat_circle` takes the sentinel that the shader reads as flat, so no normal is built and no light term is added.[[src:warp_core/src/context/draw/primitives.rs|/// A disc in the instance colour, flat from the middle to the edge.]]

### Overlay rows

The `draw_overlay_*` calls draw the same shapes on a higher world-space row. `draw_screen_overlay_line`, `draw_screen_overlay_rect` and `draw_screen_overlay_circle` take normalized screen coordinates, independent of the world camera, and use the size from `set_surface_size`.[[src:warp_core/src/context/draw/primitives.rs|/// Draw a normalized screen-space rectangle, independent of the world camera.]]

### Images

`draw_image_simple(position, size, texture_index)` draws one sprite at one size. `draw_image` adds a `Vec2` size, a rotation, a tint and flags. `draw_mega_atlas_image` is the low-level form for the unified mega-atlas system, and `draw_scene` walks a whole [[scene]] store and pushes one instance per visible object. The render path allocates four mega-atlas slots, and an application decides what fills each one through its atlas set descriptor.[[src:warp_core/src/context/mod.rs|pub const NUM_MEGA_ATLASES: usize = 4;]] `set_draw_z` sets the depth of later image calls, and the caller must reset it to zero. See [[image]].

### Scene layers

`push_scene_layer` appends instances to a layer that the application registered. The list holds bytes, because the type belongs to the application. An instance type that does not match the descriptor gives a wrong picture and not a crash, and an unknown index appends nothing.[[src:warp_core/src/context/mod.rs|/// mismatch is a wrong picture and not a crash, the same way a wrong]] See [[render]].

### Game-named calls

A set of verbs, such as `draw_planet_circle`, comes from Stella Nova. Other verbs of this kind have moved out of the engine, and a new game should not use the remainder.

### Counting a frame

`drawn_count` gives the number of world-space rects, lines, circles and sprites recorded in the frame. `frame_fingerprint` gives one count per bucket, in a fixed order, with the sum as the last entry. Both exist because the draw buffers are private to the crate. See [[building-a-game#Proving what is drawn|proving what is drawn]].

## GPU hooks

`scene_underlay` and `scene_overlay` receive a `SharedGpu`, a live command encoder and the HDR targets. The underlay draws a background, such as a sky, terrain or the fluid surface, and the scene layers draw over it. [[lit2d]] and [[fluid]] draw here.

```rust
fn scene_underlay(&mut self, shared: &SharedGpu, encoder: &mut wgpu::CommandEncoder,
    hdr: &wgpu::TextureView, _z: &wgpu::TextureView, _cov: &wgpu::TextureView,
    view: &View, _px: [u32; 2]) {
    self.sky.draw(shared, encoder, hdr, view.width(), view.height());
}
```

`surface_px` is the window size in physical pixels and not the size of the HDR view. The HDR chain runs at a fixed internal resolution, and the final blit scales it to the window. A pass that needs the target size reads the view.[[src:warp_core/src/lib.rs|/// `surface_px` is the window size in physical pixels. It is NOT the size]] `coverage_view` is a single-channel shadow target, and a pass that casts no shadow ignores it.

## Viewports

`ViewportId` is a `u32`, and `PRIMARY_VIEWPORT` is 0. The secondary window is viewport 1. It runs its own input, `frame_reset` and `render` against a separate `RenderContext`, so `render` must use its `viewport` argument when the two views differ.[[src:warp_core/src/lib.rs|renderer.input(1, &secondary_input, sw, sh);]] The secondary window opens when the application asks for it.

A second split runs between chrome and the game image. `gui` lands on the surface in window space. `game_gui` draws in game-image space onto the LDR image before the CRT pass, so a HUD drawn there carries the same filter as the scene. Two egui contexts are needed, because one context lays out at one screen rect, and a HUD would paint over the toolbar.[[src:warp_core/src/lib.rs|/// Two contexts, because one cannot serve both. A single context lays out]]

## DisplaySettings

`DisplaySettings` holds every post-processing attribute: FXAA, motion blur, depth of field, the bloom and grade values, and the CRT tube. There is one global block for the whole process and not one per window, because a copy per viewport let a second window render the game with different settings and nothing reported the divergence.[[src:warp_core/src/types/display.rs|//  One global instead. Every viewport reads the same values, the Display]]

`DisplaySettings::DEFAULT` has every effect off. The bloom and grade sub-switches default to on, under `pp_enabled`, so a project saved before those switches existed keeps its picture. The struct is serialisable because the game can be a second process and the editor pushes the block to it over a socket. On disk, the table holds only the keys that differ from the default, and `copy_crt_tuning_from` copies the tuning of the tube as one block.

The `display` argument of `gui` is a borrow of the global, taken for the frame.

```rust
fn gui(&mut self, _v: ViewportId, _ctx: &egui::Context, display: &mut DisplaySettings) {
    display.crt_enabled = true;
}
```

The lock is held across the whole of `gui`, so code inside the frame must not read the global a second time. Re-entering it would deadlock the process with no panic and no log.[[src:warp_core/src/types/display.rs|/// lock is held across a whole GUI frame, so anything the frame calls that]] [[post]] is the one-line interface to the same settings, callable from any thread.

## SharedGpu

`SharedGpu` holds every GPU resource that is identical across viewports: the device, the queue, compiled pipelines, atlases and bind group layouts. It is created once at startup, and secondary viewports borrow from it. The device and the queue are `Arc`-wrapped because the background asset loader shares them. Pipelines and atlases belong to the render thread.[[src:warp_core/src/shared.rs|Device/Queue are Arc-wrapped (shared with background asset loader).]] Per-viewport state, such as the surface, buffers, post-processing and the view uniform, lives elsewhere. `mega_atlas_mapping` gives the texture mapping for one slot, and `scene_texture_count` gives the layer count of the loaded scene textures.

## Limitations

- `render` receives no delta time, so a game keeps its own clock.
- `set_crt_params` carries the horizontal curvature only. A cylindrical tube bows one axis, and the one-scalar hook cannot carry the vertical one.[[src:warp_core/src/lib.rs|// tube bows one axis only, and this one-scalar hook cannot]]
- `new` receives no context, so anything that needs an `egui::Context`, such as installing fonts, waits for the first `gui`.
- The desktop event loop does not call `scroll_secondary_camera` or `pan_secondary_camera`.
