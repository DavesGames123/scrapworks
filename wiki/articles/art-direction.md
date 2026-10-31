---
title: Art direction
short: Rules for how a Warp game looks, reads and teaches
category: Guides
order: 20
see: visual, semiotics, post, lit2d, fonts, front-menu
---
**Art direction** is the Warp guide of rules that make a game look like a product and not like a prototype, covering text, menus, fonts, lighting, density and interface behaviour. It is the document `docs/art-direction.md`, which a game author reads before the first line of a game. Where [[building-a-game]] makes a game run, this guide decides how it looks.[[src:docs/art-direction.md|like a product and not like a prototype.]] Each rule names the SDK kit that implements it, where one exists.

## The principle

A Warp game is code that makes an image. It is not generated prose and not generated art. The look comes from math: shaders, signed distance fields, noise, lighting and simulation, combined and recombined.[[src:docs/art-direction.md|noise, lighting and simulation, combined and recombined.]] Two outcomes follow. A game shows its quality in the first frame, before the player reads a word. Each game also looks different from every other Warp game, so one font, one glow and one circle sprite shared by two games is a failure.

## Text

The rule is instructions and not narrative.

- **No lore copy.** No taglines, flavour subtitles, mottos or atmospheric sentences. The player cannot use such text, and it reads as machine-written.[[src:docs/art-direction.md|and it reads as machine-written.]]
- **Instructional text only**, in Simplified Technical English: short sentences, imperative verbs, one instruction per sentence. The guide gives "Hold Space to boost."
- **Labels** are nouns or verbs of one or two words, with no decoration.
- **No engine credit** on screen, in menus or in the HUD.
- **Names of things in the world** are allowed, at one or two words each.

## Teach by play

A title menu has no "How to play" item, because a text page of controls does not teach the game and it makes every title menu look the same.[[src:docs/art-direction.md|Do not put a "How to play" item on the title menu.]] Each verb is taught at the moment the player needs it, with one prompt next to the thing it acts on, and the prompt goes when the player does the action. Controls appear as glyphs such as a keycap or a mouse button. A correct action is confirmed by a sound, a pulse or a burst of particles, which is what [[juice]] provides. The first minutes must not fail without a clear cause, so starting conditions are tested over several seeds. See [[teach]].

## Menus

| Rule | Detail |
|---|---|
| Title items | Continue (when a save exists), New game, Load, Settings, Quit; a mode item only for a second mode |
| Title background | a live simulation view is a good default, not a rule |
| Title glow | from the post bloom pass of a bright emissive shape, never a moving shader on the text or a blur sprite behind it |
| Escape menu | Resume, Settings, Save, Load, Quit to title, Quit |
| Settings | dense: display, graphics, audio, controls and accessibility pages |
| Failure screens | belong to the game's world; a generic "Game over" panel is a failure of design |

The settings minimum is window mode, resolution, vsync, frame cap and UI scale; quality preset, particle density, bloom and motion; master, music and effects volume; rebinding through `bindings`; and text size, reduce motion and a colour-blind palette.[[src:docs/art-direction.md|`bindings`), accessibility (text size, reduce motion, colour-blind palette).]] [[front-settings]] supplies these pages and [[front-menu]] the title. Options that change the run go in gameplay UI and not in Settings.

## Transitions

No menu appears or disappears in one frame. A game changes screens as film cuts change shots, with one grammar picked per game and used everywhere.

| Transition | Use |
|---|---|
| Cut | the action continues and speed matters |
| Dip to black or a colour | time passes, or the player enters a new place |
| Push or slide | the new screen is beside the old one |
| Iris or mask wipe | focus moves to one object |
| Dolly-through or zoom-through | the menu sits in the world and the camera enters it |
| Rack focus | the menu comes forward over the live game |
| Match cut | one shape in the old screen becomes a shape in the new one |

Every motion eases, and menu transitions stay between 150 ms and 450 ms.[[src:docs/art-direction.md|transitions between 150 ms and 450 ms.]] [[cine]] implements them.

## Fonts

A game chooses its own fonts and does not use the engine default for the title or menus. It uses at most two families, one display face and one text face, from fonts that match its world, and keeps the monospace face for numbers and debug only.[[src:docs/art-direction.md|Keep the monospace face for numbers and debug only.]] [[fonts]] pairs them for a mood.

## Corner decks

The [[squircle]] deck is the default app interface. In a game, every key in the deck relates to gameplay: the colony, the map, the inventory, the research. Settings and save go in the escape menu. The deck stays small in the top right corner until the player opens a key, and the panel then grows out of the key. A game is not a scientific tool, so a block of numeric readouts appears only if the player uses each number to make a choice.[[src:docs/art-direction.md|in a corner unless the player uses each number to make a choice.]]

## Lighting and visuals

A game sets its look through [[post]]. It starts from a preset such as `Post::clean` or `Post::cinematic`, changes switches with `post::set`, and does not write raw `DisplaySettings` fields.

Bloom is for light brighter than white. The threshold stays at 0.8 to 1.0, and only emissive sources exceed 1.0. A threshold near 0 blooms every lit surface, and the whole scene goes soft and hazy.[[src:docs/art-direction.md|blooms every lit surface, and the whole scene goes soft and hazy.]] The engine default threshold is 0.0, so a game sets it through a preset.

### Everything is a lit material

Every object is a 2D sprite with a full material: albedo, normal, roughness, metallic and emissive. It is lit by one key light, such as a sun, a lamp or a shaft from the surface, plus local point lights. This is how Stella Nova makes 2D look 3D: surface normals react to one directional light, with real albedos and specular highlights.[[src:docs/art-direction.md|Nova makes 2D look 3D: surface normals react to one directional light, with]] [[lit2d]] is the renderer for this.

- Normals come from the shape: a signed distance field gives a normal from its gradient, and a height field from its slope.
- One scene has one key light with a stable direction, so shadows and highlights agree and the scene reads as one space.
- Unlit flat colour is for UI only.

### Banned looks

These looks mark a game as generated.[[src:docs/art-direction.md|These looks mark a game as generated. Do not ship them:]]

| Look | Rule |
|---|---|
| Soft Gaussian blobs | a radial alpha falloff with no shape is allowed only as one layer of a bloom pass |
| Flat circles and squares as terrain or creatures | terrain is a material with texture, normals and a lit edge; a creature has a body plan |
| Circles with spikes | a spiked circle is not a monster |
| Rectangles strung together as plants or corals | grow them with rules: L-systems, space colonisation, diffusion-limited aggregation, reaction-diffusion |
| One glow for every light | a vent, a polyp, a lamp and a star do not glow the same way |
| A copied sun sprite | no reuse of another game's light sprite for a different thing |

## Density

The GPU path draws hundreds of thousands of instances, and the guide tells authors to use them.[[src:docs/art-direction.md|The GPU path in warp draws hundreds of thousands of instances. Use them.]] Thousands of particles on screen is normal, each with a purpose: flow tracers, debris, plankton, sparks, spores. Primitives must look good alone and better in a crowd. One particle is a small lit shape, and ten thousand show the flow field, so the flow becomes the image.

Animation comes from simulation and not from sine waves. Sway comes from the fluid and not from `sin(t)`. A generative animation such as polyps that retract when a threat comes near reads as alive, and a looped wobble reads as cheap.[[src:docs/art-direction.md|looped wobble reads as cheap.]] The world remains the subject: particles support the scene and do not cover it. See [[fluid]] and [[procgen]].

### Physics contact

Particles collide against the surface and not against cells. A particle that hits a grid cell stops at the cell edge and stacks into overhangs where no rock exists, so a game samples a distance field and resolves contact on the surface that it describes. Things that sit on terrain are part of it: a vent, a plant or a building has its base under the surface line.[[src:docs/art-direction.md|building is placed on the surface, with its base under the surface line.]] See [[world-collide]].

## Characters

The player character must read in one look: its silhouette tells what it is at game zoom, on a dark background and on a bright one. Characters are built from layers: a body signed distance field, a normal-mapped material, lit parts such as lamps and eyes, and secondary motion such as fins, cables and hair from a simple physics chain. Speed, turning and damage change the pose.

## Boot and identity

The loading screen belongs to the game. Shader compilation can take a minute on some machines, so the wait shows the game's own art and type with a progress indicator.[[src:docs/art-direction.md|Shader compilation can take a]] Every executable has an icon made for the game at 16, 32, 48 and 256 pixels, from the same art as the game. See [[boot]] and [[icon]].

## Information on request

The key principle of the interface is animated, expanding menus that show information only when the player requests it, needs it or asks for it.[[src:docs/art-direction.md|information when the player requests it, needs it, or asks for it.]]

- **At rest**, the screen is the game. A small cluster of keys stays out of the way.
- **Requested:** a key press expands its panel out of the key, and the panel retracts when dismissed.
- **Needed:** when game state makes information necessary, such as low energy or a near threat, that one piece appears where it matters with a cue, and goes when the need ends.
- **Asked for:** hover or focus on a thing shows a hovercard.

Every expansion and retraction animates, and information that the player never needs to act on gets no panel.

## Gameplay you can see

A Warp game tells the player what to do by sight. The guide ties each requirement to a kit.

| Requirement | Kit |
|---|---|
| Show the purpose of every object | [[teach]]: `teach::link`, `teach::reveal` |
| Progression is visible and continuous | [[hud-progress]] |
| Every forced change has a visible cause | [[hud-cues]] |
| Show where the player is | [[hud-minimap]], off-screen markers |
| Environments differ in purpose, not only in looks | [[world-biome]], which rejects a region that differs only in colour |
| Colour has one meaning | [[visual]]: `Language` |
| Icons follow the standard | [[semiotics]] |
| Threats need the right answer | [[challenge]]: damage kinds, weaknesses, telegraphs, escalation |
| Music belongs to the player | [[soundtrack]]: the player's own folder; no generated soundtrack |
| Performance is a requirement | [[perf]], [[fluid]] |

Every system serves gameplay. A creature, an effect or a mechanic that exists only for looks is a failure, so each thing has a role that the player can use or must answer.[[src:docs/art-direction.md|exists only for looks is a failure.]]

## The front end

Every game ships a title with real buttons from [[front-menu]]. Escape opens a pause menu. Settings come from [[front-settings]]. Fonts come from [[fonts]], paired for the mood of the game, and the default font never ships. Transitions come from [[cine]] with one film grammar per game. Identity is an icon from [[icon]] and a boot splash from [[boot]].

## Done means playable

A game proves that it can be played, not only that it boots. A test with `smoke::play` sends input from the title into play and checks that the game state moves. Unfinished parts carry `placeholder!`, and the [[smoke]] tests fail until they are replaced.[[src:docs/art-direction.md|the smoke tests fail until they are replaced.]]

## Pre-ship checklist

The guide ends with a checklist applied to a screenshot of each screen, taken with `boot::shot::request`.

1. The first frame looks like a finished product.
2. No text on screen is narrative or flavour copy.
3. Nothing is lit flat, drawn as a plain circle or drawn as a soft blob.
4. The title, menus and HUD use the game's own fonts.
5. Every screen change animates.
6. Every corner-deck key serves gameplay.
7. A new player learns the controls by playing, with glyph prompts.
8. The executable has its icon.
9. A player can start a new game from the title with a click.
10. Every object, creature and region has a purpose the player can see.
11. A minimap exists, and every forced change shows its cause.
12. Progress shows, and keeps growing.
13. `smoke::play` reaches play and sees the game state change.

## History

The document was added on 2026-10-29 in the commit "docs: add the art direction rules a one-shot game reads first".
