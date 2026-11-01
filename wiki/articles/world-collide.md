---
title: Surface collision
short: rays, sweeps, and a circle body against any signed distance field
category: World and simulation
order: 12
module: world::collide
example: world
see: world, world-terrain, fluid-particles, procgen
---
**Surface collision** is the SCRAP SDK module that moves circles and casts rays against any signed distance field. It lives in `warp_sdk::world::collide`, and its main field is `Terrain`. A game uses it to move a body with `CircleBody::step`, to test sight, and to root props on the ground.

## Design

Every query reads one function, the signed distance `sdf(p)`, negative inside solid. The trait `Sdf` expresses that function. `Terrain` implements it with its exact distance and normal, and any closure `Fn(Vec2) -> f32` also implements it, so a game can collide with its own shapes the same way.[[src:warp_sdk/src/world/collide.rs|so a game can collide with its own shapes the same way]]

An `Sdf` value can under-estimate the distance but must never over-estimate it.[[src:warp_sdk/src/world/collide.rs|It can under-estimate, never over-estimate.]] The default `Sdf::normal` is a central difference of `sdf`.

```rust
let wall = |p: Vec2| p.x - 10.0;             // solid for x < 10
let hit = collide::raycast(&wall, Vec2::new(20.0, 0.0), Vec2::new(-1.0, 0.0), 50.0);
```

## Usage

`CircleBody::step` is the one obvious path for a moving thing. Make the body once, and step it each frame with an acceleration and a time step.

```rust
use warp_sdk::world::collide::CircleBody;
let mut body = CircleBody::new(Vec2::new(20.0, 50.0), 0.4);
// each frame:
body.step(&terrain, Vec2::new(0.0, -9.8), dt);
ctx.draw_circle(body.pos, body.radius, [240, 240, 250, 255]);
```

The body has public fields, so game code sets jump speed and surface response directly.

```rust
let mut b = CircleBody::new(spawn, 0.4);
b.surface.friction = 0.4;
b.step(&terrain, gravity + steer, dt);
if b.grounded && jump { b.vel.y = 6.0; }
```

## How it works

### Sphere tracing

`raycast` steps along the ray by the distance at each point, and stops when the distance is below `HIT_EPS`, which is 1e-4. A start inside solid is a hit at distance 0, and `dir` need not be unit length. The loop runs up to 1024 steps. A grazing ray that runs out of steps counts as blocked, which is the safe answer.[[src:warp_sdk/src/world/collide.rs|A grazing ray ran out of steps. Call it blocked: that is the safe answer.]]

`line_of_sight` is true when a raycast between two points finds nothing.

### The sweep

`sweep` moves a circle from one point toward another, and stops at the first contact. Each move is at most the distance to the surface, less the radius. The disc of radius `sdf(p)` around `p` holds no solid, so each move stays in open space, and the circle cannot tunnel through a thin wall at any speed.[[src:warp_sdk/src/world/collide.rs|WHY THE SWEEP CANNOT TUNNEL]] A lower bound for `sdf` is enough, and that is what `Terrain` gives far from the surface. A test fires a body at 600 units per second at a wall half a cell thick, and the body does not cross.[[src:warp_sdk/examples/world.rs|A body at 600 units per second does not cross a wall half a cell thick.]]

The sweep runs against a radius a little smaller than the real one. This contact slop is 5% of the radius, with a floor of 1e-3, and it lets a circle that rests on a surface still slide along it. `circle_resolve` removes the overlap afterwards.[[src:warp_sdk/src/world/collide.rs|The overlap that a sweep permits]] The sweep runs up to 512 steps. If it runs out, it stops at the last safe point with no hit.

### One body step

`CircleBody::step` does these things in order.[[src:warp_sdk/src/world/collide.rs|Integrate `accel` over `dt`, sweep, slide, resolve.]]

1. It adds `accel * dt` to the velocity.
2. It sweeps the motion, up to 3 times. After each hit it applies the surface response to the velocity, and it removes the part of the remaining motion that goes into the surface.
3. It calls `circle_resolve_with` to push the circle out of any overlap, up to 8 iterations.
4. If the centre is still inside solid, or the position is not finite, the body returns to its last position with zero velocity.

`grounded` is true when the step touched a surface whose normal has a y above 0.5.

### Surface response

`Surface` has two fields. Friction is Coulomb: each contact removes up to `friction` times the normal speed from the tangent speed. `bounce` is the part of the normal speed that returns, where 0 is a dead stop and 1 is a full bounce.[[src:warp_sdk/src/world/collide.rs|Friction is Coulomb]]

The default `Surface` has friction 0 and bounce 0, and this is what `circle_resolve` uses. `CircleBody::new` makes a body with friction 0.3 and no bounce.

## Props on the ground

`ground_snap` gives a y a little under the surface line at `x`, so a prop drawn with its base there shows no gap of water under it.[[src:warp_sdk/src/world/collide.rs|prop drawn with its base there shows no gap of water under it]] It casts a ray down from the top of the world, and sinks the hit by `SNAP_SINK_CELLS` cells, which is 0.25. It returns `None` in a top-down world, or when `x` is outside the world.

`ground_snap_span` handles a wide prop. It samples the span at half-cell steps and takes the lowest value, so no corner floats.

```rust
if let Some(y) = collide::ground_snap(&terrain, 40.0) { vent.pos = Vec2::new(40.0, y); }
```

[[procgen]] has a more general placement call, `place_on_surface`, which also handles slope limits and tilt.

## Interaction with other kits

`Terrain` is the normal field, and [[world-terrain]] explains its distance. Particles do not use this module. [[fluid-particles|GPU particles]] run their own contact code in WGSL against the SDF texture of the same terrain.

## Limitations

- The guarantee of `CircleBody::step` is about the centre. The final check tests only that the centre is out of solid, and the contact slop permits a small overlap of the rim. The `world` example test accepts a distance of at least 90% of the radius over 10,000 random steps.[[src:warp_sdk/examples/world.rs|assert!(d >= g.body.radius * 0.9]]
- `line_of_sight` from a point to itself is true, even inside solid, because a zero-length `raycast` returns `None`.
- `ground_snap` finds the highest surface in a column. A cave floor under an overhang needs a `raycast` from inside the cave.

## History

Commit `4e564d42` added the module on 2026-10-29, together with `world::terrain`.
