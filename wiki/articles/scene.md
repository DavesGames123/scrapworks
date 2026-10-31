---
title: Scene
short: objects with a transform, a parent and a visual, owned by a store
category: Engine
order: 24
module: scene, scene::object, scene::store
see: census, image, render, renderer
---
**The scene** is the `scene` module of `warp_core`, re-exported by `warp_sdk`, which holds a general object with a transform, a parent and an appearance, and a registry that owns such objects. An object is drawn because it is in the store, and not because some pass knows how to draw its type. The module uses neither egui nor wgpu, and everything in it runs and is tested with neither.[[src:warp_core/src/scene/mod.rs|No egui and no wgpu. Everything here runs, and is tested, with neither.]]

## Design

The engine rule elsewhere is that it learns no game names. The scene does not break that rule. An `Object` has a position, a size and a `Visual`, and a `Visual` is a slot number and a type id. These numbers express the atlas taxonomy of the application, and the module does not know what slot 0 holds.[[src:warp_core/src/scene/mod.rs|atlas taxonomy as NUMBERS]] This is why the store can serve an editor with no project linked.

### Scene and census

`census` looks similar and is the opposite. The [[census]] is a channel: an application publishes rows about what it has, a panel draws them, and a click travels back as a request. Its ids expire with the snapshot. The scene owns the truth. An object exists here and nowhere else, a despawn is a real removal, and an id is good for the life of the store.[[src:warp_core/src/scene/mod.rs|IT OWNS ITS OBJECTS, AND IS THEREFORE NOT THE CENSUS]] The two coexist. A hosted game keeps publishing a census of its world, and the store holds what the editor has placed.

## Types

`Transform` holds a position, a rotation in radians and one uniform scale, relative to the parent. The default is the origin, no rotation, and a scale of 1. It is three fields and not a matrix, because `ImageInstance` accepts only a position, a size and one rotation, so shear and non-uniform scale would be discarded one step later. The source names the cost: a sprite cannot be stretched on one axis through this type.[[src:warp_core/src/scene/object.rs|WHY THE TRANSFORM IS THREE FIELDS AND NOT A MATRIX]]

`Transform::compose` scales the child offset by the parent, rotates it by the parent, and moves it to the parent. Rotating before scaling would make a rotated parent shear its children.

`Visual` describes appearance in the terms of the render path. Each field is an argument to `RenderContext::draw_mega_atlas_image` or a value in its instance, so no translation step exists.

| Field | Meaning |
| --- | --- |
| `slot` | Which mega-atlas |
| `type_id` | Which texture family in that atlas |
| `variant` | Which image in the family, wrapped by the mapping |
| `size` | World size when the scale is 1 |
| `tint` | Straight RGBA; `[255; 4]` draws untinted |
| `flags` | `IMAGE_FLAG_*` bits |
| `z` | Sort depth |

`Visual::new` requires the size, because no default size is honest. It sets no tint, and turns on the mask, normals and lighting flags. `Visual::tinted` and `Visual::at_depth` adjust the result. Size and scale stay separate and multiply: size is a property of the picture, and scale is what a person did to one instance. `z` is what the draw pass reads, so layering is a property of the object and not of spawn order.[[src:warp_core/src/scene/object.rs|Sort depth. The draw pass reads this rather than iteration order]]

`Object` joins an `ObjectId`, a name, a parent, a transform, an optional visual and a flag byte. The name is for display and need not be unique. An object with no visual is a group, a marker or a spawn point, and its children still compose through it. `HIDDEN` and `LOCKED` are the two flags. A locked object is still drawn, but it is not selectable or draggable. `Object::visible` is the one definition of visible: it has a visual and is not hidden.

`Desc` is the builder passed to `Scene::spawn`. It exists because the store mints the id, and an `Object` built by a caller would be a second source of ids.

## The store

`Scene` is a vector in spawn order plus a map from id to index. The vector is what the draw pass and hierarchy walk, and the map keeps lookups off a scan. A map alone would iterate in an order that changes between runs. The cost is that `Scene::despawn` is O(n), which suits a store where spawn and draw are frequent and despawn is a person pressing delete.[[src:warp_core/src/scene/store.rs|WHY A VEC AND A MAP RATHER THAN JUST A MAP]]

### Usage

```rust
use warp_sdk::scene::{Desc, Scene, Visual};
use warp_sdk::ultraviolet::Vec2;

let mut scene = Scene::new();
let group = scene.spawn(Desc::new("Group"));
let child = scene.spawn(
    Desc::new("Sprite")
        .at(Vec2::new(10.0, 0.0))
        .parented_to(group)
        .with_visual(Visual::new(0, 0, 0, 64.0)),
);
let world = scene.world_transform(child);
let removed = scene.despawn(group);
```

### Ids

Ids come from a counter that only rises, starting at 1, and a despawned id resolves to nothing for as long as the store lives. A selection, an undo entry and a saved file can therefore hold a bare id with no generation beside it. `Scene::clear` removes every object and does not reset the counter, so a handle held across a clear stays stale.[[src:warp_core/src/scene/store.rs|The id counter does NOT reset]]

### Hierarchy

`Scene::despawn` removes an object and its subtree, and returns the removed ids, parents before children, so a caller can update a selection or an undo stack. An id that is not present returns an empty list and does not panic.

A `Desc` that names a missing parent lands at the root and does not fail. `Scene::roots`, `Scene::children` and `Scene::subtree` read the tree.

`Scene::set_parent` moves an object under another, or to the root with no parent. The object keeps its local transform, so a re-parent moves it on screen. The call returns `ParentError` for a missing child, a missing parent, or a parent that is the child or below it.[[src:warp_core/src/scene/store.rs|WouldCycle]] Only the store writes the parent field, because a parent set elsewhere could form a cycle.

`Scene::world_transform` walks to the root and composes down, with a depth cap of 256. The API makes cycles unreachable. The cap guards a corrupted or hand-loaded store, which would otherwise stall the frame loop. A broken parent chain resolves against what remains.

## Limitations

The transform has no non-uniform scale. The source says that widening `scale` to a two-component vector would be confined to `Transform` and `Transform::compose`. No SDK example uses this module.

## History

The module was added on 2026-08-04.
