---
title: Perf
short: per-system frame budgets, growth detection and automatic quality
category: Engine
order: 21
module: perf
see: profile, renderer, devconsole, display-mode, front-settings
---
**Perf** is the `warp_sdk` kit that measures frame budgets every frame and adjusts quality automatically. A game gives each costly system a budget in milliseconds, times the system with a guard, and reads one report. The `perf` module finds three failures: a system over its budget, a system whose time increases over minutes, and a frame too slow for the display. Auto-quality then moves game knobs down until the frame fits, and moves them up again when the frame is stable.

## Design

The kit exists because of a specific failure. The Reef v2 fluid became slower over time and nothing told the author. The Perf panel showed the frame, but not which system grew and not that the time rose for minutes.[[src:warp_sdk/src/perf.rs|The Reef v2 fluid became slower over time, and nothing told the author.]] So each system gets a number that it must stay below, and the module reports when that stops being true.

The module has no render-loop hook of its own. The render loop calls `profile::frame()` once per frame, and this module reads `profile::generation()`. When that value changes, the module closes its own frame, so a game calls no frame function.[[src:warp_sdk/src/perf.rs|THE FRAME CLOCK IS THE PROFILER'S FRAME]] A headless loop or a test with no render loop calls `end_frame` instead. After the first such call, the module ignores the profiler clock, so a frame never closes twice.

`scope` also opens a `profile::Scope` of the same name. The span therefore appears in the flame chart of the Profiler panel, and the module needs no second span channel. See [[profile]]. GPU time from `report_gpu` is not a span, so it appears only in `report`.

## The frame budget

`FRAME` is 16.6 ms, one frame at 60 Hz, and auto-quality compares the frame time to it. The source calls the split below a guide and not a rule.[[src:warp_sdk/src/perf.rs|The split is a guide, not a rule]]

| Constant | Value | Used for |
| --- | --- | --- |
| `SIMULATION` | 6.0 ms | Game update, physics and fluid steps on the CPU |
| `GPU_EFFECTS` | 5.0 ms | Post, particles and fluid passes on the GPU |
| `UI` | 2.0 ms | egui and HUD |
| `HEADROOM` | 3.6 ms | The OS, the driver, an unusual frame |

## Usage

```rust
use warp_sdk::perf::{self, Ms};

perf::budget("fluid", Ms(1.5));                                     // once, in `new`
perf::knob("fluid_res", [1.0, 0.75, 0.5, 0.35], |v| FLUID_RES.set(v));
// Each frame:
{
    let _t = perf::scope("fluid");
    self.fluid.step();
}
for line in perf::take_warnings() { /* show in the console */ let _ = line; }
```

`budget` gives a channel a budget. A channel with no budget still gets statistics and growth detection, but it is never over budget.

`scope` returns a `Scope` guard that records its time when it drops. The guard must be bound to a named variable: `let _ = perf::scope(..)` drops it at once and records zero.[[src:warp_sdk/src/perf.rs|guard at once and records zero.]] On wasm32 the standard library has no clock, so only the Profiler span records.

`record` adds time that a guard cannot measure, such as time from a worker. Two records in one frame add together. `report_gpu` does the same thing, under a name that says where the number comes from.

## Statistics and detectors

### Rolling statistics

Each channel keeps the last `WINDOW` samples, which is 120 frames. `Stats` holds the sample count, mean, 95th percentile by nearest rank, and maximum.

### Over budget

A channel enters the over state after `ENTER_AFTER` consecutive frames over budget, which is 10. It leaves only after `LEAVE_AFTER` consecutive frames, which is 60, below `LEAVE_FRACTION` of the budget, which is 0.9. The leave condition is longer so that the state does not flicker.

### Growth

Growth detection looks for the slow rise that a leak or a feedback loop gives. Each `GROWTH_BUCKET` of 60 frames becomes one mean, and the module keeps `GROWTH_BUCKETS` of them, 180, which is three minutes at 60 Hz. It gives no result before `GROWTH_MIN_BUCKETS`, 30.

The detector splits the history into thirds. It requires that the three means increase in order, that the last exceeds the first by more than 0.05 ms, and that the ratio reaches 1 + `GROWTH_RATIO`, which is 1.25.[[src:warp_sdk/src/perf.rs|Noise gives thirds that are almost]] Noise gives thirds that are almost equal and not in order, so noise does not trigger it. The absolute floor stops a system near zero cost from giving a large ratio.

### Warnings

The dev console is a snapshot that the game owns, so this module cannot add a line to it. `take_warnings` returns `devconsole::Line` values, and the game adds them to its scrollback. See [[devconsole]]. On native targets, the module also writes each warning to stderr. One channel gives at most one warning in `WARN_EVERY` frames, which is 600. A game that never takes the warnings keeps 64 at most.[[src:warp_sdk/src/perf.rs|A game that never takes the warnings keeps 64 at most.]]

## Auto-quality

`Quality` has four levels, from best to cheapest: Ultra, High, Medium and Low. The module starts at `START_QUALITY`, which is High, so that auto-quality can go up or down from the first frame.

`knob` registers a named setter with four values, in the order of `Quality::ALL`. The setter gets the value for the current level at once, and again on each level change.

The state machine runs once per closed frame:[[src:warp_sdk/src/perf.rs|fn step_quality]]

| Constant | Value | Meaning |
| --- | --- | --- |
| `DOWN_AFTER` | 30 | Consecutive slow frames before one step down |
| `UP_AFTER` | 300 | Consecutive stable frames before one step up |
| `SLOW_FACTOR` | 1.15 | A frame longer than `FRAME` times this is slow |
| `STABLE_FRACTION` | 0.75 | A stable frame keeps each budgeted channel below this part of its budget |

A frame also counts toward a step down when any channel is over budget. The `SLOW_FACTOR` margin exists so that a vsync frame of 16.7 ms is not slow. A stable frame also must not exceed `FRAME` by more than 5 percent.

If a step up is followed by a step down in less than two times the current wait, the wait doubles, up to 16 times `UP_AFTER`. This stops the level from oscillating. Each level change also clears the over state of all channels, because a channel still marked over would step the level down again at once.

`set_quality` with a level records a player choice, and while one is set, the automatic state machine does nothing. `auto_quality(false)` also stops it. `quality` returns the current level, and `Quality::name` gives the text for a settings menu.

## Reading the report

`Report` is a snapshot of the `Monitor`.

| Field | Meaning |
| --- | --- |
| `frames` | Frames closed since the start |
| `frame` | Wall time of the frame, as `Stats`; empty when no frame time is known |
| `quality` | The current level |
| `player_override` | True when the player chose the level |
| `warnings_total` | Warnings since the start |
| `channels` | One `ChannelReport` per channel |

`Report::channel` finds a channel by name. A `ChannelReport` holds the name, budget and statistics, with `over` while the channel is in the over state, and `growth` with the ratio when the time rises over minutes.

```rust
let c = perf::report().channel("fluid").unwrap();
if c.over { /* show a red light */ }
```

## Tests and headless use

`report` returns a `Report` snapshot of all channels, and `Report` implements `Display`. `assert_within` turns a budget into a test: it panics when the p95 of a channel is above the limit, or when the channel has no samples.

```rust
for _ in 0..600 { sim.step(); perf::end_frame(None); }
```

The free functions share one global `Monitor`. A test that must not share state with other tests makes its own instance with `Monitor::new`.

## History

The kit was added on 2026-10-29.
