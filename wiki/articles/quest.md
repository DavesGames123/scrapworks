---
title: Quest kit
short: objectives and goal chains as plain data, for icons, counts and markers
category: Game systems
order: 40
module: quest
see: teach, hud, hud-markers, metaprog, economy
---
**Quest kit** is the objective system of the Warp SDK: goal chains held as plain data, with a tracker that counts progress and gives the HUD what to draw. It lives in the `quest` module of `warp_sdk`. A game defines a book of `Objective` values, starts one, and sends the tracker signals as things happen. The tracker keeps a small number of objectives active and reports starts and completions as events.

## Design

The module rests on one rule: a game tells the player what to do with icons, counts and markers, not with prose. The tracker never shows text. Each objective has an icon id, a `Target`, an optional world position for a marker, reward ids, and the objectives that come next. The HUD maps an icon id to a picture. [[src:warp_sdk/src/quest.rs|A game tells the player what to do with icons, counts and markers, not]]

Every id is a `u32` that the game defines: objective, icon, counter, item, place, kind, flag and reward ids. The kit gives none of them a meaning. A reward id is delivered in an event, and the game decides what it pays. [[src:warp_sdk/src/quest.rs|flag ids and reward ids are all `u32` values that the game defines.]]

## Usage

The sample below is the module's own doc test. `starter_chain` builds the linear "first minutes" chain: ids go up by one from the first id, and each step leads to the next.

```rust
use warp_sdk::quest::{self, Target, Tracker, QuestEvent};
// 1. The "first minutes": three steps, one after the other.
let book = quest::starter_chain(100, [
    (1, Target::reach([0.0, -20.0, 0.0], 4.0)),   // icon 1: go here
    (2, Target::count(7, 5)),                     // icon 2: collect 5 of counter 7
    (3, Target::deliver(7, 9, 5)),                // icon 3: bring 5 of item 7 to place 9
]);
let mut t = Tracker::new(book);
t.start(100);
// 2. Each frame, send what happened.
t.set_position([0.0, -19.0, 0.0]);
t.add(7, 5);
// 3. Read events for juice and rewards, and views for the HUD.
for e in t.drain_events() {
    if let QuestEvent::Completed { rewards, .. } = e { let _ = rewards; }
}
for v in t.views() { let _ = (v.icon, v.progress, v.count, v.marker); }
assert!(t.is_done(101));
```

The order of calls is the same each frame: send signals, drain events, read views. No objective is active until the game calls `Tracker::start`.

## Targets

A `Target` says what completes an objective, and each kind has one tracker call that advances it.

| Target | Constructor | Signal | Goal |
|---|---|---|---|
| Count | `Target::count` | `Tracker::add` | The count |
| Reach | `Target::reach` | `Tracker::set_position` | 1 |
| Deliver | `Target::deliver` | `Tracker::deliver` | The count |
| Survive | `Target::survive` | `Tracker::tick` | The seconds |
| Discover | `Target::discover` | `Tracker::discover` | The count |

The constructors clamp a count to at least 1 and a radius or time to at least 0. A Count target measures the amount added after the objective went active. `Tracker::tick` means "`dt` seconds passed with the player alive", so a game must not call it while the player is dead. `Tracker::set_position` tests distance in three dimensions.

## Objectives and branches

`Objective::new` makes an objective with no marker, no rewards and no next objectives. Builder calls add the rest:

```rust
use warp_sdk::quest::{Objective, Target};
let o = Objective::new(10, 2, Target::count(7, 5))
    .at([4.0, -8.0, 0.0])   // marker position
    .reward(42)             // game reward id
    .then_if(3, 11)         // flag 3 set: objective 11
    .then(12);              // else: objective 12
```

A `Branch` names the next objective and a `When` condition: Always, Flag or NotFlag. The game sets flags with `Tracker::set_flag`, and the conditions are read when the parent completes. `Objective::pick` chooses a `Pick` mode. With Pick::First, the default, only the first branch whose condition holds starts. With Pick::All, every branch whose condition holds starts. Because First stops at the first match, a `then_if` before a `then` acts as an if and an else. [[src:warp_sdk/src/quest.rs|a flag that the game sets with [`Tracker::set_flag`]. With [Pick::First]]]

`Objective::marker_pos` gives the marker: the explicit position, else the place of a Reach target. An objective with neither has no marker.

## The tracker

`Tracker` holds the book and the state: active, queued and completed objectives, plus flags. `Tracker::start` returns false when the id is not in the book, or is already active, queued or completed. A completed objective cannot run again.

### The active cap

At most `MAX_ACTIVE` objectives are active, and the value is 3. A start past the cap goes into a queue. When an active objective completes, the queue head starts. The queue head fills the freed slot before the new branches, so a branch can land in the queue behind older work. [[src:warp_sdk/src/quest.rs|The queue head fills the freed slot before the new branches.]]

Only active objectives receive signals. A queued Count objective does not count, and its progress starts from zero when it activates. `Tracker::progress` gives 0 for it.

### Reading state

`Tracker::views` returns one `ObjectiveView` per active objective, oldest first: the id, the icon id, progress from 0 to 1, a `(done, goal)` count as whole numbers, and the marker. For a Survive target the count is in seconds. For Reach it is `(0, 1)` until the player arrives. `Tracker::markers` gives `(icon, position)` pairs for the active objectives with a marker. `Tracker::active_ids`, `Tracker::queued_ids`, `Tracker::is_active` and `Tracker::is_done` answer the direct questions.

### Events

`Tracker::drain_events` takes the events since the last call, oldest first. QuestEvent::Started fires when an objective becomes active, not when it joins the queue. QuestEvent::Completed fires once per objective and carries the reward ids. The tracker pays nothing itself: these are for the [[juice]], the [[hud]] and the game's reward code. [[src:warp_sdk/src/quest.rs|An objective completed. This occurs once for each objective.]]

## Save and load

`Tracker::save` writes the state to bytes: flags, completed objectives, active objectives with progress, and the queue. The book and pending events are not in the bytes. `Tracker::load` reads the bytes back against a book that the game gives. Ids that are not in the book drop from the active list and the queue, so a game update can remove an objective with no load failure. [[src:warp_sdk/src/quest.rs|are not in `book` drop from the active list and the queue.]]

`Tracker::load` fails with a `LoadError`: BadMagic, BadVersion or Truncated. The format starts with the tag WQST and version 1. A load sends no Started events for the restored objectives.

## Interaction with other kits

A game passes views to the [[hud]] and marker positions to [[hud-markers]], and the kit calls neither. Signals come from game code, which may also feed [[economy]] and [[metaprog]]. The kit has no direct link to either, or to [[teach]].

## Limitations

- Branches are read once, at completion. A flag set later does not start a branch that was skipped.
- A book id that a branch names but the book lacks fails silently, because `Tracker::start` returns false and the completion code ignores the result.
- An objective cannot fail. The kit has no timeout or failure state, so a game that wants one models it as a branch or with its own state.

## History

The module was added to the SDK on 2026-10-29.
