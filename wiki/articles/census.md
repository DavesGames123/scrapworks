---
title: Census
short: the rows a game publishes for the Hierarchy and Inspector panels
category: Editor channels
order: 20
module: census
example: pong, starter
see: editor-panels, hostlink, scene, devconsole
---
**The census** is the channel through which a running application tells the Hierarchy and Inspector panels what exists. The `census` module of `warp_core`, re-exported by `warp_sdk`, carries rows from the application to the panel, and clicks and edits back. A hierarchy panel needs a list of what is alive and a way to say "that one" to its owner, and the engine can supply neither. Each row is a string, an id and a flag word, so the engine never learns what a planet is.[[src:warp_core/src/panels/census/mod.rs|so the engine never learns]]

## Design

The census is a channel, and the truth lives in the application. The [[scene]] module looks similar and is the opposite: it owns its objects. A hosted game keeps publishing a census of its own world.

### The panel asks for what it draws

The source gives the scale that shaped the channel: the selectables cache of Stella Nova has about forty-two thousand rows, and publishing these every frame would be a hundred thousand string allocations a second for a panel with room for forty lines.[[src:warp_core/src/panels/census/mod.rs|THE PANEL ASKS FOR WHAT IT DRAWS]]

The flow is therefore inverted. `census_wanted` says whether anyone is looking, and `is_expanded` says which nodes are open. A publisher sends full rows for open nodes and a count for closed ones, so a closed tree costs one row per category. Nothing enforces this. A publisher that ignores the expanded set is correct and slow.

`want_census` is what the panel calls on each frame that it draws. The claim expires after `WANT_GRACE` publishes, which is 3, not 1, because the panel and the publisher run in an order that neither controls.

## Usage

Publish once per frame, gated on interest.

```rust
if census::census_wanted() {
    let w = &self.world;
    let mut row = census::Entity::new(1, 0, "Drifter");
    row.params = vec![
        census::Param::new("x", census::Value::Float(w.pos.x)),
        census::Param::new("y", census::Value::Float(w.pos.y)),
        census::Param::new("energy", census::Value::Float(w.energy)),
    ];
    census::publish(census::Census {
        kinds: vec![census::Kind::new("Drifter", [226, 159, 62], census::Focus::World)],
        rows: vec![row],
        ..Default::default()
    });
}
```

`census::publish` overwrites the generation of the snapshot and returns the new value, because the publisher must file its key table under that number.

## Rows

`Census` holds `kinds`, `rows`, a `generation` and a `note`. A publisher that caps a category says so in `note`, because a silent cap reads as "that is all there is".

`Kind` is one category, named once: a plural `name`, a `color` for the dot, and a `Focus`. `Focus` decides what the panel draws, a crosshair for a world row or a frame for a screen row. The engine does not act on it.

`Entity` is one row.

| Field | Meaning |
| --- | --- |
| `id` | The publisher's `EntityId` |
| `kind` | Index into the `kinds` list; out of range draws unstyled |
| `parent` | `ROOT` for a top-level row |
| `name` | The label |
| `detail` | The short right-hand column |
| `flags` | `SELECTED`, `HIDDEN`, `FOCUSABLE`, `EXPANDABLE` |
| `children` | How many children exist, whether sent or not |
| `params` | Editable values, filled only for open rows |

`ROOT` is 0, so a publisher that hands out indices starts at 1. A row with a parent that is not in `rows` draws at the top level and is not dropped. Rows may arrive in any order. `HIDDEN` rows draw dimmed, because "it is there and it is off" is what a person opens a hierarchy to learn. `EXPANDABLE` applies even when no child rows were sent.

## Generations

Ids belong to the publisher, and the useful ones are indices into a table that it rebuilds on each publish. An index means something only against the table that produced it, and a click always arrives at least one frame after that table. So each `Request` carries the generation that it was drawn from. The publisher keeps its last few tables, resolves against the one named, and refuses what has aged out.[[src:warp_core/src/panels/census/mod.rs|A REQUEST NAMES THE CENSUS IT CAME FROM]]

Without this, a click lands on whatever now occupies that index, and the camera flies to the wrong thing.

## Going back

`Request` is a click, with an `Action` of Select, Focus, Extend or Toggle. The panel calls `request`, and the publisher calls `drain_requests`. The queue holds `REQUEST_LIMIT` entries, 64, and drops the oldest, which keeps the most recent intent.

`Edit` is a changed value. `set_param` and `drain_edits` are its queue, separate from requests because `Value` can hold a string. Edits coalesce on the row and parameter index, where requests do not. A slider held for a second gives sixty values and only the last is wanted, but a click pressed twice is two clicks.[[src:warp_core/src/panels/census/mod.rs|Edits COALESCE rather than queue]] `EDIT_LIMIT` is 256 distinct parameters.

`set_highlight` and `highlight` carry hover, so that a game can draw its own highlight. `set_reveal` runs the other way: the publisher names what just became selected, and the panel scrolls to it once. It is a one-shot and not a state, because a level that kept asserting would fight the mouse wheel. `inspect`, `inspecting`, `set_inspect` and `take_inspect_reveal` manage which row the Inspector shows.

## Values

`Param` is one named value on a row, with `name`, `value`, `range`, `unit`, `readonly` and `group`. `Value` is deliberately short: Bool, Int, Float, Color, Text and Vec2. Each variant has one obvious control. A value that fits none is sent as Text, and the publisher owns the parse. A publisher checks `Value::same_type` before it applies an edit, because an edit of another type means that the two sides disagree about a parameter.

A range of none draws a drag field with no stops. `readonly` draws a greyed value that the publisher computes. `group` is a free heading string such as "Transform", because the engine does not know the categories of an application. Textures are not a variant. A publisher sends a path as Text, and the panel decides that it is a picture.

Params count as nothing in the `children` field, and they are filled only for open rows, so a closed tree costs the same as before they existed.

## Across processes

`install` takes a snapshot published in another process and keeps its generation. Renumbering on arrival would send back a generation that the publisher never issued, and each click would be refused. `install` refuses a generation of 0 and a generation that goes backwards, so a restarted transport cannot resolve ids against a world that is gone. `reset_generation` is the separate call for a forwarder when a world ends. `clear` drops the snapshot and leaves the counter alone, so that a local publisher never reissues a number.[[src:warp_core/src/panels/census/snapshot.rs|Going BACKWARDS is refused.]]

[[hostlink]] does the forwarding in `pump_census`.

`with_census` reads the snapshot through a closure, because cloning forty thousand strings to draw forty is the cost this design avoids.
