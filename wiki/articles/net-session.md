---
title: Network sessions
short: host, guest and role holder, with seats, channels, blobs, chat and reconnect
category: Networking
order: 20
module: net::session
example: pong_link
see: net, net-invite, net-transports, net-discover
---
**Network sessions** are the top layer of SCRAP's networking: the host and guest objects that run the handshake, hold seats, carry application channels and blobs, and survive a dropped link. They live in `warp_sdk::net::session`, re-exported from the `warp_net` crate. A session is one host and a set of guests, on any transport that gives a `FrameIo`. The session layer does not know which transport it runs on.

## What a session does

- **Join.** A SPAKE2 handshake on the join code and the build seals every frame after connect. Then comes a Hello message, a Welcome message, and a seat with a random seat token.
- **Channels.** The application sends `(channel, bytes)` reliably and in order, or latest-wins per channel and key.
- **Blobs.** A guest asks for a named blob, and the host deflates it and sends it in chunks.
- **Liveness and reconnect.** Both ends send at least once a second. A silent link is interrupted, the host holds the seat, and the guest redials.
- **Guards.** The join-code lockout, kick and ban by source, rate limits, a frame cap, and the guest filter.
- **Chat.** A relay with the seat and name from the host's record of the link.
- **The last-session record.** Data that the application may store, to rejoin after a restart.

[[src:warp_net/src/session/mod.rs|WHAT A SESSION DOES]]

## Objects, not globals

`Host` and `Guest` are values that the application holds, and clones share one host or one link. One process may run many of them, which is how the tests run a host and guests together. The Stella Nova code that this came from kept the role in a process global. `Session` is an optional holder for one role at a time: off, host, a guest, or a dial in progress. [[src:warp_net/src/session/dial.rs|The Stella Nova source kept the role in a process global (SESSION). A]]

Each link has two threads. Each new link has a handshake thread, each `Host` has one housekeeping thread, and each `Guest` has a keepalive thread and at most one reconnect thread. The application polls events from any thread. `Host` and `Guest` hide the threads, and neither `Host::send` nor `Guest::send` blocks.

## The host

`Host::new` starts a host with a `Domain`, its name in the roster, a build string, the join code and a `HostConfig`. It fails only when the housekeeping thread does not start. The host has no transport of its own. The game gives it each accepted transport with `Host::accept_io`. The `from` label also names the source for the lockout and the ban. A TCP "ip:port" label counts per IP, and a P2P label from `peer_label` counts per node. [[src:warp_net/src/session/guard.rs|The key that limits count per source: the IP of a TCP peer ("ip:port"]]

`Host::stop` ends the session. Every guest gets a goodbye first, so it ends at once and does not try to reconnect. The housekeeping thread and the links hold the host until then. [[src:warp_net/src/session/host.rs|Close every guest and every transport in the handshake. Every guest]]

### HostConfig

| Field | Default | Meaning |
|---|---|---|
| `hello_timeout` | 5 s | The longest handshake and Hello |
| `idle_timeout` | `interrupt_after` (4 s) | A welcomed guest silent this long is interrupted |
| `blob_period` | 30 s | One blob request per guest per this time |
| `seat_hold` | 60 s | How long an interrupted guest's seat is held |
| `keepalive` | 1 s | The roster keepalive period |
| `trust_loopback` | true | A loopback guest is not a source for the kick ban or the blob source limit |
| `max_players` | 4 | The seats, the host included: 2 to `MAX_SEATS` |
| `app_limit` | `ChannelLimit::DEFAULT` | The shared rate of application channels |
| `channel_limits` | empty | Channels with a limit of their own |

`MAX_SEATS` is 64. HostConfig::default takes the timers from the environment through `Timers::from_env`. `HostConfig::with_timers` takes them from the caller, which is what the tests use.

### Seats

Seat 0 is always the host. A transport gets a temporary id at the end of the handshake, and its Hello decides the real seat. A fresh guest takes a free seat and a new random token. A guest that sends the token of a held seat gets that seat back, with the same id and name. A transport in the handshake holds no seat, so a peer that does not know the code cannot keep a guest out. [[src:warp_net/src/session/host.rs|One transport in the handshake. It holds no seat: a transport that]]

- A welcomed guest whose link closes without a goodbye raises Event::GuestInterrupted. Its seat is held for `seat_hold`, then Event::GuestLeft fires with LeaveReason::TimedOut.
- A guest that sends a goodbye frees the seat at once. Its token stays valid for `seat_hold`, so a rejoin gets the same id while that id is free.
- `Host::kick` sends a goodbye with the kicked reason, and the token is refused for the rest of the session.

`Host::roster` lists the host and guests, with held seats. `Host::interrupted` lists held seats with the seconds left. `Host::seats_used` and `Host::handshakes` report the counts.

## The guest

`Guest::start` runs on a connected transport, a `JoinSpec`, and an optional `Dialer` that opens a new transport to the same host for a reconnect. With no dialer, a lost link ends the session. The handshake runs on a thread, so the call returns at once.

`JoinSpec::new` is a fresh join. `JoinSpec::rejoin_from` joins again from a `SessionRecord`. Its fields also carry a label for the status line, the `Via` transport for the record, and a `GuestConfig`.

| `GuestConfig` field | Default | Meaning |
|---|---|---|
| `handshake_timeout` | 5 s | The longest handshake, and the longest wait for Welcome on a redial |
| `interrupt_after` | 4 s | A link silent this long is interrupted |
| `give_up` | 60 s | The time before the guest ends with EndReason::HostLost |
| `backoff_base` | 1 s | The first reconnect wait |
| `keepalive` | 1 s | The keepalive period |

`LinkState` answers what the link is doing now, for a banner drawn each frame: Off, Hosting, Joining, Linked, Interrupted or Ended.

### Reconnect

A guest becomes interrupted when the link goes silent for `interrupt_after`, or closes with no goodbye. The host sends the roster each second, so a quiet host is a lost host. A driver thread redials after 1, 2, 4, 8, 8 and so on times `backoff_base`, as `backoff` computes. Each redial runs the full handshake and sends the seat token. The host gives back the same seat, and the guest pushes Event::Reconnected. The application must then resync its state with the host. [[src:warp_net/src/session/guest.rs|guest pushes Event::Reconnected: the application resyncs]]

After `give_up` the guest ends with EndReason::HostLost. A link that closes within 10 seconds of a redial's Welcome continues the last interrupted phase, so a host that sends Welcome and then closes cannot hold the guest for ever. A wrong code on a redial ends the guest, because it most likely means that the host restarted. `Guest::reconnect_now` starts the next attempt at once. [[src:warp_net/src/session/guest.rs|next Interrupted keeps the attempt count and the give-up time of the]]

`Guest::send` returns false while interrupted, and the send is dropped and counted, not queued. A game therefore reads the state again after reconnecting and does not rely on a replay.

### A malicious host

The guest does not trust the host either. It accepts one blob start for each request that it sent. A seat id at or over `MAX_SEATS` is refused. Names, chat lines and status text are cleaned and cut. A reconnect that gets another seat is refused. Roster events keep to 16 per second. Text from a peer passes through a filter that removes control, separator, bidi, tag and other invisible characters. [[src:warp_net/src/session/guest.rs|The guest does not trust the host. It accepts one BlobBegin for each]]

## Session: the role holder

`Session` holds one role, and clones share it. `Session::role` gives a `Role` of Off, `Host` or `Guest`. A guest role is either a `Guest` value or a dial, a join whose resolve and connect run on a worker thread, so DNS and the connect timeout do not stop a render thread.

| Call | Effect |
|---|---|
| `Session::host` | Ends the role before, and holds the host |
| `Session::join_tcp` | Joins an address over TCP |
| `Session::join_invite` | Joins from a pasted invite |
| `Session::join_dialed` | Joins with a connect closure that the caller gives |
| `Session::join_dialed_after` | Starts a fallback in place of a watched dial |
| `Session::leave` | Ends the role |

`Session::link_state` and `Session::status_line` report for all roles. `Session::host_handle`, `Session::guest` and `Session::current_dial` give the value inside.

A join or a leave ends the role before it. A dial that connects after it stopped being the role drops its link. A fallback replaces the dial it watched only while that dial is still the role, with the check and the change under one lock, so a leave or a newer join wins, and the fallback returns `DIAL_SUPERSEDED` and does not connect. [[src:warp_net/src/session/dial.rs|A join or a leave ends the role before it. A Dial worker that connects]]

### The invite join

`Session::join_invite` decodes the invite first, so a bad invite is an error on return, and the `JoinSpec` code is replaced by the code in the invite. A version 2 invite with a node id dials P2P first when the application gives a `P2p` endpoint. A watcher thread follows that dial, and when it failed and is still the role, TCP starts. A version 1 invite, or no endpoint, goes to TCP at once. The TCP connect tries each invite address in order, and moves on only after a connect failure, never after a handshake refusal, so a wrong code is never tried twice. [[src:warp_net/src/session/dial.rs|address in order, and goes to the next one only after a connect]]

`host_invite` builds the invite on the host side: the LAN address, a public address when one was found and it differs, the TCP port, the node id and the join code. If no LAN address is found, it writes `127.0.0.1`.

## Events

`Host::poll_events` and `Guest::poll_events` drain a queue of `Event` values. At most 65,536 wait. Past that, the oldest drops and `Host::events_dropped` rises, so an application that stops polling cannot grow the memory. `Host::history` and `Guest::history` read the newest 256 link events with no drain, and they exclude messages and blob traffic. [[src:warp_net/src/session/events.rs|Over that, the oldest event drops and the drop count rises, so an]]

| Seen by | Events |
|---|---|
| Host | GuestJoined, GuestInterrupted, GuestReturned, GuestLeft |
| Guest | Joined, HostInterrupted, Reconnecting, Reconnected, SessionEnded, PeerJoined, PeerLeft, BlobProgress, BlobDone, BlobFailed |
| Both | Message |

On the host, the `peer` of Event::Message is the seat of the sender, and the filter has passed it. On a guest, `peer` is 0. `EndReason` gives why a session ended for a guest: HostEnded, Kicked, Refused, HostLost, Left or Error.

## Sending

| Call | Delivery | Limit |
|---|---|---|
| `Host::send`, `Host::broadcast` | Reliable, in order | A guest with more than `send_queue_cap` bytes unsent is closed |
| `Host::send_latest`, `Host::broadcast_latest` | Latest-wins per channel and key | At most 256 keys wait per link |
| `Guest::send` | Reliable, in order | 64 KiB less 64 bytes per message |
| `Guest::send_latest` | Latest-wins per channel and key | The batch must fit the guest frame cap |

A latest-wins value can go out twice but never out of date. Each batch holds only the newest value of each key, and a key is always in the same batch. [[src:warp_net/src/session/mod.rs|value can go out twice, never out of date: a batch holds only the]]

## Guards

Only a guest that knows the join code passes the handshake, but the host still does not trust it. The guards are independent of what the application does. [[src:warp_net/src/session/host.rs|Only a guest that knows the join code passes the handshake, but the]]

- **Handshakes.** At most 16 transports wait in the handshake at one time, and at most 4 from one source. A transport must finish the handshake and send a valid Hello within `hello_timeout`.
- **Lockout.** Five failures in 60 s lock a source for 60 s. Thirty from all sources lock the host. A wrong build counts as a wrong code.
- **Frames.** A guest frame over 64 KiB closes the link before decode.
- **Rates.** A token bucket per guest and per class drops a flood. The default `ChannelLimit` is 60 messages a second with a burst of 240, room for a 60 Hz input stream. A guest over an application rate for 10 seconds is closed. Blob requests also take a token from a bucket per source, so a redial does not refill them.
- **The guest filter.** See below.
- **Kick.** `Host::kick` bans the seat token and the source for the rest of the session. A banned source gets no fresh seat, but its Hello can still bring the token of a live, held or recent seat, so another guest behind the same NAT IP keeps its seat across a redial.
- **Sends.** A guest that does not read for `send_queue_cap` bytes is closed by the next reliable send.

### The guest filter

`Host::set_filter` sets the application check on each guest message that passed the rate limits. It receives an `Inbound` and returns an `Admit`. Admit::Accept queues the message as an event, Admit::Drop drops it, and Admit::Kick closes the guest and refuses its token. The seat, the token and the name in `Inbound` come from the host's record of the link, never from the payload. The filter runs on the reader thread of the guest with no host lock held, so it may call the `Host`. With no filter, every message is accepted. [[src:warp_net/src/session/host.rs|Set the guest filter: the application check on each guest message]]

```rust
fn admit(m: &Inbound) -> Admit {
    match m.channel {
        CH_INPUT if m.data.len() == 1 && m.data[0] <= 2 => Admit::Accept,
        CH_INPUT => Admit::Kick,
        _ => Admit::Drop,
    }
}
```

## Blobs

A blob is one named byte string from the host to the guests that asked for it, deflated and cut in chunks of 1 MiB. The flow has four steps:

1. A guest calls `Guest::request_blob`.
2. The host's `Host::take_blob_request` returns the name, once per encode, while no encode runs.
3. The host calls `Host::deliver_blob` with the bytes, which deflates on a worker and sends to every guest that waits for that name. `Host::fail_blob` is the other ending, and the caller must use one of the two.
4. The guest gets Event::BlobProgress per chunk, then Event::BlobDone or Event::BlobFailed.

One encode runs at a time and serves every guest that waits, so a flood of requests costs one. Each guest has one request per `blob_period`. The guest refuses a blob over 256 MiB, packed or inflated, grows its buffer as chunks arrive so that an announced size cannot force a large allocation, and checks the sizes and an FNV hash. [[src:warp_net/src/session/blob.rs|BlobBegin that it did not ask for. A blob over BLOB_LIMIT, packed or]]

## Chat

`Host::say` and `Guest::say` send a line. `Host::notice` adds a relay line. A guest sends only text. The host writes the seat and the name from its own record of the link, so a guest cannot forge them. A guest does not add its own line: the line shows when the host relays it back. Each `Host` and `Guest` keeps a log of 200 lines, read with `Host::chat_since` and `Guest::chat_since` and a cursor. A `ChatLine` has a `ChatKind`: `Player`, Joined, Left or Notice. The rate is 5 lines every 10 seconds. [[src:warp_net/src/session/chat.rs|the seat and the name from its own record of the link that sent the]]

## The last-session record

`Guest::record` gives a `SessionRecord` after the first Welcome: the host name, this guest's name, the `Via` transport, the join code, the seat token, and the time the session was last live. `warp_net` keeps it in memory only, and the application decides where to store it. `SessionRecord::encode` and `SessionRecord::decode` give a plain text body. Kicked or Refused forgets the record. HostLost, HostEnded and Left keep it, because those are what a person retries. The code and the token are secrets of the session and must not go to a log. [[src:warp_net/src/session/record.rs|code and the token are secrets of the session. Do not write them to a]]

## Timers

`INTERRUPT_AFTER` is 4 s, and `SEAT_HOLD` and `GIVE_UP` are 60 s. `Timers::from_env` reads WARP_NET_INTERRUPT_S, WARP_NET_HOLD_S and WARP_NET_GIVE_UP_S in seconds, once per process, so a test or a lab can shorten them with no code change. `timers_from` does the same with a lookup that the caller gives. A missing, bad or non-positive value keeps the default. [[src:warp_net/src/session/mod.rs|WARP_NET_HOLD_S and WARP_NET_GIVE_UP_S, in seconds. A missing, bad or]]

## Byte counts

Each link counts the sealed wire bytes that it writes, per class. `HostConfig` and `JoinSpec` carry the setup in a `counting` field, and `Host::counters` and `Guest::counters` read the counts. Session messages, blobs and each application channel can count separately. A latest-wins frame that a newer frame replaced is never written, so it is not counted.

## Limitations

- The host is a single point of failure. A guest that loses the host for `give_up` ends, and no guest takes over.
- A wrong build looks like a wrong code to the guest, because both fail at the same step.
- `Host::stop` must be called. The housekeeping thread and the links hold the host until then.
- The counting types are not in the `warp_sdk::net` surface, so a game cannot name them through that module.
