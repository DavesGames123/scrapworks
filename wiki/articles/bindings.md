---
title: Bindings
short: the table between a key and a verb, read by the input pass and the Control Map
category: Editor channels
order: 40
module: bindings, bindings::chord, bindings::store
example: pong, starter
see: editor-panels, gamepad, front-settings, hostlink, types
---
**Bindings** is the table between a physical input and a game verb. The `bindings` module of `warp_core`, re-exported by `warp_sdk`, lets an application declare its actions once, after which what a key does, what it did by default, what the Control Map panel paints and what a rebind writes are all questions about this one table.[[src:warp_core/src/panels/bindings/mod.rs|An application declares its actions once.]]

## Design

Before this table, a control scheme was two hardcodings kept in step by hand: a const table of keycaps for a settings screen, and a pass of key checks for behaviour. Nothing sat between the key and the verb, so a remap had nothing to write to. Now physical layout stays as data, and which action sits on which key is a lookup. The panel draws the table and the input pass reads it, so the two cannot disagree.

## Usage

Declare a `'static` catalog, register it in `new`, and read verbs by id.

```rust
static ACTIONS: &[bindings::Action] = &[
    bindings::Action::new("p1_up", "Left Up", "Play", &[bindings::Chord::key(RawKey::W)]),
    bindings::Action::new("p1_down", "Left Down", "Play", &[bindings::Chord::key(RawKey::S)]),
];

bindings::register(ACTIONS);

if bindings::held("p1_up", input) {
    // ...
}
```

`bindings::held` asks whether a verb is down, `bindings::pressed` whether it went down this frame, and `bindings::released` whether it came up. `ActionId` is the trait that these functions take as an id.

`bindings::register` replaces the catalog and loads stored overrides. Overrides for actions not in the catalog are kept and written back, so a build with a smaller catalog does not erase bindings that it cannot see.[[src:warp_core/src/panels/bindings/mod.rs|erase the bindings of the actions it cannot see.]]

## Actions

`Action` is copyable, because each field is `'static`.

| Field | Meaning |
| --- | --- |
| `id` | Stable name that the store writes; renaming it orphans an override |
| `name` | What the panel calls it |
| `group` | The section, and the colour class of its keycap |
| `context` | When the action can fire; empty means always |
| `hint` | One line under the name |
| `defaults` | The chords at the start |

Two actions in different contexts may share a chord without a conflict. A real scheme has W as pan and W as thrust. The engine takes the word of the application: `bindings::held` and `bindings::pressed` do not consult the context, because the application gates those calls already.

## Chords

`Chord` is one physical input plus the modifiers held with it, and it is a plain value. `Input` carries mouse buttons and wheel directions beside keys, so the mouse diagram in the panel holds real bind targets. `MouseZone` lists Left, Right, Middle, Back, Forward, WheelUp and WheelDown.

A chord comes from `Chord::key`, `Chord::keyed`, `Chord::mouse` or `Chord::moused`. `parse_chord` reads the text form. One table of keys carries the token and the label for each key, so names stay in one list.

### Matching

Modifiers match by subset: a chord is satisfied when each modifier that it names is down, whether or not others are. Shift+W therefore still pans when W is bound plain.

When two actions are satisfied on one input, the action that names more modifiers wins and the others are suppressed. With `1` and `Ctrl+1` both bound and Ctrl down, only `Ctrl+1` fires. That one rule replaces a hand-written suppression flag.[[src:warp_core/src/panels/bindings/mod.rs|THE LONGEST CHORD TAKES THE PRESS]]

## Reading the table

| Function | Purpose |
| --- | --- |
| `catalog` | Each action, in declaration order |
| `groups` | The groups in the catalog, in first-seen order |
| `action` | One action by id |
| `actions_on` | Everything bound to one physical input |
| `bound_keys` | Each key that any action names |
| `revision` | Moves when the table changes |

`bindings::held`, `bindings::pressed` and `bindings::released` all apply the specificity rule. They take the `WinitInputHelper` that the application receives.

## Rebinding

`set` rebinds an action and writes the store. An empty list is a deliberate unbind, not a reset. `reset` and `reset_all` restore defaults. `chords` gives what is bound now, `defaults` what was bound at the start, and `is_default` whether they agree.

Only overrides are stored. `chords` falls through to the action's defaults when nothing overrides them, so a later build can move a default and reach everyone who never touched that action.

### Conflicts

Two actions on an identical chord are a conflict. `conflicts` names them so that the panel can paint both red, and `is_conflicted` tests one. The rebind is still accepted, because refusing it would make it impossible to swap two keys without a parking key.[[src:warp_core/src/panels/bindings/mod.rs|CONFLICTS ARE REPORTED, NOT REFUSED]] Two actions on one key with different modifiers are not a conflict.

## The store

`bindings::store` reads and writes a flat file through the per-person config directory, one action per line:

```text
# comment
camera.pan_up   = W, Up
ui.station      = Ctrl+E
combat.hold     =
```

The format is not TOML, because the content is a flat map and hand-editing is common. An empty right side records a deliberate unbind. A line that does not parse is dropped, so a file from a later build costs that one binding and never the run.[[src:warp_core/src/panels/bindings/store.rs|A LINE THAT DOES NOT PARSE IS DROPPED]]

## Across processes

The table is process-local, and the game is not always this process. The process that declared the table owns it: it keeps the store, applies each rebind, and publishes a `Snapshot` when `revision` moves. The process that draws it is a viewer. A viewer calls `install`, never writes the file, and queues a rebind as an `Edit` for the owner to perform and echo back. Two processes that wrote one file would each write the half that they could see.[[src:warp_core/src/panels/bindings/mod.rs|THE TABLE IS PROCESS-LOCAL, AND THE GAME IS NOT ALWAYS THIS PROCESS]]

| Function | Purpose |
| --- | --- |
| `install` | Draw another process's table; turns on viewing |
| `detach_viewer` | The game is gone; restores what was shelved |
| `is_viewing` | Whether this process owns what it draws |
| `drain_edits` | Rebinds made here, for the owner |
| `apply_edit` | Perform one, on the owning side |

[[hostlink]] carries these in `pump_controls`.

## Interaction with other kits

`bound_keys` returns every key that any action names, for `set_raw_key_watch`, so the focus-immune path in [[types]] follows a rebind. `live_mods` reads the held modifiers. Each `bindings::held` and `bindings::pressed` call takes the table lock. At a few dozen calls a frame this costs microseconds, and a rebind lands on the very next query.
