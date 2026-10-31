---
title: Post effects
short: One switch per post effect, settable from any thread
category: Look
order: 40
module: post
example: starter, settings
see: visual, lit2d, art-direction, render, gpu, types
---
**Post effects** is the Warp module that controls tonemapping, bloom, colour grade, antialiasing, depth of field, motion blur and the CRT tube through one value with one switch per effect. It lives in `warp_sdk::post`. `Post` is a view of the post fields of `DisplaySettings`, grouped by effect, and a game sets it with one line from `new`, from `gui` or from a worker thread. A switch that is off skips the GPU passes of that effect.[[src:warp_sdk/src/post.rs|switch that is off skips that effect's passes on the GPU]] The [[art-direction#Lighting and visuals|art direction]] requires this module and not raw `DisplaySettings` fields.

## The effects

The fields of `Post` are in the order the frame runs them.[[src:warp_sdk/src/post.rs|Every post effect the engine runs, in the order the frame runs them.]]

| Field | Type | `DisplaySettings` fields | Meaning |
|---|---|---|---|
| `tonemap` | `Tonemap` | `pp_enabled` | the HDR tonemap pass |
| `exposure` | `Exposure` | `pp_exposure` | linear gain before the curve; has no switch, 1.0 is no change |
| `bloom` | `Bloom` | `pp_bloom_*` | bright parts glow |
| `grade` | `Grade` | `pp_grade_enabled`, `pp_saturation` and others | colour grade after the curve |
| `fxaa` | `Fxaa` | `fxaa_*` | removes stair-step edges |
| `z_dof` | `ZDof` | `z_dof_*` | depth of field from the scene depth buffer |
| `dof` | `Dof` | `dof_*` | screen-space depth of field |
| `motion_blur` | `MotionBlur` | `motion_blur_*` | motion blur |
| `crt` | `Crt` | `crt_*` | the CRT tube |

Exposure, bloom and grade run inside the tonemap pass, so they do nothing while `tonemap` is off.[[src:warp_sdk/src/post.rs|Exposure, bloom and grade run inside it, so they]] Bloom off records no bloom passes. With the bloom enabled, the pass count is one extract pass plus a downsample and an upsample chain across five mips, which is nine passes.[[src:warp_core/src/gpu/postprocess.rs|1 + 2 * (BLOOM_MIP_COUNT - 1)]] An intensity below `BLOOM_MIN_INTENSITY` also records none. Grade off sends the identity grade.

`CrtTuning` keeps the tuning fields of the tube as one block. A game changes them by their `DisplaySettings` names through `CrtTuning::fields_mut`, for example `p.crt.tuning.fields_mut().crt_scanline_count = 240.0`. A change to a field that is not `crt_*` is dropped, and `crt_enabled` is `enabled`.

## Presets

Each preset starts from the defaults, so a value that it does not name is the tuned default.

| Preset | Tonemap | FXAA | Bloom (intensity, threshold, radius) | Grade (saturation, contrast, temperature, brightness) | Other |
|---|---|---|---|---|---|
| `Post::off` | off | off | off | off | every switch off |
| `Post::clean` | on | on | off | off | |
| `Post::cinematic` | on | on | 0.2, 1.0, 1.5 | 1.1, 1.12, 0.15, -0.02 | |
| `Post::underwater` | on | on | 0.3, 0.9, 2.5 | 0.75, 0.9, -0.6, -0.03 | exposure 0.85 |
| `Post::neon` | on | on | 0.7, 0.8, 1.8 | 1.6, 1.15, 0, 0 | |
| `Post::retro_crt` | on | off | 0.25, 0.0, 1.2 | 1.5, 0.994, 0, 0 | CRT on at default tuning |

`Post::retro_crt` is the one preset that builds on the default value and not on `Post::clean`, so it keeps the bloom and grade switches of the default value and leaves FXAA off.[[src:warp_sdk/src/post.rs|The engine's tuned HDR look through the CRT tube, at its default tuning.]]

## Defaults

The default `Post` value reads `DisplaySettings::DEFAULT`. A game that never calls `post` gets the picture it got before this module, because `tonemap` is off and with it exposure, bloom and grade.[[src:warp_sdk/src/post.rs|gets the picture it got before this module.]] The bloom and grade switches themselves ship on, under the tonemap switch, and a test asserts that.[[src:warp_sdk/src/post.rs|both switches ship on]] A game that turns on only `tonemap` therefore gets bloom and grade at the default values.

| Default | Value |
|---|---|
| exposure gain | 1.0 |
| bloom threshold, intensity, radius | 0.0, 0.25, 1.2 |
| grade saturation, contrast, temperature, brightness | 1.5, 0.994, 0.0, 0.0 |
| FXAA subpix, edge threshold | 0.75, 0.166 |
| motion blur intensity | 0.5 |
| z DOF aperture, max blur | 50.0, 40.0 |
| DOF aperture, focal radius, max blur | 0.3, 0.5, 15.0 |

The default bloom threshold of 0.0 blooms every lit surface. The art direction asks for a threshold of 0.8 to 1.0, which the presets `Post::cinematic`, `Post::underwater` and `Post::neon` hold.

CRT is opt-in. The engine boots with `crt_enabled` false, and the repository guidance says not to enable it unless the art direction calls for it.[[src:CLAUDE.md|CRT is opt-in, not a default]]

## When a change shows

`post::set` and `post::replace` write a store in `warp_core`, and not the `DisplaySettings` global. The global is locked for the whole of a GUI frame, so a write from another thread would wait for the frame to end, and a read from inside `gui` would lock it a second time and hang the process.[[src:warp_core/src/types/post_store.rs|inside `Renderer::gui` locks it a second time and hangs the process.]] The store avoids that lock.

One frame runs in this order.[[src:warp_core/src/types/post_store.rs|THE ORDER IN ONE FRAME]]

1. The game `gui` writes the `&mut DisplaySettings`.
2. `sync_post_store` runs on that same borrow. If a `post` call happened since the last frame, the post fields of the store replace those of the global, so the newest `post` call wins over what `gui` wrote. If none happened, the global is copied into the store, so `post::get` shows what the editor and `gui` wrote.
3. The global goes to the postprocess, FXAA, DOF and CRT parameters.

A `post::set` applies once, at the next frame. After that the value is in the global and the editor Post panel can move it again. The store holds no override that wins every frame, because that would make the panel dead.[[src:warp_core/src/types/post_store.rs|hold an override that wins every frame, because that makes the panel dead.]] `lighting_wrap` and `light_z` are scene lighting, and neither `Post::apply_to` nor the store writes them.

`post::revision` counts `set` and `replace` calls in the process. A different number since the last read means the settings changed.

## Usage

```rust
use warp_sdk::post::{self, Post};

post::replace(Post::underwater());              // in `new`: the game's look
post::set(|p| p.bloom.enabled = false);         // a settings toggle, from any thread
let bloom_on = post::get().bloom.enabled;
```

The store is locked while the closure of `post::set` runs, so the closure must not call `post::get`, `post::set` or `post::replace`, or the thread hangs. `post::replace` is `post::set` with a closure that assigns the whole value.

`Post::from_display` and `Post::apply_to` convert to and from `DisplaySettings`, and a test requires the round trip to be exact. The [[lit2d]] example calls `post::replace(Post::cinematic())` in `new`, so that its emissive lamps bloom and lit surfaces stay crisp.

## History

The module was added on 2026-10-29 in the commit "sdk: add post, one switch per effect that any thread can set".
