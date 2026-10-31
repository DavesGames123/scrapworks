---
title: Procedural generation
short: seeded streams, Poisson-disc scatter, placement, and fair starts
category: World and simulation
order: 30
module: procgen
see: world, world-terrain, world-collide, world-biome
demo: streams
---
**Procedural generation** in Warp is the module `warp_sdk::procgen`, a set of seeded tools that make a world that is the same on every run. A game makes its world from one `u64` seed, and each feature takes its own named stream, so a new feature does not move the old ones.[[src:warp_sdk/src/procgen.rs|named stream, so a new feature does not move the old ones]] The module also holds Poisson-disc scatter, weighted tables, clusters, surface placement, fair start search, and seed reports. It has no GPU code and depends on no other kit.

## Design

### Why named streams

One shared generator makes every feature depend on all the features before it. Add one more fish and every rock moves. A named stream is a hash of the root seed and the name, so each feature has its own fixed sequence.[[src:warp_sdk/src/procgen.rs|One shared RNG makes every feature depend on all the features before it.]]

### Why a fair start

A random world can start the player in a place where they lose at once. The game scores start sites with its own rule, and `fair_start` tries seeds in order until the best site of a seed scores at or above the threshold. `score_seeds` in a `#[test]` shows how often seeds fail before a player sees one.[[src:warp_sdk/src/procgen.rs|see how often seeds fail before a player sees one.]]

## Usage

This sample from the SDK reference derives two streams from one seed and scatters two features.

```rust
use warp_sdk::procgen::{self, Area, Rng};

let world = Rng::new(42);
let mut coral = world.stream("coral");
let mut rocks = world.stream("rocks");
let area = Area::new([0.0, 0.0], [100.0, 60.0]);
let reef = procgen::poisson_disc_density(&mut coral, area, 2.0, 8.0, |p| (p[0] / 100.0).min(1.0));
let boulders = procgen::poisson_disc(&mut rocks, area, 10.0);
```

## Rng

{{demo:streams}}

`Rng` is a xoshiro256** generator. The doc comment states that the same seed gives the same numbers on every machine and every run.[[src:warp_sdk/src/procgen.rs|A deterministic random number generator (xoshiro256**).]]

Each generator has a fixed key as well as its running state. `Rng::new` hashes the seed with splitmix64 to get the key, and the state comes from the key. A sub-stream hashes the key and the name, so it depends only on those, never on how many numbers the parent gave before.[[src:warp_sdk/src/procgen.rs|that depends only on the seed and the name, never on]]

```rust
pub fn stream(&self, name: &str) -> Rng {
    Rng::from_key(splitmix64(self.key ^ splitmix64(fnv1a(name))))
}
```

The name goes through FNV-1a first. `Rng::stream_n` makes a named, numbered sub-stream: one per chunk, per level, per wave. A stream has its own key, so streams nest.

| Call | Result |
|---|---|
| `Rng::next_u64` | The next 64 random bits |
| `Rng::next_u32` | The high 32 bits of the next value |
| `Rng::f32` | A float in `[0, 1)` |
| `Rng::range` | A float in `[lo, hi)`. If `hi <= lo`, the result is `lo` |
| `Rng::range_i` | An integer in `[lo, hi)` |
| `Rng::index` | An index in `[0, len)`. If `len` is 0, the result is 0 |
| `Rng::chance` | True with probability `p`, clamped to `[0, 1]` |
| `Rng::pick` | One item of a slice, or `None` if it is empty |
| `Rng::shuffle` | A Fisher-Yates shuffle in place |
| `Rng::normal` | A Gaussian value with this mean and standard deviation |
| `Rng::unit_vec2` | A unit vector in a random direction |
| `Rng::in_disc` | A point in a disc, with even density |

`Rng::range_i` and `Rng::index` scale by multiplication and a 64-bit shift, not by a modulo.

## Area

`Area` is an axis-aligned rectangle, where `min` is inclusive and `max` is exclusive.[[src:warp_sdk/src/procgen.rs|An axis-aligned rectangle: `min` is inclusive, `max` is exclusive.]] `Area::new` takes two corners in any order. `Area::contains` and `Area::random_point` use the same half-open rule.

## Poisson disc

Poisson-disc scatter gives points with a minimum distance between them. There are three forms, and the first two call the third.

| Function | Spacing | Returns |
|---|---|---|
| `poisson_disc` | One fixed `radius` | Points as `[f32; 2]` |
| `poisson_disc_density` | From a density map in `[0, 1]`: `r_min` at 1, toward `r_max` near 0, no points at 0 or less | A list of `Sample` |
| `poisson_disc_variable` | From a closure that returns a radius, or `None` where no point may go | A list of `Sample` |

Two points are never closer than the larger of their two radii.[[src:warp_sdk/src/procgen.rs|than the larger of their two radii.]] A `Sample` holds the position and the radius that kept other points away. Results of the radius closure clamp to `[r_min, r_max]`, and a non-finite value counts as `None`.

The algorithm is Bridson's, in rounds. Each round throws up to 120 darts at the area to start a front, then grows the front with 30 attempts per active point in the ring from one to two radii around it. A point with no room leaves the active list. Rounds stop when a whole round of darts finds no space.[[src:warp_sdk/src/procgen.rs|Rounds stop when a whole round of darts finds no space.]] The darts are what let a fill cross a gap where the closure returns `None`: when the front stops, random throws look for new free space.

A background grid speeds up the distance test. Its cell is `r_min / sqrt(2)`, so a cell holds at most one point, and each test scans the cells within `r_max`. A very large ratio of `r_max` to `r_min` thus costs more per test. An empty area or an `r_min` that is not positive returns an empty list.

```rust
use warp_sdk::procgen::{poisson_disc_density, Area, Rng};
let area = Area::new([0.0, 0.0], [40.0, 40.0]);
// Dense at the bottom, empty above y = 30.
let pts = poisson_disc_density(&mut Rng::new(2), area, 1.0, 4.0, |p| 1.0 - p[1] / 30.0);
assert!(pts.iter().all(|s| s.pos[1] < 30.0));
```

## Weighted table

`WeightedTable` picks one item from a list by weight. An item with a larger weight comes back more often, and weights of 0 or less never come back.[[src:warp_sdk/src/procgen.rs|Weights of 0 or less never come back.]] A non-finite weight counts as 0.

```rust
use warp_sdk::procgen::{Rng, WeightedTable};
let table = WeightedTable::new()
    .with("brain coral", 3.0)
    .with("fan coral", 2.0)
    .with("giant clam", 0.2);
let kind = table.pick(&mut Rng::new(4)).unwrap();
```

The table stores cumulative weights and picks by binary search. `WeightedTable::pick` and `WeightedTable::pick_index` return `None` if the total weight is 0.

## Clusters

`scatter_cluster` places `count` members round a centre, inside a radius, thinning with a `Falloff`. `clusters` does the same for each centre in a list, and `cluster` tells which centre a member belongs to. `t` is the distance as a fraction of the cluster radius.

| Falloff | Weight at `t` |
|---|---|
| Falloff::Flat | 1 |
| Falloff::Linear | `1 - t` |
| Falloff::Smooth, the default | `1 - t * t * (3 - 2 * t)` |
| Falloff::Gaussian | `exp(-4.5 * t * t)` |

Each member draws an evenly distributed `t` and accepts it with the falloff weight, with up to 64 tries. If every try fails, the member takes a point near the centre.[[src:warp_sdk/src/procgen.rs|A weight near 0 everywhere can refuse every try; use a center point.]] `Falloff::weight` is public, so a game can also use it to scale props: big at the centre, small at the edge.

```rust
use warp_sdk::procgen::{clusters, poisson_disc, Area, Falloff, Rng};
let world = Rng::new(8);
let area = Area::new([0.0, 0.0], [100.0, 100.0]);
let centers = poisson_disc(&mut world.stream("reef centers"), area, 30.0);
let coral = clusters(&mut world.stream("reef coral"), &centers, 8.0, 15, Falloff::Smooth);
```

## Surface placement

`place_on_surface` roots props into terrain through a closure `surface(x) -> (y, normal)`, so the module does not need a terrain type.[[src:warp_sdk/src/procgen.rs|root props into terrain through a closure]] For each `x`, the call turns the normal to face `world_up`, measures the slope, and skips a position steeper than `max_slope_deg`. It then sinks the base along the normal, and tilts the prop by `align`. A position with a non-finite height or a zero normal is skipped too.

`Rooting` holds the settings.

| Field | Default | Meaning |
|---|---|---|
| `sink` | 0.1 | The distance the base goes into the ground, along the normal |
| `align` | 0.5 | 0 keeps the prop upright, and 1 tilts it fully to the normal |
| `max_slope_deg` | 50.0 | Slopes steeper than this get no prop |
| `world_up` | [0, 1] | The up direction. Use `[0, -1]` for a screen with y down |

A small positive `sink` hides the seam between prop and terrain.[[src:warp_sdk/src/procgen.rs|A small positive value hides the seam between prop and terrain.]] The result is a `Placement` with the sunk base, the unit normal, the growth direction, a rotation in radians, and the slope.

`surface_normal` gets the normal of a height function by central difference, and it pairs with a plain height closure.

```rust
use warp_sdk::procgen::{place_on_surface, surface_normal, Rooting};
let ground = |x: f32| 5.0 + (x * 0.2).sin() * 2.0;
let props = place_on_surface(
    (0..20).map(|i| i as f32 * 3.0),
    |x| (ground(x), surface_normal(ground, x, 0.05)),
    &Rooting::default(),
);
```

`place_on_ground` is the 3D form. It takes `[x, z]` pairs and a closure `ground(x, z) -> (y, normal)`, and it returns `Placement3`. World up is `+y`, and it ignores `world_up`.

For a cave world from [[world-terrain]], a surface closure can build on `collide::ground_snap` with `sink` set to 0, because that call already sinks the point. See [[world-collide#Props on the ground|props on the ground]].

## Fair start

`best_start` returns the site with the highest score. NaN scores never win, and it returns `None` if there are no sites.[[src:warp_sdk/src/procgen.rs|NaN scores never win.]]

`fair_start` takes a first seed, a `FairStart` rule, and two closures: `sites(seed)` makes the candidate sites of a seed, and `score(seed, site)` is the rule of the game. Build the world inside these closures from `Rng::new(seed)`, so the pick is the same on every run.[[src:warp_sdk/src/procgen.rs|from `Rng::new(seed)`, so the pick is the same on every run.]]

`FairStart` has `min_score`, 0.5 by default, and `max_seeds`, 64 by default. Seeds run from the first seed upward by 1. On success the result is a `StartPick` with the seed, the site, the score, the seeds tried, and each rejected seed with its best score. A seed with no site enters that list at negative infinity. On failure the result is `NoFairStart`, with the best seed seen, if any.

```rust
use warp_sdk::procgen::{fair_start, poisson_disc, Area, FairStart, Rng};
let area = Area::new([0.0, 0.0], [100.0, 100.0]);
let food = |seed: u64| poisson_disc(&mut Rng::new(seed).stream("food"), area, 25.0);
let pick = fair_start(
    1000,
    &FairStart { min_score: 0.0, max_seeds: 16 },
    |seed| poisson_disc(&mut Rng::new(seed).stream("starts"), area, 20.0),
    |seed, site| {
        // Score: closer food is better.
        let near = food(seed).iter()
            .map(|f| ((f[0] - site[0]).powi(2) + (f[1] - site[1]).powi(2)).sqrt())
            .fold(f32::MAX, f32::min);
        1.0 - near / 100.0
    },
).expect("a fair start");
```

`fair_start` builds candidate sites for each seed until one passes, so the cost of the closures multiplies by the seeds tried.

## Seed reports

`score_seeds` scores each seed and returns a `ScoreReport`: every pair, the count, min, max, mean, median, the 10th and 90th percentiles, and the worst and best seeds. NaN scores count as negative infinity, and with no seeds every number is 0.

`ScoreReport::pass_rate` gives the fraction at or above a threshold, `ScoreReport::failing` lists the seeds below it, and `ScoreReport::histogram` gives counts in equal bins. The `Display` form prints a summary line and a text histogram of 10 bins, so `println!("{r}")` in a test is a quick view.

```rust
use warp_sdk::procgen::score_seeds;
let r = score_seeds(0..100, |seed| (seed % 10) as f32 / 10.0);
assert_eq!(r.count, 100);
assert!(r.pass_rate(0.5) > 0.4);
println!("{r}");
```

## Interaction with other kits

`Terrain` and `BiomeSet` take their own seeds and use private hash noise, not `Rng`. A game that wants one world seed derives those two seeds from named streams, for example with `Rng::next_u64` and `Rng::next_u32`.

## Limitations

- Points are `[f32; 2]`, and the module has no chunk streaming of its own. `Rng::stream_n` supplies the seed for each chunk, and points near a chunk edge are the game's concern.
- Poisson-disc functions take `&mut Rng` and leave it at a position that depends on the result. Give each call a stream of its own.
- Generation runs on the CPU, and the module has no parallel form.

## History

Commit `9355001c` added the module on 2026-10-29. Its stated aim was starting conditions that a new game can rely on. The module has no example in `warp_sdk/examples`, and its doc comments carry the samples.
