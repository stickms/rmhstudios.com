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

## 4. The MP pack: art, localization, glyphs

The mod's used PNGs and its 16 localization files are imported once, offline, by
`scripts/balatro/import-mp-assets.py --mod <checkout>` into `data/balatro-mp/`
(committed). The importer only copies data. It runs nothing from the mod at
runtime and copies none of its code.

| Path in `data/balatro-mp/` | What                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `1x/`, `2x/`               | the used sprite sheets, losslessly recompressed with oxipng once at import                              |
| `atlases.json`             | the atlas registry (below), written by the importer                                                     |
| `localization/<lang>.json` | the mod's 16 language tables, converted to JSON                                                         |
| `extra-strings.en-us.json` | our own strings (`rmh_mp_*` keys, LOC-02), hand-written; translations go in `extra-strings.<lang>.json` |
| `pack-budget.json`         | the size budgets the builder and the pack test enforce                                                  |
| `import-sources.json`      | provenance: the mod version and a SHA-256 for every source file                                         |

**Pruned (EX-20).** The importer drops `release_jokers`, `j_copycat`, `stickers`,
`pvp_title_base_*`, `sticker_nemesis`, `alt_t_*`, `alt_mp_stakes` and `modicon`.
It fails on any mod PNG it has not classified. Two sheets are rebuilt:

- `mp_misc.png` (2×1) holds the only two used cells of `ec_other_sandbox.png`
  (D-27): the Echo Deck at (0,0), from (2,0), and the Extra Credit sticker at (1,0),
  from (1,1).
- `tag_gambling_sandbox.png` is padded from 32×32 to a vanilla 34×34 tag cell. Vanilla
  tag art sits at (1,1)–(33,33).

**Localization.** The importer loads each mod file with PUC Lua 5.1 in an empty
environment, with a bytecode refusal and an instruction budget, and dumps JSON.
Functions, non-string keys and mixed tables are errors. The builder turns the JSON
into `rmh_mp/loc/<lang>.lua` in the pack:

- **Shipped languages.** It ships only the game's own languages (`G.LANGUAGES`, read
  from `game.lua`). `mi` and `vi` are imported but not shipped, and `id` has no MP
  file.
- **`en-us`** is complete: the mod's English plus `extra-strings.en-us.json`. A key
  collision fails the build.
- **Other languages are partial.** Each holds only the entries it translates.
  **The runtime lays a language over `en-us` one entry at a time** (WS6,
  `registry/loc.lua`, on every `init_localization`). An entry is a description
  `{name, text}`, a dictionary string or a `v_text` line list. It is never merged
  deeper.
- **Dropped translations fall back to English.** That covers a key English lacks
  (the mod's stale keys), a different shape, or a `#n#` placeholder English does not
  fill. `--verbose` lists them all.
- **Excluded content is dropped from every language**, so it neither ships nor pulls
  glyphs into the fonts. That is the Release ruleset (EX-14), Baron, Mime and the
  White Deck (EX-15), the alt stakes (EX-16), and `j_broken`, `j_mp_idol`,
  `j_to_the_moon_mp` and the `m_gold` balanced note (A2 §14).
- **Missing typographic punctuation is replaced.** `’`, `“”`, `…` and similar marks
  that a language's font lacks become their ASCII form (the mod's French uses `’`,
  which `m6x11plus` cannot draw).

The tables use vanilla's structure (`descriptions.<set>.<key>`, `misc.dictionary`,
`misc.v_dictionary`, `misc.labels`, `misc.challenge_names`, `misc.v_text`), so
`loc_parse_string` reads them as it reads the game's own.

**Fonts (LOC-04).** MP text is folded into the core pack's font subsets. Every text
font gets the English MP text. A language's own MP text goes only into that
language's font: Japanese into NotoSansJP, Korean into NotoSansKR, and so on.
That costs about 240 glyphs, about 38 KB of core. MP Lua must not draw literal
non-ASCII text. Put it in `extra-strings`, which is scanned. Lua sources are not
scanned, so a comment cannot change the core pack.

**Glyph bitmap.** `rmh_mp/glyphs.bin` is little-endian:

```text
'RMHG'  u8 version=1  u8 fontCount  u8 langCount  u8 0
fontCount × { u8 nameLen, name (the G.FONTS file, e.g. resources/fonts/m6x11plus.ttf), u32 byteLen, bitmap }
langCount × { u8 keyLen, key (G.LANGUAGES key, e.g. en-us), u8 fontIndex }
```

Bit `cp & 7` of byte `cp >> 3` is set when the shipped (subset) font draws `cp`.
TypeScript (WS5 `identity.ts`) picks the bitmap for the current language. It then
replaces anything else in a player name or chat line with `?`. The builder fails
if any shipped MP string is missing from its language's bitmap.

### Atlas registry

`data/balatro-mp/atlases.json` maps an atlas key to an entry. The pack also ships
it as the Lua table `rmh_mp/data/atlases.lua`: the flat `atlases` map (no `version` or
`stub`), with `frames` omitted when null. `registry/atlas.lua` accepts both shapes.

| Field         | Meaning                                                                                                                                                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `file`        | PNG name under `1x/` and `2x/`, shipped at `rmh_mp/assets/{1x,2x}/<file>`. The 2x file is twice the 1x size                                                                                                                                                                                                              |
| `px`, `py`    | 1x sprite size; the sheet is a whole number of cells                                                                                                                                                                                                                                                                     |
| `kind`        | `card` (into `G.ASSET_ATLAS`, drawn by the `Card.set_sprites` wrap: jokers, consumables, boosters, backs, stickers), `animation` (into `G.ANIMATION_ATLAS`: blind chips, `frames` per row), `tag` (one 34×34 cell that extends `tags.png`) or `asset` (into `G.ASSET_ATLAS`, drawn directly: stake chips, the PvP title) |
| `frames`      | Frame count for `animation`; `null` otherwise                                                                                                                                                                                                                                                                            |
| `placeholder` | Vanilla atlas to draw from if the file is not loaded                                                                                                                                                                                                                                                                     |
| `variants`    | Optional `{lang: file}` art for one language (only `mp_c_asteroid` has one, for `ru`)                                                                                                                                                                                                                                    |

The key is `mp_<file stem>`, so `j_pizza.png` becomes `mp_j_pizza`. The four
blind-chip sheets are the exception. They keep the mod's names:
`mp_player_blind_chip`, `mp_player_blind_col`, `mp_manhunt_hunter_blind_chip` and
`mp_manhunt_runner_blind_chip`. Every sheet stays within 4096 px at 2x (the WebGL1
guarantee). The widest is `deck_stickers` at 3550 px.

## 5. Deviations from the mod

_TODO (WS4–WS9): one line per deviation._ Plan decisions D-04 (the comeback bonus
arms only on a lives decrease), D-18 (SPEEDRUN emission rebuilt by the host) and
D-22 (`c_mp_eeeee`) start the list.

WS6 (Lua core):

- The Uncommon and Rare Tag reworks under The Order (OR-05) keep vanilla's free
  (couponed) shop joker; only the queue becomes ante-agnostic, through the
  `create_card` wrap.
- The Order's Idol and Mail-In Rebate picks are weighted by copies in the deck over
  a candidate list sorted by count, rank and suit (a reconstruction of the intent,
  not the mod's scoring table).
- A PvP blind's held-in-hand end-of-round effects run when the round ends (after
  `end_pvp`), not when the player runs out of hands. The money is the same.
- The Order's voucher queue over a "stable culled pool" and its value-stable deck
  shuffle are not reproduced; vouchers and shuffles use the rewritten keys only
  (`*_resample` advances one queue, `nr`/`cashout` are per blind).

### WS4 (pure match logic)
- Pairing is a true 1-factorisation (stable per-run order + circle method with a BYE slot, bounded search, then reset); A1's adjacent-pair rotation can repeat a pair early for n ≥ 6.
- Pending death: a player whose ante has passed the pending blind, or who readies for that ante's PvP Boss, counts as having beaten it (prevents stalls on D-06's blind-on-deck key).
- Any 2-player match outside Manhunt/Teams receives the degenerate `nemesis_pairing`.
- D-11 votes count present, alive, non-forfeited players; seed and draw votes share `votes.openedAt`, so both expire 60 s after the latest vote of either kind.
- `end_pvp.pvp_timer_lost` is true when the round was decided by the loser's PvP-timer hand loss.
- PvP-timer receivers keep their own clock value; ante-timer receivers adopt the sender's value.
- Teams card targets are `opp[(index + ante − 1) mod |opp|]` (A1 has no rule).
- The Runner's voucher adds a life only to alive Hunters.
- Practice reaching ante 9 emits nothing from the referee; the vanilla win screen there is the Lua side's.
- `chip_cap` and `shrinking_hand` stay excluded (EX-18) although vanilla has `chips_dollar_cap` and `minus_hand_size_per_X_dollar`; cheap to add later.

## 6. Operations

_TODO (WS1, WS14): hub limits and relay budgets, TURN configuration, the bundle
budget baseline._

### Pack rebuilds (WS2)

```bash
pip install fonttools pyoxipng
python3 -I scripts/balatro/build-game-pack.py            # every pack + lib/balatro/game-pack.json
pnpm balatro:mp-pack                                     # = --mp-only: only mp-<sha>.zip (Lua edits)
python3 -I scripts/balatro/build-game-pack.py --check    # CI freshness: rebuild in memory, write nothing
python3 -I scripts/balatro/build-game-pack.py --check --mp-only   # the fast half (pack.test.ts runs it)
```

The mp pack holds the following:

- `lib/balatro/lua/mp/rmh_mp/**.lua`, without `*_spec.lua`;
- the art;
- the generated localization and atlas tables;
- the glyph bitmap.

Every edit to MP Lua therefore changes `mp-<sha>.zip` and its manifest entry.
Streams test against local builds. **Only WS2 or the orchestrator commits a rebuilt
pack, at wave merges** (R-14). CI's `--check` and `pack.test.ts` fail on a stale one.

The core pack changes only when the shipped MP localization's characters change.
`--mp-only` leaves the core as it is, so run the full build after editing
`data/balatro-mp/localization` or `extra-strings`. A full build takes a few minutes,
because it subsets about 60 MB of fonts.

**Budgets** (`data/balatro-mp/pack-budget.json`; the build fails past them):

| Pack | Budget                                        | Plan §6.4                                                                                                                                       |
| ---- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| core | 4 930 572 B baseline + 40 000 B               | plan +30 KB. Even per-language, the CJK/Hangul MP glyphs cost ~38 KB (folding all MP text into every font cost ~108 KB)                         |
| mp   | 1 800 000 B compressed, 8 000 000 B extracted | plan 1.3 MB. The used art alone is ~1.25 MB after lossless oxipng (1x + 2x, AS-01) and the localization ~0.1 MB, so 1.3 MB left no room for Lua |

`CORE_PATCHES` in the builder is the anchored patch list for data/balatro Lua, as
`(path, anchor, replacement)`. Each anchor must occur exactly once. It holds one
entry, WS6's eval-row label hook in `functions/common_events.lua` (same line,
`RMH_MP.eval_row_label`, nil outside multiplayer).
A stream requests further entries through WS2.

## 7. Lua MP core (WS6)

Sources are in `lib/balatro/lua/mp/rmh_mp/`. `require 'rmh_mp'` runs `init.lua`
once. It loads the core, then the content modules in a fixed order (registry
`order` = 1000 + definition index, which must match on every peer), then the
reference content (`j_mp_pacifist`, `bl_mp_nemesis`) for any key no stream
defined. After that it installs the always-on wraps and binds to
`RMH_WEB.net`. Session wraps exist only while a session is mounted (wrap group
`session`).

### Isolation

`MP.registry.mount(resolved, session)` does the following:

- adds every MP prototype to `G.P_CENTERS`, `G.P_BLINDS`, `G.P_TAGS` or
  `G.CHALLENGES`;
- adds the _enabled_ ones to their pools (rarity pools for jokers; never the
  vanilla `P_CENTER_POOLS.Joker` collection list);
- swaps reworks in.

`unmount()` restores every pool array in place, with the same table and element
identity, and removes every MP key. Two specs guard this:
`spec/mp_registry_spec.lua` and `spec/mp_determinism_spec.lua`. The second runs
the real `data/balatro` pool code with the LuaJIT-exact `math.random`. Its
golden-seed digests (shops, bosses, tags, vouchers for 5 seeds) must be equal
before the pack loads, after it loads, and after a mount/unmount cycle.

A gate opens when any of these holds:

- the key is in `resolved.included` or `resolved.reworked`;
- `gate.include(session)` returns true;
- one of `gate.layers` is active;
- the default `isolation` gate: `multiplayerContent` and the `multiplayerJokers`
  option are both `true` (a missing option counts as off, as in TS).

`pool = false` keys are registered but never pooled.

In a session, `get_current_pool` and `get_next_tag_key` run with `unlocked` and
`discovered` forced on and restored before returning (OR-07). While the vanilla tag
and blind collection grids build, MP keys are hidden.

### Session lifecycle

```text
match_start / practice_start  -> MP.session.mount(kind, info) -> MP.session.launch()
Game:start_run (wrap)          seed gets The Order '*' prefix; pre-roll pending
Back:apply_to_run (wrap)       run seed in effect -> bans (banned ∪ bannedSilent ∪ Attrition
                               ∪ ban sources) -> gameModifiers -> MP stake -> layer hooks
                               (resolved.setupHooks only, in order; deduped)
                               -> Small World starting-voucher fix -> vanilla apply
get_starting_params (wrap)     resolved.startingParams merged into the base
after start_run                layer post hooks; set_ante 0
go_to_menu / New Run           MP.session.unmount() (after delete_run)
```

Applying the bundle follows WS4's conventions (`lib/balatro/mp/rulesets/layers.ts`):

- `gameModifiers` go into `G.GAME.modifiers`; a dotted key is a nested path
  (`no_blind_reward.Small` sets `modifiers.no_blind_reward.Small`).
- `mp_` keys are not modifiers. They are layer-hook parameters, read with
  `MP.layer_param(name, default)` (also `ctx.params`): `mp_smallworld_cull`,
  `mp_shop_slots_bonus`, `mp_ante_scaling_mult`, `mp_reroll_increment_bonus`,
  `mp_sticker_chance`, `mp_eeeee_chance`, `mp_shared_slots`, `mp_glass_cannon_xmult`.
- `setupHooks` alone decides which layer hooks run. A registered hook on an active
  layer that is not listed is logged and skipped (the layer lacks `hook: true`).
- The isolation gate is `multiplayerContent && options.multiplayerJokers`
  (`mpContentPooled`). `practice_start` carries no options, so practice mounts with
  `multiplayerJokers = true`, the default the practice bundle was resolved with.
- `lib/balatro/lua/spec/mp_rulesets_spec.lua` applies every real bundle in
  `lib/balatro/mp/__fixtures__/rulesets-resolved.json`;
  `rulesets-lua-fixture.test.ts` keeps that file equal to `resolveRuleset()` output
  (`RMH_UPDATE_FIXTURES=1` regenerates it).

### Internal API (PLAN §3.d, implemented)

| Call                                                                                                                                                        | Notes                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MP.state`, `MP.state_reset()`, `MP.in_session()`, `MP.session_kind()`, `MP.option(name, default)`, `MP.resolved()`, `MP.layer_active(name)`                | `state.lua`                                                                                                                                          |
| `MP.hooks.wrap(owner, name, fn(orig, ...), {id, group, optional})` → handle with `remove()`; `MP.hooks.remove_group(g)`, `unwrap`, `is_wrapped`, `original` | Idempotent per id (default: the hook function). A hook error is logged and the original runs once. An error from the original is re-raised unchanged |
| `MP.net.send(t, d)`, `MP.net.on(t, fn)`, `MP.net.defer(fn, pred?, queue?)`, `MP.safe_point()`, `MP.net.add_frame_hook(fn)`, `MP.json_array(t)`              | Outbound is validated by `protocol.lua` and flushed once per frame. Use `MP.json_array` for arrays that may be empty                                 |
| `MP.event(e)`                                                                                                                                               | A GameEvent, sent only in match and practice sessions                                                                                                |
| `MP.peer.send(kind, d, to?)`, `MP.peer.on(kind, fn(from, d))`, `MP.sync.register(key, {receive})`, `MP.sync.send(obj, data, to?, kind?)`                    | A `receive` returning `{send=…}` replies                                                                                                             |
| `MP.report.on(t, fn(o))`                                                                                                                                    | Observers for referee outcomes. UI streams use this, never `MP.net.on('outcome')`                                                                    |
| `MP.ctx.calculate(ctx, {consumeables, silent})`                                                                                                             | Custom contexts fanned out over jokers and consumables                                                                                               |
| `MP.registry.define(def)`, `mount`, `unmount`, `is_mp`, `get`, `enabled`, `proto`, `leaked_keys`                                                            | Definition shape and dispatch signatures are documented at the top of `registry/init.lua` and `registry/dispatch.lua`                                |
| `MP.rules.layer_hook(name, fn(ctx))`, `MP.rules.layer_post_hook(name, fn)`, `MP.rules.ban_source(fn)`                                                       | Run-start hooks for content layers                                                                                                                   |
| `MP.card.serialize`, `build`, `validate`, `deck_string`                                                                                                     | The SafeCard codec. Keys must exist in the mounted registry                                                                                          |
| `MP.pvp.*`                                                                                                                                                  | `on_pvp_blind`, `round_is_pvp`, `toggle_ready`, `report_hand`, `set_location`                                                                        |
| `MP.timer.input(op)`, `MP.timer.press()`, `MP.timer.flags()`                                                                                                |                                                                                                                                                      |
| `MP.order.active()`, `MP.order.rewrite(key)`                                                                                                                |                                                                                                                                                      |
| `MP.smallworld.cull()`, `MP.smallworld.digest()`                                                                                                            |                                                                                                                                                      |
| `MP.saves.continue_singleplayer()`                                                                                                                          |                                                                                                                                                      |
| `MP.registry.atlas.blind_atlas(key)`, `tag_pos(key)`                                                                                                        |                                                                                                                                                      |
| `MP.open(intent)`                                                                                                                                           | Called by `rmh_mp_entry.lua`; forwards to `MP.ui.open` (WS10)                                                                                        |

Hooks the UI streams may define, all optional:

- `MP.ui.open(intent)`
- `MP.ui.show_result(result)`
- `MP.ui.countdown_tick(n)`
- `MP.ui.timer_cue()`
- `MP.ui.toast(key)`

### Save guards

In a session:

- `G.F_NO_SAVING` is set.
- `save_run` writes `/rmh/mp/run.jkr` and `state.json`, touches the marker
  `/rmh/mp/snap` and sends `snapshot`. This is for matches only; practice writes
  nothing.
- `remove_save` is a no-op.
- The save channel drops `save_run` pushes and puts the player's real tutorial
  flags back into `save_settings` pushes (OR-08 forces the tutorial complete in
  sessions).

Continue in Singleplayer writes the sidecar `<profile>/mp.jkr`. On boot, Continue
with that sidecar re-mounts the content as session kind `continued` before
vanilla loads the save. A fresh single-player run deletes the sidecar.

## 8. Mailbox, lazy loading and the page (WS3)

**Mailbox.** Lua (`lib/balatro/lua/rmh/net.lua`, exposed as `RMH.net`; the codec is
`rmh/json.lua`) and JS (`lib/balatro/mp/bridge.ts`, `Mailbox`) trade NDJSON under
`/rmh/net`, framed per `bridge-protocol.ts`.

- Lua pumps once per frame from `rmh_web.lua` §9, after `RMH.frame_hooks` (each called
  as `fn(dt)`, paused or not). It writes its batch to `out.tmp`, renames it to `out`,
  then reads `in` whole and removes it. While `out` still exists, Lua holds its batch.
  Idle cost: one failed `io.open` per frame.
- JS hears the rename through `FS.trackingDelegate.onMovePath` (installed in
  `runtime.ts`, chaining any existing delegate). Inside that call it reads and unlinks
  `out`, and writes pending inbound lines to `in` (the in-call reply). Listeners run in
  a microtask, outside the FS call.
- `onDeletePath(in)` means Lua consumed the file. Without delegates (and across
  processes in the conformance test), JS polls every 16 ms and forgets an inbound line
  only once Lua's batch header acks it. Lua sends a header-only batch to ack.
- Lua drops `s ≤ last`; JS drops Lua duplicates the same way. Both sides validate
  (zod; `RMH.net.validate`, which the MP pack sets to `protocol.lua`), log and drop.
  Handler errors are isolated.
- JSON: numbers `%.17g`; NaN/±inf are encode errors (scores travel as strings, §0.9);
  a null object field decodes to nil and a null array item to `json.null`; decoded
  arrays keep a marker so `[]` re-encodes as `[]`; depth is capped at 64.

**Entry.** `rmh_mp_entry.lua` (core) adds MULTIPLAYER to the main menu bar. A click
sends `mp_open`, shows a loading overlay fed by `mp_pack`, and on `mp_pack` ready (or
`/rmh/mp/ready`) runs `require 'rmh_mp'` and `rmh_mp.open(intent)`. Files written after
boot are visible to LÖVE's `require` (`?.lua` and `?/init.lua`), `love.filesystem`
and `newImage`, verified in-engine, so no loader fallback exists.

**Lazy JS.** `BalatroPage.tsx` holds a stub that scans Lua's batches for `mp_open`. It
then imports `lib/balatro/mp/pack-loader.ts`, which takes the mailbox over (last seq
plus backlog), fetches the MP pack (IndexedDB kind `mp`, then the network), and writes
it under `rmh_mp/` directories only (`mpPackPath`). It then sends `mp_pack`, and starts
`index.ts` `startMultiplayer` (WS5; found through `import.meta.glob`, so the chunk
builds before it exists). Nothing under `lib/balatro/mp/` is in the initial chunk.

**Boot autoload.** An invite (`?lobby=`), a rejoin hint (localStorage
`rmh-balatro-mp-rejoin`, set by the session runtime while seated) or a
`<profile>/mp.jkr` sidecar writes `/rmh/mp/autoload`. For an invite or rejoin, the MP
pack is fetched alongside the core and mounted before the game's first line. Lua then
loads `rmh_mp` right after `G:start_up`. The login redirect keeps `?lobby=`
(`lobbyReturnPath`).
