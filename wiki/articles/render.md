---
title: Render passes
short: the draw table, registered scene layers and the declared frame graph
category: Engine
order: 23
module: render
see: gpu, renderer, scene, image, post, lit2d
---
**Render passes** are the ordered draws that make up a SCRAP frame, and the `render` module of `warp_core`, re-exported by `warp_sdk`, is the code that owns them. The module holds three things: the table that walks the draw order, the seam through which an application registers scene layers, and a declared frame graph that the engine validates. Layering in the scene is entirely the order of the table.

:: An application pass with its own bind groups uses `Renderer::scene_underlay` or `Renderer::scene_overlay`. See [[renderer]].

## Design

The order is a table and not a function body. `layers` returns one row per draw, in submission order, and `execute_render_pass` is a loop over that list that does not know what any row means.[[src:warp_core/src/render/pass.rs|THE ORDER IS A TABLE, NOT A FUNCTION BODY]] Adding a layer adds a row. The table replaced thirteen hand-numbered blocks, and the fractional names left over from those blocks, such as 6.5 and 7.5, survive as positions.

No scene pipeline has a depth test. Each pipeline sets `depth_stencil: None`, and the Z target is a channel for the depth-of-field pass, not a depth buffer. Later rows overwrite earlier rows.[[src:warp_core/src/render/pass.rs|NO PIPELINE IN THIS ENGINE HAS A DEPTH TEST.]]

Two callers walk the table: the live frame, and the debug dump in [[gpu#Debug buffers|gpu]], which runs the scene pass once per channel.

## The engine rows

The private ENGINE_ROWS table lists the 15 rows of the engine. A row with a count of zero binds nothing.

| Row | Position |
| --- | --- |
| dust | 2.0 |
| lines | 3.0 |
| circles | 4.0 |
| atlas:environment | 5.0 |
| atlas:resources | 6.0 |
| rects | 6.5 |
| atlas:resources-overlay | 6.75 |
| atlas:structures | 7.0 |
| atlas:resources-hull | 7.25 |
| overlay:rects | 7.5 |
| overlay:lines | 7.5 |
| overlay:circles | 7.5 |
| ships | 9.0 |
| planets | 11.0 |
| stars | 12.0 |

The GUI is rendered separately, after `execute_render_pass` returns. `execute_rect_surface_pass`, `execute_line_surface_pass` and `execute_circle_surface_pass` encode primitives into one colour target that the caller provides, and `RenderResources` carries the references that a pass needs.

`InstanceCounts` holds the count of each row. It also crosses the process boundary to the editor, so it is serialisable, and its `registered` field carries each name with its count, because the editor process does not link the application.[[src:warp_core/src/render/pass.rs|Carrying the name is what makes the row readable on the far side.]] `last_counts` returns the counts of the most recent scene pass. The value comes from the last writer and is not a sum across viewports, because a dump runs the pass many times in one frame.

## Registered scene layers

Before this seam, a row for a game object had to go in engine source. An application now declares a row with its shader, instance layout, binding and position, before the engine makes a device. The engine keeps the descriptor in a process-wide slot and learns no name.[[src:warp_core/src/render/layers.rs|Scene layers the application registers, and the engine draws.]]

`SceneLayerDesc::new` starts a row with the defaults of an instanced quad: an instanced triangle list of 6 vertices, alpha blend, no group 1, and a capacity of 256. The `with_*` methods set the rest.

| Field | Meaning |
| --- | --- |
| `name` | Unique across the registry and different from each engine row name |
| `order` | Position on the engine row scale; larger draws later |
| `wgsl` | The shader, without `struct View`, because `view.wgsl` goes in front |
| `wgsl_vs` | A vertex-only copy for wasm, needed when the shader holds a `discard` |
| `stride`, `attributes` | The instance layout, set with `SceneLayerDesc::with_layout` |
| `step_mode` | `LayerStep` |
| `topology` | `LayerTopology` |
| `binding` | `LayerBinding` |
| `draw` | `LayerDraw` |
| `blend` | `LayerBlend` |
| `capacity` | Instances the buffer holds before it grows |

The `wgsl_vs` field exists because naga emits one module into both stages, and WebKit rejects a vertex shader that holds a `discard`.[[src:warp_core/src/render/layers.rs|WebKit rejects a vertex]]

### Group bindings

Group 0 is always the view uniform. `LayerBinding` chooses group 1:

- None binds nothing. The binding of the row before stays and is not read.
- SceneTextures binds the scene material set.
- MegaAtlas binds one slot of the [[image]] mega-atlas set, through the GLES rebind.
- Coverage binds the shadow coverage buffer, which the application fills in `scene_underlay`.
- ShipAtlas binds the player-ship atlas.

The GLES rebind binds a dummy group and then the real group, because the texture-unit tracker of wgpu-hal on GLES can hold slot 1 textures stale. It costs nothing on native. The last atlas slot is the dummy, so a registered row cannot bind it.[[src:warp_core/src/render/layers.rs|which is the GLES rebind dummy]]

A row that needs a bind group of its own is not this API. That row uses `Renderer::scene_underlay` or `Renderer::scene_overlay`.

### Position in the order

Rows sort by `order` into one list with a stable sort, and the engine rows come first. A registered row at the position of an engine row therefore draws after it. The source gives the reason: the opposite rule would let a registered row hide the hull that it was registered to sit on.[[src:warp_core/src/render/pass.rs|That is the rule an application needs]]

### Lifecycle

1. Build a list of `SceneLayerDesc` values before `run`.
2. Call `register_scene_layers`. It validates the set, sorts it by `order`, and stores it. The first call wins, and a second returns an error.
3. Call `scene_layer_index` to find a row by name. The index is the position after the sort, not the position of declaration.
4. Push instances to the row by index each frame.

`scene_layers` and `scene_layer_count` read the registry. `validate_scene_layers` runs the same checks without using up the single registration.

A registered row is dropped with no message if the device came up before registration, because the pipeline list is then short.[[src:warp_core/src/render/pass.rs|A registered row is dropped, with no message, where the pipeline list or]]

### Validation

Every rule adds its own message, so one run finds every mistake. The result is an error that holds a list of strings. The rules are:

- A name must be present, unique, and not an engine row name.
- `order` must be finite.
- `stride` must be non-zero and a multiple of 4.
- There must be attributes, each must end inside the stride, and no shader location may repeat.
- The atlas slot must be in range and not the last slot.
- `capacity` must not be 0, and an instanced row must draw at least one vertex.
- The WGSL must parse and validate with naga, with the prelude in front. wasm32 skips this check.
- `wgsl_vs` must hold no `discard`.
- The set must not exceed `MAX_SCENE_LAYERS`, which is 16.

Each row costs one pipeline, one instance buffer per viewport and one row in the perf readout, so the source treats a registry of hundreds as a mistake.[[src:warp_core/src/render/layers.rs|A cap and not a budget.]]

## The frame graph

`FrameGraph` is a contract in which a product declares its resources and passes as data. The aim is to stop the engine from growing one game noun at a time. This is not the live frame loop yet: `pass.rs` still walks its fixed order, and the migration is a later step.[[src:warp_core/src/render/graph.rs|WHAT THIS IS NOT, YET]]

A `GraphResource` is a named target with a `ResourceKind` of colour, depth or aux and a `ResourceSource` of imported or created. A `PassDesc` is one pass, with its owner, `after` edges, inputs, outputs, depth and feedback resources. `PassDesc::new` gives an owned scene pass that needs a project, moves no input, and may be omitted when it is off. `PassOutput` says how a pass starts a colour target, with `Load`. `BudgetClass` names the bucket for its time. `InputMapping` says whether the pass warps the map from a cursor to a scene point.

`engine_frame_graph` declares the frame of the engine in six passes: clear, scene, overlay, post, gui and present. All have the owner `warp`, and all run with no project, because the editor shows a frame before a game loads. `engine_frame_graph_checked` validates that graph once and caches it. An invalid engine declaration panics.[[src:warp_core/src/render/pass.rs|engine frame graph is invalid]]

A product implements `RenderPassExtension`. `declare` fills a `FrameGraphBuilder` with data, and `encode` runs the GPU work. `compose_frame_graph` seeds a graph from base resources and adds each extension that is enabled and owned by a loaded product. A stopped product adds nothing, so a stopped game leaves the graph whole. Composition does not validate, so the caller composes once and validates once.

`validate_frame_graph` checks a graph with no device and returns all messages.[[src:warp_core/src/render/graph.rs|pub fn validate_frame_graph]] It reports these faults:

- a name that is empty or repeated, on a resource or a pass
- a created colour or aux target with no format
- a pass owner that is not loaded
- a read, write or depth that names no resource, or a resource of the wrong kind
- an undeclared read-write of one target, or a feedback claim over a target that the pass does not both read and write
- an `after` edge to no pass, or a cycle

`FrameGraph::order` sorts the passes with Kahn's algorithm. The order is stable: passes keep their declared order where no edge forces otherwise. `FrameGraph::active_passes` returns the passes that are enabled and owned by a loaded product.

## Limitations

A registered row cannot have a bind group of its own or a group 2. The frame graph does not yet drive the frame, so `RenderPassExtension::encode` has no live caller to rely on. wasm32 finds a bad shader only at pipeline creation, because naga is a native dependency there.

## History

The application layer seam landed on 2026-08-06, and the frame graph contract and its composition landed on 2026-09-16.
