---
title: Host link
short: the channel between the editor and the game it launched
category: Editor channels
order: 80
module: hostlink, hostlink::audio, hostlink::child, hostlink::import, hostlink::input, hostlink::present, hostlink::surface
example: observatory, front, cine
see: editor-panels, gpu, census, audio, renderer
---
**The host link** is the channel between the SCRAP editor and a game that it launched as a separate process. The `hostlink` module of `warp_core`, re-exported by `warp_sdk`, carries a transport that the editor drives, a surface that the game publishes, and each panel channel. It exists because the editor used to link the game, so a project that did not compile took the tool for fixing it down with it.[[src:warp_core/src/hostlink/mod.rs|It exists because the editor used to LINK the game.]] Every call on the game side costs almost nothing when no editor is listening. The module is native only.

## Design

### A game with no editor is the normal case

`child::attach` returns false when the launch flag is absent, and every function in `hostlink::child` is then a cheap no-op. That is the shipped game. One atomic gates the hot paths, so a game does not lock a mutex to learn "no".[[src:warp_core/src/hostlink/child/mod.rs|A GAME WITH NO EDITOR IS THE NORMAL CASE]]

The editor passes `SOCKET_FLAG`, which is `--warp-hostlink`, on the command line of the game. The constant lives here, because a writer and a reader of a command line that share no constant drift apart silently.

### There is no per-frame message

A frame does not travel on the channel. The game renders into a surface that the editor already holds, so pixels arrive by being written. The channel carries only what changes state: the transport, the size, the focus, and the name of a surface when a resize forces a new one. It is idle while a game runs.[[src:warp_core/src/hostlink/mod.rs|THERE IS NO PER-FRAME MESSAGE, AND THAT IS THE POINT]] Sound crosses the same way, through the name of a shared page.

### Every panel that read a global is a message

The transport, the display settings, the profiler and the census were once statics in one address space. Out of process, each broke in the same quiet way: Debug booted the ordinary configuration, a bloom slider moved nothing, and a hierarchy drew its empty state over a full world. None gave an error. The symptom is always that the editor's own copy changed, so a panel looks as if it works.

### Messages and the pipe are separate

The wire format is newline-delimited JSON with a reader thread and an inbox drained once a frame. Messages are serde over engine types and name no socket or handle. The two payloads too big for JSON carry a string name. So one protocol sits on two transports: a unix domain socket on macOS and Linux, and loopback TCP on Windows.[[src:warp_core/src/hostlink/mod.rs|a unix domain socket on]]

The source rejects a named pipe on Windows because a synchronous handle lets a parked read hold off a write from the frame, and fixing that means several hundred lines of unsafe whose failure mode is a hung frame. A loopback port is reachable by each process on the machine, so the address carries a random token after the port, and the host refuses a caller that does not present it. The read of that line is bounded.

## Game side

A game calls one function directly. `child::report_screen` names the screen for the Storyboard, once per frame, and sends only on a change.

```rust
hostlink::child::report_screen("deep field");
```

The rest runs from the engine: `child::attach` once in `run`, before any window or GPU work, then `child::poll` and the pumps once per frame.

| Function | Purpose |
| --- | --- |
| `child::hosted` | Whether this process has an editor |
| `child::poll` | Drain the channel into the engine statics |
| `child::requested_size` | What the editor last asked the image to be |
| `child::take_resize` | The resize edge, once per change |
| `child::focused` | Whether keys are aimed at the Game panel |
| `child::visible` | Whether the Game panel is on screen |
| `child::should_exit` | Editor gone, or shutdown received |
| `child::memory_pressure` | The level that the editor last sent |
| `child::report_crash` | A last message from the panic hook |
| `child::detach` | Drop the connection and restore the statics |

The transport lands in the same static that an in-process editor wrote, so `child::poll` writes the game's own copy, and no reader downstream changes.

`child::visible` is true by default. It arms the frame loop, so each way that the message can fail to arrive lands on the old behaviour. A game that renders when nobody looks wastes power, but a game that does not render when somebody looks is a black panel.[[src:warp_core/src/hostlink/child/mod.rs|TRUE BY DEFAULT, AND THAT IS THE WHOLE SAFETY ARGUMENT]]

### The pumps

Each pump re-arms the want of a publisher from what the editor last said, leaves if nobody looks, and sends only when the watched value has a new generation or revision.

| Pump | Carries |
| --- | --- |
| `child::pump_census` | [[census]] snapshots |
| `child::pump_console` | [[devconsole]] snapshots |
| `child::pump_controls` | [[bindings]] snapshots |
| `child::pump_profile` | [[profile]] reports |
| `child::pump_perf` | Frame costs, in batches |
| `child::pump_screen` | The Storyboard screen name |
| `child::pump_mem` | Memory use |

## Editor side

`Host::start` listens, and returns nothing when no socket can be made. `Host::socket` gives the address for the argv of the game. `Host::drain` returns messages once a frame, and `Host::send` tells the game something. `Host::is_connected` says whether a game attached.

`Guest` is the game's end: `Guest::connect`, `Guest::drain` and `Guest::send`, with `Guest::apply_transport` to write a received transport to the engine statics.

`reap` ends the game, the shell that started it, and what that shell left running. On unix this is a process group, and on Windows it is a job object that `contain` sets up at spawn. A plain kill signals one process, and a script that pipes its output leaves the game running one level down.[[src:warp_core/src/hostlink/mod.rs|reap_ends_what_the_shell_started_and_not_only_the_shell]]

## Messages

`ToGame` goes down, with Transport, Step, Resize, Input, Focus, Visible, Scale, Display, Census, CensusInput, Console, Command, Rebind, Profile, Perf, MemoryPressure, Shutdown and others. `ToEditor` goes up, with Ready, Surface, NoSurface, Audio, Display, Profile, Perf, Census, Console, ConsoleWords, Controls, Screen, Crash and Mem.

`CrashReport` records a failure with a `CrashKind`: a panic, a fatal signal, or a stop by the editor to protect memory. The report also goes to a file named for the process, which `crash_file_path` and `read_crash_report` handle. `MemoryPressureLevel` has Warn and Critical. It is a courtesy, because the guarantee that a game cannot take the editor down rests on the editor being able to stop it.

Each message has a stated reason. Transport carries the play state and the debug flag, because the editor once set that flag in a static that the linked game read, and out of process Debug booted the ordinary configuration. Screen is sent on change, a handful of lines per session.[[src:warp_core/src/hostlink/message.rs|SENT ON CHANGE, WHICH IS THE ONLY TIME IT SAYS ANYTHING.]] Crash carries the panic message, the line and a backtrace from the panic hook, because an exit status tells a person that something broke and nothing about what. A fatal signal cannot send it. Display goes up once as a first look, and the editor owns the settings after that. Going down it is sent on change, so a drag on a slider costs one line per frame while the pointer is down and nothing afterwards.

## The surface

The game allocates and publishes, and the editor looks up and imports. The surface must exist before anything renders into it, and the renderer is on the game side. A resize does not free the old surface at once, because the editor is still drawing from it, and freeing it would give a black flash on each splitter drag.[[src:warp_core/src/hostlink/child/mod.rs|WHO OWNS THE SURFACE, AND WHY IT IS THIS SIDE]]

`Shared` wraps the buffer. On macOS it is an IOSurface, and the handle is a service name and not an integer. The source records that it measured this: the lookup call returns null in a child process, so a mach port crosses through the inherited bootstrap namespace, and the name travels on the JSON channel.[[src:warp_core/src/hostlink/surface.rs|WHY THE HANDLE IS NOT AN INTEGER]] The deprecated `bootstrap_register` call has one call site, so that a migration would touch only those two functions.

The game side has three calls for this.

| Function | Purpose |
| --- | --- |
| `child::ensure_surface` | Allocate and publish when the size changed; idempotent at a given size |
| `child::surface_generation` | Which allocation is current |
| `child::with_surface` | Borrow the surface through a closure, behind the session mutex |

The generation is a counter and not the surface address, because a pointer freed and reallocated can land on the same address and read as unchanged. `child::take_resize` is an edge detector over the requested size. The size alone is a level, and a frame loop that resized on it would call the window sixty times a second for ever.[[src:warp_core/src/hostlink/child/mod.rs|`WANT` alone cannot drive a window resize, because it is a level and not an]]

`Shared::publish` gives the name, `Shared::lookup` finds a surface by name, and `Shared::create` allocates. `Shared::adopt` is a third constructor for a surface that another producer allocated, and it retains the surface, because dropping a `Shared` releases it and the caller still owns its copy.

`hostlink::import` turns a surface into a wgpu texture, in `texture_from_shared`. `IMPORT_FORMAT` is its format. Both ends use the same call, so they cannot disagree about the format. The unsafe wgpu-hal use is confined to this file.

`hostlink::present` draws the composed frame into the surface with `publish_frame`, in one render pass, with no second scene pass or readback. The pass has no aspect correction. It is a copy only because the size now reaches the window, and the source warns that the correctness of this pass depends on a resize two files away.[[src:warp_core/src/hostlink/present.rs|correctness of this pass is a property of a resize two files away.]]

On the editor side, the texture goes in `GameView` through `GameView::adopt`, as [[gpu#The game view|gpu]] describes.

## Input

The window of a hosted game is hidden and receives nothing. Each event lands in the editor window, so `hostlink::input` carries it. `InputEvent` is the wire type. The editor tap is `input::capture` and `input::drain`, and the child side is `input::accept` and `input::replay`.

The child replays winit events and not egui events, because the game consumes input twice: its egui context draws menus, and the winit input helper drives everything else. Forwarding egui events would give a game whose menus click and whose camera cannot move. The replay also writes the raw key ring.[[src:warp_core/src/hostlink/input/mod.rs|WHY REPLAY WINIT EVENTS AND NOT egui EVENTS]]

A click passes through three coordinate spaces. It starts in physical pixels of the editor window, becomes pixels of the game image, and ends in pixels of the child window. The game image is the space on the wire, because it is the one thing that both ends agree on.[[src:warp_core/src/hostlink/input/mod.rs|THREE COORDINATE SPACES, AND THE TWO CONVERSIONS BETWEEN THEM]]

The rules are the ones for a linked game: pointer events inside the published rect, and keys while the panel holds the keyboard and this is the window that it draws in. A drag is exempt from the rect, so an orbit that leaves the panel does not stop. When the key gate shuts under a held key, each forwarded press is paid out as a release, so the game holds no key that nobody presses.[[src:warp_core/src/hostlink/input/mod.rs|A SHUT KEY GATE PAYS OUT ITS RELEASES]]

## Audio

`SharedRings` is the same arrangement for the [[audio]] rings: the game allocates, and the name travels on the channel. It uses `shm_open` and `mmap` on POSIX and a file mapping on Windows. A game killed with SIGKILL leaves a quarter megabyte named in the namespace until reboot. `create` unlinks its own name first, so a second run at the same name reclaims the space.[[src:warp_core/src/hostlink/audio.rs|THE NAME IS UNLINKED LATE, AND THAT LEAKS ON A CRASH]]

## History

The channel and the surface import landed on 2026-08-02.
