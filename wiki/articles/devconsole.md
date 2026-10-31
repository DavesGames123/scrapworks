---
title: Dev console
short: the Console panel, a mirror of the game's own scrollback
category: Editor channels
order: 30
module: devconsole
example: pong, starter
see: editor-panels, perf, hostlink, census
---
**The dev console** is the channel behind the Console panel, a dock panel that shows the console an application already has and types back into it. The `devconsole` module of `warp_core`, re-exported by `warp_sdk`, is the whole of the part that the engine plays. There is one scrollback with two views: a line printed in the game appears in the panel, and a command entered in the panel runs in the game and prints in both.[[src:warp_core/src/devconsole.rs|One scrollback, two views]]

## Design

The console lives in the application, and the dependency runs one way, so the engine cannot name its commands or interpreter. The application publishes, and the engine draws. Every line that crosses is a string and three bytes of colour.

### A snapshot and a revision

The obvious build hooks the function that appends a line, and forwards each line. It fails because a buffer is also cleared, and it drops its oldest lines at a cap. An append-only stream carries neither, so the first `cls` would leave the panel showing lines that the game no longer has.[[src:warp_core/src/devconsole.rs|WHY A REVISION AND NOT A HOOK ON THE PRINT]]

So the unit that crosses is a snapshot. The publisher bumps a counter on each change to its buffer, and it republishes when that counter differs from `published_revision`.

### The want clock counts polls

`want_console` is the same brake as `want_census`, with one difference. Console output changes only when a command runs, so a publish clock would stand still through each idle frame, and a deadline against a stopped clock never arrives. `console_wanted` advances the clock instead, so the per-frame question of the publisher is the tick.[[src:warp_core/src/devconsole.rs|WHY THE WANT CLOCK COUNTS POLLS AND NOT PUBLISHES]] `WANT_GRACE` is 3.

### Typing is a queue

Running a command needs a renderer, a world, or a mutable borrow of both, and none of these exist when a person presses Return inside a panel draw. The panel records the text, and the application runs it on its own frame. `MAX_PENDING` is 64.

The panel does not echo what it sends. The console of the application prints the echo, and it arrives with the next publish. A local echo would show each command twice, in this panel only.

## Usage

Drain the commands where the game holds what they need, and publish when the buffer changes. `Seg` is one coloured run, and `Line` is a row of them.

```rust
fn gui(&mut self, _v: ViewportId, ctx: &warp_sdk::egui::Context, _d: &mut DisplaySettings) {
    for cmd in devconsole::take_submissions() {
        if cmd == "reset" {
            self.score = [0, 0];
            self.point();
        }
    }
}

/// Announce the score on the console.
fn point(&mut self) {
    self.rev += 1;
    let line = format!("score  {} : {}", self.score[0], self.score[1]);
    devconsole::publish(
        self.rev,
        vec![devconsole::Line::new(vec![devconsole::Seg::new(line, [200, 200, 200])])],
    );
}
```

`devconsole::publish_words` sends the completion vocabulary once, in `new`. `words_published` says whether that was done. On the panel side, `completions` gives the matches for a prefix and `common_prefix` gives their shared start, and `with_console` and `with_words` lend the data for drawing.

## API

| Side | Function | Purpose |
| --- | --- | --- |
| Panel | `want_console` | I am open, or closed |
| Panel | `with_console` | Borrow the lines to draw |
| Panel | `submit` | Queue a command |
| Publisher | `console_wanted` | Is anyone looking; ticks the clock |
| Publisher | `publish` | Install a snapshot |
| Publisher | `published_revision` | Is the snapshot stale |
| Publisher | `take_submissions` | What was typed since the last frame |
| Publisher | `has_submissions` | Peek at the queue |

[[perf]] returns its warnings as `Line` values, because this console is a snapshot that the game owns and the kit cannot add to it.

## Across processes

Nothing in this file changed when the editor stopped linking the game. The panel arms `want_console` and reads `with_console` in its own copy, and the game polls and publishes in its copy. [[hostlink]] carries a snapshot up and a want down in `pump_console`. The cost is a frame of lag.[[src:warp_core/src/devconsole.rs|What that costs is a frame of lag and nothing else.]]
