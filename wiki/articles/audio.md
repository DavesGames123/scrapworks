---
title: Audio
short: the bus a game plays into, and the analysis behind the Audio Scope
category: Editor channels
order: 50
module: audio, audio::bus, audio::chord, audio::events, audio::library, audio::scope, audio::spectrum
example: observatory
see: editor-panels, soundtrack, hostlink, juice, front-settings
---
**Audio** is the `audio` module of `warp_core`, re-exported by `warp_sdk`, which holds everything the sound monitor reads and the one mixer that a game adopts so that the monitor has a signal. The engine plays no sound of its own. It owns the mixer that the game plays through, so that the mix exists somewhere a tool can reach it.[[src:warp_core/src/panels/audio/mod.rs|The engine plays no sound of its own.]] The module is native only, and the bus sits behind the `audio` feature, which `warp_sdk` enables by default.

| Submodule | Holds |
| --- | --- |
| `audio::bus` | The mixer the game takes sinks from, with a tap on it |
| `audio::scope` | Rings of samples that the tap fills |
| `audio::events` | What the game says it started, and which of it is still on |
| `audio::spectrum` | Samples to one column of a spectrogram |
| `audio::chord` | Samples to notes, and notes to a chord |
| `audio::library` | Sound files on disk, found by walking them |

## Design

`audio::bus` is the only submodule that names rodio, and rodio is the only part that links a system library. With the feature off, the measuring half survives: rings, spectrogram, chord detector and library. None of these reads a device.[[src:warp_core/src/panels/audio/mod.rs|THE DEVICE IS OPTIONAL, THE ANALYSIS IS NOT]] `BUS_SAMPLE_RATE` is 44,100 Hz and `BUS_CHANNELS` is 2. They are declared in the parent module for that reason.

Music and sound effects stay apart from the bus to the display. Each `Lane` has one ring and one spectrogram trace. A mix can be summed later, but two lanes cannot be recovered from a mix that was flattened early.

No module holds a list of game sounds. An event carries a name as free text, and the library finds files by walking directories. A new sound appears in the monitor with no edit here. The cost is that a typo becomes a new sound, which the source accepts for a monitor that decides nothing.

## What a game does

Two things, and neither changes how it handles a voice.

1. Build a `Bus` on the output stream handle, and take sinks from it in place of rodio.
2. Call `events::push` where a sound starts.

```rust
use warp_sdk::audio::{Bus, Lane};

let (_stream, handle) = rodio::OutputStream::try_default()?;   // hold _stream
let bus = Bus::new(&handle)?;
bus.sink(Lane::Sfx).append(source);                            // rodio source
```

A game with no sound device can feed the monitor directly:

```rust
audio::scope::write(audio::Lane::Sfx, &tone);
```

A sound left uninstrumented is heard in the spectrogram and missing from the list. The source calls this visible discrepancy the intended failure mode.

`reset` zeroes the rings and empties the queue. The transport Stop edge calls it, because the host stops a game by no longer calling its hooks, and a rodio sink plays on its own thread regardless.

## The bus

`Bus` sits between the sinks of a game and the rodio output stream. Each sample is summed into a lane, tapped, and handed to the device, so what the monitor draws is what the device gets. Before it, each voice went directly to the output stream, and rodio summed them past the last line of game code. Tapping each voice separately would give signals slid past each other in time, not the mix.[[src:warp_core/src/panels/audio/bus.rs|THERE WAS NO PLACE TO LISTEN]]

`Bus::sink` returns an ordinary rodio sink, with the same pause, volume, stop and reaping that rodio gives. `Bus::play_raw` plays a source directly on a lane.

The tap never ends its stream. A rodio mixer ends the moment that it has no live source, and a mixer drops a source that ends. A lane handed raw to rodio would therefore be dropped at the first silence, permanently and with no error. The tap yields 0.0 instead, which also keeps the lanes sample-aligned.[[src:warp_core/src/panels/audio/bus.rs|A TAP NEVER RETURNS NONE]]

## Scope rings

`audio::scope` holds one ring of mono samples per lane, of `CAPACITY` 32,768 samples, which is 0.74 s at 44.1 kHz. A mutex in the audio callback would cause an audible click, because the callback must fill the device buffer before a deadline. So the storage is a flat array of atomics, and each lane has one writer.[[src:warp_core/src/panels/audio/scope.rs|A MUTEX IN THE CALLBACK IS AN XRUN]]

`scope::write` appends a block of samples, so that the cursor publishes once per callback. `scope::latest` and `scope::latest_mixed` fill a buffer with the newest samples, zero-padded at the front. `scope::take_peak` returns the peak and zeroes it. The writer never waits for a reader, so a read can tear only if the draw thread stalls for most of a second.

The rings live in one `Block`, and `scope::adopt` points both processes at a shared mapping. See [[hostlink]].

| Function | Purpose |
| --- | --- |
| `scope::set_format` | Told once, by the bus, at device open |
| `scope::sample_rate` | Hz, or 0 before the bus exists |
| `scope::write` | Audio thread: one block of mono samples |
| `scope::cursor` | Total samples ever written to a lane |
| `scope::latest` | The newest samples of one lane |
| `scope::latest_mixed` | The newest samples of every lane, summed |
| `scope::take_peak` | Peak magnitude since the last call |
| `scope::reset` | Zero each lane |
| `scope::adopt` | Unsafe: use a block that another party holds |
| `scope::release` | Return to the block of this process |

`latest_mixed` sums by index, which is correct only because the lanes advance together. Each lane is a source that never ends, and all are handed to rodio at once.

## Events and voices

`SoundEvent` is one start, built with `SoundEvent::sfx` or `SoundEvent::music` and chained setters for variant, path, duration, gain and spatial attenuation. `events::push` cannot fail and does not report whether anyone listens, so a game grows no branch around each sound.

The queue holds `QUEUE_LIMIT` events, 512, and drops its oldest. `dropped` counts the loss, because a display that silently loses events looks the same as a game that went quiet. `VoiceBoard::poll` drains at most `MAX_DRAIN_PER_FRAME`, 256, and tracks live voices.

The game reports starts only, because a voice ends on the rodio thread inside a sink that the game has dropped. A `Voice` retires when its declared duration elapses, and each derived end is marked as derived. A declared duration of zero means that the estimator gave up, so it is treated as absent: an ordinary voice gets `UNKNOWN_VOICE_LIFE`, 4 seconds, and an exclusive voice gets `HELD_VOICE_LIFE`, 30 minutes.[[src:warp_core/src/panels/audio/events.rs|A DECLARED ZERO IS A FAILED ESTIMATE]] An exclusive voice ends when the next voice takes its lane.

`VoiceBoard` is the panel's view, built with a history capacity. `VoiceBoard::live` gives the live voices, `VoiceBoard::live_on` counts one lane, `VoiceBoard::history` gives finished events, `VoiceBoard::seen` gives a running count, and `VoiceBoard::tally` counts by name. A `Voice` holds its event, its expected end, and `end_is_guessed`. The panel must show that flag, because a guessed end drawn as a measured one is a claim that the engine cannot support.[[src:warp_core/src/panels/audio/events.rs|the display into a claim the engine cannot support.]]

## Spectrum

`Analyzer` turns one block of mono samples into one spectrogram column, with a Hann window, a hand-written radix-2 FFT, and a fold onto a log frequency axis. There is no FFT crate. Linear bins are the wrong axis, because they crush what a musician can hear into the bottom eighth of the display. So bands are spaced geometrically from `F_LO`, 30 Hz, up to Nyquist. `FFT_SIZE` is 1024, `DEFAULT_FLOOR_DB` is -90, `DEFAULT_CEIL_DB` is 0, and `DEFAULT_SHARPEN` is 0.75. Nothing allocates once the `Analyzer` exists.[[src:warp_core/src/panels/audio/spectrum/mod.rs|Nothing here knows about]]

## Chord detection

`Detector` takes mono samples and gives a named `Chord`. It runs its own transform of `WINDOW` 16,384 points, because at the spectrogram resolution two adjacent bass notes land in one bin.[[src:warp_core/src/panels/audio/chord.rs|IT NEEDS A LONGER WINDOW THAN THE SPECTROGRAM]]

Harmonics are subtracted and not ignored. A plucked low E puts as much energy on its third harmonic as on some played notes, so the detector takes the loudest pitch by salience, removes that note's overtone series from the peak list, and repeats. Tuning is measured as a circular mean of each peak's deviation, and subtracted before the fold to twelve pitch classes.

`Detector::feed` takes one frame. `Detector::now` is what is sounding, and it flickers because near-ties are real. `Detector::dominant` is a vote that decays over about four seconds. Inversions are not named: the result is a root and a `Quality`, so C/E reads as C.

`Chord` holds a `root` pitch class, with 0 as C, a `Quality`, and a `score`, which is a cosine against the template and not a probability. `Chord::name` gives a symbol such as Am. `Quality::CHORDS` lists the eight templates: major, minor, dominant 7, major 7, minor 7, suspended 2, suspended 4 and diminished. `Quality` also has a single-note fallback, which is not a template.

## Library

`LibraryState` walks a directory of sound files on a worker thread, so the walk never runs on the draw thread. `LibraryState::rescan` starts a walk, and leaves a matching one running. `LibraryState::poll` takes a finished `Scan` and never waits.

The tree is the registry. A `Clip` has a group that is its directory path from the root, and a category that is the first component. Dropping a directory into the library makes it appear on the next walk. `AUDIO_EXTS` decides what counts as sound by extension. `MAX_CLIPS`, 20,000, and `MAX_DEPTH`, 12, bound a walk of the wrong root, and both report into the `errors` list of the `Scan` when they bite.[[src:warp_core/src/panels/audio/library.rs|WHAT STOPS A WALK OF THE HOME DIRECTORY]]

`Scan` holds the root, the groups, clip and byte totals, the errors, and the time taken. `LibraryState::set_filter` and `LibraryState::filtered` narrow the list.

## Across processes

The audio callback runs in the game, and the panel runs in the editor. Samples do not travel on the socket, because two lanes at 44.1 kHz would be 353 KB of floats a second, and more as JSON text. One message carries the name of a shared page, and the callback writes into it. See [[hostlink]].
