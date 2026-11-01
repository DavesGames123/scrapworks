---
title: Types
short: shared state and channels that the engine and the application both read
category: Engine
order: 30
module: types
see: renderer, display-mode, post, project-settings, render, hostlink
---
**Types** is the `types` module of `warp_core`, re-exported by `warp_sdk`, which holds the shared types and process-global channels that the engine and an application both read. It holds no single concept. The module was one 2700-line file with a dozen unrelated concerns, and it is now a directory with one concern per file, which re-exports all items so that each item keeps its path.[[src:warp_core/src/types/mod.rs|This module was one 2700-line file carrying a dozen unrelated concerns.]]

Most of the surface is globals with a small accessor pair. A game normally reaches these through a kit: [[display-mode]] uses the display store, and [[post]] uses the post store. This article groups the items by concept.

## Display settings

`DisplaySettings` is the one block of attributes for the whole application: the CRT filter, HDR chain, depth of field, FXAA, motion blur and lighting wrap. They describe how the game image looks, and they are not a property of a window. They were once a field on each viewport, so a second window could render the game with different settings and nothing reported the difference.[[src:warp_core/src/types/display.rs|a second window silently rendered the game with]] One global replaced them.

| Function | Purpose |
| --- | --- |
| `display_settings` | Read a copy |
| `set_display_settings` | Replace the block |
| `with_display_settings` | Borrow mutably for one call |
| `display_is_borrowed` | Whether a frame holds the borrow |
| `display_section` | The [[project-settings]] section |

`Renderer::gui` receives `&mut DisplaySettings`, a borrow of this global for the whole GUI frame. The lock is held across the closure, so anything in the frame that takes the global again deadlocks with no panic and no log. The source records that this froze the editor the day that the settings registry was wired in.[[src:warp_core/src/types/display.rs|It exists so that re-entering the global can FAIL rather than HANG.]] `display_is_borrowed` lets such a call fail loudly. It is a flag and not `try_lock`, because `try_lock` cannot tell this thread from another thread that holds the lock for a moment.

Every effect is off in `DisplaySettings::DEFAULT`, and the tuned values beside the switches stay. A new project draws its rects and lines with the colours that it chose, and a game that wants the old look sets `pp_enabled` and `crt_enabled`.[[src:warp_core/src/types/display.rs|EVERY EFFECT IS OFF, AND THE VALUES BESIDE THE SWITCHES ARE NOT]]

## Any-thread stores

Two stores let any thread change the frame without touching the lock above. Both are a mutex and a revision that never wait for a frame, and the frame applies the newest value at one fixed point.

The post store is a second copy of the post fields. `post_store_get`, `post_store_update` and `post_store_revision` serve the [[post]] kit, and `sync_post_store` runs in the frame. A `post::set` applies once, at the next frame. If no update arrived, the global is copied into the store, so `post::get` shows what the editor and the game wrote. The store does not hold an override that wins each frame, because that would make the Post panel dead.[[src:warp_core/src/types/post_store.rs|hold an override that wins every frame, because that makes the panel dead.]]

The display store holds `DisplayMode`, `DisplayWindow` and `MonitorInfo`, with `display_store_get`, `display_store_update`, `sync_display_store` and the monitor functions. [[display-mode]] describes these and the frame order. `pick_present_mode` and `frame_cap_budget_us` are its pure helpers.

## Keyboard channels

`RawKey` is a physical key as winit reports it. SCRAP has two paths that bypass egui and the winit input helper.

### The raw key ring

egui consumes a key event whenever a TextEdit holds keyboard focus, so a console whose own field has focus goes deaf to the key that closes it. The event loop mirrors each watched press into `RAW_KEY_PRESSES` from the raw window event, before egui gets it.[[src:warp_core/src/types/rawkey.rs|egui consumes a key event whenever any TextEdit holds keyboard focus]] The watch list bounds the ring, because mirroring all presses would let held keys evict a real press. A full ring of `RAW_KEY_RING_LIMIT`, 64, drops its oldest entry, so the newest press always lands.

The list is keyed by owner, and the effective watch is the union. `watch_raw_keys` replaces only the list of its owner, so no registration can delete another subsystem's key. `set_raw_key_watch` is the `RAW_WATCH_APP` slot. The owner keying exists because a single list once let one subsystem clear another's keys, and the debug console could not be opened.

`take_raw_key` removes all pending presses of one key and reports whether any existed, and `drain_raw_keys` takes them all. `push_raw_key` and `push_raw_key_from` are the producers: the first is for a shipped game and the web loop, and the second is for an editor that hosts a game.

### Input capture

Keyboard and pointer capture are two independent grabs, and the engine gives neither a meaning.[[src:warp_core/src/types/capture.rs|Two independent grabs.]]

`set_input_capture` diverts key transitions into `CAPTURED_KEYS` in place of the raw ring and egui. `pop_captured_key` takes them, with `true` for a press. `set_capture_passthrough_keys` names the keys that stay global: a console toggle belongs there, because the user must always be able to leave.

The queue carries transitions and not presses, so the two edges of one key live or die together. At `CAPTURED_KEY_LIMIT`, 64, it drops the oldest press with the release that closes it, and it never drops a release alone. A lost release would leave a key locked on, and the source judges a lost press to be the smaller fault.[[src:warp_core/src/types/capture.rs|A RELEASE IS NEVER THE ENTRY THAT GOES]] `captured_keys_dropped` counts the cost.

`set_pointer_capture` hides the cursor, warps it to the window centre each frame, and accumulates the drift. `take_pointer_delta` returns the drift since the last call, and `pointer_buttons` the held buttons. `set_pointer_release_keys` names keys that drop the capture. Such a press also reaches the raw ring, so one keystroke can release the pointer and mean something.

| Function | Purpose |
| --- | --- |
| `set_input_capture`, `input_captured` | Keyboard grab |
| `set_pointer_capture`, `pointer_captured` | Pointer grab |
| `is_capture_passthrough`, `is_pointer_release_key` | Test one key |
| `clear_captured_keys` | Empty the queue |
| `push_captured_key` | The producer, in the event loop |

### Pending flags

`PENDING_SCROLL` and the `PENDING_MOUSE_*` flags carry input across event batches between render frames. Without them, scroll would read as 0 on a frame that the render budget skipped.

## Transport

`PlayState` is what the play bar says the simulation should do: Stopped, Playing or Paused. This is deliberately not the pause flag of a game. Game systems write such a flag freely, so a play bar built on one would resume when a story overlay closed. Game code must not clear an editor pause.[[src:warp_core/src/types/playstate.rs|This is deliberately NOT the game's own pause flag.]]

| Function | Purpose |
| --- | --- |
| `play_state`, `set_play_state` | Read and write the transport |
| `play_debug`, `set_play_debug` | The debug configuration for the next boot |
| `transport_active`, `set_transport_active` | Whether a play bar owns the transport |
| `request_step`, `take_step_request` | Run one pass while paused |
| `step_pending` | Peek at a step, with no consumption |
| `take_play_state_change` | Report the state once per change |

`take_step_request` has one consumer, the simulation loop. `step_pending` has no caller today and stays for a reader that has a stake in a step. `take_play_state_change` exists because a host that wrote its state every frame overwrote what the application did. The first call returns nothing, so a host does not disturb a boot sequence.

## The game view

These items carry the scene as a texture in an egui panel. See `GameView` in [[gpu#The game view|gpu]]. The normal frame draws egui into the LDR image, so the scene is the backdrop of the GUI. In embedded mode, the finished scene is a texture, and a panel draws it.

`set_game_view_embedded` is a declaration that a host makes once at startup, because it decides whether the chrome is post-processed. It used to be a side effect of a panel draw, so closing a tab could send the whole window through the CRT shader.[[src:warp_core/src/types/gameview.rs|THIS DECIDES WHETHER THE CHROME IS POST-PROCESSED]]

`GameViewRect` is the rect that a panel drew, with the window that it drew in. The window is a field of the rect, because four numbers with no window are numbers that every window believes are its own. The panel publishes the rect each frame, and `tick_game_view` and `mark_game_view_drawn` expire it when the panel stops drawing. `game_view_remap`, `game_view_contains` and their `_in` forms map the pointer.

Key routing is separate, because a key has no position. `game_view_focused` says that the panel holds the keyboard, `game_focus_vote` and `publish_game_focus` let each window vote, and `game_keys_from` combines the two. Outside embedded mode, `game_keys_from` is true unconditionally, because otherwise a shipped game would be deaf.[[src:warp_core/src/types/gameview.rs|True unconditionally outside embedded mode.]] `game_view_host` names the window of the panel.

## GPU data

These are the plain structs that scene shaders read.

- `View` is the view uniform: camera position and scale, star data, time, depth-of-field and lighting values, occluders and the debug mode. The `xy` field packs the HDR target size into one word, with the width in the low 16 bits and the height in the high 16 bits. This is not the window size. `View::width`, `View::height` and `View::pack_xy` read and write it.[[src:warp_core/src/types/gpudata.rs|This is the size of the]]
- `Rect` is a rect instance, with min, max, colour, rotation and flags. `RECT_FLAG_RECEIVE_SHADOW` is its one flag.
- `Vertex` is a position and colour.
- `Instance` holds a position, radius, colour, texture index and rotation.

## Windows and viewports

`ViewportId` is a `u32` that names one OS window, with its own surface, post chain, egui context and camera. `PRIMARY_VIEWPORT` is 0 and always exists. `SECONDARY_VIEWPORT_REQUESTED` asks for the secondary view, which has id 1.

`alloc_viewport_id` starts at 2 and never reuses an id. The application allocates the id and then asks for a window, because a dock must fill the new window on the frame of the drop.[[src:warp_core/src/types/windows.rs|Name a window that does not exist yet.]] `request_window` queues a `WindowRequest` of open, close, focus or retitle, and `drain_window_requests` takes the queue once per frame. `push_window_closed` and `push_panel_closed` report closures.

`WindowGeometry` holds the client origin, size and pixels per point of each window. `to_desktop`, `to_local` and `to_desktop_size` convert positions across windows. `DragProxyState`, `set_drag_proxy` and `drag_proxy` carry a drag between windows, and `NewWindowPreview` previews the window that a drop would open.

`FULLSCREEN_TOGGLE_REQUESTED`, `FULLSCREEN_STATE`, `WINDOW_MODE_REQUESTED`, `WINDOW_SIZE_REQ_W` and `WINDOW_SIZE_REQ_H` are the requests that the event loop applies. A game uses [[display-mode]] instead.

## Instrumentation

`RENDER_DRAW_US`, `RENDER_UPLOAD_US`, `RENDER_GPU_US` and `RENDER_FRAME_US` hold the phase times of the last frame, in microseconds. `GPU_DESCRIPTION` holds the adapter and surface as lines of text, and is empty until the device exists. `WINDOW_PHYS_W`, `WINDOW_PHYS_H`, `WINDOW_SCALE_BITS`, `SURFACE_W` and `SURFACE_H` hold the sizes of the primary window. An application can read these for a performance report. See [[perf]] and [[profile]].

## Application identity and previews

`app_name` returns the product name that `run` stored with `set_app_name`, or a neutral placeholder before that. The first call wins. The name is a global because the GPU failure dialog must name the product and cannot take a parameter.[[src:warp_core/src/types/appid.rs|because the GPU failure dialog in]]

`PLANET_PREVIEW_REQUEST`, `PLANET_PREVIEW_TEXTURE` and `PlanetPreviewRequest` feed the planet preview in [[gpu]]. `GUI_ATLAS_TEXTURES` holds egui texture ids of atlases for sprites in panels.
