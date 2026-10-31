---
title: Save slots
short: Numbered save files with metadata, atomic writes, and a version check
category: Front end
order: 30
module: front::save
example: front
see: front, front-menu, front-settings, metaprog
---
**Save slots** are numbered save files with metadata, in the `warp_sdk::front::save` module. `Slots` manages a fixed number of files for one game, writes each one atomically, and checks versions on read. The payload is text that the game owns. `Fields` is a small key=value map for a game that has no format of its own.

## Usage

```rust
use warp_sdk::front::save::{Fields, Slots};
let slots = Slots::new("reef", 3).version(2);
// Save:
let mut f = Fields::new();
f.set("depth", 41.5).set("polyps", 12);
slots.write(1, "Outer shelf", playtime_secs, &f.to_text())?;
// Continue:
if let Some(meta) = slots.latest() {
    let save = slots.read(meta.slot)?;
    let f = Fields::parse(&save.payload);
    let depth: f32 = f.get("depth").unwrap_or(0.0);
}
```

Slots are numbered from 1. `latest` gives the slot written last, which is what a Continue button reads. Set `Title::has_save` from it, as in [[front-menu]].

## Where the files are

`Slots::new` puts the files under the per-user application data folder, at `games/<game>/saves/slot-<k>.save`. The game name becomes a folder name, so the kit keeps only letters, digits, `-` and `_`, and replaces each other character with `_`. A count of zero becomes one.[[src:warp_sdk/src/front/save.rs|/// becomes a folder name, so the kit keeps only letters, digits, `-`]]

| Platform | Application data root |
|---|---|
| Windows | `%LOCALAPPDATA%\Warp` |
| macOS | `Library/Application Support/Warp`, in the home folder |
| Linux | `$XDG_DATA_HOME/warp` |

`Slots::at` uses any directory, which suits tests.

## The file format

A save is plain text, so a person can read it.[[src:warp_sdk/src/front/save.rs|//! Plain text, so a person can read a save:]]

```text
warp-save=1          the kit format, SAVE_FORMAT
version=2            the game's own format, from Slots::version
saved=1793212345     unix seconds
playtime=812.5       seconds of play
label=Outer shelf    escaped: \\ \n \r
thumbnail=C:/...     optional
---
<payload, the game's text, as it was given>
```

The first `---` line ends the header, so a payload may hold its own `---` lines. warp_sdk has no serde, which is why the payload is text.[[src:warp_sdk/src/front/save.rs|//! warp_sdk has no serde, so the payload is text the game owns. [`Fields`]]

## Atomic writes

A write goes to `slot-<k>.save.tmp`, is flushed to disk, and then a rename replaces the slot file. A crash during the write leaves the old save whole.[[src:warp_sdk/src/front/save.rs|//! file. A crash during the write leaves the old save whole.]] The parent folders are created on the first write.

`write` takes a slot, a label, the play time in seconds and the payload. `write_with` also takes a thumbnail path, which the kit stores as a path and does not copy. Negative play time is clamped to zero. Both return the `SaveMeta` that they wrote.

## Versions

Two numbers are in a file. `warp-save` is the layout of the kit, `SAVE_FORMAT`, which is 1. `version` is the format of the game, set by `Slots::version` and 1 by default.

A file with a higher game version does not read, and gives SaveError::TooNew. A file with a lower version reads, and the game migrates it from `meta.version`.[[src:warp_sdk/src/front/save.rs|/// does not read. A file with a lower version reads, and the game]] A file with a newer kit format also gives TooNew.

## Reading and listing

| Call | Result |
|---|---|
| `read(slot)` | The whole `SaveFile`: metadata and payload |
| `list()` | One `Option<SaveMeta>` per slot, in slot order |
| `latest()` | The slot with the highest saved time, or `None` |
| `first_empty()` | The lowest empty slot, or `None` when all are full |
| `delete(slot)` | Removes the file. An empty slot is not an error |
| `count()`, `dir()` | The slot count, and the folder if the platform has one |

`list` treats an unreadable slot in the same way as an empty one: both are `None`. A damaged or too-new save therefore disappears from `latest`, and `first_empty` reports its slot as free. Ties on the saved time go to the higher slot number. `saved` has a resolution of one second.

`SaveMeta` holds `slot`, `version`, `saved`, `playtime`, `label` and `thumbnail`.

## Errors

| `SaveError` | Cause |
|---|---|
| NoSuchSlot(n) | The slot number is 0 or more than the count |
| Empty(n) | The slot has no save |
| NoDataDir | The platform has no application data folder |
| Corrupt(text) | The file is not a save, or its header is damaged |
| `TooNew { found, supported }` | The file is newer than this build |
| Io(error) | Any other file error |

## Fields

`Fields` is a sorted map of text. `set` stores any `Display` value, and `get` parses it into a `FromStr` type, with `None` when the key is absent or does not parse. `text` gives the raw string. `to_text` writes one `key=value` line per field, in key order, and `parse` reads that text and skips lines with no `=`.

Keys must not hold `=` or a line break, and `set` removes those characters. Values are escaped, so any text survives.[[src:warp_sdk/src/front/save.rs|/// A small key=value map for a save payload. Keys must not hold `=` or a]]

```rust
let mut f = Fields::new();
f.set("hp", 3).set("name", "Ana\nB");
let back = Fields::parse(&f.to_text());
assert_eq!(back.get::<i32>("hp"), Some(3));
assert_eq!(back.text("name"), Some("Ana\nB"));
```
