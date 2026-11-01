---
title: Camera
short: 2D game camera with follow, dead zone, shake, zoom-to-fit and shots
category: Look
order: 50
module: camera
example: camera
see: juice, lit2d, cine, render, teach, world
demo: shake
---
**Camera** is the SCRAP 2D game camera, a rig that follows a target with look-ahead and damping, stays inside level bounds, frames groups, shakes from trauma and plays scripted shots. It lives in `warp_sdk::camera` and its main type is `Camera2d`. A game makes one camera, calls `Camera2d::update` once per frame with the frame time and the target position, and sends the result to the renderer. The module header describes it as a camera that works like a camera operator.[[src:warp_sdk/src/camera.rs|a 2D game camera that works like a camera operator.]]

## Units

The camera uses the engine view model. `scale` is the half view height in world units, so the screen shows `2 * scale` world units from bottom to top. The dead zone, the soft zone, the look-ahead limit and the shake offset use view units, where one view unit is the half view height. These values therefore keep the same screen size at every zoom.[[src:warp_sdk/src/camera.rs|keep the same screen size at every zoom.]] Screen positions are pixels with the origin at the top left and y down. World y points up.

The scene shaders and [[lit2d]] use the same transform, so `View2d::world_to_screen` gives the pixel that the renderer draws. A test checks that one world unit up from the centre at scale 1 lands on the top edge of the screen.

## The frame

`Camera2d::update` runs ten steps in a fixed order.[[src:warp_sdk/src/camera.rs|THE FRAME, IN ORDER]]

1. **Target velocity.** The camera estimates velocity from the last target position. A jump of more than one view unit in one frame counts as a teleport and gives no velocity.
2. **Look-ahead.** The aim point moves along the velocity with damping. The lead has two parts: `look_ahead` seconds of velocity, limited to `look_ahead_max` view units, and a lag term of velocity times `smooth_time` that cancels the lag of the spring at constant speed.[[src:warp_sdk/src/camera.rs|target goes. The lag term cancels the spring lag, which is about]]
3. **Dead zone.** The rig stays still on each axis while the aim point is inside the zone. Outside it, the desired point sits at the edge of the zone.
4. **Spring.** `smooth_damp` moves the rig to the desired point.
5. **Soft zone.** A hard limit keeps the target itself inside the zone. The rig moves at once at its edge, so a fast target stays on screen.
6. **Zoom.** The scale eases to its target in log space, so zoom speed feels even.
7. **Bounds.** The rig stays inside `bounds`. A clamp on an axis clears the rig velocity on that axis.
8. **Shot.** An active `Shot` blends from the rig to its point and back.
9. **Shake.** Trauma adds Perlin translation and rotation.
10. **Pixel snap.** The position rounds to the pixel grid when `pixel_snap` is on.

`update` clamps `dt` to the range 0 to 0.25 s and treats a non-finite value as zero. Because shake and pixel snap come after the bounds step, the shake offset is not clamped to the level.

`Camera2d::update_group` frames several points. It sets the zoom target with `Camera2d::fit_scale`, then follows the centre of their bounding box in the rotated frame of the camera. An empty list continues to follow the last target. The example calls it with a margin of 0.15.

## The spring

`smooth_damp` is a public free function, a critically damped spring on one float. The caller keeps `velocity` between calls. `smooth_time` is about the time in seconds to reach the target. It uses a polynomial approximation of the exponential. Because the approximation can step past the target, the function stops at the target and clears the velocity in that case, so the result never moves past a still target.[[src:warp_sdk/src/camera.rs|The approximation of exp() can step past the target. Stop at the target.]] A `dt` of zero or less returns `current`, and a `smooth_time` of 1e-4 or less jumps to the target.

```rust
use warp_sdk::camera::smooth_damp;
let (mut x, mut v) = (0.0_f32, 0.0_f32);
for _ in 0..120 { x = smooth_damp(x, 10.0, &mut v, 0.2, 1.0 / 60.0); }
assert!((x - 10.0).abs() < 0.01);
```

## Configuration

`Follow` and `ShakeSettings` are public fields of `Camera2d`, so a game changes them directly.

| Setting | Default | Meaning |
|---|---|---|
| `smooth_time` | 0.25 s | time for the rig to reach the aim point; small is tight, large is heavy |
| `look_ahead` | 0.3 s | seconds of target velocity to look ahead |
| `look_ahead_max` | 0.35 | the longest look-ahead, view units |
| `look_ahead_smooth` | 0.5 s | damping of the look-ahead, so a turn does not whip the camera |
| `dead_zone` | `[0.12, 0.08]` | half extents, view units |
| `soft_zone` | `[0.6, 0.5]` | half extents, view units; zero or less turns the limit off |
| `max_offset` | 0.06 | largest translation, view units |
| `max_angle` | 0.05 rad | largest rotation |
| `frequency` | 15 | noise cells per second |
| `decay` | 1.2 | trauma lost per second |
| `motion_scale` | 1 | 0 turns shake off, 1 is full shake |
| `zoom_smooth_time` | 0.35 s | time for a zoom change |
| `min_scale`, `max_scale` | 0.1, 1000 | zoom limits |
| `rotation` | 0 | base rotation; a small value gives a dutch angle |
| `pixel_snap` | off | for pixel art, so sprites do not shimmer |

## Zoom

`Camera2d::set_zoom` sets the target, clamped to the zoom limits. `Camera2d::scale` is the zoom now, before a shot changes it, and `Camera2d::zoom_target` is the goal. `Camera2d::fit_scale` returns the scale that shows every point with a margin at the base rotation. Its result does not obey `min_scale` and `max_scale`, though `update_group` passes it through `set_zoom`, which does.

## Shake

{{demo:shake}}

`Camera2d::add_trauma` adds to a trauma value that stays between 0 and 1. The header suggests 0.2 for a small hit, 0.5 for a large hit and 1.0 for an explosion. Trauma falls by `decay` per second, and the shake size is the square of trauma, so small hits stay small and large hits feel large.[[src:warp_sdk/src/camera.rs|so small hits]] The translation scales with the current view scale.

Each axis and the rotation read 1D Perlin gradient noise with their own seed. Smooth noise reads as a hand-held camera and not as white noise.[[src:warp_sdk/src/camera.rs|1D Perlin gradient noise in [-1, 1]. Smooth, so shake reads as a hand]] When trauma reaches zero, the offset and the angle are exactly zero, which a test checks. `motion_scale` is the accessibility control: the game connects it to its reduce-motion setting. `Camera2d::shake_now` returns the shake of the last frame.

## Shots

A `Shot` is a pan to a point of interest, a hold and a return to the follow target. `Shot::to` builds one with `travel` 0.9 s, `hold` 1.2 s, `back` 0.7 s and no letterbox. The setters are `Shot::zoom`, `Shot::travel`, `Shot::hold` and `Shot::letterbox`, which clamps the bar height to at most half the screen. The header calls a bar of 0.1 a good cinematic look.

`Camera2d::play` starts a shot and replaces any shot that plays. Follow continues below the shot, so the return goes to where the target is now.[[src:warp_sdk/src/camera.rs|Follow continues below the shot, so the return goes to where the]] The blend weight uses a smootherstep curve for both pans, and the scale blends in log space. `Camera2d::cut_shot` stops a shot at once. `Camera2d::shot_active` is true while a shot plays, which a game uses to lock player input, as the example does.

`Camera2d::letterbox` gives the current bar height, which eases in and out with the shot. The bars do not draw themselves. `Camera2d::paint_letterbox` paints them on an egui painter, and the doc comment recommends the background layer painter so that the bars go below the game panels.

## Usage

```rust
use warp_sdk::camera::Camera2d;
use warp_sdk::ultraviolet::Vec2;

let mut cam = Camera2d::new([1280, 720]);   // in `new`
cam.snap_to(player_pos);                    // no glide on the first frame

cam.update(dt, player_pos);                 // in `render`, once per frame
cam.apply(ctx);                             // engine view: pos, scale, rotation
let lit_cam = cam.lit2d(time);              // or a `lit2d::Camera` for Lit2d

cam.add_trauma(0.4);                        // a hit: screen shake
cam.play(Shot::to(door).hold(1.5));         // a cut to a point of interest
```

`Camera2d::snap_to` moves the camera with no glide and stops all motion. It belongs on the first frame and after a teleport or a level change. `Camera2d::set_viewport` takes the new size when the window changes.

`Camera2d::new` starts at the world origin at scale 1.

## Output

`Camera2d::view` returns a `View2d`, the final view of the last update, with `pos`, `scale`, `rotation` and `viewport`. Three methods carry it to a renderer.

| Method | Use |
|---|---|
| `Camera2d::apply` | writes position, scale and rotation to a `RenderContext` |
| `Camera2d::apply_to_view` | writes to an engine `View`, and subtracts the render origin |
| `Camera2d::lit2d` | returns a `lit2d::Camera`; `time` is the material clock |

`View2d::screen_to_world` is the inverse of `View2d::world_to_screen` and serves the mouse. A test round-trips points with rotation, zoom and shake. `View2d::contains`, `View2d::half_extents` and `View2d::pixels_per_unit` answer the common questions. The same two transforms exist on `Camera2d` for the view of the last update.

## Bounds

`Bounds::new` takes two corners in any order. If the view is larger than the bounds on one axis, the view centres on the bounds on that axis.[[src:warp_sdk/src/camera.rs|If the view is larger than the bounds on one axis, the view centres]] `Bounds::clamp_center` is public. During a shot the camera clamps the blended position again at the shot scale.

## History

The module was added on 2026-10-29 in the commit "sdk: add camera, follow, shake, zoom-to-fit and cinematic shots".
