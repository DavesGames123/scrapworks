---
title: Network transports
short: TCP, P2P over QUIC, and a message-sink adapter, each giving a FrameIo
category: Networking
order: 40
module: net::tcp, net::p2p, net::msg
example: pong_link
see: net, net-session, net-invite, net-discover
---
**Network transports** are the three carriers under a SCRAP session: TCP, direct P2P over QUIC, and a message-sink adapter for platform networks. They live in `warp_sdk::net::tcp`, `warp_sdk::net::p2p` and `warp_sdk::net::msg`, re-exported from `warp_net`. Each one gives a `FrameIo`, and the session layer runs the same handshake and seal on each. A game picks a transport by what the players can reach.

## The transport contract

A `FrameIo` moves whole frames and keeps their boundaries. It has three parts, so that the reader thread, the writer thread and the closers each own one: a sender, a receiver and a control. Every transport must refuse a frame that is empty or over the wire limit before it allocates, return an error from a receive after the timeout and promptly after close, and send one frame whole or fail. [[src:warp_net/src/wire.rs|A transport moves whole frames and keeps their boundaries. It has three]]

Security does not depend on the transport. The handshake and the seal run above it, so a relay carries only sealed frames. See [[net#Security model]].

## Choosing a transport

| Transport | Reaches | Needs |
|---|---|---|
| `net::tcp` | A LAN, or the internet with a forwarded port | An address and a port |
| `net::p2p` | The internet, through NAT. Native builds only | A node id, and the `p2p` feature |
| `net::msg` | A platform network, for example Steam | A `MsgSink` from the game |

## TCP

`tcp` makes a stream, and `FrameIo::tcp` frames it with a little-endian `u32` length.

`dial` connects with a timeout, and `CONNECT_TIMEOUT` is 6 seconds. It blocks, so only a worker thread should call it. On failure the error text is a hint that a player can act on. For example, a timeout at a private address, as `is_private_address` defines it, most likely means that the guest is not on the host's network. The text then says that the address works only on that network, and that a guest over the internet must join with the host's invite. On macOS a host-unreachable error points at the Local Network privacy switch. [[src:warp_net/src/transport/tcp.rs|(`is_private_address`) most likely means that the guest is not on the]]

`resolve` reads `host`, `host:port` or `[v6]:port` and uses a default port when none is given. It blocks for DNS when given a name. `dial_text` resolves and dials. `dialer` gives a `TcpDialer` closure that a guest uses to redial.

`Listener::bind` is non-blocking, and port 0 picks a free port. `Listener::try_accept` never blocks. A host thread polls it between its other work, so a stop flag ends the thread with no extra wake. [[src:warp_net/src/transport/tcp.rs|`Listener::bind` is non-blocking. The host thread polls `try_accept`]]

```rust
let listener = Listener::bind((bind_ip, FORMAT.default_port).into())
    .or_else(|_| Listener::bind((bind_ip, 0).into()))
    .map_err(|e| format!("Could not open a TCP port: {e}"))?;
let port = listener.local_addr().port();
let h = host.clone();
std::thread::spawn(move || {
    while !h.stopped() {
        match listener.try_accept() {
            Ok(Some((io, from))) => h.accept_io(io, &from.to_string()),
            _ => std::thread::sleep(Duration::from_millis(10)),
        }
    }
});
```

## P2P

`p2p` is a direct QUIC link built on iroh, with no port forward and no server that the developer runs. A guest dials the host by its node id, the Ed25519 public key of the host's endpoint. iroh finds the host through the n0 DNS discovery, punches a hole through both NATs, and uses a public n0 relay when no direct path works. One QUIC bi-stream then carries the frames, with the same length framing as TCP. [[src:warp_net/src/transport/p2p.rs|A guest dials the host by its node id: the Ed25519 public key of the]]

### The endpoint

A `P2p` is one bound endpoint, and a value and not a process global, so a process can hold more than one. `P2p::bind` takes a `P2pConfig` and blocks, so it belongs on a worker. The accept loop runs from the bind on, and refuses each connection until `P2p::set_accepting` turns it on. An accepted link goes to a queue of 16 that `P2p::accept` and `P2p::accept_timeout` take from, as a `P2pLink` with the frames, the peer's node id and a source label. `P2p::close` closes the endpoint and each link on it. [[src:warp_net/src/transport/p2p.rs|ALPN `cfg.alpn`, n0 DNS discovery and the default n0 relays. Its]]

`P2pConfig::new` makes an internet endpoint with a fresh key. The ALPN is the QUIC application protocol, and both peers must use the same one. `P2p::dial` dials a node id, with `DIAL_TIMEOUT` at 20 seconds. `ACCEPT_WAIT` is 15 seconds. `available` is true when the build has the transport.

```rust
let ep = P2p::bind(P2pConfig::new(ALPN))?;
ep.set_accepting(true);
let (h, ep2) = (host.clone(), ep.clone());
std::thread::spawn(move || {
    while !h.stopped() {
        if let Ok(link) = ep2.accept_timeout(Duration::from_millis(100)) {
            h.accept_io(link.io, &link.label);
        }
    }
});
```

### The node id

`KeySource` chooses the secret key, and so the node id.

| Variant | Effect |
|---|---|
| KeySource::File | Reads the key from a file, or makes one and writes it there |
| KeySource::Fresh | A new random key, so a new node id for each bind |
| KeySource::Secret | A key that the application keeps |

A key file lets a host keep one node id across restarts, so a rejoin still finds it. A launcher that starts the host and the guests from one executable must not share the file, or every child gets the node id of the host. `KeySource::resolve` reads or makes the key with no bind, so an application can know the node id before the bind ends and put it in an invite. [[src:warp_net/src/transport/p2p.rs|from one executable must not share the key file, or every child gets]]

`format_node` gives a short id for logs and the interface. Two short ids can match, so a short id must never serve as a key. `node_hex` and `parse_node` handle the full 64 hex digits. `peer_label` builds the source label with the full id in brackets, so the lockout and a kick ban key per peer and not per relay address.

### Local mode

`P2pConfig::local` binds 127.0.0.1 with the relay off and no discovery, so no packet goes to the internet. A guest in local mode must dial with the host's `P2p::direct_addr`, because no discovery finds the host. The integration test runs a host and a guest this way. [[src:warp_net/src/transport/p2p.rs|With `cfg.local`, the endpoint binds 127.0.0.1 (port 0) with the relay]]

### Status

`P2p::status` gives a `P2pStatus` as seen from a host: Local, Online when a home relay knows the endpoint, or Offline. `P2p::path_to` gives a `P2pPath` to one peer: Direct, Relay or Connecting. Both display as short text for a panel.

### Runtime and close

iroh is async and a frame link is blocking. One tokio runtime with two worker threads lives for the whole process, for all endpoints, and each blocking call uses Handle::block_on. A game must never call `P2p::bind`, `P2p::dial`, `P2p::close` or a method of a P2P `FrameIo` from a task on that runtime, because `block_on` inside the runtime panics or stops a worker. [[src:warp_net/src/transport/p2p.rs|inside the runtime panics or stops a worker.]]

A close first finishes the send stream and waits up to 1 second for the peer to acknowledge. A QUIC close abandons stream data that is not yet sent, so without the flush the last frame, such as a refusal or a goodbye with its reason, can be lost. TCP shutdown sends the queued bytes first, so TCP has no such step. `P2p::close` blocks until iroh ends, and `pong_link` runs it on a worker. [[src:warp_net/src/transport/p2p.rs|sent, so without the flush the last frame (a refusal, or a Bye]]

### Limits

iroh stays at `=0.34.1`, and all peers must run the iroh 0.34 line. See [[net#The iroh pin]]. The transport is native only: without the feature or on `wasm32`, `P2p::bind` returns an error, so a call site needs no `cfg`.

## Message sinks

`msg` is a `FrameIo` over a platform network that carries whole messages to a peer id. `warp_net` calls no platform SDK. The application implements `MsgSink`, whose `MsgSink::send` sends one message and returns a `Sent` value, and it calls `Registry::deliver` with each message that it receives. [[src:warp_net/src/transport/msg.rs|warp_net calls no platform SDK. The application gives a `MsgSink` that]]

A `Registry` holds one link per remote peer id, a `u64` such as a SteamID. `Registry::open` returns the `FrameIo` for one peer, or None when one is open already. `Registry::deliver` joins the parts and returns a `Delivery` of Routed or Unknown. `Registry::fail` closes one link, and `Registry::close_all` closes every link.

### Chunks

A platform can refuse a large message. Steam refuses a message over 512 KiB, and a frame can be larger, such as a 1 MiB blob. So each frame goes as one or more messages on one reliable, ordered channel, with a one-byte flag before each part that says whether more parts follow. The part size is 256 KiB by default, half the Steam limit, and `Registry::with_part` sets a smaller one. [[src:warp_net/src/transport/msg.rs|A platform can refuse a large message (Steam refuses a message over]]

The sink must send reliably and in order. Sent::Full means that the send buffer is full, and the transport waits and tries again, for up to 30 seconds before the link closes, so a 1 MiB blob does not fail on the buffer limit. Sent::Failed closes the link. The receive timeout measures silence and not the time of one frame: each part that arrives starts the wait again, as each TCP read does, so a slow blob does not count as a dead link. Bad framing closes that link. [[src:warp_net/src/transport/msg.rs|The timeout measures silence, not the time of one frame:]]

A host passes a platform label to `Host::accept_io` with the id as trailing digits in brackets, for example a SteamID, and the session then counts limits per id.

## History

The TCP, P2P and message-sink transports were added to `warp_net` in one commit on 2026-10-29. Later that day, a commit made the last P2P frame reach the peer before the QUIC close, and another gave the node id before the endpoint binds.
