---
title: Biomes
short: places that play differently, with blended rules and discovery
category: World and simulation
order: 13
module: world::biome
see: world, world-terrain, world-reveal, hud-cues, palette-kit, post
---
**Biomes** are places in a Warp game that play differently, not only look different. The module `warp_sdk::world::biome` defines each place as a `Biome`, places the set of them in bands with `BiomeSet`, and gives a blended rule set `Env` at any point. A biome is a reason to go somewhere.[[src:warp_sdk/src/world/biome.rs|A biome is a reason to go somewhere.]]

## Design

Each `Biome` states its gameplay first: what the player gets there, what it costs to stay, how movement changes, how much light there is, what spawns, and an ambience tag. The looks come last: a palette shift, a particle mood and a fog colour. The looks tell the player which rules apply, so the rules must exist first.[[src:warp_sdk/src/world/biome.rs|The looks tell]]

The module enforces this order with two rules.

1. `BiomeBuilder::build` refuses a biome with no reward or no cost. The default biome from `Biome::base` has neither, so every other biome differs from the default in at least one reward and one cost.[[src:warp_sdk/src/world/biome.rs|refuses a biome with no reward or no cost]]
2. `BiomeSet::check` reports each pair of biomes whose gameplay is the same and whose looks only are different. It also reports a biome that adds no reward or no cost beyond the base biome.

The commit that added the module gives the aim as a contrast between the dungeons of Skyrim and its outer regions: an environment should interact with the player in a different way, not only wear a different colour.

## Usage

This sample is the module doc test. It builds a base biome and one placed biome, checks the set, and reads it at a point.

```rust
use warp_sdk::world::biome::{Biome, BiomeSet, Hazard, Reward};
use warp_sdk::ultraviolet::Vec2;

let shelf = Biome::base("shelf").light(1.0).build_base();
let vents = Biome::new("vents")
    .reward(Reward::resource("sulphur", 2.0))
    .cost(Hazard::Heat, 0.4)
    .light(0.3)
    .fog([0.35, 0.12, 0.05], 0.4)
    .band(40.0, 90.0)
    .build()
    .unwrap();
let set = BiomeSet::new(shelf, 7).with(vents);
assert!(set.check().is_ok());

let blend = set.sample(Vec2::new(10.0, 60.0));
assert_eq!(set.biome(blend.primary).name, "vents");
let env = set.env(Vec2::new(10.0, 60.0));
assert!(env.hazard(Hazard::Heat) > 0.0);
```

The usual order of work is as follows.

1. Build the base biome with `Biome::base` and `BiomeBuilder::build_base`.
2. Build the other biomes with `Biome::new` and `BiomeBuilder::build`. Call the gameplay methods first, then the looks, then `band`.
3. Make the set with `BiomeSet::new` and `BiomeSet::with`. Index 0 is the base biome, and each `with` call takes the next index.
4. Call `BiomeSet::check` in a test.
5. Each frame, call `BiomeSet::env` at the player position, and feed the result to the physics, damage, light and post settings.[[src:warp_sdk/src/world/biome.rs|Feed it to the player's]]
6. Each frame, call `BiomeTracker::update`, and show the first entry to a biome.

## Gameplay fields

### Rewards and costs

`Reward` has two forms: `Reward::resource` with a yield per minute, and `Reward::discovery` for a thing the player can find once. A reward with a rate of 0 or less does not satisfy the build rule.

`Cost` pairs a `Hazard` with a rate in units per second. The game decides what one unit is.[[src:warp_sdk/src/world/biome.rs|Units per second. The game decides what one unit is.]] `Biome::hazard` adds up the rates of one hazard.

| Hazard | Name string | Meaning in the source |
|---|---|---|
| Hazard::Heat | `heat` | Burns hull or health |
| Hazard::Pressure | `pressure` | Crushes the hull below a rated depth |
| Hazard::Darkness | `darkness` | Drains the light source or the sanity meter |
| Hazard::Current | `current` | Pushes the player. Pair it with the `current` field of `Movement` |
| Hazard::Toxicity | `toxicity` | Poisons the player over time |

`Hazard::ALL` lists all five in a fixed order, and `Hazard::name` gives the string for save files and debug text.

### Movement

`Movement` has `drag` and `current`. A drag of 1 is open water, and a larger value is thicker. `Movement::apply` pulls a velocity toward the current with an exponential. The step is exact for any `dt`, so it does not depend on the frame rate.[[src:warp_sdk/src/world/biome.rs|The step is exact for any]]

```rust
let m = Movement { drag: 2.0, current: Vec2::new(1.5, 0.0) };
let v = m.apply(Vec2::new(4.0, 0.0), 1.0 / 60.0);
```

### Other gameplay fields

`light` is ambient light from 0 for black to 1 for full daylight, and the builder clamps it. `spawns` is a table of `Spawn` entries, each with an id, a relative weight and a maximum alive count. `ambience` is a sound tag that the game maps to a bed. The module runs no spawner and plays no sound. `Env` does not carry spawn tables or rewards, so a game reads those from `BiomeSet::biome`.

## Looks

`Looks` holds a `PaletteShift`, a `ParticleMood`, a fog colour in linear RGB, and a fog density.[[src:warp_sdk/src/world/biome.rs|The looks of a biome. They come after the gameplay and must tell it.]] The defaults are no palette shift, ParticleMood::Drift, fog `[0.02, 0.08, 0.14]` and density 0.2. A `PaletteShift` has a hue rotation in turns, and saturation and value multipliers.

| Mood | Meaning |
|---|---|
| ParticleMood::Still | No particles |
| ParticleMood::Drift | Slow random drift, the default |
| ParticleMood::Rising | Heat, vents, bubbles |
| ParticleMood::Falling | Snow, ash |
| ParticleMood::Streaming | Along the current |
| ParticleMood::Sparse | Darkness, depth |
| ParticleMood::Murky | Toxicity, silt |

The mood is a tag. The module does not draw particles, so the game maps it to a [[fluid-particles|particle kind]] or any other effect.

## Placement

The band coordinate is `p.y`: depth for a side view, or any height the game gives.[[src:warp_sdk/src/world/biome.rs|The band coordinate is]] Each placed biome has a band `[lo, hi]`, set by `BiomeBuilder::band`. A biome with no band gets weight 0 unless it is the base biome. [[world-terrain|Terrain]] in side view has y up, and the module does not convert, so a game that wants depth bands passes a depth in `p.y`.

Seeded value noise moves the band edges, so a border is a wavy line, not a ruler line. Three octaves of noise at `p / scale` give a value that shifts y by up to the noise amplitude in either direction. Inside `feather` of an edge, the membership falls with a smoothstep. The base biome fills every place that no band covers, with weight `1 - max(other weights)`.[[src:warp_sdk/src/world/biome.rs|every place no band covers, with weight]]

`BiomeSet::new` sets the defaults: a feather of 4, a border noise amplitude of 6, and a scale of 32 world units. `BiomeSet::feather` and `BiomeSet::border_noise` change them, and an amplitude of 0 gives straight borders.

`BiomeSet::weights` returns the membership of every biome. `BiomeSet::sample` returns a `Blend`: the two strongest biomes and `t`, the share of the second. `t` is continuous everywhere. Where two biomes swap rank, both sides give `t = 0.5`.[[src:warp_sdk/src/world/biome.rs|both sides give]] Blend::mix mixes any pair of values by `t`.

## The blended environment

`BiomeSet::env` returns an `Env` that mixes these values between the two biomes of the blend: drag, current, light, each hazard rate, fog, fog density and palette shift. A third biome at the same point has no effect. The particle mood does not blend, and `particles` is the mood of the primary biome.[[src:warp_sdk/src/world/biome.rs|The particle mood of the primary biome.]]

`hazards` is indexed like `Hazard::ALL`, and `Env::hazard` reads one entry by name.

## The set check

`BiomeSet::check` returns `Ok` or a list of `BiomeIssue` values.

| Issue | Condition |
|---|---|
| BiomeIssue::LooksOnly | Two biomes have the same gameplay key. The base biome takes part in this comparison |
| BiomeIssue::NoNewReward | No reward has a kind and id that the base biome lacks. A larger rate of the same resource does not count |
| BiomeIssue::NoNewCost | No cost has a rate above the base rate of that hazard |

The gameplay key covers rewards, costs, spawns, movement and light, sorted, with floats rounded to three decimals.[[src:warp_sdk/src/world/biome.rs|Floats are rounded to three decimals.]] The ambience tag is a sound choice, so the check does not count it as gameplay.[[src:warp_sdk/src/world/biome.rs|the check does not count it as gameplay]]

## Errors

`BiomeBuilder::build` returns a `BiomeError`. BiomeError::NoReward and BiomeError::NoCost name a biome that fails the rule, and BiomeError::BadBand names a band with `lo > hi` or a value that is not finite. The band test comes first.

A builder from `Biome::base` skips the reward and cost test in `build`. `BiomeBuilder::build_base` never fails, and it drops a bad band. It runs no reward test on any builder, so `BiomeSet::check` is the only guard on a `Biome::new` builder that finishes with `build_base`.

## Discovery

`BiomeTracker` remembers which biomes the player has entered. `BiomeTracker::update` returns `Discovered` the first time the primary biome at the point is new, and `None` after that. Show it with a sting, an icon and a map mark.[[src:warp_sdk/src/world/biome.rs|Show it with a sting, an icon and a map mark.]] `BiomeTracker::current` gives the biome of the last update, and `BiomeTracker::has_seen` tests one index.

```rust
let mut t = BiomeTracker::new(&set);
if let Some(d) = t.update(&set, warp_sdk::ultraviolet::Vec2::zero()) { let _ = d.biome; }
```

## Limitations

- Placement is one dimensional. Only y selects a band, and x affects the result only through the border noise.
- `BiomeSet::biome` clamps an index past the end to the last biome.
- `BiomeTracker` holds no save code. The game stores what it needs from `BiomeTracker::has_seen`.

## History

Commit `ccc8f737` added the module on 2026-10-29, together with `world::reveal`.
