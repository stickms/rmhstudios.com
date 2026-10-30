# Balatro multiplayer (native P2P PvP)

> Not published: `docs/conf.py` excludes this file. `/balatro` is signed-in only
> and kept out of search, and the docs site is public. The single-player port it
> builds on is [`balatro-wasm.md`](balatro-wasm.md); feature parity with the
> reference multiplayer mod is tracked in [`balatro-mp-parity.md`](balatro-mp-parity.md).

**Status: skeleton (WS0, wave 0).** The frozen interfaces, test scaffolding and CI
exist. Sections marked _TODO (WSn)_ are written by that workstream as it lands.

Multiplayer adds PvP to `/balatro` without a game server. Players connect
peer-to-peer in a star around the lobby host. The site's socket hub only signals,
relays when no direct path forms, and keeps the seat and queue directory. The host's
TypeScript referees the match. Each player's Lua game reports events and applies
outcomes. The mod's code is never used: everything is reimplemented from specs, and
only its assets, UI design and localization strings are imported, with the owner's
permission.

## 1. Architecture

| Layer                | Where                                                  | Owner     |
| -------------------- | ------------------------------------------------------ | --------- |
| Signalling contract  | `lib/balatro/net/{events,limits}.ts`                   | WS0       |
| Hub handlers         | `server/socket-server/handlers/balatro-{p2p,queue}.ts` | WS1, WS12 |
| Shared P2P transport | `lib/shared/p2p/`                                      | WS1       |
| Domain types         | `lib/balatro/mp/types.ts`                              | WS0       |
| P2P wire catalogue   | `lib/balatro/mp/wire.ts`                               | WS0       |
| Lua↔JS mailbox       | `lib/balatro/mp/bridge-protocol.ts` · `bridge.ts`      | WS0 · WS3 |
| Referee, timers      | `lib/balatro/mp/{referee,timer,rulesets,setup}/`       | WS4       |
| Session runtime      | `lib/balatro/mp/{index,transport,lobby,match,…}.ts`    | WS5       |
| Lua MP pack          | `lib/balatro/lua/mp/rmh_mp/**`                         | WS6–WS13  |
| Generated protocol   | `lib/balatro/lua/mp/rmh_mp/protocol.lua`               | WS0 (gen) |
| MP assets, loc       | `data/balatro-mp/**`                                   | WS2       |

_TODO (WS1, WS3, WS5, WS6): topology, host migration, rejoin snapshots, lazy MP
pack and content isolation, as built._

## 2. Frozen interfaces

All four are zod schemas with types from `z.infer`. They use only `zod` and
relative imports, so the socket server's esbuild bundle can pull them in as they are.
`lib/balatro/mp/__tests__/contracts.test.ts` enforces this. Changing one is a plan
amendment.

- **Signalling** (`net/events.ts`): `BALATRO_C2S` / `BALATRO_S2C` are
  `{ event: schema }` maps. They have three derived forms:
  - `BALATRO_EVENTS`, the `{ event: { c2s, s2c } }` map for `bindEvents`;
  - `BALATRO_C2S_EVENTS`, the name map for the rate-limit coverage test;
  - the socket.io generics `BalatroClientToServer` / `BalatroServerToClient`.

  `zIceServers` is a local copy until WS1 re-exports it from `lib/shared/p2p/ice`.
  Relay frames are bytes capped at `BALATRO_RELAY_LIMITS.MAX_PACKET_BYTES`. The
  S2C schema also accepts an `ArrayBuffer`, which is what socket.io-client delivers.

- **Wire** (`mp/wire.ts`): the envelope is `{ v: 1, k, s, f?, to?, d }`. `WIRE_D`
  maps each kind to its data schema, and `WIRE_META` gives each kind's direction
  and host-only flag. The module has helpers to make, encode, decode and validate
  an envelope. Fragmentation is the transport's job. `outcome` carries the host
  sequence number as `d.hs`. `kick` is local-only.
- **Mailbox** (`mp/bridge-protocol.ts`): it holds the paths, the 64 KB line and
  256 KB batch limits, and the `L2J` / `J2L` schema maps. `parseLuaBatch`,
  `parseBridgeMessage` and `encodeJsLine` work on the NDJSON lines. Two rules
  cover Lua's quirks:
  - A nullable Lua→JS field may be absent, because a Lua table cannot hold nil.
  - A `d` of `[]` reads as `{}`.
- **Domain** (`mp/types.ts`): `LobbyState`, `LobbyOptions` (all camelCase), and
  `StartedMatch`, `ResolvedRuleset`. The game and referee types are `GameEvent`,
  `RefInput`, `RefMsg`, `RefOutput`, `RefCheckpoint` and `RefStep<S>`. WS4 defines
  `RefState`. The rest are `SetupView`, `HandResult`, `PlayerResult`, `SafeCard`,
  `ReplayEvent` and `ReplayBatch`.

Each file starts with the gaps in the plan's text that it resolved.

### Generated Lua protocol

`scripts/balatro/gen-lua-protocol.ts` lowers each bridge schema through
`z.toJSONSchema` into Lua descriptor tables. It then appends a validator, which
writes `rmh_mp/protocol.lua`. The file exports:

- `P.validate(dir, t, d)` and `P.known(dir, t)`;
- `P.L2J` / `P.J2L` type names and `P.ENUM` value lists;
- `P.PATHS`, `P.LIMITS` and `P.NULL` / `P.set_null` for JSON null.

The Lua validator checks types, required fields, enums, ranges, lengths (in code
points) and records. It skips regex patterns and zod refinements, which TypeScript
checks.

```bash
pnpm balatro:gen-protocol           # regenerate after editing bridge-protocol.ts or types.ts
pnpm balatro:gen-protocol --check   # CI freshness check (protocol-lua.test.ts asserts it too)
```

## 3. Tests

| Suite            | Command                 | What                                                                                                         |
| ---------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| Balatro          | `pnpm test:balatro`     | `lib/balatro/mp`, `lib/shared/p2p`, `server/socket-server/balatro`, `scripts/balatro`, plus the Lua L1 specs |
| Lua L1 only      | `pnpm test:balatro:lua` | `lua5.1 lib/balatro/lua/spec/runner.lua [--filter text] [files…]` (TAP output)                               |
| E2E (stub, WS14) | `pnpm test:balatro:e2e` | engine specs in love.wasm; multi-browser matches                                                             |
| Main (critical)  | `pnpm test`             | hub auth walk, rate-limit coverage, save-path safety, pack manifest                                          |

The Lua specs need **PUC Lua 5.1** (`apt-get install lua5.1`, or set `LUA51=`).
`lua-specs.test.ts` fails with an install hint without it and never skips.

Lua specs live in `lib/balatro/lua/spec/*_spec.lua`. The runner provides
`describe` / `it` / `xit` / `before_each` / `after_each` and these matchers:

```lua
expect(v).eq(x)        -- also .ne / .near(x, eps) / .truthy() / .falsy() / .type(t)
expect(fn).error(s)
```

It also sets `package.path` (`lib/balatro/lua/?.lua;lib/balatro/lua/mp/?.lua`) and
`RMH_SPEC.{root,fixtures}`. Globals and modules a spec file adds are removed after
it runs. `spec/fake_g.lua` installs a vanilla-shaped `G` with:

- prototypes and pools sorted by `order`;
- the vanilla event manager rules;
- deterministic `pseudoseed`/`pseudorandom` stand-ins.

Shared fixtures live in `lib/balatro/mp/__fixtures__/*.json`.
`contracts.test.ts` (TypeScript) and `spec/protocol_spec.lua` (Lua) read the same
files. In them, `{ "$ref": "name" }` points into `types.json` → `objects`, and
`tsOnly` marks an invalid case that only TypeScript can reject.

CI: `.github/workflows/balatro-mp-tests.yml`. It is path-filtered and installs
`lua5.1`. Its steps:

1. Protocol freshness.
2. `test:balatro`.
3. `test:tf2`, because the P2P primitives are shared.
4. Pack freshness, once WS2 adds `--check`.
5. The bundle budget, once WS14 adds the script.

The e2e job is a stub.

## 4. Atlas registry

`data/balatro-mp/atlases.json` maps an atlas key (`mp_<name>`) to an entry with
these fields:

| Field         | Meaning                                                              |
| ------------- | -------------------------------------------------------------------- |
| `file`        | PNG name under `1x/` and `2x/`; the 2x file is twice the 1x size     |
| `px`, `py`    | 1x sprite size                                                       |
| `kind`        | `card` (`Card.set_sprites` wrap), `animation` (blind chips) or `tag` |
| `frames`      | Frame count for `animation`; `null` otherwise                        |
| `placeholder` | Vanilla atlas to draw from until the file is in the pack             |

WS0 ships a stub (`"stub": true`) so that WS6 can build the sprite dispatch in
wave 1. WS2 replaces it with the full registry.

## 5. Deviations from the mod

_TODO (WS4–WS9): one line per deviation._ Plan decisions D-04 (the comeback bonus
arms only on a lives decrease), D-18 (SPEEDRUN emission rebuilt by the host) and
D-22 (`c_mp_eeeee`) start the list.

## 6. Operations

_TODO (WS1, WS2, WS14): hub limits and relay budgets, TURN configuration, pack
rebuilds at merge points, the bundle budget baseline._
