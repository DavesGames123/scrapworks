---
title: Economy kit
short: resources, stores with capacity, costs, recipes, flows and a ledger
category: Game systems
order: 30
module: economy
see: quest, metaprog, challenge, hud
---
**Economy kit** is the resource model of the SCRAP SDK: resource kinds, stores with capacity, costs, recipes, steady flows, and a ledger of recent changes. It lives in the `economy` module of `warp_sdk`. Its purpose is to give the player a reason to collect a thing and a reason to bring it back. A game registers its kinds, makes one `Economy`, and changes amounts only through it, so each change is recorded for the HUD.

## Design

The module has one call path: register the kinds in a `Catalog`, make one `Economy`, add stores to it, and change amounts only through the `Economy`. Every change then goes into the `Ledger`, so the HUD can show a number pop such as "+3 food" with no extra code. [[src:warp_sdk/src/economy.rs|`Economy`. Every change goes into the [`Ledger`], so the HUD can show a]]

The kit is deterministic. Amounts are whole `u32` units, and a flow keeps its fractional part in an `f64` carry. Stores and amounts sit in BTreeMaps, so iteration order is fixed. The same calls with the same `dt` values give the same result, and the save format is the same on every machine. [[src:warp_sdk/src/economy.rs|Amounts are whole `u32` units. Flows keep their fractional part in an]]

## Usage

The sample below is the module's own doc test, run as part of the test suite.

```rust
use warp_sdk::economy::*;

const FOOD: ResourceId = ResourceId(0);
const ORE: ResourceId = ResourceId(1);

let mut cat = Catalog::new();
cat.add(ResourceKind::new(FOOD, "food", "icon.food", Role::Food));
cat.add(ResourceKind::new(ORE, "ore", "icon.ore", Role::Material).size(2));

let mut eco = Economy::new(cat);
let cargo = eco.add_store(Store::new("cargo", 10));
let base = eco.add_store(Store::new("base", 500));

// The player picks up food. Only what fits goes in.
let got = eco.add(cargo, FOOD, 14);
assert_eq!(got, 10);

// At the base, the player unloads everything.
eco.transfer_all(cargo, base);
assert_eq!(eco.amount(base, FOOD), 10);

// The colony eats one food every two seconds.
eco.add_flow(Flow::sink(base, FOOD, 0.5));
eco.tick(4.0);
assert_eq!(eco.amount(base, FOOD), 8);

// An upgrade costs food.
let cost = Bundle::new().with(FOOD, 5);
assert!(eco.can_afford(base, &cost));
assert!(eco.pay(base, &cost));
```

## Kinds and bundles

A `ResourceId` is a game-chosen `u16`. A `ResourceKind` gives one id a name, an icon id, a `Role`, and the space that one unit takes in a store. `ResourceKind::size` defaults to 1. A size of 0 means no space, for example for a currency. The roles are Food, `Material`, Currency, Fuel, `Upgrade` and Other. The HUD can use a role to pick a color or a group, and `Catalog::with_role` finds all kinds of one role.

A `Catalog` holds the kinds. A second kind with the same id replaces the first. `Catalog::size_of` gives 1 for an unknown id, so an unregistered resource still works and takes one space unit.

A `Bundle` is a list of resource amounts. A cost, the inputs of a recipe and the outputs of a recipe are all bundles. `Bundle::with` adds an amount and returns the bundle.

## Stores

A `Store` is a container with a capacity in space units: the cargo hold of a submarine, the storage of a base, the stomach of a colony. `Store::unlimited` uses a capacity of u32::MAX. `Store::limit` adds a limit in items for one kind. `Store::free`, `Store::used` and `Store::fill` report the space; `fill` goes from 0.0 to 1.0, for a cargo bar. [[src:warp_sdk/src/economy.rs|A container with a capacity: the cargo hold of a submarine, the storage]]

`Economy::add_store` takes the store and returns a `StoreId`. `Economy::set_capacity` changes the capacity, for example after a cargo upgrade. Items over a smaller capacity stay, and new items do not go in until there is room.

## Changing amounts

`Economy::add` puts in up to `n` items and returns the number that went in. The rest stays with the caller, which can leave it in the world. `Economy::take` works the same way in reverse. `Economy::transfer` moves up to `n` items between stores and leaves what does not fit. `Economy::transfer_all` moves every kind, in id order, and returns what moved. `Economy::room_for` reports how much fits. An unknown store holds 0 and accepts nothing; these calls do not panic.

`Economy::can_afford` tests a cost. `Economy::pay` takes it all or nothing and returns whether it paid. `Economy::missing` gives what the store still needs, so the HUD can draw those amounts in red beside the upgrade. [[src:warp_sdk/src/economy.rs|Pays `cost` from `store`, all or nothing. Gives true when it paid.]]

## Recipes

A `Recipe` turns input bundles into output bundles after `seconds`. Two calls run one:

- `Economy::craft_now` crafts with no wait, all or nothing.
- `Economy::start_craft` takes the inputs now and returns a `JobId`. The outputs go in when `Economy::tick` passes the recipe time.

Both fail with a `CraftError` and no change: Missing holds the bundle that is short, NoRoom means the outputs would not fit after the inputs go out, and NoStore means a bad store id. A running `Job` has `Job::progress` for a progress ring. If the outputs do not fit when the time is done, the job sets `blocked`, waits, and tries again on each tick. A finished job is gone, so `Economy::job` returns None for it. [[src:warp_sdk/src/economy.rs|True when the time is done but the outputs do not fit. The job waits]]

## Flows

A `Flow` is a steady source or sink: a vent that makes food, a colony that eats it, a lamp that burns fuel. A positive `per_second` is a source and a negative one is a sink. `Flow::source` and `Flow::sink` set the sign from the absolute value. `Economy::set_rate` changes a rate later, and its sign chooses the direction.

A flow moves only whole items and keeps the fraction in its carry. The flag `stalled` is true when the last tick could not move the full amount, because the store was full (source) or empty (sink). The HUD can show it as a warning. A stalled flow clears its carry, so a full or empty store does not save up a debt. [[src:warp_sdk/src/economy.rs|A full or empty store does not save up a debt.]]

`Economy::rates` gives the declared rate as a `Rate`, the sum of sources and sinks. `Economy::measured_rates` gives the rate that really happened from the ledger, which is the better value when the player also moves items by hand.

## The clock

`Economy::tick` moves the economy clock, runs the flows in id order, then the craft jobs in id order, and returns the jobs that finished. Only `tick` moves the clock. A negative `dt` counts as 0. Nothing in the economy advances unless the game calls it. [[src:warp_sdk/src/economy.rs|Moves the clock by `dt` seconds. Runs the flows in id order, then the]]

## The ledger

The `Ledger` records recent changes as `Change` entries: time, store, resource, signed delta and `Cause`. The causes are Add, Take, Transfer, Pay, Craft and `Flow`. `Ledger::recent` iterates the changes of the last few seconds, oldest first. The age of a change fades its number pop.

Small changes with the same store, id, cause and sign that come close together merge into one entry. So a flow that adds 1 item each frame shows as one growing "+12", not as twelve "+1" pops. [[src:warp_sdk/src/economy.rs|shows as one growing "+12", not as twelve "+1" pops.]]

| `Ledger` field | Default | Meaning |
|---|---|---|
| `keep_seconds` | 10 | Entries older than this are dropped |
| `merge_seconds` | 0.5 | Changes closer than this merge |

`Economy::ledger_mut` gives access to these fields.

## Save and load

`Economy::save` writes the stores, the flows, the craft jobs and the clock. It does not write the `Catalog`, which the game owns and registers again at load, or the `Ledger`, which is a HUD record only. `Economy::load` takes the bytes and the catalog. The format is little-endian and versioned, with the tag WECO and version 1. [[src:warp_sdk/src/economy.rs|It does not write the [`Catalog`] (the game owns that data and]]

`Economy::load` fails with a `LoadError`: NotEconomy for a wrong tag, Version for any version other than the current one, and Corrupt for short bytes, a bad value, or trailing bytes. Used space is computed again from the catalog at load, so a change of item size in a game update takes effect on old saves.

## Interaction with other kits

The kit has no dependency on another game system. A reward from [[quest]] or a stage from [[metaprog]] is a game decision, and the game calls `Economy::add` in response. The [[metaprog]] wallet is a separate store of named currencies. The icon id in a `ResourceKind` is a string that the [[hud]] maps to a picture.

## Limitations

- A store has one capacity. The kit has no slots, stacks or item instances.
- `Economy::add` and `Economy::transfer` return partial results. A caller that ignores the count loses the difference.
- A blocked job holds its inputs, which were taken at the start, until the outputs fit.

## History

The module was added to the SDK on 2026-10-29.
