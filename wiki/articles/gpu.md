---
title: GPU module
short: formats, post chain, buffers, captures and offscreen targets of the engine
category: Engine
order: 22
module: gpu, gpu::capture, gpu::cornell, gpu::debugbuf, gpu::game_view, gpu::guard, gpu::load_events, gpu::office, gpu::peek, gpu::pixhash, gpu::planet_preview, gpu::postprocess, gpu::probe, gpu::shader_lab, gpu::splat
example: fluid, lit2d
see: render, post, renderer, types, image, hostlink
---
**The GPU module** is the `gpu` module of `warp_core`, re-exported by `warp_sdk`, which holds the formats, buffers, post-processing chain and readback tools of the engine. A game uses a small part of it: the target formats for its own passes, `try_build` for optional GPU objects, and the headless hash in `gpu::pixhash`. Most of the rest is engine plumbing that the module makes public, and several submodules serve editor panels.

The module is plain wgpu. `warp_sdk` re-exports the `wgpu` crate, and `Renderer::scene_underlay` and `Renderer::scene_overlay` hand a game the encoder and the targets. [[post]] gives post effects with one switch each, and [[render]] covers draw order.

## Which parts a game uses

| Submodule | Audience | Purpose |
| --- | --- | --- |
| `gpu::guard` | Game and engine | Build an optional GPU object in an error scope |
| `gpu::postprocess` | Game and engine | Formats and post-process parameters |
| `gpu::pixhash` | Tests | Headless render, readback and stable hash |
| `gpu::load_events` | Game | Asset loading progress queue |
| `gpu::probe` | Debugging | One clear colour per frame layer |
| `gpu::game_view` | Editor and hosted games | The game image as an egui texture |
| `gpu::capture`, `gpu::peek` | Editor panels | Readback of the game texture |
| `gpu::debugbuf` | Game panel | Debug channels and their dump |
| `gpu::shader_lab` | Shader panel | One live WGSL file in a texture |
| `gpu::planet_preview` | Editor panel | Offscreen planet preview |
| `gpu::office` | Sauron Office panel | Offscreen low-poly 3D renderer |
| `gpu::cornell`, `gpu::splat` | Cornell and Splats panels | Path tracer and gaussian splat viewer |

`gpu::office`, `gpu::shader_lab`, `gpu::planet_preview`, `gpu::cornell` and `gpu::splat` are reachable through this path but serve the editor. `gpu::cornell` and `gpu::splat` compile only with the `editor` feature of `warp_core`,[[src:warp_core/src/gpu/mod.rs|feature = "editor"))]
pub mod cornell;]] and the `warp_core` dependency line of `warp_sdk` names only `audio`.[[src:warp_sdk/Cargo.toml|warp_core = { path = "../warp_core", default-features = false, features = ["audio"] }]] Other submodules have target gates. `game_view`, `capture` and `peek` do not compile on Android, and `shader_lab` and `debugbuf` compile on neither wasm32 nor Android.

## Formats and the HDR chain

:: Main article: [[post]]

The scene renders to an HDR target, and the chain then produces the LDR image.[[src:warp_core/src/gpu/postprocess.rs|Scene → HDR texture → bloom extract → downsample chain]]

| Constant | Value | Meaning |
| --- | --- | --- |
| `HDR_FORMAT` | Rgba16Float | The HDR scene target. All scene pipelines target this format, not the surface format. |
| `Z_FORMAT` | R16Float | The linear depth channel, written beside HDR. |
| `MSAA_SAMPLES` | 1 | Sample count of every scene pipeline. |
| `BLOOM_MIP_COUNT` | 5 | Bloom blur levels. |
| `BLOOM_MIN_INTENSITY` | 0.001 | Below this intensity the bloom passes do not run. |

`MSAA_SAMPLES` was four, and FXAA replaced it after tonemapping. The name stays because the pipeline definitions read it and a multisample state still needs a count.[[src:warp_core/src/gpu/postprocess.rs|One. It was four, and FXAA replaced it after tonemapping.]]

`PostProcessParams` is the uniform block of the chain. Its fields and defaults are:

| Field | Default |
| --- | --- |
| `bloom_threshold` | 0.0 |
| `bloom_intensity` | 0.25 |
| `bloom_radius` | 1.2 |
| `exposure` | 1.0 |
| `saturation` | 1.5 |
| `contrast` | 0.994 |
| `temperature` | 0.0 |
| `brightness` | 0.0 |
| `shadows_tint` | `[1.0, 1.0, 1.0, 0.0]` |
| `highlights_tint` | `[1.0, 1.0, 1.0, 0.0]` |

`PostProcessParams::apply_display` copies the `pp_*` fields of `DisplaySettings` into the block. The frame and the Android host both call it, so the two cannot disagree about what a switch does. With `pp_bloom_enabled` false it sends an intensity of exactly zero, so stale bloom mips give nothing to the picture. With `pp_grade_enabled` false it sends the identity grade, because the tonemap shader has no grade flag.[[src:warp_core/src/gpu/postprocess.rs|`pp_grade_enabled` false sends the identity grade.]]

`PostProcessChain` owns the textures, pipelines and bind groups of the chain and is recreated on resize. `FxaaPass`, `DofPass`, `ZDofPass` and `MotionBlurPass` are the separate passes. `ZDofPass` reads the tonemapped colour and the `Z_FORMAT` channel. Objects at the focal depth stay sharp, and other objects receive a Poisson disc blur in proportion to their distance from it. `MotionBlurPass` reprojects with the delta between the previous and current camera, and it needs no depth or velocity target.

`CrtPostProcess` and `CrtParams` are the CRT filter. The filter holds separate targets for the scene and for egui, and composites them at the end.[[src:warp_core/src/gpu/crt/mod.rs|The scene goes to `texture_view` and egui goes to `gui_view`]] `barrel` and `tube_parallax` are CPU copies of two WGSL functions. They exist so that a test can check the geometry with no GPU, and the source warns against removing them as dead code.[[src:warp_core/src/gpu/mod.rs|check that the Rust and the WGSL still agree.]]

## Optional objects: try_build

`try_build` runs a closure inside a wgpu Validation error scope and returns nothing if an error was recorded. wgpu 0.16 sends a validation error with no open scope to an uncaptured handler that panics by default, so a shader that the DX12 back end cannot compile is a crash of the whole process, even for an effect that the user can turn off.[[src:warp_core/src/gpu/guard.rs|whole-process crash]]

On failure, the value is dropped and one line goes to stderr and to the boot log. `gpu::guard::describe` gives the error text. The caller disables the object.

The scope has three limits:

- On wasm32 the future is a JavaScript promise that `block_on` cannot finish, so the web build runs the closure with no scope.
- Error scopes form one stack per device, not per thread. `try_build` is unsafe to call while another thread can push or pop a scope on the same device.[[src:warp_core/src/gpu/guard.rs|Error scopes are one stack for each device, not one for each thread.]]
- The function does not call `device.poll`, because a poll waits for queued GPU work and stalls boot.

## Device and buffers

`create_device_and_surface` and `create_surface_for_window` build the wgpu objects, and `GpuContext` holds the instance, surface, device, queue and surface configuration. On native targets the device first requests raised limits, and then the wgpu defaults if the driver refuses them. Only the storage binding size and the buffer size change, and they never go below the defaults. The value `WARP_GPU_LIMITS=default` opts out.[[src:warp_core/src/gpu/device.rs|fn raised_limits]]

`choose_present_mode` picks a present mode from the surface capabilities. `set_uncapped` is called with true only when `window.frame_cap_hz` in the [[manifest]] is above 60, because Metal offers Fifo and Immediate but never Mailbox, and Immediate tears, so an application must ask for it.[[src:warp_core/src/gpu/device.rs|`Immediate` tears, and an application that never asked for it must not]] At run time, [[display-mode]] is the path for these choices.

`DynamicBuffer` is a GPU buffer that grows when the data exceeds its capacity. Growth is by powers of two, held at the device limit. Old buffers stay alive for two frames so that the GPU can finish reading them.[[src:warp_core/src/gpu/buffers.rs|Ring buffer depth for deferred GPU buffer drops.]]

`Pipelines` holds the render pipelines of the engine. `RectTargetMode`, `LineTargetMode` and `CircleTargetMode` choose scene or surface pipelines. `ViewUniform` holds the view uniform buffer and bind group. `VIEW_PRELUDE` is the text of `view.wgsl`, which goes in front of each scene shader. A registered layer gets the same string at run time, so its shader must not declare `struct View` again. See [[render]].

## Headless proof: pixhash

`gpu::pixhash` is the visual baseline tool of the engine. It opens a device with no window, renders to an offscreen target, reads the target back and reduces the pixels to one `u64`. Two renders of one scene give one number, and a changed number names a changed picture.[[src:warp_core/src/gpu/pixhash.rs|A changed number names a changed picture.]]

| Function | Purpose |
| --- | --- |
| `headless` | A device and queue with no surface, or `None` where no adapter answers |
| `offscreen` | A target that a pass can draw into and a copy can read |
| `read_rgba` | Copy a target back and normalise BGRA to RGBA |
| `hash_rgba` | The stable reducer |
| `hash_texture` | Read back and reduce in one call |

`CAPTURE_FORMAT` is Rgba8Unorm, which reads back with no channel swap on every backend. The module does not choose a golden value. A gradient rasterised on two backends can round two ways, so a committed golden value is per host. The [[boot]] kit uses `headless` and `offscreen` in its tests.

## Load events

`LoadEvent` is the progress queue for asset loading. The background loader and the scene texture loader of the application call `push_load_event`, and the host application calls `drain_load_events` each frame. Nothing in `warp_core` drains the queue: the host reads the events and draws its own loading screen.

The queue holds `LOAD_EVENT_LIMIT` events, 512, because one mega-atlas pushes one event per texture layer. When full, it drops the oldest progress event. The AllTexturesComplete and LoaderFailed events are never dropped, because a host that loses either one waits on the loading screen for ever.[[src:warp_core/src/gpu/load_events.rs|`AllTexturesComplete` and `LoaderFailed` are never dropped.]] `load_events_dropped` counts the loss.

## Probe

`gpu::probe` gives each frame layer its own clear colour. A hole in a frame is otherwise black, and every layer clears to black, so a black area names no pass.[[src:warp_core/src/gpu/probe.rs|A hole in a frame is black, and every layer of the frame clears to black.]]

| Colour | Constant | Reading |
| --- | --- | --- |
| Magenta | `SURFACE` | The window blit did not reach this area. |
| Blue | `LDR` | The post chain did not write this area. |
| Green | `HDR` | The chain wrote it, and nothing was drawn here. |
| Black | | A pass wrote black on purpose. |

The probe is off unless the WARP_PROBE environment variable is set, so a shipped build pays one atomic load per frame.

```bash
WARP_PROBE=1 ./game
```

## The game view

`GameView` holds the finished game image as a texture that an egui panel can draw. The normal frame draws egui into the LDR image and blits both to the surface. Embedded mode inverts this: the CRT pass writes to this texture, the GUI pass targets the surface, and a panel samples the texture. Only the destination of two passes changes, so the image in the panel is the game image.[[src:warp_core/src/gpu/game_view.rs|Only the destination of two render passes changes.]]

`GameView::ensure` builds the texture in the primary viewport, and `GameView::register_in` gives one window a texture id for it. The split is what lets the Game panel tear off into its own window, because an `egui::TextureId` means nothing to another renderer but all windows share one device. A window can hold a second, nearest-filtered name through `GameView::register_nearest_in`.

`GameView::adopt` puts an imported surface from another process in the same slot, which is how a [[hostlink|hosted game]] reaches the panel. An adopted slot must not be rebuilt or drawn into.

`GameViewAspect` is the shape that the game is asked to render at. `fit_centered` fits an aspect in a panel rect, rounded to whole pixels, because a half-pixel origin makes the linear filter blur a still image.

## Editor readback

`gpu::capture` brings one whole frame back to the CPU on request. A panel draws inside the egui run closure and holds no device, and the render loop does not know which screen a picture is for, so the module is a flag, a readback and a slot. `capture::request` asks, `capture::serve` runs once a frame from the loop, and `capture::take` collects. `capture::IDLE`, `capture::MANUAL`, `capture::AUTO` and `capture::GAME` tag the asker, so a frame stays with the asker that wanted it. The stall on the render thread is deliberate and bounded, because a capture happens only a few times in a session.[[src:warp_core/src/gpu/capture.rs|THE STALL IS DELIBERATE AND IT IS BOUNDED]] `capture::abandon` also drops a served frame that nobody collected.

`gpu::peek` reads a small rectangle every frame with no stall. `peek::MAX_EDGE` is 256 pixels, and three staging buffers, allocated once, cost 768 KiB in all.[[src:warp_core/src/gpu/peek.rs|THREE BUFFERS, ALLOCATED ONCE, NEVER RESIZED]] `peek::serve` polls and never waits, so the numbers may lag the picture by a frame or two. When two results complete at once, only the newest survives. The result is a `Peeked` value, with the rectangle actually read in `Region`.

## Debug buffers

`gpu::debugbuf` holds the table of debug channels. A debug buffer is the scene shaded to report one property of each fragment. `debugbuf::MODES` has 19 entries, and `debugbuf::SECTIONS` groups them for the panel. A channel is a question that not every primitive can answer, because the engine has no g-buffer. A primitive that cannot answer paints its kind colour at 10 percent, not black, which separates an object with no normal map from an object whose normal points away.[[src:warp_core/src/gpu/debugbuf.rs|So a channel is a QUESTION, and not every primitive can answer it.]]

A debug mode skips bloom, tonemap, depth of field, FXAA and CRT, because those are correct for a picture and wrong for a measurement. `DebugBlit` copies the HDR target directly to the LDR image. A dump renders each channel again inside one frame, so all channels show the same camera at the same instant, and `debugbuf::write_dump` lays the set out as a sheet.

## Editor renderers

These modules share one mailbox shape: a process global that holds the wgpu resources, a global that the panel writes each frame it is visible, and a texture global that the panel reads. The primary viewport creates and registers the resources before the GUI closure and draws after it, so the picture is from the current frame.[[src:warp_core/src/gpu/shader_lab.rs|IT FOLLOWS THE PLANET PREVIEW, NOT THE GAME VIEW]] Because the primary viewport issues the texture id, the Shader, Office, Cornell and Splats panels are not tearable.

- `PlanetPreview` renders the selected planet with the world circle pipeline into a square of `PREVIEW_SIZE`, 768 pixels, and tonemaps it with the same ACES curve. The other modules follow its shape.
- `ShaderLab` compiles one WGSL file from the Shader panel and draws a fullscreen triangle. Every build runs in an error scope, because the file may be half edited. `LabStatus` reports the result.
- `Office` is a forward renderer of low-poly meshes for the Sauron Office panel, with a depth buffer, one directional sun, warm ambient and distance haze. Its shadow map is 4096 pixels square.[[src:warp_core/src/gpu/office.rs|Offscreen 3D renderer for the Sauron Office panel.]]
- `Cornell` is a path tracer that adds samples to a running average held in float targets, then tonemaps into a texture for egui.
- `Splat` draws a cloud of 3D gaussians as instanced quads. Draw order comes from a CPU back-to-front sort that runs one frame behind, because alpha blending is not commutative and a depth buffer keeps one fragment and rejects the others.[[src:warp_core/src/gpu/splat/mod.rs|Alpha compositing is not commutative.]]

## Limitations

The engine scene has no depth test, as [[render]] describes. `Office` is the exception inside this module, and it creates and binds its own depth target.

Only the primary viewport can fill the offscreen targets. See the [[hostlink]] article for the case where the game runs in another process.
