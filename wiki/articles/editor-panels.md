---
title: Editor panels
short: every panel a game can feed, and the channels that feed them
category: Editor channels
order: 10
example: starter, pong, observatory
see: census, bindings, devconsole, audio, profile, window
---
**Editor panels** are the tool views of the SCRAP editor that a running game fills with its own data. Each panel a game drives is one channel, re-exported through `warp_sdk`. A game publishes to the channels for which it has data, and a game with no editor attached pays almost nothing. The channels share one rule: the game owns the facts, the panel draws them, and anything the panel wants done travels back as data.[[src:warp_core/src/panels/census/mod.rs|The application publishes rows. The panel draws them and pushes requests.]]

## The channel table

| Panel | Channel | How a game feeds it |
| --- | --- | --- |
| Hierarchy and Inspector | [[census]] | Publish `Census` rows each frame, gated on `census_wanted` |
| Control Map | [[bindings]] | Call `bindings::register`, then read verbs with `bindings::held` and `bindings::pressed` |
| Console | [[devconsole]] | Call `devconsole::publish` and `devconsole::publish_words`, and drain `take_submissions` |
| Audio Scope | [[audio]] | Play through `Bus`, or feed `scope::write` |
| Storyboard | [[hostlink]] | Call `report_screen` with the name of the current screen |
| Perf Monitor and Profiler | [[profile]] | Record spans, or use [[perf]] |
| An application panel | [[window]] | Implement `WarpWindow` and call `window::register` before `run` |

The [[palette]] Theme panel and the post-processing panels edit shared tables and not game channels. See [[project-settings]].

## The rule the panels follow

A game is not a panel, and a panel is not a game. The engine cannot name either side, so the dependency runs in one direction, and every channel is built around that fact.[[src:warp_core/src/devconsole.rs|The console lives in the application, and the dependency runs one way:]]

### A panel asks for what it draws

The publisher does no work unless someone is looking. A panel re-asserts its interest on each frame that it draws, and the claim expires. A flag set on open and cleared on close would miss each way that a panel stops being drawn: another tab comes forward, a window closes, or the layout resets.[[src:warp_core/src/panels/census/interest.rs|So the panel re-asserts on every frame it draws, and the assertion expires.]]

`census_wanted`, `console_wanted` and `profile::enabled` are three forms of this one brake. Each expiry counts something different, so that a stopped clock cannot hold a claim open:

| Channel | Clock | Grace |
| --- | --- | --- |
| Census | Publishes | 3 |
| Console | Polls of `console_wanted` | 3 |
| Profiler | Calls to `profile::frame` | 3 frames |

### Actions travel as data

A click on a row, a typed command and a rebind are records in a queue, which the application drains on its own frame. The application holds the world and the context needed to act, and neither exists at the moment that a panel draws. Queues are bounded, so a publisher that stops draining cannot grow one without limit.

### The two ends may be separate processes

The editor once linked the game, and these channels were statics in one address space. The editor now launches the game as a child process, so each process has its own copy of each static. [[hostlink]] carries each channel across. Every panel that read a global became a message, and the failures of that split were quiet: the panel's own copy changed, so it looked as if it worked.[[src:warp_core/src/hostlink/mod.rs|EVERY PANEL THAT READ A GLOBAL IS A MESSAGE HERE]]

A game calls the same functions in both cases. The per-frame `pump_` functions of `hostlink::child` forward what the game published.

## Usage

`starter` wires the census, bindings and console channels, `pong` is a short worked example, and `observatory` also feeds the Audio Scope. Each editor-facing call is gated, or costs little with no reader, so a shipped game keeps these lines.

```rust
// Hierarchy: the three things in play.
if census::census_wanted() {
    census::publish(census::Census {
        kinds: vec![census::Kind::new("Body", [120, 200, 255], census::Focus::World)],
        rows: vec![
            census::Entity::new(1, 0, "Ball"),
            census::Entity::new(2, 0, "Left Paddle"),
            census::Entity::new(3, 0, "Right Paddle"),
        ],
        ..Default::default()
    });
}
```

## Limitations

The Storyboard edges are edited in the panel, not by the game. `warp_sdk` does not re-export the editor's `shaderlab` and `story` panels, which sit behind an editor feature of `warp_core`.[[src:warp_sdk/src/lib.rs|Do not re-add these here.]]
