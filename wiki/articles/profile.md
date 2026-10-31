---
title: Profiler
short: named per-frame spans, the flame chart report, and the Profiler panel
category: Editor channels
order: 70
module: profile, profile::draw, profile::engine, profile::engine::report
see: perf, editor-panels, hostlink, types
---
**The profiler** is the `profile` module of `warp_core`, re-exported by `warp_sdk`, which records a stack of named spans per frame and rolls them into the report behind the Profiler panel. The Performance panel says how much a frame cost, but three phases and a population do not form a call tree, and nothing in the engine named the work. These spans are that naming.[[src:warp_core/src/panels/profile/engine/mod.rs|Nothing in the engine NAMES the work]]

For budgets and warnings, a game normally uses [[perf]], whose `perf::scope` opens a `profile::Scope` of the same name.

## Recording

`Scope` is an RAII guard for one span, and it records nothing unless someone is looking. A guard must be bound to a name, because a binding of `_` drops it at once.

```rust
let _span = warp_sdk::profile::Scope::new("upload");
```

Inside `warp_core`, the `scope!` macro makes this binding. `warp_sdk` does not re-export that macro, so a game uses `Scope::new` or `perf::scope`.

A span is pushed when it opens, and its end is written when it closes, so the recording is already in pre-order. With a depth on each span, that encodes the whole tree with no pointers. RAII guarantees this: a guard drops at the end of its block, so spans nest strictly.[[src:warp_core/src/panels/profile/engine/mod.rs|PRE-ORDER AND A DEPTH IS THE WHOLE TREE]]

The guard remembers whether it opened anything. Profiling turns on and off while frames are in flight, and a drop that popped a stack that its constructor never pushed would close another span. A toggle mid-frame therefore costs at most a partial frame.

## Interest and the frame

`want` is the census brake in the same shape. A panel says that it is looking, and the claim runs out after `WANT_GRACE` frames, which is 3. The clock is `frame`, which the render loop calls once per frame, so a closed panel stops the instrumentation with no message. This is why a span can stay in a hot path of shipped code: off, it is one relaxed load and a branch.[[src:warp_core/src/panels/profile/engine/mod.rs|That expiry is the reason a `scope!` can be left in the hot path of shipped]]

| Function | Purpose |
| --- | --- |
| `want` | A reader says that it is looking |
| `enabled` | Whether a scope entered now would record |
| `generation` | How many frames have closed |
| `frame` | Close the frame and publish it, once, in the loop |
| `take_frame` | The last published frame, once |
| `reset` | Clear the state |

[[perf]] reads `generation` for its own frame clock.

`Frame` holds its spans in pre-order. `Frame::children` and `Frame::subtree_end` walk the tree, `Frame::work_ns` gives the total, and `Frame::self_ns` gives the time in a span and not in its callees.

`Span` holds a static name, a depth, and start and end times in nanoseconds from the start of the frame. `MAX_SPANS` bounds a `scope!` inside a loop over many entities.

## Threads

Buffers are thread-local, and `frame` publishes the buffer of the thread that calls it. A worker thread that opens a span records into a buffer that nobody drains, so a recording is capped at `MAX_SPANS`, 4096, and the overflow is counted. The `dropped` count is drawn by the panel, because a flame chart that lacks its tail looks like a frame that did less work.[[src:warp_core/src/panels/profile/engine/mod.rs|Counted and not silently dropped]]

## Reports

`Window` takes frames with `Window::accept` and produces a `Report` over `WINDOW_MS`, which is 250 ms, so four times a second. The panel draws a `Report` and nothing else, and so does the socket.[[src:warp_core/src/panels/profile/engine/report.rs|The panel draws a Report and nothing else; so does]] The local source goes through the wire type too, so a field that stops being filled breaks in front of whoever broke it.

A window, and not the last frame, for two reasons. A flame chart laid out sixty times a second cannot be read, and a span tree at sixty hertz as JSON is the traffic that [[hostlink]] refuses.

The flame chart keeps one real frame, the most expensive in the window, and never a mean. A mean depicts a frame that did not run.[[src:warp_core/src/panels/profile/engine/report.rs|IT KEEPS THE WORST FRAME, NOT AN AVERAGE ONE]] `Bar` is one span of that frame. `Row` is one line of the ranked table, which holds at most `MAX_ROWS`, 96. `Report::fps` gives the rate, and `Window::latest` and `Window::take_fresh` read the result.

### The report in full

`Report` is the unit that the panel draws and the socket carries.

| Field | Meaning |
| --- | --- |
| `frames` | Frames folded into this window |
| `span_ms` | Wall time that the window covered |
| `worst` | The most expensive frame, as `Bar` values in pre-order |
| `worst_ms` | The instrumented work of that frame |
| `worst_period_ms` | The wall clock of that frame, gate included |
| `rows` | Every name seen, most self time first |
| `hidden_rows` | Rows past `MAX_ROWS` that were dropped |
| `dropped` | Spans that the capture could not record |

`worst_ms` and `worst_period_ms` travel together, because under the budget they differ by the slack that the presentation gate holds, and a panel with only one of them cannot tell a cheap frame from a late one.[[src:warp_core/src/panels/profile/engine/report.rs|cannot tell a cheap frame from a late one.]]

`Row` totals one name over the window.

| Field | Meaning |
| --- | --- |
| `name` | The span name |
| `calls` | Entries across the whole window, not per frame |
| `self_ns` | Time with the children taken out |
| `total_ns` | Time with everything it called |
| `max_ns` | The most expensive single entry |

`Bar` holds a name, a depth, and start and end times in nanoseconds from the start of its frame. `Report::children` and `Report::subtree_end` walk the bars in the same pre-order as `Frame`.

## The panel

`ProfilerState` holds the panel state, and `draw` paints a flame chart of the worst frame with a table below that ranks each span by self time. `Source` chooses the editor or the game, because these are different processes, and a chart that did not say so would be read as the game's whatever it was.[[src:warp_core/src/panels/profile/draw.rs|The whole reason this control exists: the two are different processes]]

## Across processes

The game keeps its own `Window`, and `pump_profile` in `hostlink::child` sends one `Report` per window while the editor wants one. The Profile message from the editor re-arms the want, and the expiry stays with `want`, counted in frames.

## Limitations

There is no second timeline per thread. The source calls that the obvious next version, and a panel change as much as a capture change. The panel code compiles on native targets only, and the span engine also compiles on wasm.

The Perf Monitor panel reads the timings of the render loop, so a game that records no spans still gets those.
