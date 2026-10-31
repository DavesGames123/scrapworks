---
title: Warp
short: 2D sprite engine on wgpu, its editor, and the SDK a game is written on
category: Introduction
order: 10
example: starter
see: getting-started, building-a-game, renderer, shell, smoke, net
---
**Warp** is a 2D sprite engine built on wgpu, together with an editor built on that engine and an SDK crate that games are written against. A game on Warp is a Rust crate that depends on `warp_sdk` and implements one trait, `Renderer`. The engine owns the window, the GPU device and the frame loop, and it calls the game once per frame. The editor opens such a crate as a project and drives its panels from what the game publishes.

## Crate layout

The repository is a Cargo workspace. Warp is not itself a game, and a game is a separate crate outside the workspace.[[src:warp_core/src/lib.rs|WarpCore - 2D sprite rendering engine built on wgpu.]]

| Crate | Role |
|---|---|
| `warp_core` | The engine: rendering, the frame loop, input, assets, and the subsystems behind the editor panels. |
| `warp_editor` | The project editor that hosts a game. |
| `warp_sdk` | The surface a game names: re-exports from `warp_core`, plus the kits. |
| `warp_net` | Secure peer-to-peer sessions. A game reaches it through `warp_sdk::net`, behind a feature. |

`warp_net` lets two or more copies of an application share one session with no server that the developer runs. One peer hosts and holds the canonical state, and the others join as guests.[[src:warp_net/src/lib.rs|The code came from the LINK multiplayer of Stella Nova]] Its code came from the multiplayer of Stella Nova, with each game type taken out.

## The SDK as a boundary

`warp_sdk` is one re-export list: everything an application needs, and nothing the editor keeps for itself. Its header gives the reason: every wrong path an author can take is a path that the surface offers.[[src:warp_sdk/src/lib.rs|Every wrong path an author can take is a path that the surface offers.]] The terminal, the language server, the git graph and the agent panel are public modules of `warp_core`, and each is a plausible door into engine internals. The SDK leaves them out on purpose.

Foreign crates follow the same rule. egui, wgpu, winit, `winit_input_helper` and ultraviolet are reached through `warp_sdk` and are not named again in a game's manifest, because two copies of egui in one build are two types called `Color32`.[[src:warp_sdk/src/lib.rs|Reached THROUGH this crate and not named again in a game's manifest.]] For the same reason, `Vec2` from a second ultraviolet version would make every draw call a type error.

Some choices at this boundary are single decisions with two halves:

- `window` is exported and `dock` is not. An author who wants a panel wants to name it and draw it, and `window` is those two things. The dock adds a tree of rects and a drag protocol across processes.
- The chrome palette of the editor is not exported, and the interface scale beside it is, as `scale`. The palette belongs to a different program, and the scale fixes a problem that every game has.
- `net` is behind the `net` feature, off by default, because its P2P transport pulls iroh, tokio and a QUIC stack.[[src:warp_sdk/Cargo.toml|Not in `default`: a game opts in.]] It is also a curated list and not a blanket re-export, so a game cannot send a frame that no handshake protects.

## What a game is

Three rules hold for an application on Warp: it is written in Rust on this engine, it names the one crate `warp_sdk`, and it connects the editor panels that it has data for.

The game draws in `Renderer::render`, reads input in `Renderer::input`, and draws interface in `Renderer::gui`. `run` opens the window and calls those methods. A game that wants a title screen and pause menu without writing them implements `ShellGame` and starts with `run_shell` instead. See [[renderer]] and [[shell]].

The editor draws the panels and the game feeds them. Nothing in the editor reads a game's memory. A panel shows something about a game because the game published it over a channel that costs nothing when no panel listens, so the same binary runs inside the editor and on its own with no change. See [[building-a-game#The rule the panels follow|the rule the panels follow]].

Every application boots through `run`, which attaches to an editor when one launched it. That is why a project needs no code to be hostable.[[src:warp_core/src/lib.rs|THIS IS WHY A PROJECT NEEDS NO CODE TO BE HOSTABLE.]] The data half of a project is `warp_app.toml`, which holds the window, the asset roots, the atlas taxonomy and the build targets. See [[manifest]].

## The kits

Besides the engine re-exports, `warp_sdk` owns a set of kits. Each kit is one module with a header that lists its grep targets, and each need has one kit.[[src:warp_sdk/src/lib.rs|Besides the engine re-exports, warp_sdk owns the kits below.]]

| Group | Kits |
|---|---|
| Getting started | [[renderer|run and Renderer]], [[shell]], [[smoke]] |
| Front end | [[front]] ([[front-menu|menu]], [[front-save|save]], [[front-settings|settings]]), [[fonts]], [[cine]], [[icon]], [[boot]] |
| Look | [[visual]], [[semiotics]], [[palette-kit]], [[post]], [[lit2d]], [[shaderlib]], [[camera]], [[juice]] |
| Information | [[squircle]], [[hud]] ([[hud-cues|cues]], [[hud-markers|markers]], [[hud-minimap|minimap]], [[hud-progress|progress]]), [[teach]] |
| World and simulation | [[world]] ([[world-terrain|terrain]], [[world-collide|collide]], [[world-biome|biome]], [[world-reveal|reveal]]), [[fluid]] ([[fluid-solver|solver]], [[fluid-particles|particles]]), [[procgen]] |
| Game systems | [[challenge]], [[economy]], [[quest]], [[metaprog]], [[gamepad]], [[soundtrack]] |
| Engine | [[display-mode]], [[perf]], [[scale]], [[widgets]], [[net]], and the panel channels ([[census]], [[bindings]], [[devconsole]], [[audio]], [[profile]], [[window]]) |

## Platforms

`run` is the desktop event loop. The browser uses a separate loop in the `web` module of `warp_core`, and Android uses `run_android`.[[src:warp_core/src/lib.rs|The desktop winit event loop. The browser uses `web::run_web` instead]] Modules that spawn processes or open sockets are native only.

## Look

A new project shows exactly what its `render` submitted. The engine boots with every post effect off, and the CRT tube is one optional look among the effects and not a default.[[src:warp_core/src/types/display.rs|crt_enabled: false, crt_curvature: 0.035, crt_corner_radius: 30.0,]] The default interface of an application is the [[squircle|squircle kit]]: a small cluster of keys in a corner of the viewport, each of which unfolds a panel.

## History

The repository history begins on 2026-05-06 with a commit that renamed the engine to WarpCore. `warp_sdk` was added on 2026-08-20 as a curated subset of the engine's modules. The headless boot harness in `smoke` followed on 2026-09-06 and the game shell on 2026-09-08. Most of the kits date from late October 2026.
