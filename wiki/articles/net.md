---
title: Networking
short: secure host and guest sessions with no server that the developer runs
category: Networking
order: 10
module: net
example: pong_link
see: net-session, net-invite, net-transports, net-discover
---
**Networking** in the SCRAP SDK is the `warp_sdk::net` module, a set of secure links that let two or more copies of one game share a session with no server that the developer runs. It is a curated view of the `warp_net` crate, behind the `net` feature. One peer hosts and holds the canonical state, and the other peers join it as guests. `warp_net` carries the bytes, keeps them secret, and keeps the link alive. The game decides what the state is and what a guest may send.

## Roles

A session has one host and any number of guests up to its seat limit. The host holds the canonical state of the application. A guest sends its input, and the host sends the state back. The host still does not trust a guest, and it checks each guest message before it changes the state. [[src:warp_net/src/lib.rs|canonical state. The other peers join it as guests. The application]]

The `warp_net` crate is built in layers, from the bottom up:

| Layer | Holds | In the SDK surface |
|---|---|---|
| wire | Frames on a transport, and the link threads | `FrameIo` only |
| crypto | The SPAKE2 handshake and the frame seal | `Domain` only |
| transport | TCP, P2P and message-sink links, each giving a `FrameIo` | [[net-transports]] |
| invite | One pasted string | [[net-invite]] |
| discover | Peers on the same LAN | [[net-discover]] |
| session | Host and guest | [[net-session]] |

The code came from the LINK multiplayer of Stella Nova, with each game type taken out. Generic application channels, a named blob transfer and a guest filter took the place of the game messages. [[src:warp_net/src/lib.rs|The code came from the LINK multiplayer of Stella Nova]]

## Turning it on

The `net` feature is off by default. The P2P transport pulls in iroh, tokio and a QUIC stack, and a game with no network play should not compile them. A game that wants it writes `features = ["net"]` on its `warp_sdk` dependency line. [[src:warp_sdk/API.md|The feature is off by default. The P2P transport pulls iroh, tokio and a]]

Under `warp_net`, the `p2p` feature is on by default and compiles iroh on desktop targets. Without it, the P2P types still exist, but `P2p::bind` returns an error and `available` is false, so a call site needs no `cfg`. The browser build gets random bytes for the handshake through the `getrandom` crate with its `js` feature.

## Usage

The sample is from the SDK's API notes, and `pong_link` is the worked example. A host needs a `Domain`, a build string and a join code. A P2P bind blocks, so it belongs on a worker.

```rust
use warp_sdk::net::invite::{self, InviteFormat};
use warp_sdk::net::p2p::{P2p, P2pConfig};
use warp_sdk::net::session::{host_invite, Admit, Host, HostConfig, JoinSpec, Session};
use warp_sdk::net::tcp::Listener;
use warp_sdk::net::Domain;

const FORMAT: InviteFormat = InviteFormat::new("MG", &["mygame://"], 47490);
const ALPN: &[u8] = b"my-game/1";

// Host (on a worker: P2p::bind blocks). The `?` stands for real error handling.
let code = invite::new_join_code();
let host = Host::new(Domain::new("my-game"), "Ana", "build-7", &code, HostConfig::default())?;
host.set_filter(|m| if m.data.len() <= 16 { Admit::Accept } else { Admit::Kick });
let ep = P2p::bind(P2pConfig::new(ALPN))?;
ep.set_accepting(true);
let tcp = Listener::bind(([0, 0, 0, 0], FORMAT.default_port).into())?;
// Two threads: ep.accept_timeout(..) and tcp.try_accept(), each into host.accept_io(io, label).
let text = host_invite(&FORMAT, tcp.local_addr().port(), Some(ep.node_id()), &code, None)?;

// Guest.
let s = Session::new();
let guest_ep = P2p::bind(P2pConfig::new(ALPN)).ok();
s.join_invite(&FORMAT, &pasted, JoinSpec::new(Domain::new("my-game"), "Bo", "build-7", ""), guest_ep)?;
```

The host has no transport of its own. The game accepts each transport and hands it to `Host::accept_io`, which runs the handshake. The join is a pasted invite: `Session::join_invite` dials the node id over P2P first, and connects over TCP to the LAN address when that dial fails. It returns at once, and the game polls `Session::link_state`.

Each frame the host reads `Host::poll_events`, changes the state, and sends it with `Host::broadcast_latest`. A guest sends its input and reads the state from its own `Guest::poll_events`.

## Channels

Two channel kinds carry application bytes on numbered channels. `Host::send`, `Host::broadcast` and `Guest::send` are reliable and in order. `Host::send_latest`, `Host::broadcast_latest` and `Guest::send_latest` keep only the newest value per channel and key, for state where an old value has no use, for example a cursor or a paddle. The channel numbers and the bytes are the game's. [[src:warp_net/src/session/mod.rs|(`send_latest`, `broadcast_latest`) for state that only its newest]]

`pong_link` uses latest-wins both ways. The guest sends one byte of paddle input, and the host sends the whole court as 24 bytes. Because a latest-wins value can be replaced, the guest repeats its input every 250 ms with no change, so a lost moment of quiet costs no more than that. [[src:warp_sdk/examples/pong_link.rs|The guest sends its input again after this long with no change, so a]]

## Security model

### The handshake

A join code has about 40 bits. A key exchange that sent a hash of the code, or that let a listener test a guess offline, would give up the code in minutes. SPAKE2 is a password-authenticated key exchange: each run lets the peer test one guess, and a listener tests none. The code never crosses the wire. [[src:warp_net/src/crypto.rs|A join code has about 40 bits. A key exchange that sent a hash of the]]

The password is the normalized code, a newline and the build id, so a wrong code and another build fail in the same way. HKDF-SHA256 on the SPAKE2 key gives one frame key per direction and one tag per side. The guest shows its tag first, and the host checks it before it sends any byte that depends on the key, so a wrong guess gets only a refusal. [[src:warp_net/src/crypto.rs|The password is normalize_code(code), a newline and the build id. Thus]]

### Domain

`Domain` names the application in the handshake. The SPAKE2 identities are `<app>/guest` and `<app>/host`, and the HKDF salt is `<app>/v1`. The same code in two applications therefore gives two keys, and the handshake fails. `Domain::new` makes a domain with no old-peer hooks. Its two optional fields, `old_peer_reply` and `old_peer_reason`, let a game answer a peer from before the handshake existed, and a game with no old builds leaves them empty. [[src:warp_net/src/crypto.rs|the same code in two applications gives two keys, and the handshake]]

### The seal

After the handshake, ChaCha20-Poly1305 seals each frame. The nonce is 4 zero bytes and a little-endian `u64` counter, one counter per direction, from 0. The associated data is the ciphertext length. The opener expects the next counter, so a replayed, reordered, dropped or changed frame fails its tag, and the link closes. A counter at u64::MAX is refused, so a nonce never repeats. [[src:warp_net/src/crypto.rs|counter, so a replayed, reordered, dropped or changed frame fails the tag,]]

### Lockout

The host counts failed confirmations per source. Five in a minute lock that source out for a minute. Thirty from all sources lock the whole host, as a backstop against a guesser with many addresses. Details of the guards are in [[net-session#Guards|the session article]]. [[src:warp_net/src/session/guard.rs|Wrong join codes from all sources in `CODE_WINDOW` that close the door]]

### Guest messages are untrusted

A guest with the correct code can still send any bytes. `warp_net` limits the rate and the size of what a guest sends, but it does not know what the messages mean. The host must check each guest message before it changes the canonical state: clamp a paddle to the court, or refuse a move that is not legal. `pong_link` kicks a guest whose input is not one byte in `0..=2`, and then moves and clamps the paddle at its own speed, so even a valid input cannot teleport a paddle. [[src:warp_sdk/examples/pong_link.rs|channel. The host then moves the paddle at its own speed and clamps it]]

### What the source says it does not do

The crypto header states its limits directly. It is not an audited protocol implementation. Keys stay in memory after use, with no zeroize. There is no forward secrecy past one session key. A wrong build counts as a wrong code toward the lockout. An invite shows the host addresses to each person who has the text. [[src:warp_net/src/crypto.rs|This is not an audited protocol implementation. Keys stay in memory]]

## What the game owns

- The message types on its channels, and their encoding.
- The canonical state, on the host only.
- The check on each guest message.
- The meaning of a blob, for example a save file sent to a late joiner.
- The interface: where the invite shows, how a player pastes one, and what the game does when a peer leaves.

`warp_net` never reads the first four of these. `pong_link` also notes that both copies must agree on the application name, the build, the protocol name, the invite format and the channels, and that a change to the messages needs a new build string, so that an old copy is refused at the handshake. [[src:warp_sdk/examples/pong_link.rs|new BUILD, so that an old copy is refused at the handshake.]]

## What is left out on purpose

`warp_sdk::net` is a curated list, not a `pub use` of the crate. The `wire` module (frames and the link threads), `crypto` except `Domain` (the handshake and the seal), and the session protocol and guard internals stay behind, because the session runs them for the game. `FrameIo` is the one wire type in the surface, because it is the transport handle that the host gives to `Host::accept_io`. `FrameIo::tcp` wraps a stream with a little-endian `u32` length before each frame. [[src:warp_sdk/src/lib.rs|LEFT OUT ON PURPOSE: `wire` (frames and the link threads), `crypto`]]

## The iroh pin

`warp_net` pins `iroh` at `=0.34.1`, and the pin is deliberate. A game resolves iroh in its own lock file. wgpu 0.16 needs a web-sys feature that is gone after web-sys 0.3.72, while iroh 1.x needs web-sys 0.3.83 or later, and iroh 0.35 to 0.97 move wasm-bindgen past the CLI of the browser build. Peers must also run the same iroh line to connect, so a bump is a break with every older build. [[src:warp_net/Cargo.toml|THE iroh PIN IS DELIBERATE.]]

## History

The crate was added on 2026-10-29 as a series of commits: the scaffold, the frame layer, invites, LAN discovery, the handshake, the transports, the session layer, its integration tests, then the `pong_link` example.
