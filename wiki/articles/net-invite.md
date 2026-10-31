---
title: Network invites
short: one pasted string with the host addresses, port, node id and join code
category: Networking
order: 30
module: net::invite
example: pong_link
see: net, net-session, net-transports
---
**Network invites** are one-string join tokens: a single text that holds the host addresses, the port, the host P2P node id and the join code, which a guest pastes once. They live in `warp_sdk::net::invite`, re-exported from `warp_net`. The codec is pure data in and out. An invite spares the player from typing an address and a code, and a check detects a typo before any connection starts.

## Format of an invite

The application gives an `InviteFormat`: a tag, the URL schemes that also start an invite, and a default port. It usually holds one as a constant. Two applications with two tags do not read each other's invites. [[src:warp_net/src/invite.rs|applications with two tags do not read the invites of each other.]]

```rust
/// The invite text: "PL-..." or "ponglink://...", TCP port 47490.
const FORMAT: InviteFormat = InviteFormat::new("PL", &["ponglink://"], 47490);
```

The text is the tag, then Crockford base32 symbols in groups of four. The symbols are `0-9` and `A-Z` with no I, L, O or U. A reader takes O as 0, and I or L as 1. Case, spaces, dashes and line breaks have no effect. With the tag SN and the default port 47474, `SN-230A-G08Q-DFNS-BEX9-JQ` is 192.168.1.23, the default port and the code `K7QM-3XRP`. [[src:warp_net/src/invite.rs|"SN" and the default port 47474, "SN-230A-G08Q-DFNS-BEX9-JQ" is]]

The payload is a bit stream, high bit first:

| Field | Bits | Notes |
|---|---|---|
| version | 4 | 1, or 2 when the invite has a node id |
| flags | 4 | Port present, two addresses, IPv6 for each address |
| node | 256 | Version 2 only: the Ed25519 public key of the P2P endpoint |
| address A | 32 or 128 | The LAN address |
| address B | 32 or 128 | When flagged: the public address |
| port | 16 | When flagged. Otherwise the format's default port |
| code | 40 | The join code |
| check | 10 | CRC-10 of all bits before it |

The version and the flags give the length, so a reader takes the correct count of symbols from a longer paste. A version 1 LAN invite on the default port is 18 symbols. A version 2 LAN invite on the default port is 70 symbols, and 76 with a public IPv4 address. [[src:warp_net/src/invite.rs|A version 2 LAN invite on the default port is 70 symbols, and 76 with a]]

## Using the codec

`encode` writes an `Invite`, as version 2 when Invite::node is set and version 1 otherwise. `decode` finds an invite anywhere in a text, because a paste may hold more. Each tag at the start of a word and each scheme at any position is a candidate, and the first candidate that decodes with a good check wins. The integration test decodes an invite from the text `"Join me: ..."`. `Invite::socket_addrs` gives each address with the port, in invite order. [[src:warp_net/src/invite.rs|Find and decode an invite anywhere in `text` (a paste may hold more).]]

A game rarely calls these directly. On the host, `host_invite` gathers the addresses and encodes. On a guest, `Session::join_invite` decodes and dials, and `pong_link` calls `decode` first only so that it can show an error before it starts a worker.

## One text, two routes

One version 2 text works in two places. On the host network the guest can connect over TCP to the LAN address. Over the internet a private LAN address gets no answer, so the guest dials the node id over P2P, and the TCP address is the fallback only. The order of the dials is session logic, not part of this module. [[src:warp_net/src/invite.rs|One version 2 text works in two places. On the host network the guest]]

## The check

CRC-10, with the ATM polynomial `0x233`, finds each error burst of 10 bits or fewer, at each stream length. It therefore finds each change of one symbol and each swap of two adjacent symbols, while the header stays the same. A header change also changes the length, and the check then fails by chance, about 1023 times in 1024. [[src:warp_net/src/invite.rs|A CRC-10 finds each error burst of 10 bits or fewer, at each stream]]

A typo gives InviteError::NotFound, and no handshake starts. So the host's join-code lockout counts no strike for it. The other errors come from `encode`: AddressCount for no address or more than two, BadCode, and BadTag.

## The join code

A join code is `XXXX-XXXX`: 8 symbols of `CODE_ALPHABET`, 40 bits. The alphabet has 32 symbols and leaves out 0, O, 1 and I, so a code read aloud or off a screen is not mistyped. `new_join_code` makes one. Its bits come from the standard library's RandomState, which takes its keys from the OS random source, mixed with the clock and the process id. [[src:warp_net/src/invite.rs|RandomState, which takes its keys from the OS random source, mixed with]]

The code is the SPAKE2 password of the [[net#Security model|handshake]], so each guess costs one handshake, and the host lockout limits the guesses per source. `code_bits` and `code_from_bits` convert between the text and the 40 bits. `code_bits` ignores case, spaces and dashes.

## Public address

`PublicAddress` finds the public IPv4 address of this machine with one STUN binding request. The application holds one value and clones it where it needs the address. `PublicAddress::discover` starts one background request, `PublicAddress::get` gives the result, and `PublicAddress::pending` is true while a request is in flight. The second STUN server gets a try only when the first fails. `host_invite` takes the value as its last argument and adds the address when it differs from the LAN address.

## Privacy

An invite shows the host IP address to each person who has the text, so a player should give one only to the players they want. The STUN server learns the address of the machine that asks. The request goes only when the application calls `PublicAddress::discover`, never at start. [[src:warp_net/src/invite.rs|goes only when the application calls PublicAddress::discover, never at]]

## Compatibility

The bit stream matches the Stella Nova invite. With the same tag, schemes and default port, the two codecs give the same text, and the tests hold texts that the Stella Nova codec made. A reader of version 1 refuses version 2. [[src:warp_net/src/invite.rs|The bit stream is the same as the Stella Nova invite]]
