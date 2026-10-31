---
title: LAN discovery
short: UDP beacons that let a guest list the hosts on its local network
category: Networking
order: 50
module: net::discover
see: net, net-session, net-invite, net-transports
---
**LAN discovery** is the Warp SDK's local host listing: a host announces its session by UDP broadcast, and a guest lists the hosts it hears. It lives in `warp_sdk::net::discover`, re-exported from `warp_net`. The application holds one `Discovery` value. A beacon never holds the join code, so discovery only helps a guest find an address.

## Usage

`DiscoveryConfig` sets four fields, and `Discovery::new` takes it.

| Field | Meaning |
|---|---|
| `magic` | The first four bytes of each datagram, so another application on the LAN is not heard |
| `port` | The UDP port of the beacon and the listener |
| `build` | The build string of this process, cut to 64 bytes |
| `proto` | The wire version of this process |

`DEFAULT_DISCOVERY_PORT` is 47475, for an application with no port of its own. The magic tag is how two applications on one LAN stay apart. [[src:warp_net/src/discover.rs|a four-byte magic tag of its own (two applications on one LAN do not]]

A host calls `Discovery::announce` with the game port, the seat count, an application payload, and a closure that gives the player count. A guest calls `Discovery::nearby` and shows the `Nearby` list. Nearby::addr is where to connect, `players` and `max` give the counts, and `build_ok` is false when the host runs another build or wire version. The guest still joins with the code, through `Session::join_tcp` or an invite.

`lan_address` gives the address that other machines on the LAN reach this one at. A UDP connect picks a route and sends nothing. `host_invite` uses it too. [[src:warp_net/src/discover.rs|The address other machines on the LAN reach this one at. A UDP]]

## The beacon

While a session is hosted, one beacon thread sends one UDP datagram per second to the discovery port. The targets are the LAN broadcast address `255.255.255.255`, the directed broadcast of the LAN address, and `127.0.0.1` for a second copy on this machine. A /24 is assumed for the directed broadcast, because the standard library cannot read the netmask. [[src:warp_net/src/discover.rs|the directed broadcast of the LAN address (a /24 is]]

The datagram holds the magic tag, a format version, the game port, the players now, the seats, the wire version, the build, a random session id and the application payload, up to 256 bytes. The payload can hold a host name, for example, and `warp_net` never reads it.

The thread reads the player count through the closure each period, and holds no lock while it calls the closure. `Discovery::announce` replaces a running beacon and returns the session id of the new one, or None in a wasm build. `Discovery::stop_announce` stops it at once, and so does dropping the `Discovery` value. `Discovery::announcing` reports whether one runs. [[src:warp_net/src/discover.rs|gives. The thread holds no lock of ours while it calls the closure.]]

## The listener

The first call of `Discovery::nearby` starts one listener thread on `0.0.0.0` at the discovery port. With no `nearby` call for 30 seconds, the thread stops, and the next call starts it again. A game therefore pays for listening only while its join screen polls. [[src:warp_net/src/discover.rs|With no nearby() call for this long, the listener thread stops.]]

The listener parses each datagram strictly. It must be at most 512 bytes, with the magic and the version, no trailing bytes, a nonzero port, at least one seat, players not above seats, a build of at most 64 bytes in UTF-8, and a payload of at most 256 bytes. [[src:warp_net/src/discover.rs|strictly (decode): at most MAX_DATAGRAM bytes, the magic and the]]

The table keys an entry by sender IP, port and session id, keeps at most 32 entries, and forgets an entry not heard for 3 seconds. A full table drops its oldest entry. `Discovery::nearby` lists newest first and skips the beacons that this `Discovery` value sent, so a host does not see itself.

## When the port is not available

The bind does not set SO_REUSEADDR. A second copy of the application on one machine therefore cannot listen, and macOS can refuse the port when Local Network access is off. A failed bind does not panic. `Discovery::nearby` gives an empty list and tries again after 5 seconds, and `Discovery::listen_error` gives the text for the interface. The log shows each new error one time. [[src:warp_net/src/discover.rs|The bind does not set SO_REUSEADDR. Thus a second copy of the]]

## Security

Anyone on the LAN can send a false beacon. A false entry can only point the guest at an address, and that address still needs the join code through SPAKE2, so the worst result is a failed join. A listener learns only the port, the counts, the build and the payload. [[src:warp_net/src/discover.rs|Anyone on the LAN can send a false beacon. A false entry can only point]]

The payload is not trusted, and the application must clean any text in it before it shows the text. The listener parses at most 200 datagrams per second and drops the rest unread, and the table cap limits the memory that a flood can use. [[src:warp_net/src/discover.rs|The payload is not trusted: the]]

## Limitations

- Discovery reaches only the broadcast domain of the LAN. An internet guest needs an [[net-invite|invite]].
- Only one listener can bind the port per machine.
- The directed broadcast assumes a /24, so a network with another mask relies on the limited broadcast.
- The announcement and the join code are separate. A guest that finds a host still needs the code.
