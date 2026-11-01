---
title: Challenge kit
short: combat with damage kinds, statuses, telegraphed attacks and a wave director
category: Game systems
order: 20
module: challenge
example: challenge
see: juice, teach, economy, quest, metaprog, hud
---
**Challenge kit** is the combat simulation of the SCRAP SDK: damage kinds, status effects, tools, enemies that warn before they hit, and a director that sets the pace of waves. It lives in the `challenge` module of `warp_sdk`. Each enemy resists some damage kinds and is weak to others, so the player must choose a tool and not rely on one general attack. The kit draws nothing: the game reads its state and an event list and draws what it wants.

## Design

The stated premise of the module is that "a threat that one generic push removes is not a threat". Three mechanisms follow from it. Resistances make the choice of tool matter. Telegraphs make an attack readable, so the player can move before the damage. Morale lets a beaten enemy run away, which is how a colony gets "driven off" without a kill. [[src:warp_sdk/src/challenge.rs|A threat that one generic push removes is not a threat.]]

All logic is pure and deterministic. The same seed and the same inputs give the same events, which is why the example can drive the whole fight from tests with no window. Randomness comes from `Rng`, a small seeded SplitMix64 source that gives the same numbers on every machine. [[src:warp_sdk/src/challenge.rs|All logic is pure and deterministic]]

The module header lists four rules that the kit keeps:

- No attack does damage before its telegraph ends. The telegraph is never shorter than `MIN_TELEGRAPH` (0.25 s), also at the highest difficulty.
- A resisted kind does less damage than a neutral kind, and a weak kind does more. `Effect` tells the game which, so it can show it.
- The director never spawns inside the view rectangle it gets.
- Statuses expire. Burn stacks, and a stun gives a short guard after it ends.

## Usage

A game makes one `Arena` and one `Player`. Each frame it asks the loadout for a shot, gives the shot to the arena, then steps the arena and reads the events. `Arena::step` needs the current view, because the director uses it to keep spawns out of sight, and a `progress` value in `0.0..=1.0` that drives escalation.

```rust
use warp_sdk::challenge::*;
use warp_sdk::ultraviolet::Vec2;

// Once, in `new`:
let roster = vec![Profile::gloom(), Profile::shellback()];
let mut arena = Arena::new(7, roster, DirectorConfig::default());
let mut player = Player::new(Vec2::zero(), 100.0)
    .with_tool(Tool::dart())
    .with_tool(Tool::flare())
    .with_tool(Tool::sonic_pulse());

// Each frame, in `render`:
if let Some(shot) = player.loadout.trigger(fire_held, dt, player.pos, aim, &mut arena.rng) {
    arena.fire(&shot);
}
let view = Rect::centered(player.pos, Vec2::new(16.0, 9.0));
for e in arena.step(dt, &mut player, progress, view) {
    // Draw a ring for Event::Telegraph, flash for Event::Hit, and so on.
}
```

The player is the game's own to move: the arena writes Player::vel when a hit pushes it, but the game integrates the position. The `challenge` example keeps all logic in a Sim type that takes plain controls, then draws enemies, telegraph cones, projectiles and blasts from the arena state. [[src:warp_sdk/examples/challenge.rs|all game logic is in `Sim::step`, which takes plain `Controls`.]]

Each part also works alone. A game can use `Health` and `Hit` with no arena, or resolve a `Shot` itself in place of `Arena::fire`.

## Damage

`DamageKind` has five built-in kinds, `Impact`, Energy, Heat, Pressure and Sonic, plus DamageKind::Custom for a kind that the game numbers. `Resists` holds one value per kind, clamped to `-2.0..=1.0`. The damage multiplier is `1 - resistance`. A value of 0 is neutral, 0.5 halves the damage, 1.0 is immune, and a negative value is a weakness.

| Builder | Resistance | Multiplier |
|---|---|---|
| `Resists::weak` | -0.75 | 1.75 |
| `Resists::strong` | 0.65 | 0.35 |
| `Resists::immune` | 1.0 | 0 |

`Health` holds hit points, flat armor, resistances and invulnerability frames. Damage is `amount * (1 - resistance) - max(armor - pierce, 0)`, never below zero. Armor comes off after the multiplier, so a small hit against heavy armor can deal nothing. After a hit that deals damage, the health ignores hits for `iframes` seconds. [[src:warp_sdk/src/challenge.rs|Damage = `amount * (1 - resistance) - max(armor - pierce, 0)`, never]]

`Health::apply` returns an `Outcome` with the damage dealt, the `Effect`, and flags for a kill or an ignored hit. `Health::preview` gives the damage with no state change. `Health::apply_tick` skips iframes, for burn and other ticks. `Effect` comes from the multiplier alone: Weak, Normal, Resisted or Immune. The source asks the game to show it: a weak hit flashes bright, a resisted hit shows a dull spark, an immune hit shows a shield. [[src:warp_sdk/src/challenge.rs|How well a hit worked. Show it: a weak hit flashes bright, a resisted]]

## Statuses

A `StatusApply` names a `StatusKind`, a time and a magnitude. `Statuses` holds the active list for one creature. A second application of the same kind combines by a `Stacking` rule.

| Kind | Effect | Default stacking |
|---|---|---|
| Stun | No movement and no attacks | Refresh |
| Slow | Speed times `1 - magnitude` | Refresh |
| Burn | Heat damage of `magnitude` per second per stack | `Intensify { max: 5 }` |
| Blind | Sight cut to a quarter | Refresh |
| Fear | Morale drops by `magnitude` per second | `Extend { cap: 8.0 }` |

`Statuses::tick` counts down and returns a `StatusTick` with the burn damage, as one heat hit, and the kinds that ended. Burn is a `Hit`, so a heat resistance reduces it. When a stun ends, the creature gets 1.5 s of stun guard, and a stun applied during the guard lasts a third of its time. [[src:warp_sdk/src/challenge.rs|Seconds left of stun guard. A stun during the guard lasts a third.]]

## Tools and the loadout

A `Tool` is plain data: a name, a `Delivery`, a kind, damage, and optional energy, ammo, charge, spread, knockback, status and armor pierce. Five constructors set the delivery: `Tool::projectile`, `Tool::beam`, `Tool::pulse`, `Tool::melee` and `Tool::deploy`. A `Deployable` is a mine, a turret or a lure that acts on its own.

| Preset | Delivery | Kind | Damage | Cooldown | Notes |
|---|---|---|---|---|---|
| `Tool::dart` | Projectile | Impact | 8 | 0.22 s | Speed 16, small spread |
| `Tool::flare` | Beam, range 7 | Energy | 26 | 0.9 s | 0.45 s charge, 18 energy, blinds |
| `Tool::sonic_pulse` | Pulse, radius 3.2 | Sonic | 10 | 1.6 s | 25 energy, push 7, fear |
| `Tool::water_push` | Pulse, radius 2.5 | Pressure | 1 | 0.6 s | Push 9 |
| `Tool::heat_cutter` | Melee, range 1.4 | Heat | 14 | 0.5 s | Burn |
| `Tool::mine` | Deploy | Pressure | 30 | 2 s | 4 rounds |
| `Tool::lure` | Deploy | Energy | 0 | 8 s | 30 energy, radius 6, life 6 s |
| `Tool::turret` | Deploy | Impact | 5 | 12 s | 40 energy, life 10 s |

Each tool has a list of `Tier` upgrades. `Tool::upgrade` reaches the next tier, and the multipliers of the tiers that are reached multiply together. `Tool::stats` gives the resulting `ToolStats`. Unless the game replaces the list, each tool gets `Tool::standard_tiers`: more damage, then faster, then one more projectile. [[src:warp_sdk/src/challenge.rs|Three tiers: more damage, then faster, then one more projectile.]]

A `Loadout` holds tool slots, a shared energy pool and switching. `Loadout::trigger` must run once per frame, also when the fire button is up, because it regenerates energy and counts down cooldowns. An instant tool fires while the button is held. A charge tool fires on release after a full charge, and a short release cancels. A switch cancels a charge and blocks firing for `switch_time`, 0.15 s by default. `Loadout::active` panics on an empty loadout. `Loadout::ready` and `Loadout::charge_fraction` index the same slot, so an empty loadout panics there too.

`Loadout::trigger` returns a `Shot` when the tool fires. `Arena::fire` resolves it. Beams, pulses and melee hit at once. Projectiles and deployables go into the world. The events of `fire` go to Arena::events, and the next `Arena::step` returns them once.

## Enemies

A `Profile` is an enemy type: its numbers, its `Attack`, how it hunts, what hurts it, and what it costs the director. `Profile::new` gives a plain creature that seeks and bites. Four presets show the intended match-ups:

| Preset | HP | Hunt | Weak to | Resists | Notes |
|---|---|---|---|---|---|
| `Profile::gloom` | 45 | Orbit | Energy | Pressure, Impact | Lunges. A push does not solve it, light does |
| `Profile::shellback` | 60 | Seek | Sonic, Heat | Energy | Armor 6, wide sweep, from progress 0.2 |
| `Profile::nipper` | 12 | Flock | Sonic | | Cheap, weak alone, a danger in a group |
| `Profile::lurker` | 35 | Ambush | Energy | Sonic | Hidden until near, from progress 0.4 |

### The phase machine

An `Enemy` runs a state machine with the phases in `Phase`. The attack path is always Hunt, Telegraph, `Attack`, Recover, and damage happens only on the move into `Attack`. The direction locks at the start of the telegraph, so the player can read it and step out of the cone. [[src:warp_sdk/src/challenge.rs|The attack path is always Hunt → Telegraph → Attack → Recover. Damage]]

`Enemy::think` runs one frame. An Idle or Patrol enemy that sees a goal moves to Notice, stops for Profile::notice seconds, then moves to Hunt. In Hunt, an enemy in reach with no attack cooldown starts a telegraph. Recover is slow and open, the window to punish. It then starts the attack cooldown.

`Steer` sets how an enemy moves while it hunts: Seek, Orbit, Ambush or Flock. The functions in `steer` each return a desired velocity, and steer::approach blends the current velocity toward it. A lure in sight wins over the player. `Enemy::hidden` is true for an ambusher that waits, so the game can leave it undrawn.

### Stagger and morale

`Enemy::take` applies a hit: health, status, push and morale. Knockback divides by Profile::mass, and an immune hit applies no status. A weakness hit during a telegraph stuns the enemy for Profile::stagger seconds and so cancels the attack. After the stun, the enemy returns to Hunt with at least half of its attack cooldown.

Morale is `0.0..=1.0`. A hit removes morale in proportion to the health it took, 2.5 times faster for a weakness hit (a factor of 1.5 against 0.6). Fear removes morale per second. A death within 5 units removes 0.15 from each nearby enemy. Morale regenerates up to Profile::courage when no fear is active. [[src:warp_sdk/src/challenge.rs|let shock = if out.effect == Effect::Weak { 1.5 } else { 0.6 };]]

Below Profile::flee_at, the enemy enters Retreat and runs at 1.2 times its speed, from any phase but Stunned. A retreat during a telegraph therefore also cancels the attack. The enemy returns to Hunt when morale recovers by 0.25 above `flee_at`, capped at `courage`. An enemy in retreat that leaves the director bounds, grown by 2 units, is removed. Event::Fled reports it, and Arena::routs counts it as driven off. [[src:warp_sdk/src/challenge.rs|A routed enemy left the bounds and is gone. It counts as driven off.]]

## The director

The `Director` decides when waves come and what they hold. It alternates between two `Pace` states, Rest and Wave. A wave has a budget. Each `spawn_every` seconds the director picks a random roster entry that is unlocked by `min_progress` and affordable, and pays its Profile::cost. A wave ends when the budget cannot buy the cheapest entry and no enemy is alive. A rest follows.

| `DirectorConfig` field | Default | Meaning |
|---|---|---|
| `base_budget` | 3.0 | Budget of the first wave at progress 0 |
| `budget_per_progress` | 9.0 | Budget added at progress 1 |
| `budget_per_wave` | 1.0 | Budget added per wave |
| `rest` | 10.0 | Seconds of rest at progress 0 |
| `rest_late` | 5.0 | Seconds of rest at progress 1 |
| `spawn_every` | 0.8 | Seconds between two spawns in a wave |
| `max_alive` | 12 | The most enemies alive at once |
| `view_margin` | 1.0 | Distance outside the view that a spawn keeps |
| `bounds` | -20..20 by -12..12 | Where spawns can go |
| `first_rest` | 3.0 | Seconds before the first wave |

`Difficulty::at` turns progress and the wave number into multipliers that the arena applies at spawn. At progress 1 the health multiplier gains 0.8, damage gains 0.5, speed gains 0.2, and the telegraph multiplier loses 0.3. Each wave after the first adds a little more health and damage and shortens the telegraph a little. The telegraph multiplier never drops below 0.6, and `Enemy::telegraph_secs` keeps the result at or above `MIN_TELEGRAPH`. [[src:warp_sdk/src/challenge.rs|telegraph: (1.0 - 0.3 * p - 0.01 * w).max(0.6),]]

A spawn point is a random point in `bounds` outside the view grown by `view_margin`. The director tries 24 points, then the bounds corner farthest from the view. When the view covers every corner too, no spawn happens and the budget stays. [[src:warp_sdk/src/challenge.rs|A point in the bounds and outside `view` grown by the margin. Tries]]

The director's spawns start in Hunt, because a wave is an attack. An ambusher still waits hidden. `Arena::spawn` places an enemy by hand; that enemy starts Idle and wanders near its position until it sees the player.

## Events

`Arena::step` returns the frame's `Event` list. The game shows and sounds these and changes no kit state.

| Group | Variants |
|---|---|
| Combat | `Hit`, Died, StatusOn, StatusOff, Fired, Blast |
| Enemy warning | Telegraph, Strike (with `landed`) |
| Morale | Routed, Fled |
| Pace | Spawned, WaveStarted, WaveCleared, RestStarted |

Event::Telegraph carries the position, direction, reach, arc and seconds, which is all that is needed to draw the warning cone. `Enemy::telegraph_progress` gives the fill from 0 to 1 for a live enemy. `in_cone` is the test that the arena uses for strikes and melee.

## Interaction with other kits

The arena keeps its own Arena::kills and Arena::routs counts. A game passes them, or the events, to [[metaprog]] counters and [[quest]] signals. The event list is the input for [[juice]] and the [[hud]], and the kit calls neither. `Rect` here is the kit's own world-unit rectangle, separate from any screen rectangle.

## Limitations

- The arena resolves only player projectiles against enemies. Team::Enemy exists, but `Arena::step` ignores those projectiles in its collision test, so an enemy attack is a cone and not a shot.
- A mine ignores the knockback of its tool. `Arena::fire` clears the push on a deployed hit, and a blast uses a fixed push of 6.
- Event::Died for the player comes only from a strike. A player killed by burn gets a `Hit` event and no Died, so a game should also check `Health::is_dead`.
- Difficulty scales health, damage, speed and the telegraph. It does not scale armor.
- `Arena::spawn` indexes the roster and panics on a bad `kind`.

## History

The module was added to the SDK on 2026-10-29.
