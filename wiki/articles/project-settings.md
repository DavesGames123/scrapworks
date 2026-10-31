---
title: Project settings
short: the registry of [settings.*] blocks that keep a project's look in its manifest
category: Engine
order: 28
module: project_settings
see: manifest, types, palette, post, hostlink
---
**Project settings** is the registry of named settings blocks that live in `warp_app.toml` under one `[settings]` table. It is the `project_settings` module of `warp_core`, re-exported by `warp_sdk`. Each subsystem registers a `Section`, a name with a way to install a table into its global and a way to write that global back. The module owns the file format and the diffing, and a subsystem owns neither.[[src:warp_core/src/project_settings.rs|This module owns the file format and the diffing; a subsystem owns neither.]]

## Design

`DisplaySettings` is a process global, and once nothing wrote it down. A person could tune a CRT for an hour, close the editor, and get the flat default back. A project that wanted a look had one place to put it: hand-written Rust in its own `main.rs`.[[src:warp_core/src/project_settings.rs|WHAT WAS WRONG]]

The [[manifest]] carries `deny_unknown_fields`, so a section that is not a declared field fails to parse and takes the whole project with it. A field per section would put every future section in the manifest code. So the manifest declares one field, `settings`, as a free table, and each section is a sub-table of it. The manifest never learns a section name, and a new section is one `register` call.

The namespace separates two questions. `[app]`, `[assets]` and `[build]` say what the project is, and a build reads them. `[settings.*]` says how it looks, and a frame reads them.

## Sections

`SETTINGS_TABLE` is the manifest key, `"settings"`. A `Section` is a plain value with three fields:

| Field | Meaning |
| --- | --- |
| `name` | The sub-table name. `"display"` becomes `[settings.display]`. |
| `load` | Install a table into the global of the subsystem. |
| `save` | Merge the live values into a table that is already created. |

The `load` function gets nothing when the project names no such table. The subsystem must then install its default, because otherwise one project's look would leak into the next.[[src:warp_core/src/project_settings.rs|section that skipped that would leak one project's look into the next.]] These are function pointers and not closures, so a section costs no allocation. Neither takes state, because a section works on the global that a frame already reads.

The engine has two built-in sections:

| Block | Owner | Holds |
| --- | --- | --- |
| `[settings.display]` | The viewport | Post chain, CRT tube, depth of field, anti-aliasing |
| `[settings.theme]` | The [[palette]] | The game palette, on native targets |

`ensure_builtins` seeds these at the first touch, from every entry point of the module. An init function would be one more thing that an application could forget, and the failure would be silent. So registration has no order to get wrong.[[src:warp_core/src/project_settings.rs|REGISTRATION HAS NO ORDER TO GET WRONG]]

## Usage

An application adds a section with `register`, at any time. A second call with the same name replaces the first, so two writers never share one table.

`read` and `merge` are what a section normally calls. This is the theme section from the palette module, trimmed:[[src:warp_core/src/panels/palette/mod.rs|load: |table| set_palette(crate::project_settings::read(table)),]]

```rust
pub fn section() -> crate::project_settings::Section {
    crate::project_settings::Section {
        name: "theme",
        load: |table| set_palette(crate::project_settings::read(table)),
        save: |into| crate::project_settings::merge(into, &palette(), &Palette::DEFAULT),
    }
}
```

## Reading

`load_all` installs each section from a manifest table. `run` calls it through a boot step, before the window and GPU exist, so a built artifact boots with the look that it was tuned with. `reset_all` installs each default, which is the engine state that a closed project should leave.

`read` deserialises one table, or gives the default when there is none. A table that does not deserialise also gives the default, with no message. The alternative is refusing to open a project over a typo, and the source judges that a look is not worth it. The value is visibly wrong on screen, which is the report. The type must treat each missing field as its default, through `#[serde(default)]`, because the table holds only the keys that differ.[[src:warp_core/src/project_settings.rs|A table that does not deserialise gives the default too, and says nothing.]]

`load_all`, `reset_all` and `save_all` must run outside `Renderer::gui`. A `debug_assert` guards this, because a call while a frame holds the display settings otherwise deadlocks with no panic or log.[[src:warp_core/src/project_settings.rs|project_settings::{who} was called while a frame holds the display]]

## Writing

Only what differs is written. `merge` serialises the live value and the default, compares key by key, writes the keys that differ, and removes the keys that have gone back to default. The table is therefore exactly the choices of the project, and a fresh project has no `[settings]` table. Without the removal, a slider dragged away and back would leave a key that says nothing.[[src:warp_core/src/project_settings.rs|Write the keys of `value` that differ from `default`, and remove the rest.]]

`save_all` merges each registered section into a `toml_edit` document. It creates the table on demand and removes it when every section comes out empty, so a project that tuned nothing has no first-save diff. The `[settings]` root is implicit, so a reader sees only `[settings.display]`.

`fingerprint` returns what `save_all` would write, as text. The editor compares it to the last one to find whether a slider moved. It is defined as the save and not beside it, so it cannot say "unchanged" about a value that a save would write.

Unknown keys survive. `merge` touches only keys that it can name, and `save_all` walks only registered sections, so an older engine that opens a project tuned by a newer one preserves the settings that it cannot read.[[src:warp_core/src/project_settings.rs|A KEY THIS BUILD DOES NOT KNOW IS LEFT ALONE]]

## Who reads the file

The editor writes the block on save. Its panels change the live viewport during a drag, because a write per drag step would rewrite the manifest sixty times a second. Both processes read the same file. A shipped game reads it in `run`, and the editor reads it when the project opens and pushes changes to a hosted game over the socket.

## Limitations

Comments inside a `[settings.*]` table may not survive a rewrite of their key. Comments elsewhere in the file survive, because the editor holds the document in `toml_edit` and this module touches one table.

## History

The module landed on 2026-08-17.
