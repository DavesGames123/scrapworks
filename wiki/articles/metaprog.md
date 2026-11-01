---
title: Metaprogression
short: unlock trees, stages, upgrades, milestones and a codex that outlast a run
category: Game systems
order: 50
module: metaprog
see: quest, economy, challenge, teach, front-save
---
**Metaprogression** is the SCRAP SDK's model of progress that lasts past one moment and past one run: an unlock tree, growth stages, upgrades with levels, milestones and a codex. It lives in the `metaprog` module of `warp_sdk`. A game declares its progression as data once, reports what the player does, and reads the events that come back. `Meta::save` and `Meta::load` keep the state on disk.

## Design

### The two halves

`MetaDef` is the design: nodes, stages, upgrades, milestones and codex kinds. The game builds it in code, and it is not saved. `Progress` is the state of one player: wallet, counters, unlocks, upgrade levels, milestones, stages and codex. `Meta` holds both and is the one call path. Only `Progress` goes into the save bytes, so a game can change its design and still load an old save. [[src:warp_sdk/src/metaprog.rs|path. Only [`Progress`] goes into the save bytes, so a game can change its]]

### Ids are the game's

Every id is a plain string that the game chooses: node ids, effect ids, counter names, currency names, icon ids and codex kinds. The module does not interpret an effect id. The game reads `Meta::effects` and applies each effect id in its own systems. [[src:warp_sdk/src/metaprog.rs|not interpret an effect id. The game reads [`Meta::effects`] and applies]]

## Usage

The sample below is the module's own doc test.

```rust
use warp_sdk::metaprog::{Meta, MetaDef, Node, Stage, Upgrade, Milestone, CodexKind};

let def = MetaDef::new()
    .node(Node::new("sonar").cost("shells", 10).effect("sonar_on"))
    .node(Node::new("sonar_2").cost("shells", 25).requires("sonar").effect("sonar_range+50"))
    .stage(Stage::new("reef_young", "polyps", 20).unlocks("sonar"))
    .upgrade(Upgrade::new("hull").currency("shells").costs(&[5, 15, 40]).effect("hull_hp+10"))
    .milestone(Milestone::new("first_feed").when("snow_fed", 1).reward("shells", 5).icon("feed"))
    .codex(CodexKind::new("fish").study_at(3).master_at(10));

let mut meta = Meta::new(def);
meta.count("snow_fed", 1);          // a counter only
meta.earn("shells", 20);            // the wallet and the "shells" counter
meta.observe("fish", "lantern");    // the codex
assert!(meta.buy("sonar").is_ok());
for ev in meta.drain_events() {
    // Send each event to the HUD or the teach kit.
    let _ = ev;
}
let bytes = meta.save();            // write these bytes to disk
let again = Meta::load(meta.def().clone(), &bytes).unwrap();
assert!(again.is_unlocked("sonar"));
```

## The design parts

### Nodes

A `Node` is one entry in the unlock tree. It has a cost in one or more currencies, a list of prerequisite node ids, a list of effect ids and an optional icon. A node with no cost is free. `Meta::can_buy` checks a purchase with no state change, and `Meta::buy` runs it. Both return a `BuyError` on failure: Unknown, Owned, MissingPrerequisite with the node that is missing, or CannotAfford with the currency, the need and the balance. The cost is summed per currency first, so two entries in one currency add up. On an error the state does not change. [[src:warp_sdk/src/metaprog.rs|Sum the cost per currency, so two entries in one currency add up.]]

### Stages

A `Stage` is a threshold on one counter, with a list of ids to unlock. When the counter reaches the threshold, the stage fires one time, and each id becomes unlocked at no cost. An id can be a tree node id or any other id that the game reads with `Meta::is_unlocked`. A stage can therefore give away a node that was otherwise for sale. `Meta::stage_progress` gives the fraction toward a stage, for a HUD bar. `Meta::next_stage` gives the next one in design order, to show the player the next goal. [[src:warp_sdk/src/metaprog.rs|in `unlocks` becomes unlocked at no cost. An id can be a tree node id or]]

### Upgrades

An `Upgrade` is a persistent item with levels, and each level has its own cost. `costs[0]` buys level 1, and the maximum level is the number of costs. All levels use one currency, `"points"` by default. `Meta::buy_upgrade` buys the next level and returns the new level, or BuyError::MaxLevel at the top. `Meta::next_upgrade_cost` gives the price. An upgrade's effects apply once per level, so `Meta::effect_count` works for stacked bonuses.

### Milestones

A `Milestone` is an achievement: conditions on counters and a one-time reward. It fires when every condition holds. The reward adds currency to the wallet and unlocks ids. `Meta::milestone_progress` gives the lowest fraction of its conditions. A milestone with no conditions fires on the first check, which `Meta::new` runs, so `Milestone::new` needs at least one `when`. [[src:warp_sdk/src/metaprog.rs|A milestone with no conditions fires on the first check.]]

### The codex

A `CodexKind` is one kind of codex entry, for example fish, coral or terrain. `Meta::observe` adds one to the count of an entry, and the count sets a `Knowledge` state. The order is Unseen, Seen, Studied, Mastered, and a state only goes up.

| Count | State |
|---|---|
| 0 | Unseen |
| 1 up to `study_at` | Seen |
| `study_at` (default 3) | Studied |
| `master_at` (default 10) | Mastered |

A kind does not need to be declared. An observation of an undeclared kind uses the defaults of `CodexKind::new`. Entries are not declared either: `Meta::codex_entries` lists only the entries that the player has met, because the codex does not know the others. `Meta::knowledge` gives the state of one entry.

## Reporting and reading

| Call | Effect |
|---|---|
| `Meta::count` | Adds to a counter |
| `Meta::record` | Sets a counter to a value if the value is higher, for records such as the deepest dive |
| `Meta::earn` | Adds to the wallet and to the counter of the same name, which holds the lifetime total |
| `Meta::observe` | Records one codex observation |
| `Meta::begin_run` | Starts a run |

Spending lowers the wallet and leaves the counter, so a stage on a currency name still counts what the player spent. [[src:warp_sdk/src/metaprog.rs|counter with the currency name, which holds the lifetime total.]]

`Meta::effects` returns every active effect id: the effects of unlocked nodes in design order, then each upgrade effect one time per level. The game applies them. `Meta::balance`, `Meta::counter`, `Meta::is_unlocked`, `Meta::upgrade_level`, `Meta::has_milestone` and `Meta::has_stage` read one value each.

## When things fire

Each call that changes a counter or the wallet checks every stage and every milestone again, until nothing more changes. A milestone reward can fill a counter that reaches a stage, and that stage fires in the same call. A stage or a milestone fires one time only, also after load. [[src:warp_sdk/src/metaprog.rs|Each call that changes a counter or the wallet checks every stage and]]

`Meta::drain_events` takes the events since the last call, oldest first. An `Event` is one of Unlocked with an `UnlockSource`, StageReached, MilestoneReached, Upgraded or `Discovered`. A milestone's rewards are in the wallet already when its event arrives.

## Runs

`Meta::begin_run` sets every counter whose name starts with `run.`, for example `run.depth`, to zero, and adds one to Progress::runs. All other state stays: wallet, lifetime counters, unlocks, upgrades and the codex. The prefix is the whole mechanism, so a counter's lifetime is chosen by its name. [[src:warp_sdk/src/metaprog.rs|names that start with `run.`, for example `run.depth`. All other state]]

## Save and load

`Meta::save` writes `Progress` to versioned bytes. All maps are sorted, so two equal states give equal save bytes. `SAVE_VERSION` is 1. The layout is the tag `WMP\0`, a little-endian `u16` version, then the sections wallet, counters, unlocked, upgrades, milestones, stages, codex and runs.

`Meta::load` takes a design and the bytes. Stages and milestones that the old state did not reach, but that it now satisfies, fire after the load, and their events wait in the queue. This is how a changed design catches up with an old save. `LoadError` has BadMagic, UnknownVersion, Truncated and BadString. `Meta::with_progress` continues from a `Progress` value that the game already has. The kit writes bytes and leaves the file to the game; [[front-save]] covers save slots. [[src:warp_sdk/src/metaprog.rs|design. Stages and milestones that the old state did not reach, but]]

## Interaction with other kits

The doc test sends events to the HUD or the [[teach]] kit, and the game does that routing. [[quest]] rewards and [[challenge]] kill counts are natural inputs to `Meta::count` and `Meta::earn`. The wallet here is a set of named `u64` totals. It is separate from the capacity-limited stores of [[economy]].

## Limitations

- `Meta::observe` and `Meta::begin_run` do not run the stage and milestone check. A codex observation changes no counter, so a stage cannot depend on it directly.
- `Node::requires` names are not validated. A prerequisite that no node or stage ever unlocks makes the node unbuyable.
- The kit has no refund, and no call removes an unlock.
- The wallet and counters saturate at the `u64` limit.

## History

The module was added to the SDK on 2026-10-29.
