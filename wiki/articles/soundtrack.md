---
title: Soundtrack
short: the player's music, tagged ambience and sound effects with ducking
category: Game systems
order: 70
module: soundtrack
see: audio, juice, front-settings, world-biome
---
**Soundtrack** is the game-audio layer of the SCRAP SDK: the player's music, the world's ambience, and sound effects. It lives in the `soundtrack` module of `warp_sdk`. `Music` plays files from a folder that the player picks, `Ambience` crossfades looped beds by a tag, and `Sfx` plays one-shot effects with pan, variation and a voice limit. The module's central policy is that the game does not compose music.

## The policy

There is no generated or procedural music in this module, and no default makes one. The player owns the soundtrack. `Music` plays the audio files in a folder that the player picks. When that folder holds no track this build can decode, music is off. The source states that silence is the correct result and is not an error. [[src:warp_sdk/src/soundtrack.rs|that folder holds no track this build can decode, music is off. Silence is]]

A game that ships licensed tracks gives them to `Music::bundled`. That is the only path to game-owned music, and it takes a license note, so the choice is explicit and shows in review. An empty license gives music that is off. `Music::license` returns the note for a credits screen. [[src:warp_sdk/src/soundtrack.rs|call takes a license note, so the choice is explicit and shows in review.]]

The game does own two things: `Ambience`, the looped beds per biome, and `Sfx`, the one-shot effects.

## Usage

```rust
use std::sync::Arc;
use warp_sdk::soundtrack::{self, Ambience, Music, Sfx, SfxSpec};

let (_stream, handle) = soundtrack::rodio::OutputStream::try_default()?;
let bus = Arc::new(soundtrack::Bus::new(&handle)?);

let mut music = Music::player("reef");          // the player's folder
music.attach(bus.clone());

let mut amb = Ambience::new();
amb.add_loop("reef", "assets/amb/surf.ogg", 0.7);
amb.add_loop("trench", "assets/amb/drone.ogg", 0.5);
amb.attach(bus.clone());
amb.set_tag("reef");

let mut sfx = Sfx::new();
sfx.load("pickup", "assets/sfx/pickup.wav", SfxSpec::default())?;
sfx.attach(bus.clone());

// Once a frame:
sfx.play_at("pickup", screen_x / screen_w);
music.duck(sfx.duck_level());
music.update(dt);
amb.update(dt);
sfx.update(dt);
```

The module re-exports `rodio`, `Bus` and `Lane` from the engine. A game names warp_sdk::soundtrack::rodio and adds no rodio line of its own, because one copy of rodio keeps one Sink type in the build. The re-export and each `attach` call exist only with the `audio` feature on a native target. [[src:warp_sdk/src/soundtrack.rs|line to Cargo.toml. One copy of rodio keeps one `Sink` type in the build.]]

## Device and tests

Each type is plain logic first. `attach` gives it an Arc<Bus>, and only then does it open rodio sinks. Without `attach`, every call still runs and reports gains, order and voices, so tests need no sound device. `Sfx::add` adds an effect with no audio data for the same reason. [[src:warp_sdk/src/soundtrack.rs|then does it open rodio sinks. Without `attach`, every call still runs and]]

## Music

### Finding tracks

`player_folders` gives the folders in order of use. The first is a per-game `music` folder under the app data directory, which this call creates so that the player can find it. The second is the OS music folder: `%USERPROFILE%\Music` on Windows, `$XDG_MUSIC_DIR` or `~/Music` on Linux, `~/Music` on macOS. `default_folder` picks the first folder that holds a playable track. When none does, the result is the empty game folder, so music is off until the player adds files. [[src:warp_sdk/src/soundtrack.rs|The first of [`player_folders`] that holds a playable track.]]

`scan_folder` returns every playable file, sorted by path. The walk goes down at most four folders and keeps at most 4000 tracks, so a wrong root costs bounded work. It reads folder entries only and opens no file. A folder that cannot be read gives an empty list. `MUSIC_EXTS` lists the decodable extensions, `mp3`, `ogg`, `flac` and `wav`, and `is_playable` ignores case. A file with a correct extension that fails to decode is skipped when it comes up. One pass over the list is the limit, so a folder of broken files stops instead of looping. [[src:warp_sdk/src/soundtrack.rs|so a folder of broken files stops instead of looping.]]

### Settings

`MusicSettings` belongs in the game's settings screen. `Music::with_settings` starts from saved values, and `Music::player` uses the defaults.

| Field | Default | Meaning |
|---|---|---|
| `enabled` | true | False turns music off and keeps the other settings |
| `folder` | None | The folder the player chose. None uses `default_folder` |
| `order` | Order::Shuffle | Order::Sequential or Order::Shuffle |
| `crossfade` | 4.0 | Seconds between two tracks. 0 cuts |
| `volume` | 0.5 | Music volume |
| `duck_depth` | 0.5 | How much a loud effect lowers the music |
| `seed` | None | Shuffle seed. None takes a seed from the clock |

### Playback

`Music::update` runs once a frame. It starts the first track, moves the crossfade and the duck, and goes to the next track before the current one ends. The next track starts `crossfade` seconds before the end when the decoder knows the length. Otherwise the change comes when the sink drains. `Music::next` crossfades at once. `Music::pause` and `Music::resume` hold the place. `Music::set_folder` rescans when the player picks a folder, and clears any license note. `Music::is_off` and `Music::current` report the state.

Shuffle makes a new order on each pass with `shuffle_order`, and a new pass does not play the same track twice in a row. `crossfade_gains` is constant power: the squares of the two gains sum to 1 at every point, so the loudness does not drop in the middle of the fade. [[src:warp_sdk/src/soundtrack.rs|A new shuffle must not play the same track twice in a row.]]

### Ducking

`Music::duck` lowers the music under loud effects. The usual input is `Sfx::duck_level`, given once a frame. The gain is `volume * (1 - duck_depth * duck)`. The duck comes down over 0.08 s, so a hit is not late, and rises over 0.8 s, so the music does not pump. These are time constants of an exponential approach. [[src:warp_sdk/src/soundtrack.rs|Seconds for the duck to come back up. Long, so the music does not pump.]]

## Ambience

`Ambience` holds looped layers by tag, for example one tag per biome. A tag can have more than one layer, for example surf and gulls under "beach". `Ambience::set_tag` crossfades from the layers of the old tag to the layers of the new tag, and an unknown tag fades all layers out. `Ambience::clear_tag` does that too. The crossfade defaults to 3 seconds. A layer opens its sink when it starts to fade in and closes it at silence, so only audible layers hold a sink. `Ambience::gain` reports the current level of one tag. Ambience goes to the `Sfx` lane of the bus.

## Sound effects

`Sfx::load` reads a file once. `Sfx::add_bytes` takes encoded bytes. `Sfx::play` plays at the center, and `Sfx::play_at` pans from `screen_x`, where 0 is the left edge and 1 the right. Both return a `Shot` with the values chosen, or None when the name is unknown, the effect is in its cooldown, or all voices are busy with effects of higher priority.

| `SfxSpec` field | Default | Meaning |
|---|---|---|
| `volume` | 1.0 | Base volume |
| `volume_jitter` | 0.1 | Random volume change, as a fraction |
| `pitch_jitter` | 0.05 | Random speed change, as a fraction |
| `cooldown` | 0.05 | Seconds before the same effect plays again |
| `priority` | 1 | Which voice survives a full table |
| `length` | 1.0 | Seconds that a voice holds its place |
| `ducks_music` | false | The effect lowers the music while it plays |

`Sfx` has 16 voices by default in Sfx::max_voices. A full voice table drops the voice of lowest priority, oldest first, for a voice of equal or higher priority. Sfx::stereo_width, 0.8 by default, limits how far the screen edge pans, which keeps some sound in both ears. `pan_gains` is constant power: the center gives 0.707 on each side. `Sfx::seed` fixes the jitter for a test or a replay. [[src:warp_sdk/src/soundtrack.rs|A full voice table drops the voice of lowest priority for a voice of]]

`Sfx::update` moves the effect clock and frees ended voices. It must run each frame, because cooldowns use this clock. `Sfx::duck_level` gives the volume of the loudest voice that ducks music.

## Interaction with other kits

The low-level bus and lanes belong to [[audio]]. A biome name from [[world-biome]] is the intended ambience tag. `MusicSettings` is meant for a settings screen such as [[front-settings]]. The kit calls neither: the game connects them.

## Limitations

- `Music::attach` sends music to the `Music` lane, and `Ambience` and `Sfx` both use the `Sfx` lane.
- Ducking is not automatic. The game must pass `Sfx::duck_level` to `Music::duck` each frame.
- With the `audio` feature off, or in a browser build, the types run as logic only and make no sound.
- `Music::bundled` keeps only files that pass `is_playable`, and does not test that they decode until they come up.

## History

The module was added to the SDK on 2026-10-29.
