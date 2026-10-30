# RMH TF2 — the browser game

A playable Team Fortress 2 in the browser, part of the [TF2 Hub](tf2-hub.md):
`/tf2/play`. It is a clean-room TypeScript engine — **not** the Source engine
and not built from any leaked engine code. The official
[Source SDK 2013](https://github.com/ValveSoftware/source-sdk-2013) (which
includes TF2's game code since 2025) is the reference for every constant,
formula and rule, so the game reflects TF2 as closely as an independent engine
can. Code that follows an SDK routine names it (`// SDK: CGameMovement::Friction`).
`lib/tf2-game/LICENSE-SOURCE-SDK.txt` carries Valve's SDK licence and notices,
as that licence requires for derived work; the game is free to play and stays
that way.

Game content (maps, models, textures, sounds) is never committed. The
`tf2-assets-sync` workflow converts it from a Steam install into object
storage, like the loadout builder's models (see [TF2 Hub](tf2-hub.md)).

## Layout

| Path                                        | What                                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/tf2-game/core/`                        | Vectors and angles (`vec.ts`), SDK constants (`constants.ts`), the shared contracts (`types.ts`: `UserCmd`, `TraceResult`, `CollisionWorld`).                                                                                                                                             |
| `lib/tf2-game/formats/`                     | Readers for Valve formats: VPK, KeyValues, BSP v19–21, VTF, VMT, PHY. Pure TS over `Uint8Array`; used by the asset pipeline (Node) and the game (browser + server).                                                                                                                       |
| `lib/tf2-game/world/`                       | The map as a collision world: BSP brush tracing (CM_BoxTrace), displacement and static-prop collision, brush entities that move.                                                                                                                                                          |
| `lib/tf2-game/data/`                        | Class and weapon tables (stock arsenal), extracted from the game scripts and checked against the SDK.                                                                                                                                                                                     |
| `lib/tf2-game/sim/`                         | The authoritative simulation: game movement, players, weapons, projectiles, damage, conditions, buildings, map entities and I/O, game rules and modes. Deterministic.                                                                                                                     |
| `lib/tf2-game/bots/`                        | Bots (see [Bots](#bots)): nav mesh generation and `nav.bin`, A\* and path following, the TFBot brain.                                                                                                                                                                                     |
| `lib/tf2-game/net/`                         | Protocol: snapshots, deltas, input packing; client prediction and interpolation. `net/p2p/`: [peer-to-peer play](#peer-to-peer-play) (DataChannel link, host session, signaling contract).                                                                                                |
| `lib/tf2-game/render/`                      | three.js renderer: world, props, players, view models, projectiles, buildings, particles, decals. Browser only.                                                                                                                                                                           |
| `lib/tf2-game/audio/`                       | Sound playback over `getAudioContext()`: the mixer, attenuation and channel rules, soundscapes, scenes, captions.                                                                                                                                                                         |
| `lib/tf2-game/client/`                      | The browser game loop: input, local "listen server" worker for offline play, connection to the hub for online play; the HL2 / Portal client (see [Playing](#playing-the-clients)).                                                                                                        |
| `components/tf2-game/`                      | React UI: the play page, HUD, menus (team, class, scoreboard, settings).                                                                                                                                                                                                                  |
| `lib/tf2-game/server/`                      | Match hosting: the `MatchHost` contract the simulation implements (`match-host.ts`), the game registry (`game-registry.ts`), and the fixed-step loop (`match-runner.ts`) the browser's listen server runs. |
| `server/socket-server/handlers/tf2-game.ts` | The server browser, a P2P host's door and pings on the hub (`tf2:*` events, `lib/tf2-game/net/events.ts`); the hub never simulates. `tf2-p2p.ts` beside it signals for [peer-to-peer](#peer-to-peer-play) rooms. |
| `scripts/tf2-game/`                         | Asset pipeline: map packages, materials, props, sounds, view models, particles.                                                                                                                                                                                                           |
| `lib/csgo-game/`                            | CS:GO (de_dust2: bomb defusal and deathmatch) on the same engine — see [CS:GO (Dust II)](#csgo-dust-ii) "The simulation".                                                                                                                                                                 |

## Conventions

- **Units and axes.** Source units (inches), Z up, angles `[pitch, yaw, roll]`
  in degrees — exactly the SDK's conventions, so a ported formula reads the
  same. Only the renderer converts to three.js (Y up, metres) with
  `sourceToGl` from the loadout particles.
- **Tick.** The simulation steps at 66.67 Hz (`TICK_INTERVAL = 0.015`). Nothing
  in `sim/` reads wall-clock time; it reads `world.curtime`.
- **Determinism.** `sim/` uses only its seeded random streams (`core/random.ts`),
  so the server and a predicting client agree on spread and crit rolls.
- **No allocation in hot loops.** Traces, movement and weapon frames reuse
  scratch vectors.
- **Environment-agnostic.** `core/`, `formats/`, `world/`, `data/`, `sim/`,
  `bots/` and `net/` import nothing from the DOM, React or Node — they run in a
  browser worker, the hub worker and Vitest alike.

## Multiplayer hosting

**Every match runs in a player's browser.** Offline play is a listen server in a worker
(`client/net/listen-server.ts`); online play is peer-to-peer: a signed-in player hosts the same listen
server and friends connect to it over WebRTC ([Peer-to-peer play](#peer-to-peer-play)). The games hub
never simulates and carries no game traffic of its own — there are no hub-hosted (dedicated) rooms. It
lists the P2P rooms for the server browser, answers the browser's pings, keeps a host's door, and
signals (plus a capped relay fallback) for P2P play. The pieces inside a listen server, outermost first:

- **Runner** (`server/match-runner.ts`): hosts the match at a drift-corrected 66.67 Hz (at most 5 catch-up
  ticks per wakeup; the rest of a backlog is dropped and logged), one `postMessage` per tick with the
  buffers transferred. It can be paced by `host_timescale` (`setTimescale`, 0.1–10; each tick is still
  15 ms of game time).
- **Host** (`server/match-host.ts`): what the simulation implements — `Tf2MatchHost`
  (`server/tf2-match-host.ts`), or another game's host registered with `registerMatchGame`
  (`server/game-registry.ts`; CS:GO). `EchoMatchHost` is the transport test double.

**The host administers the room** — the pause menu's **Server** view or the console (`kick`, `kickid`,
`changelevel` / `map`, `sv_lock`, `sv_password`, `rcon say …`):

- `kick` — the member is removed and the account refused for the room's life (by the hub too);
- `transfer` (Make host) — the match migrates to that player's browser;
- `changelevel` — any published map (`findTf2Map`): `Tf2MatchHost.changeLevel` loads the package while the
  match plays on, then builds a new world on it that keeps the tick count running
  (`GameWorldInit.startTick`) and puts every human back on their seat — the same player id, team, class
  and loadouts (TF2 resets scores on a level change); bots are dealt again. Each client gets a new `hello`
  naming the map: it shows the loading screen, reloads the level, and resyncs from a full snapshot;
- `lock` / `password` — sent to the hub (`tf2:room:admin`, `zRoomAdmin`, 30/min), which keeps the door:
  new accounts are refused (`locked`) or asked for the password (`password`, compared in constant time);
  anyone who has played in the room rejoins freely;
- `say` — a line in everyone's chat from `Console` (no speaker: a system line).

The match settings — `mp_timelimit`, `mp_winlimit`, `tf_bot_quota`, `tf_bot_difficulty`, `mp_restartgame`
— are the console's server cvars, which the host changes. Tests:
`server/socket-server/tf2/room-admin-migration.test.ts`.

**Joining as a spectator** is part of the join (`P2pJoinPayload.spectate` through the hub-vouched join
request, `PlayerInfo.spectate`): the match seats the player with the spectators, with no team switch after
joining.

## Peer-to-peer play

A signed-in player can **host a match from their own browser** and friends connect to it directly over
WebRTC — Source's listen server: the host plays on its own server with no transport latency, everyone else
is a client. The hub only **signals**; it never simulates a P2P match and carries none of its traffic
unless a member cannot connect directly.

**The match outlives its host** (host migration, below): when the host leaves or drops, it carries on in
another player's browser. The host is authoritative (as in any listen server). The hub never lists, logs or
exposes an address — ICE candidates pass through it only to the one peer they are meant for.

```
host page                                   hub (signaling only)                 member page
listen worker (Tf2MatchHost + bots) ──┐     tf2:p2p:host → code, token          tf2:p2p:join {code}
P2pHostController / P2pHostSession ◄──┼──── tf2:p2p:join-request {userId,name} ─┘ (hub-verified account)
   admit → RTCPeerConnection (offer) ─┼──── tf2:p2p:signal (offer/answer/ICE) ───► P2pJoinController
   PeerLink ◄═════ DataChannels: unreliable (input, snapshots, pings) ═════════════► P2pPeerClient
            ◄═════               reliable   (reliable stream, commands, chat) ═════►  → Tf2Client
   no direct path in 8 s → tf2:p2p:relay:start → tf2:p2p:relay (opaque, capped) ◄──► RelayChannel
```

- **Same bytes as offline.** Input packets, snapshots and reliable batches are exactly the listen worker's
  (`usercmd-codec`, `snapshot`, `protocol`), plus a one-byte tag (`net/p2p/wire.ts`). The client runs the
  same `SnapshotClient` / `Prediction` / interpolation; `Tf2Client` reaches its match through one
  `Transport` shape over the local listen worker or a P2P link.
- **Host** (`client/net/p2p-host.ts`): the listen worker (`listen-server.ts`) runs `Tf2MatchHost` with
  TF2's join menus and `snapshotMaxBytes` 1100, and takes remote players (`peer-add` / `peer-input` /
  `peer-command` / `peer-resync`, routed out per player as `peer-frame`). `P2pHostSession`
  (`net/p2p/host-session.ts`) is the room manager: seats by account, validation exactly as the hub
  (input ≤ 512 bytes and 5,000/min per member; every command through the zod schemas and per-kind
  rates; chat cleaned and capped; the match's command budget still applies), chat routing (team chat by the
  team the match reports), kick, and the connection type of every human for the scoreboard (Host / Direct
  / Relayed). Max players ≤ 12 (the host uploads a snapshot stream per member).
- **Link** (`net/p2p/link.ts`, `PeerLink`): two channels — `unreliable` (`ordered: false,
maxRetransmits: 0`, negotiated id 0) and `reliable` (ordered, id 1). Backpressure never blocks: an
  unreliable message is dropped when the channel already buffers 16 KB; reliable frames queue in the link
  and drain on `bufferedamountlow` (high water 256 KB), and a member that piles up 4 MB is disconnected.
  MTU: unreliable messages are refused above 1200 bytes (the snapshot budget is 1100 for P2P, so a snapshot
  is one datagram); reliable messages above 16,000 bytes are split and reassembled (≤ 1 MB). Each side
  pings every second (five quick ones first); 10 s of silence ends the link. The host answers pings with its
  match tick, so the member's `TickClock` syncs as over the hub; RTT (min-filtered), jitter (RFC 3550 over
  round trips) and loss (pings unanswered after 2 s, last 60) feed the ping column and diagnostics.
- **Two channels, one order.** Over one ordered stream a snapshot never overtakes the reliable packet that
  defines its strings; over two DataChannels it can. `SnapshotClient` holds a snapshot that names an undefined string
  (it is not acknowledged, so the host keeps its baseline) and retries it after the next reliable packet;
  a snapshot older than the newest one (the unreliable channel reorders) is skipped before decoding.
- **Signaling** (`server/socket-server/handlers/tf2-p2p.ts`, contract `net/p2p/signal.ts`, events in
  `net/events.ts`, rates in `SOCKET_RATE_LIMITS`): `tf2:p2p:host` (map allowlist, ≤ 12 players) → `hosted`
  {code, resume token}; `update` (the host's digest for the browser every 2 s); `join` → the host gets
  `join-request` with the **hub-verified** user id and account name (the host trusts nothing a peer says
  about itself) → `admit` / refuse; `signal` relays an offer, answer or candidate only between the host
  and one admitted member of the same room (SDP ≤ 16 KB, candidate ≤ 512 chars); `kick` (refused at the
  hub too, for the room's life); `leave`; `close`. A room is hidden when its host's hub connection drops
  and closed (`host-left`) after 30 s unless the host reclaims it with its token — the DataChannels do not
  need the hub once connected. An invite link (`?lobby=CODE`) and join by code go straight to `tf2:p2p:join`.
- **ICE, in order: STUN → TURN → the hub relay.** The hub hands every account its ICE servers with its
  room (`P2pHostedPayload.ice`, `P2pAdmittedPayload.ice`): STUN (`STUN_URLS`, default public STUN), then
  — when the deployment runs a TURN server (`TURN_URL`, `TURN_SECRET`: the same self-hosted coturn the
  site's calls use) — TURN with a credential **minted for that account** by `lib/call/ice.ts`
  (`buildIceServers`: coturn's `use-auth-secret`, `<expiry>:<userId>` / HMAC-SHA1, valid 10 minutes;
  the secret never leaves the hub and no static credential is ever in a bundle). ICE tries host and
  server-reflexive candidates first and TURN relay candidates after them; only a pair that connects no
  way in time (8 s, 12 s with a TURN server: an allocation takes round trips) goes to the hub relay. The
  connection is labelled from the selected candidate pair: **Direct**, **TURN** (a relay candidate) or
  **Relayed** (the hub) — the scoreboard, the host's player list and the Server view show it. Without
  hub-provided servers the browser falls back to `VITE_TF2_ICE_SERVERS` (`net/p2p/ice.ts`) or public
  STUN. **STUN contacts a third-party server** unless `STUN_URLS` names your own; it sees the player's
  public address and nothing else.
- **Relay fallback.** A pair not connected within 8 s (symmetric NAT, blocked UDP) asks the hub to relay
  it (`tf2:p2p:relay:start`): opaque packets with a two-byte header (flags, member slot), reliable ones in
  socket.io's ordered stream, unreliable ones volatile. Caps: **4 relayed members per room**, **32 KB/s per
  relayed member per direction** (64 KB burst); unreliable packets past the budget are dropped, reliable
  ones may run a 256 KB debt, past which the member is cut off (`relay-overflow`). The hub still never
  parses or simulates them.
- **Seats and rejoin.** A member whose link drops keeps its seat (player, team, class, score) for 30 s;
  the client rejoins by code on its own and the host resyncs the seat (`MatchHost.resyncPlayer`: a full
  snapshot, server info and roster again, command numbers from 1). Kicked accounts are refused. The host's
  door — lock and password (pause menu → Server, `tf2:room:admin`) — is kept by the hub; a member that
  played here passes it.
- **Host migration.** The host session names a **successor** (`P2pHostSession.successor()`: a member that
  allows it — `P2pJoinPayload.canHost`, default yes — on a Direct or TURN link, lowest round trip
  first; a checkpoint is too big for the hub relay's budget) and tells the hub (`tf2:p2p:successor`). The
  listen-server worker writes a **checkpoint** of the whole match every 2 s and on every round or map
  change, and the host sends it to the successor over its reliable channel (`TAG_CHECKPOINT`). A
  checkpoint (`lib/tf2-game/sim/checkpoint/`) is the authoritative world written down exactly: every
  entity with every field (private ones too, not just what snapshots carry), the rules and the mode's
  state, timers, scores, the I/O queue, the random streams, lag-compensation history, the brush models'
  transforms in the collision world, the tables kept beside the world (crit trackers, spy state, the TF
  object list, objectives, the bots' manager), the bots' brains, each human's seat (hub player id,
  entity, account, team, class, loadouts) and the console's cvars — versioned (`TF2M` · version ·
  deflate-raw JSON, `pack.ts`) and tied to the build (the catalog's fingerprint). It is a generic codec
  over the object graph (`graph.ts`): shared references, cycles, Maps, Sets, typed arrays and the buffers
  they share, holes, -0 and NaN; classes, prototype methods and module data are named by module path and
  export (`catalog.ts`, from the bundle's `import.meta.glob` — never a minified `constructor.name`); the
  map, its entity lump and the nav mesh are named by path from the restoring world's own copies; a
  closure (an arrow field, a think context's callback) is rebuilt by its owner's constructor and matched
  to its home by its source text. Restoring merges into a fresh world built on the same map, adopting its
  objects. Measured on 2Fort with 10 hard TFBots (every class, buildings up, pipes in flight) and 2
  humans: ~16,600 objects, 1.2 MB of JSON, **≈ 180 KB packed**, written and packed in ≈ 60–200 ms in the
  worker, restored in ≈ 130–200 ms. The test (`checkpoint.test.ts`): write a match down mid-fight,
  restore it into a fresh world, run both 1,500 ticks with the same inputs — identical, field for field
  (a synthetic room too, without TF2_ROOT).
  - **On host loss** — the host leaves (`tf2:p2p:close {migrate: true}`; members are told `migrating`
    over their links), or its hub connection stays gone for `MIGRATE_GRACE_MS` (2 s: a closed tab) — the
    hub **promotes** the successor (`tf2:p2p:promoted`: the room, a new resume token, its ICE servers;
    the old host's token is spent), tells everyone else `tf2:p2p:migrating` (the new host's name) and
    asks the new host for each of them with the accounts it vouches for (join requests, as on a first
    join). A member whose link to the old host died and asks again is held in the room until the
    promotion, not refused.
  - **The new host** (`Tf2Client.becomeHost`) starts its own listen-server worker from its newest
    checkpoint, on its own seat (`ListenHostOptions.restore`, `localPlayerId`), and opens it with
    `P2pHostController.startPromoted`, which holds every former member's seat for 30 s
    (`P2pHostSession.restoreSeats`) and answers the waiting join requests. Members reconnect (WebRTC
    again, through the hub), reclaim their seats and resync from a full snapshot; their snapshot mirror,
    interpolation and prediction restart (`resetNetState`; the level stays loaded). Everyone sees **"Host
    migrated to <name>"**. Bounded loss: at most the time since the last checkpoint (≤ 2 s). A successor
    with no checkpoint cannot continue: the room closes as before.
  - **Make host** (pause menu → Server) hands the match to a chosen member on purpose: it becomes the
    successor, gets a fresh checkpoint, and this host leaves with `migrate` and comes back as a member of
    the new host's match (by code; its seat is held).
- **A background host tab.** The room's clock runs in the listen-server **worker**, which a browser does
  not throttle as it does a hidden page: the worker posts `upkeep` every 100 ms (link pings and
  timeouts, the hub digest every 2 s, the successor choice) and writes the checkpoints; snapshots were
  already sent from worker messages, never from the page's animation frame. The host sees a gentle notice
  ("You're hosting this match. Keep this tab open (it can stay in the background).").
- **Loss, jitter and choke from real traffic.** Every unreliable game message carries a 5-byte header
  (`wire.ts` `sequenced`: u16 sequence · u16 sender clock · u8 choke), added and stripped by the link. The
  receiver measures loss from sequence gaps (a late packet is not lost — the channel is unordered),
  RFC 3550 jitter from transit times, and choke as the sender reports it — snapshots the host had to drop
  before sending because the member's channel was backed up (`net/p2p/loss.ts` `SequenceMeter`). A
  member's `net_graph` shows them (loss, choke, jitter); the host's `peers` rows carry each member's round
  trip and input loss, so the scoreboard's ping column shows the host's measured ping and a loss tag.
- **Accounts.** Every multiplayer action — P2P hosting and joining, signaling, the relay, a host's door —
  needs a signed-in account; the hub answers `auth-required` otherwise
  (`server/socket-server/handlers/__tests__/tf2-multiplayer-auth.test.ts` walks every `TF2_C2S` event).
  Browsing, room details and the ping stay public. Players are named by their account. The lobby shows a
  sign-in prompt that returns through `lobbyReturnPath()`, so `?lobby=CODE` survives the login; a socket
  that connected signed out reconnects after sign-in (`reauthenticateTf2`).

**Server browser** (`components/tf2-game/ServerBrowser.tsx`, logic `client/server-browser.ts`): the
public P2P rooms ("Hosted by <name>"), columns name / map / mode / players (+ bots) / host, sortable;
filters (map, mode, not full, has players, hide empty) and search; refresh
every 15 s and on demand; a details pane (roster with classes and scores, round state, time left) with Join
and Join as spectator; Quick Play for a mode or map (else an offer to host or play offline); Favorites and
Recent (this device's `localStorage`); join by code; `?lobby=CODE`. `tf2:rooms:list {offset}` returns pages
of 100 with the total; `tf2:room:details {code}` the pane. There is no ping column (the browser never
learns a host's address); the header shows the round trip to the hub. Rows are buttons (keyboard), and a
gamepad's d-pad / A / B move through them (`use-lobby-gamepad.ts`, a 100 ms poll while a pad is connected).

Measured (`TF2_P2P_REPORT=1 pnpm test:tf2 lib/tf2-game/net/p2p`: host + 3 members + 8 wandering bots = 12
players in the synthetic room, 80 ms RTT, ±6 ms jitter, 3 % loss and reordering, 60 simulated seconds):
about **10 KB/s host → member** and 3.6 KB/s member → host per member (largest snapshot 909 bytes, under
the 1100 budget; no datagram over 1200), so a full 12-player room costs the host ≈ 110 KB/s (≈ 0.9 Mbit/s)
of upload for 11 members; the first prediction of every command matched the server to **0.000 units** over
≈ 2,000 commands per member (commands run with another player in collision reach are left out: no client
predicts other players), the reliable stream arrived complete and in order (every batch the match sent was
decoded), and a handful of snapshots per minute waited for their strings (`unknown-string`).

Tests: `lib/tf2-game/net/p2p/p2p.test.ts` (an in-memory DataChannel pair with latency, jitter, loss,
reordering, bandwidth and MTU — `fake-channel.test-support.ts` — running the real listen server and codecs:
prediction, the reliable stream under loss and reordering, fragmentation, the snapshot budget,
backpressure, the host leaving, a dead tab, a silent network, rejoin keeps the seat, validation and rates,
loss measured from the traffic, and **host migration**: the host leaves, a member restores its checkpoint in
a new listen server and another member reclaims its seat and plays on), `lib/tf2-game/net/p2p/loss.test.ts`,
`lib/tf2-game/sim/checkpoint/checkpoint.test.ts`, `server/socket-server/tf2/p2p-signaling.test.ts`
(accounts, vouching, signal routing and caps, kicks, room expiry and resume, relay caps),
`server/socket-server/tf2/room-admin-migration.test.ts` (promotion, TURN credentials, the door, room
owners), `lib/tf2-game/client/server-browser.test.ts`. In a real browser:
`scripts/tf2-game/p2p-smoke.ts` (its header has the setup: a throwaway Postgres, the hub, Vite, game assets
proxied from a deployment) — A hosts on ctf_2fort, B joins by the invite link (Direct), C joins with every
candidate dropped on both ends (Relayed) or, with `--turn`, through a TURN server with hub-minted
credentials (TURN); `--background` sends the host's tab to the background (hidden, no animation frames,
page timers throttled to 1 s), `--migration` closes the host's browser mid-match, `--screenshot` takes a
console screenshot.
Measured in the real-browser smoke (headless Chromium, SwiftShader, one machine; 2026-10-29): B's
DataChannels opened **48 ms** after the host admitted it (Direct), ~67 snapshots per 2 s arrived, B walked
263 units and the host drew it where B was (0.0 units apart); C — every candidate dropped on both ends —
fell back to the relay **8.0 s** after admission (the direct timeout), received the same snapshot rate
through the hub, walked and was seen by the host the same way. On 2Fort with 6 bots, host → member was
≈ 6.6 KB/s direct and ≈ 5.4 KB/s relayed (member → host ≈ 0.7 KB/s), well inside the relay's 32 KB/s; the
largest datagram 1101 bytes. Over the relay, unreliable packets are sent without socket.io's `volatile`
flag, which drops a frame written while the previous one is still in flight (the snapshot right behind its
tick's reliable batch): they are dropped instead when the receiver's write queue holds 16 frames.
Host migration, TURN and a background host in the same smoke (`--turn --background --migration
--screenshot`, a local coturn with hub-minted credentials; 2026-10-29): C connected through TURN 154 ms
after admission (labelled TURN on both ends); with the host's tab hidden — no animation frames, page
timers throttled to 1 s — B kept receiving **33.2 snapshots/s** and the links stayed up; the successor (B)
received ≈ 160–177 KB checkpoints (≈ 80–90 KB/s on its link while it is the successor). Closing the host's
browser mid-match: B became the host **2.5–3.1 s** later, C was re-admitted by B and receiving its
snapshots **10.8 s** after the close (WebRTC again, over TURN), was told "Host migrated to P2P B", walked
404 units and B drew it where C was; B's pause menu has the Server view with C and Kick; the console
`screenshot` PNG carries the HUD.

## Playing: the clients

| Route          | Page                                    | Client                                                        |
| -------------- | --------------------------------------- | ------------------------------------------------------------- |
| `/tf2/play`    | `components/tf2-game/Tf2PlayPage.tsx`   | `lib/tf2-game/client/tf2-client.ts` (online or listen server) |
| `/half-life-2` | `components/sp-game/Hl2PlayPage.tsx`    | `lib/tf2-game/client/sp-client.ts` (`SpWorld`, main thread)   |
| `/portal`      | `components/sp-game/PortalPlayPage.tsx` | `sp-client.ts` + `portal-view.ts` (recursive portal views)    |

All three mount `components/tf2-game/GameCanvas.tsx`: the canvas, the HUD (`GameHud`), loading progress per
stage, errors with retry, pointer lock, fullscreen and the phone's rotate hint. A client owns exactly one
`requestAnimationFrame` (`client/loop.ts`, paused while the tab is hidden) and runs everything on it.

- **TF2** (`tf2-client.ts`): `connectTf2` → create/join (or the listen-server worker, `net/listen-worker.ts`, which
  uses the bots module's brain when one is present) → the map package (one BSP parse feeds the renderer and the
  predicting client world) → per frame: look applied to the view angles, 66.67 Hz commands (`buildUserCmd` →
  `InputSender` → `Prediction`), snapshots into the interpolation buffer, the camera (`client/view.ts`: stairs,
  roll, punch, the zoom FOV; death cam → freeze cam on the killer → chase; spectator in-eye / chase / roaming),
  `WorldRenderer` + `EntityRenderer` + the view model, audio, the HUD at 20 Hz. HUD commands map to match
  commands; build / destroy / disguise / taunt travel as `tf2:extra` (`zExtraCommand`). A new `hello` map
  reloads the level; a reconnect restarts prediction.
- **Half-Life 2 / Portal** (`sp-client.ts`): the browser `SpAssets` (`client/sp-assets.ts`: model sequences and
  bounds from the GLBs' `scene.extras`, hulls from the map's `hulls.bin`, scenes and captions from `snd/`), a
  fixed-step `SpWorld`, level transitions (`trigger_changelevel` loads the next package with the carried
  player; a map that is not published ends the demo), checkpoints (death reloads them inside the world) and
  Continue (`client/sp-save.ts`: the last level start in localStorage). The manifest has no `%noportal` or
  `$surfaceprop` yet, so Portal refuses portals on metal / glass / tool materials by name.
- **Quality** (`client/quality.ts`): desktop / laptop / mobile from WebGL2, the texture limit, memory, cores,
  the GPU name and touch; each sets resolution scale, DPR cap, texture cap, anisotropy, particle budget, prop
  draw distance and portal recursion (2 desktop, 1 phone). A frame-time governor lowers the resolution scale
  under sustained load and raises it slowly.
- **Phones and tablets** (touch-first devices, or Options → Touch → On-screen controls): `touch/TouchOverlay.tsx`
  draws a floating thumbstick on the left, drag-to-look on the right (two fingers at once), the fire / jump /
  crouch / reload / weapon cluster bottom right, and a top row (scores, chat, voice, menu — and full screen and
  the invite link, which have no corner of their own on a phone); class extras (Build / Demo, Disguise, HL2's
  sprint / flashlight) sit above the stick. The overlay stands down while a menu has the taps. Layout panels are
  placed inside the safe-area insets (`usePanelStyle`; GameHud measures them with a probe), the touch layout
  moves TF2's ammo and meters top right and stops the kill feed left of them (`touchOverrides`, which in
  portrait also lifts the objective strip above the thumbs), and a custom HUD's panel files that would sit under
  the thumb cluster ride up above it (`clearOfReserve` in `client/custom-hud/scene.ts`). Menus picked by a
  finger use `--u-menu` (never under 1px per unit) and drop the keyboard hints; the pause menu's dialogs, the
  lobby and the TF2 Hub controls are 44px targets with 16px fields on `pointer: coarse`. The game plays in
  landscape; portrait shows a "turn your device" screen that can be dismissed. Checked on a device matrix by
  `scripts/tf2-game/phone-check.ts` (real touch input, emulated safe areas; its header has the setup).

Smoke test in a real browser (not part of a suite): `scripts/tf2-game/play-smoke.ts` (its header has the setup —
a Vite dev server with the map packages under `LOCAL_STORAGE_DIR`, no Postgres needed). Pure client logic is
tested in `lib/tf2-game/client/play-client.test.ts`.

## Custom HUDs in game

Any HUD from the [HUD editor](tf2-hud-editor.md) can be the in-game HUD: pause menu → **HUD** (TF2 Default,
this device's drafts, the account's saved HUDs, the workshop, or a pasted share link), or the editor's
**Test in game** (`/tf2/play?hud=draft:<id>|cloud:<id>|share:<token>|default`). The choice is remembered
(`localStorage` `rmh-tf2-game-hud`). Code: `lib/tf2-game/client/custom-hud/` (logic, tested in
`custom-hud.test.ts`) and `components/tf2-game/custom-hud/` (UI).

- **Same renderer as the editor.** The HUD's `.res` panels are built by the editor's scene builder
  (`lib/tf2-hud/scene/build.ts`) and painted by its painter onto one canvas over the game, so positions,
  sizes (`c`/`r`/`f`, `pin_to_sibling`, proportional integer scaling), visibility, scheme colours, fonts
  (including font files the HUD ships), textures and labels resolve exactly as the editor previews them.
  The fidelity test checks every panel rectangle against the editor's build for the base HUD and two sample
  HUDs (`sample-huds.ts`) at 1920×1080 and 1280×720.
- **Fed by the live game.** `adapter.ts` maps `HudState` onto the editor's `TestState` (class, team,
  health, ammo, Über/cloak/sticky meters, metal, sentry level, scores, round clock, events) plus the
  `%variables%` only the game knows; `bindings.ts` adds what the game decides at run time (clip vs. no-clip
  ammo labels, condition icons, the health cross fill, KOTH clocks, the win panel's top players, building
  bars); `events.ts` starts the HUD's own animation events (`DamagedPlayer`, the health/low-ammo/Über
  pulses, `AccountMoneyAdded`, disguise fades, `ActiveTimerHighlight`, `TimerIncrement`, …).
- **Cost.** `scene.ts` builds each panel file on its own and caches it under exactly the inputs it reads;
  `renderer.ts` repaints only the changed areas, inside the HUD store's ≤30 Hz publish (no loop of its
  own). Measured in Chromium at 1920×1080 (`scripts/tf2-game/hud-harness/perf.ts`): ~0.3–0.9 ms per update
  when nothing changed, ~0.7–1.4 ms when health or Über changes, ~1.1–2.2 ms (p95 ≤ 4 ms) for a full
  rebuild and repaint. Switching HUDs loads files, fonts and textures first and keeps the old HUD until then.
- **What stays the game's own** (made at run time in TF2 too): the round timer, control points, flags and
  cart, kill feed, chat, messages, damage numbers, crosshair, the voice / PDA menus — placed by the HUD's
  `hudlayout.res` (`layout.ts`). The Engineer's building panels come from the HUD only when it customises
  them (the base pack lacks most of their textures). Missing textures draw nothing in game.
- **Menus follow the HUD, as in TF2** (`menus.ts`, `components/tf2-game/custom-hud/CustomHudMenu.tsx`): a
  HUD that ships its own `scoreboard.res`, `teammenu.res` or `classselection.res` gets that menu drawn from
  it (`PreparedHud.menus`); any other HUD — the TF2 Default included — keeps the game's menus. The panels
  come from the editor's scene builder and painter (exactly where the editor previews the file: the
  fidelity test checks every rectangle, base HUD and the `menus` sample, 1920×1080 and 1280×720) with the
  live game's numbers (team scores and player counts, the class counts, the map, the clock, the local
  player's kills / deaths / assists and class portrait) and what TF2's code adds: the scoreboard's
  `SectionedListPanel` rows (name, domination mark, class icon for your team, score, ping / BOT, best first,
  you highlighted, the dead dimmed; column widths from the dialog's own `*_width` keys, one row per
  `linespacing`), the hovered / focused button armed (its `armed*` colours; the class menu's team-coloured
  `class_sel_sm_*` picture, the HUD portrait standing in while those textures are unpublished), and a flat
  team-coloured door where TF2 draws its 3D doors. Over the canvas lies a layer of real transparent buttons
  at the HUD's button rectangles: mouse, touch, Tab / arrows / Enter and the gamepad (`useMenuNav`), each
  named for screen readers (with its player count); number keys follow the HUD (`&3` on BLU in TF2's own
  team menu — `teamMenuHotkeys`; the class menu's 1–9 as before). A button's `command` maps to the game
  (`jointeam …`, `select N` / `joinclass`, `openloadout` → the pause menu's Loadout, cancel). The scoreboard
  canvas is `aria-hidden` over a visually hidden copy of the game's own table. Menus open rarely, so a menu
  is rebuilt when its inputs change (a few ms) and repainted when a texture arrives — no frame loop.
- **The spectator GUI** (`spectator.res`) is drawn on the HUD canvas while dead after the freeze cam or
  spectating, when the HUD customises it: the respawn time and map through the game's strings, the watched
  player's target ID (`targetid.res` placed by the HUD's `CSpectatorTargetID` block, read as
  `resource/ui/cspectatortargetid.res`) with their name and health. The game's own respawn text stays for
  screen readers.
- **Panel files loaded into panels.** Some panels load another file into themselves at run time
  (`CTFFreezePanelHealth` → `freezepanelkillerhealth.res`, `CTFSpectatorGUIHealth` →
  `spectatorguihealth.res`): the scene builder lays that file out inside the panel
  (`embeddedFileFor` in `lib/tf2-hud/scene/build.ts`), in game and in the editor alike, so the freeze cam's
  killer health lands inside its card (showing the killer's health, a building's background for a sentry
  kill). A page that lists the loaded file as well draws it once, nested.
- **Language.** `#Token` labels read, per token: the HUD's own `resource/*_<language>.txt`, its
  `*_english.txt`, the game's `resource/tf_<language>.txt` and `tf_english.txt` (published with the HUD
  base — see [Game assets](#game-assets)), then the game's built-in stand-ins (`hudTokens`, c-tf2-game).
  The language is the site's when the game ships it (`<html lang>` → `languageForSite`), else English.
  Strings with `%s1` (respawn time, player counts) are filled as TF2 does (`localize`).
- **Edit HUD** opens the full editor over the match (offline play pauses: the listen server holds the
  match, `MatchRunner.setPaused`; online play goes on); **Test in game** applies the edited draft and
  returns; **Export** is the editor's zip for `tf/custom`. A draft saved in another tab is re-read
  (`BroadcastChannel` `rmh-tf2-hud-drafts`). In full screen the editor and its dialogs, menus and popovers
  mount inside the full-screen element (`editorContainer`, `lib/tf2-hud/portal-root.ts`), so it no longer
  leaves full screen; it borrows the pointer lock and gives it back from the click that returns to the
  game (`PointerLockMemo`).
- **Resuming an offline pause** (the pause menu or the editor) shows no correction: the listen server
  holds the match on its tick and restarts its clock on release; the client holds its render clock with it
  and rebases it by the time held (`RenderClock.hold` / `release`) and keeps its prediction, whose pending
  commands are still the server's next ones. `client/net/pause-resume.test.ts`: after a 5 s pause while
  walking, every correction stays under 1 unit.
- **Quick AI** (`components/tf2-game/ai/HudQuickAi.tsx`, in the pause menu's HUD view and as a small dock
  over the in-game editor): a one-line "Ask AI" prompt ("bigger health, centre it", "minimal competitive
  HUD") and chips chosen for your class, weapon and screen (`lib/tf2-game/client/ai/suggestions.ts`: a Medic
  gets "Bigger Über meter", a Sniper "Charge meter by the crosshair" — "Bow charge" with the Huntsman — a
  Demoman the stickies, a Spy the cloak, a phone with touch controls "Keep clear of touch buttons", an
  ultrawide screen "Pull the HUD in from the edges"). It works on the HUD in use through the editor's store
  (`ensureEditorHolds`: the TF2 Default becomes a new draft, a workshop HUD a copy — never someone else's
  cloud HUD), asks the editor's own endpoint (`POST /api/tf2-hud/ai`, select → edit; a chip names its files,
  so "select" is skipped) with a note about the player as `context` data (class, weapon, screen size, touch
  buttons — `hudQuickContext`, no names), dry-runs the proposed changes with `applyChanges` and shows a
  compact diff plus a live preview (the game's renderer, drawn once). **Apply & test in game** is one step
  in the editor's history, saved to the draft and drawn by the game at once; **Undo** steps that history
  back (while nothing else changed since); **Open in editor** goes deeper. Requests can be cancelled (the
  button, or Esc in the field), a double tap is one request, `{ unavailable: true }` says so and offers the
  chip's preset instead.
  - **Local presets** (signed out, or the AI unavailable; `lib/tf2-game/client/ai/hud-presets.ts`): bigger
    health / ammo / Über (every panel of the file scaled about its anchors, `r120` stays bottom-anchored, a
    bigger font of the same face from the HUD's own scheme), minimal (class portrait, max health and the
    ammo background hidden), meters by the crosshair, ammo by the crosshair, keep clear of touch buttons
    (the bottom-right cluster lifted 200 units, once). They read the HUD's own files, touch only panels that
    exist and produce the assistant's change format, so they go through the same validator and undo the
    same way. Tests: `lib/tf2-game/client/ai/quick-ai.test.ts` (tf2 suite).
- Harness: `shoot.ts` adds `custom-*` shots and `compare-*` (game HUD beside the editor's pipeline, same
  HUD and state; for a menu, the editor's preview of that menu's file), including `custom-menus-*` /
  `compare-menus-*` for the scoreboard, team and class menus, the spectator GUI and the freeze cam
  (`s=spectating` is the spectator scenario); `tap-check.ts` covers the pause menu and its HUD view.

## Developer console

All three games have Source's developer console: the backquote key (when **Options → Keyboard → Developer
console** is on — `con_enable`; automatic means on with a keyboard, off on touch-first devices), the pause
menu's **Console** entry, or `?console=1` (or `?-console`, the engine's launch option) to open it at start for
the session. The engine is `lib/tf2-game/console/` (environment-agnostic, tested in the tf2 suite); the panel
is `components/tf2-game/console/Console.tsx` (mounted once by `GameHud`) with `NetGraph.tsx` for
`net_graph` / `cl_showpos`.

- **Engine** (`core.ts`, `cvar.ts`, `tokenize.ts`). ConVar / ConCommand semantics from `tier1/convar.*`:
  typed cvars (int / float / bool / string) with defaults, `[min, max]` clamping as `ClampValue`, atof
  parsing, change callbacks, help text and the FCVAR_* bits (`CHEAT`, `ARCHIVE`, `REPLICATED`, `GAMEDLL`
  (server), `CLIENTDLL`, `NOTIFY`, `HIDDEN`, `SPONLY`). The command buffer is CCommandBuffer's: `;` and
  newlines split commands outside quotes, `//` comments out the rest of the line, CCommand::Tokenize makes
  each of `{ } ( ) ' :` its own argument, `$` is never expanded, `wait [n]` delays the rest by n frames
  (the client calls `frame()` after each rendered frame), and an alias's commands run before whatever
  follows it. Safety the engine leaves to its buffer size is explicit: aliases (and cfgs exec'ing cfgs)
  nest at most 32 deep without a `wait` (`alias a a` stops with an error), and at most 4096 commands run
  per frame. Scrollback is capped at 2000 lines; history (100) and the cfg files live in localStorage
  (`rmh:tf2-game:console:<game>:…`, every access try/catch — a refusing storage leaves the console working
  in memory).
- **Settings are cvars** (`settings-cvars.ts`): `sensitivity`, `m_yaw`, `m_pitch` (negative inverts),
  `m_rawinput`, `fov_desired`, `viewmodel_fov`, `volume`, `snd_sfxvolume`, `snd_voicevolume`,
  `snd_musicvolume`, `cl_showfps`, `mat_quality` (0 auto … 3 high), `closecaption`, `crosshair`,
  `cl_crosshair_style`, `cl_crosshair_red/green/blue`, `cl_crosshair_scale`, `tf_dingalingaling`,
  `hud_combattext` (TF2), `cl_autoreload`, `hud_reduce_flashing`, `con_enable`, `joy_*`, `touch_*`. The
  settings record (`client/settings.ts`, which gained `mYaw`, `mPitch` and `devConsole`) stays the one
  source of truth: a cvar writes it (the play page saves and applies it, as the Options panel does) and a
  panel change flows back into the cvars without echoing; these are ARCHIVE but left out of config.cfg.
- **Binds** (`binds.ts`): Source key names (`w`, `mouse4`, `kp_end`, `semicolon`, `mwheelup`…). A bind to an
  action command (`+forward`, `+attack2`, `slot3`, `invnext`, `voice_menu_1`, `+showscores`, `impulse 100`…)
  sets that key in the settings' key bindings, so the Options panel shows it; any other command (an alias,
  `say gg`, `toggle cl_showfps`) goes to the console's own table and runs from the panel's window
  listener while the game has the keys; a `+` bind runs its `-` form on release (Key_Event). Escape and the
  backquote key are reserved. `bind`, `unbind`, `unbindall`, `bind_toggle`, `key_listboundkeys`.
- **cfg files**: `exec <name>`; `config.cfg` is rewritten (`host_writeconfig`) whenever a console bind or an
  archived console cvar changes and replayed when the game starts, then `autoexec.cfg`; `cfg_edit <file>`
  opens an editor in the panel, `cfg_list`, `cfg_delete`.

### Where each command runs

Client commands run in the browser; server commands are forwarded as `HudCommand { kind: 'extra' }` → the TF2
client's transport (the listen-server worker, or the peer-to-peer host — shaped by `zExtraCommand`) or the single-player client's world, and **validated again on the
server** (`server-commands.ts`: every argument's type and range, printable text, at most 8 × 64 characters)
before `console/tf2-server.ts` (in `Tf2MatchHost.onCommand`, between ticks; 20 commands burst, 8/s per
player) or `console/sp-server.ts` runs them. Replies come back as `console` events and replicated cvars as
`cvar` events (also sent to a player who joins late); the client mirrors them.

| Game        | Client (browser)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Server (match host / single-player world)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All         | `echo` `help` `find` `cvarlist` `toggle` `incrementvar` `alias` `exec` `host_writeconfig` `history` `clear` `wait` · `toggleconsole` `showconsole` `hideconsole` · `bind` `unbind` `unbindall` `bind_toggle` `key_listboundkeys` · `cfg_edit` `cfg_list` `cfg_delete` · `net_graph 0–4` `cl_showfps` `cl_showpos` `fps_max` `r_drawviewmodel` `hud_fastswitch` `developer` `screenshot` / `jpeg` (the game view and its HUD as a PNG) · `+`/`-` actions, `slot1–9` `invnext` `invprev` `lastinv` `messagemode(2)` · `impulse 100` · `disconnect` `quit` `retry` · the settings cvars                                     | player: `kill` `explode` `status` `getpos` · cheats: `noclip` `god` `buddha` `notarget` `impulse 101` `give <item>` `setpos x y [z]` `setang p y [r]` `hurtme [n]` `ent_fire <target> [input] [value] [delay]` (`!picker` = what you look at) · `sv_cheats` (host)                                                                                                                                                                                                                                                                                                                                                                                       |
| TF2         | `say` `say_team` `jointeam` `joinclass` `voicemenu` `voice_menu_1–3` `build` `destroy` `disguise` `lastdisguise` `taunt` `dropitem` `changeclass` `changeteam` (the HUD's own commands — the hub's zod schemas) · `thirdperson` / `firstperson` (cheat, checked against the replicated `sv_cheats`) · `changelevel` / `map` (the listen server's host — offline or peer-to-peer; everyone reloads the level from the new `hello`, keeping their seats) · `kick <name\|#id>` `kickid` `sv_password` `sv_lock` `rcon <say …\|command>` (the host; lock and password also to the hub, `tf2:room:admin`) · `connect <code>` | player: `ping` · host: `mp_restartgame <s>` `mp_timelimit` `mp_winlimit` `mp_friendlyfire` `sv_gravity` (replicated: players' movement, everything MOVETYPE_FLYGRAVITY — pipes, stickies, syringes, dropped packs, each by its own gravity scale — the bots' grenade aim, the client's gibs) · cheats, listen server only: `host_timescale 0.1–10` (the runner's pace; replicated: the client's ticks and clock follow) `tf_bot_add [n] [class] [red\|blue\|auto] [difficulty] [name] [noquota]` (any order, as CTFBot's; a class sticks) `tf_bot_kick` / `tf_bot_kill <name\|class\|team\|all>` `tf_bot_quota` `tf_bot_difficulty` `tf_bot_force_class` |
| HL2, Portal | `say` (prints)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | player: `save` / `load` (the checkpoint) · host: `changelevel` / `map` (published maps only) · cheats: `host_timescale` (the client's fixed step), `impulse 101` (HL2: the suit, health and armor — the demo has no weapons; Portal: the dual portal gun) · Portal: `portal_place <0\|1> [x y z p y r]`, `sv_portal_placement_never_fail`                                                                                                                                                                                                                                                                                                                |

While it is open the game sees no input (`input.suspended`), and Half-Life 2 / Portal pause, as Source's
single-player does (TF2 never pauses for it).

**Permissions.** A listen server — offline play, or this browser hosting
peer-to-peer — is administered by its host (`LISTEN_PLAYER_ID`): only they set server cvars, add bots or
restart, and with `sv_cheats 1` every player there may cheat, as on a Source listen server. `sv_cheats 0`
ends everyone's noclip / god / buddha / notarget and resets the cheat cvars. Single-player is always its own
host. Server-side cheat commands are not pre-checked by the client (a line like `sv_cheats 1; noclip`
reaches the server in order); client-side ones (`thirdperson`) are checked against the replicated value.

**In the simulation.** `noclip` puts the movement in MOVETYPE_NOCLIP (part of the replicated MoveState, so the
owner's prediction flies too; `Player.syncMoveInputs` keeps it; turning it off steps out of solid like
FindPassableSpace); `god` is DAMAGE_NO in single-player and does nothing in TF2, as in the SDK: `CC_God_f`
(`game/server/client.cpp`) returns under `TF_DLL` unless Mann vs. Machine is on, because TF2 always runs as
deathmatch (`gpGlobals->deathmatch`) — the console says so and suggests `buddha`; `buddha` keeps the player at 1
health (`Player.buddha`, `SpPlayer.buddha`); `notarget` sets FL_NOTARGET, which sentries and the TFBot
perception skip; `give` spawns TF2 pickups at the player or equips a stock weapon of the player's class
(single-player: the suit, battery, health, the portal gun); `setang` tells the owner's client to snap its view.

**`screenshot` / `jpeg`** composite three layers into one PNG (`console/screenshot.ts`): the 3D canvas, read
right after its frame; the HUD's canvases (a custom HUD) where they sit; and the DOM HUD, serialized into an
SVG `foreignObject` with every element's computed style inlined, its canvases as images and its fonts'
`@font-face` files embedded — the browser renders its own HTML, no library. The console's panel is left out.

**`ent_fire` completion** (`console/entity-complete.ts`): names and classnames from what the client knows of
the server's entities — TF2: the map's entity lump the level was loaded from (snapshots carry no names) and
every class the simulation registers; Half-Life 2 / Portal: the world itself. A target's inputs are the
`case` labels of its class's `acceptInput` chain (lower-case, as the I/O system compares them) after the
spelling the map's own outputs use (`gate_door,Open`).

**Gaps.** `ent_text` / `ent_bbox` are not implemented; runtime-spawned entities have no
names to complete.

## Items and loadouts

Players can wear what they build in the [loadout builder](tf2-hub.md): pause menu → **Loadout**
(`components/tf2-game/tf2/LoadoutPauseView.tsx`, the builder's own class picker, slot tiles, item picker,
customise modal and 3D preview) loads this device's drafts or the account's saved loadouts and **Equip**s
one. As in TF2 a change applies at the next respawn or resupply, or at once inside your own respawn room;
the view says which. Bots stay stock; at hard and expert each held slot may carry a fully simulated unlock
(`sim/items/bots.ts`, from the match's seeded random stream).

- **Quick AI** (`components/tf2-game/ai/LoadoutQuickAi.tsx`, at the top of the Loadout view): a prompt and
  chips from the live match (`loadoutSuggestions`: "Counter the Sniper Rifle" once it has killed you twice,
  "Counter their Sniper" for the enemy team's most common class, "Rocket-jump set" / "Sticky-jump set",
  "What's good on cp_granary?", festive and Halloween looks). Signed in it asks `POST /api/tf2-loadout/ai`
  with `context` — the match as data (`matchContextFrom`: map, mode, round, your class and team, the enemy
  classes from the scoreboard, what killed you by weapon and class from a session death log that outlives the
  kill feed; no player names, capped by `matchContextSchema`, quoted to the model in its own `MATCH` data
  frame; prompt `tf2-loadout-assistant` v2). Signed out, or when the AI is unavailable, the item-name matcher
  (`heuristicSuggest`) answers locally with each chip's own words. Equips are catalog-checked on the server;
  **Equip** puts them into the class's draft under the game's rules (`applyLoadoutActions` → `equipInto`,
  so a clashing cosmetic is replaced) and sends it through the view's own `loadout` command — the
  respawn/resupply rule applies and the match's answer is shown; **Undo** restores (and resends) the
  loadout before.
- **Command.** `{ cls, slots }` (`net/lobby-schema.ts` `zLoadout`, the saved-loadout slot schema) → the
  match command `{ kind: 'loadout' }`, to the listen server offline or over the P2P link to the host. `sim/items/command.ts` checks it like a saved loadout
  (`lib/tf2-loadout/validate.ts` `slotProblem` — class, slot, equip regions, duplicates — plus the game's
  rules, `checkGameLoadout`) and answers the owner with a `loadout` event: `applied`, `pending` or
  `refused` + reason. The private NET_PLAYER fields `loadoutPending` / `inSpawnRoom` drive the view's status.
- **Catalog.** The browser fetches `/api/tf2-loadout/catalog` for the listen server (`{ t: 'items' }`) and
  for prediction. Both call `setItemCatalog`
  (`sim/items/registry.ts`). Without a catalog everyone is stock.
- **What an item does** (`sim/items/resolve.ts`): a weapon's `item_class` (after TranslateWeaponEntForClass)
  picks the stock implementation, or an unlock script that refines one (`data/unlock-scripts.ts`, generated
  by `scripts/tf2-game/extract-unlock-scripts.py`: the Direct Hit is the rocket launcher running
  `tf_weapon_rocketlauncher_directhit`), or — for the unlock scripts with a C++ class of their own
  (`ownClass`) — that class ported in `sim/weapons` (`UNLOCK_WEAPON_FACTORIES`, kept equal to
  `support.ts` `IMPLEMENTED_OWN_CLASSES` by a test); `tf_wearable…` items are worn providers (Gunboats, the
  shields, the Razorback); an item class with no implementation here (only the Thermal Thruster now) is a
  **fallback**: the wearer gets the class's stock weapon of that slot, and the builder view says so.
- **Unlock weapons** (`sim/weapons`, their projectiles in `sim/projectiles`, each file names its SDK class):
  the Huntsman and the Crusader's Crossbow (`bow.ts`, arrows `arrow.ts`: draw → damage/speed/gravity,
  headshots, lit arrows, healing bolts); Jarate, Mad Milk, the Flying Guillotine and the Gas Passer
  (`throwables.ts`, `jar.ts`: JarExplode, bleed, the gas cloud and its ignition); the Sandvich family,
  Bonk! and Crit-a-Cola (`lunchbox.ts`: the eating/drinking taunts at the scenes' lengths, bites, phase and
  the dodged-damage slow, the dropped lunch box); the Flare Gun, Detonator, Scorch Shot and Manmelter
  (`flaregun.ts`, `flare.ts`); the Pomson, Righteous Bison and Cow Mangler (`energy.ts`: energy clips,
  `projectiles/energy.ts`); the banners and the B.A.S.E. Jumper (`buff-item.ts`: the horn, rage pulses);
  the Loose Cannon (`cannon.ts`, `cannonball.ts`: fuse, push, double donk); the Dragon's Fury
  (`dragons-fury.ts`, `fireball.ts`); the Wrangler (laser dot; the sentry's player control, 66 % shield and
  3 s disable live in `buildings/sentry.ts`), the Short Circuit (`orb.ts`) and the Rescue Ranger (repair
  bolts, long-range pickup in `buildings/player-objects.ts`) in `engineer.ts`; the Ambassador
  (`revolver.ts`). The shared machinery — the effect bar (`tf-weapon.ts`: jars, drinks, the cleaver),
  energy weapons, demo shield charges and charge crits (`melee.ts`) — follows CTFWeaponBase. Their sounds
  are listed for the `game-sounds` channel by `scripts/tf2-game/sound-list.py` (`UNLOCK_PREFIXES`,
  `UNLOCK_NAMES`); until the channel is republished they are silent. `sim/items/unlocks.test.ts` drives each
  through the game's commands against the SDK's numbers (catalog entries in
  `__fixtures__/unlock-catalog.ts`, checked against a local catalog build when `TF2_ROOT` is set).
- **Player-level unlock state** (`sim/items/effects.ts` `UnlockState` on `Player.unlock`, checkpointed like
  the rest of the player): stuns (StunPlayer's stack), bleeds, rage and buff pulses, the energy drink and
  hype, the Demoman's charge meter, decapitations, revenge crits, feign death, the Dalokohs bonus. Meters
  are NET_PLAYER's private `meter0…3` (charge, rage, drink, the secondary item meter) plus `unlockState`
  (heads, revenge crits, the next melee crit, the Dead Ringer armed …), so the owner predicts them and
  `client/item-meters.ts` turns them into the HUD's item meters (`HudMeters.items`; the custom HUD maps
  them to the editor's `huditemeffectmeter_*`, `hudbowcharge`, `huddemomancharge` meters). The damage
  rules unlocks add run where the SDK runs them (`sim/items/damage-rules.ts`: ApplyOnDamageModifyRules,
  OnTakeDamage, Event_KilledOther, ApplyOnHitAttributes).
- **Attributes** (`sim/items/attributes.ts`, `hooks.ts`): the catalog's `at` (`[class, value, op]`) is
  applied per CALL_ATTRIB_HOOK as the SDK does — a weapon's hooks see its own attributes plus the wearer's
  worn items, a player hook sees every provider (a `provide_on_active` weapon only while active), ops by
  `description_format` (percentage/inverted multiply, additive add, or/lookup set), integer hooks rounded
  like RoundFloatToInt (halves to even: the Huntsman's 25 × 0.5 arrows are 12).
  Weapon-only numbers are folded into the weapon's stats from its defindex (clip, damage, bullets, spread,
  fire delay, reload, deploy), so prediction rebuilds them from the replicated defindex. Simulated:
  damage, clip (override and multiplier), fire rate, reload, bullets and spread, deploy and switch times,
  swords' range and holster penalty, crit chance, projectile speed, blast radius, damage vs players /
  buildings, mini-crits on airborne targets, damage taken (all, fire, blast, bullet, melee), blast-jump
  self damage and force, health on hit / on kill / on blast damage, über on hit, max health, max ammo,
  move speed (always, active, aiming), health regen, healing received (medics, packs), Medi Gun heal
  rate / overheal / über build and the Kritzkrieg's crits, minigun spin-up, sniper charge rate, cloak
  drain and regen, afterburn damage and duration, airblast cost and its removal, and the unlock rules:
  crits and mini-crits by condition (burning, wet, airborne, from behind, the Backburner), crits that
  become mini-crits and back, crit falloff, bleeding, marks for death, Natascha's slow, the Pomson's drain,
  speed and charge on hit, cloak on hit, rage on kill, kill crit boosts, the shield's turn control /
  recharge / impact / duration, heads, hype and boost, air dashes, the parachute, the effect bar's rate,
  the Rescue Ranger's attributes, the Equalizer / Escape Plan, the Dead Ringer and the Cloak and Dagger
  (`sim/items/support.ts` `SUPPORTED_ATTRIBUTES`; some only for some values, `PARTIAL_ATTRIBUTES`; some
  only on their item class, `ITEM_CLASS_ATTRIBUTES` — set_weapon_mode is a lunch box's type on a lunch box
  and a flare gun's on a flare gun).
  Everything else on an item is listed as unsupported and the Loadout view shows "Some of this item's
  effects aren't simulated yet" with the list. Whole mechanics not simulated (`ITEM_CLASS_MECHANICS`):
  the Air Strike, the Shortstop's shove, revenge crits from sentries (Frontier Justice), Crikey, the
  Bazaar Bargain's heads, the Classic's charge, honorbound, balls, the Caber, the Gunslinger, slaps,
  sapper variants. Still partial among the rest: the Quick-Fix and Vaccinator charges, the Machina, the
  Phlogistinator's Mmmph (it needs a taunt), the Sydney Sleeper, the Beggar's Bazooka, Natascha's mode,
  the Spy-cicle, Your Eternal Reward, the Widowmaker. Against the local catalog build (each item with a
  weapon slot for some class, `resolveItem` per class): of 328 weapon-slot items, 243 are fully
  simulated, 84 partly, 1 falls back (the Thermal Thruster) — before the unlock work 166 / 118 / 44.
- **Bots** take only fully simulated unlocks their brain can use by holding +attack
  (`sim/items/bots.ts` `BOT_UNUSABLE_ITEM_CLASSES` keeps the bow, the Loose Cannon, lunch boxes, banners,
  the parachute, the Wrangler and the Gas Passer away from them).
- **Replication.** NET_PLAYER `items` (public string) lists what a player shows:
  `/`-separated `<slot code><defindex>[w][s<style>][p<paint>][e<effect>][f][k<kit>.<wear>.<seed>][x<sheen>[.<killstreaker>]]`
  (`P/S/M/D/E/B/A` weapon slots, `w` worn, `C` cosmetics; `sim/items/loadout.ts` `encodeItems`). The
  predicting client restores the owner's worn providers from it, and the renderer dresses every player.
- **Rendering** (`render/entities/loadout-models.ts`): unlock weapons (third person and the view model,
  with the role's view-model activity table) and cosmetics from the loadout builder's model channel —
  rigid parts on their bone at the converter's pose, bone-merged ones on the skeleton — with paint
  (two-tone paints switch per team), styles, per-class variants, the body groups they hide, festivizers,
  war paints and unusual effects (`ParticleLibrary` `unusual:<id>`, the loadout particle channel, on the
  head). Until a model loads, or when the channel has none, the class's stock weapon of the slot is drawn.
  - **Team skins:** a BLU player's items wear the GLB's BLU variant (`extras.blu`, team-skins.ts): tints at
    once, BLU's texture when decoded (once per model, shared by every player wearing it).
  - **Weapon unusual effects** (`e<id>` on a weapon with a `particle_suffix`): `unusual:<id>:<suffix>`, its
    control points on the weapon's own `unusual_<n>` attachments (`weapon:<name>` resolves on the held
    weapon, stock or unlock; `FxPlacement.schemaPrefix`), in third person and in the view model's pass.
  - **Killstreak kits** (`x<sheen>.<killstreaker>`): the sheen is a tinted rim plus a band that sweeps along
    the weapon every 2.5 s (model-material.ts `uSheen`, on the weapon's own uniform set, stock or unlock,
    both views; Team Shine takes the team's colour); the killstreaker (`killstreak_t<n>_lvl1`, `_lvl2` from
    ten kills; class_fx.pcf, in `particle-systems.txt`) burns at the `eyeglow_l/r` attachments in the sheen's
    colour (control point 9) while the wearer is on a streak of five or more. Streaks are counted by the
    renderer from the death events it sees (kills since the player's last death), so a client that joins
    mid-streak counts from then.
  - **Jiggle bones** (`lib/tf2-loadout/jiggle.ts`) swing on cosmetics after the wearer's pose, within 1000
    units of the camera; farther away they rest.
  - **Bone-merged worn weapons:** the Gunboats and Mantreads deform with both feet (`extras.boneMerge`).
  - **Budget:** cosmetics are not drawn beyond 1800 units, and all players' items share a per-frame draw
    budget (`ITEM_DRAW_BUDGET`, 200 meshes) handed out nearest player first. Each item mesh is already one
    draw per material (the converter merges a model's geometry per texture), so there is nothing left to
    merge per player: 24 decorated players (`loadout-crowd`) draw 235 entity meshes, 107 of them items
    with 107 distinct materials and no two of one model and material on a player; total 357 draws (266 with
    stock looks).

## Game assets

The `tf2-assets-sync` workflow converts the game's content into object storage
under `tf2-game/`, as channels gated by the Steam build like the hub's (see
[TF2 Hub](tf2-hub.md) "Keeping the game files current"). Builder versions live
in `lib/tf2-game/assets/versions.ts`; the workflow reads them from there.

| Channel                        | Stored at                                                   | Built by                                                                                      | Entry point (published last)        |
| ------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------- |
| `game-models`                  | `tf2-game/mdl/`, shared `tf2-game/tex/`                     | `scripts/tf2-game/model-list.py` → `models.py`                                                | `mdl/index.json`                    |
| `game-sounds`                  | `tf2-game/snd/<sha>.mp3`                                    | `scripts/tf2-game/sound-list.py` → `sounds.py` (ffmpeg)                                       | `snd/index.json`                    |
| `game-particles`               | `tf2-game/particles/{effects,tex}/<sha>`                    | `scripts/tf2-game/game_particles.py` (`particle-systems.txt`)                                 | `particles/index.json`              |
| `game-maps`                    | `tf2-game/maps/`, shared `tf2-game/tex/`                    | `scripts/tf2-game/build-maps.ts` (see [Maps](#maps))                                          | `maps/index.json`                   |
| `hl2-maps`, `hl2-models`       | `hl2-game/maps/`, `hl2-game/mdl/`, `hl2-game/tex/`          | `build-maps.ts --game hl2`, `models.py --search hl2` (Half-Life 2 demo, app 219)              | `maps/index.json`, `mdl/index.json` |
| `portal-maps`, `portal-models` | `portal-game/maps/`, `portal-game/mdl/`, `portal-game/tex/` | `build-maps.ts --game portal`, `models.py --search portal,hl2` (Portal: First Slice, app 410) | `maps/index.json`, `mdl/index.json` |
| `hl2-sounds`, `portal-sounds`  | `hl2-game/snd/`, `portal-game/snd/`                         | `sound-list.py --game hl2\|portal` → `sounds.py --game hl2\|portal` (ffmpeg)                  | `snd/index.json`                    |
| `csgo-*` (five channels)       | `csgo-game/<kind>/`, shared `csgo-game/tex/`                | `csgo-assets-sync.yml` (app 740), see [CS:GO (Dust II)](#csgo-dust-ii)                        | each kind's `index.json`            |

`GET /api/tf2-game/assets/<kind>/<file>` serves them (`lib/tf2-game/assets/store.server.ts`,
paths checked by `paths.ts`): content-addressed files are immutable for a year,
index files revalidate after five minutes, Brotli passes through. In the
browser, `lib/tf2-game/assets/urls.ts` builds the URLs and loads the indexes.
The scheme is `<game>-game/<kind>/`: `GET /api/hl2-game/assets/…`,
`GET /api/portal-game/assets/…` and `GET /api/csgo-game/assets/…` serve the other games with the
same code (a `game` argument). Files named by a content hash (64 hex, or the model channel's 40) are the
immutable ones, including multi-part extensions such as `<sha>.hulls.bin`.

- **Sounds.** `snd/index.json` is `{ v, entries: { <script name>: { waves: [sha…],
volume: [min,max], pitch: [min,max], soundlevel, channel, flags? } }, files:
{ "sound/<path>": "<sha>.mp3" }, loops: { "<sha>.mp3": { start, end } } }`.
  Scripts are read tf/-first (`gamefs.py`), conditionals evaluated as Windows
  desktop, Source's prefix characters kept as `flags`. MP3 is mono 64 kbps
  (less below 32 kHz) unless the sound is stereo by design (`)`, `^`, music:
  96 kbps stereo); an MP3 source already that small is copied untouched. Loop
  points come from the WAV `cue `/`ltxt` or `smpl` chunk, in seconds of the
  source. The encoder's leading padding is recorded in the LAME header, which
  Chromium and Firefox trim when decoding; where it is not trimmed (Safari) a
  loop starts about 25 ms late. The default list is about 1,400 files.
- **Half-Life 2 and Portal sounds.** `sound-list.py --game hl2|portal` lists what the published
  maps use (read as their gameinfo.txt searches, sound packs included — `gamefs.SearchFS`):
  entity values naming a script entry or a sound file (ambient_generic, door / button / train
  sounds), env_soundscape soundscapes and their waves, logic_choreographed_scene speech (read
  from `scenes/scenes.image`, `sourcegame.SceneImage`), the NPCs and surfaces present, the
  player and each game's own set (portal gun, portals, energy balls; the suit), dropping what
  the demo depots do not ship; `--max-files` defaults to 800. `sounds.py --game …` publishes,
  next to the index, `snd/soundscapes.json` (`{v, soundscapes: {name: {dsp?, rules}}}`),
  `snd/scenes.json` (`{v, scenes: {"scenes/…/x.vcd": {duration, speak: [{actor, sound, start,
end, cc?, ccType?}]}}}`) and `snd/captions.json` (`{v, lang, captions: {token: {text, color?,
sfx?, len?, delay?, norepeat?}}}` — English captions, `<clr>` / `<I>` / `<B>` / `<cr>` reduced
  to `<color=#rrggbb>`, `<i>`, `<b>` and newlines). About 650 files / 11 MB (HL2) and 340 files
  / 14 MB (Portal, mostly its songs). Tests: `-p test_sourcegame.py` (with `HL2_ROOT` /
  `PORTAL_ROOT` it also lists the real games).
- **Playback.** `lib/tf2-game/audio/` (`AudioEngine`) mixes over the page's shared
  `getAudioContext()`: Source's sound-level attenuation (`attenuation.ts`), per-entity channel
  replacement (`channels.ts`), an LRU of decoded buffers under a byte budget, HRTF panning,
  volume groups, voice ducking, throttled occlusion, a 48-voice limit, soundscapes with the
  3-second crossfade, scene speech and caption events for the HUD.
- **Particles.** `particles/index.json` is `{ v, systems: { <name>:
"effects/<sha>.json" }, missingTextures }`; each bundle is exactly the loadout's
  `ParticleBundle` (built by `scripts/tf2-assets/particles.py`'s `Graphs`), with
  `id` a stable hash of the name and `schema: { system }`. Its texture frames are
  `particles/tex/<sha>.webp` — load them with `particleAssetUrl`, not the loadout's
  `PARTICLE_API`.

**Storage budget.** Every game channel (all games) shares one budget — and so does the HUD base
(`tf2-hud-base/`: the HUD panels, textures and the game's localisation `resource/tf_<language>.txt` that
custom HUDs and the HUD editor read; `COUNTED_CHANNELS` in `versions.ts`),
`TF2_GAME_STORAGE_BUDGET_GB` (a repository variable; default 12 GB, R2).
Before any game upload, `scripts/tf2-game/storage-report.ts report` sums the
stored size of every channel of every game from its state file — no bucket
listing — plus what this run would add (an object two channels publish, like a shared
`tex/` file, counted once), and fails the publish past the budget. Run it locally
(with the S3 variables) to see the footprint. Keep lists lean: `sound-list.py
--max-files` (default 1,600) fails a selection that grows, and
`particle-systems.txt` names only systems the game spawns.

Local runs: `python3 -B scripts/tf2-game/sound-list.py --root <install> --out list.json`,
`python3 -B scripts/tf2-game/sounds.py --root <install> --list list.json --out out`,
`python3 -B scripts/tf2-game/game_particles.py --root <install> --out out`. A
dedicated-server install has no texture or sound data, only their indexes: the
particle exporter records the textures it could not read and carries on; the
sound exporter reports every file as missing. Exporter tests:
`python3 -B -m unittest discover -s scripts/tf2-game -p 'test_sounds.py'` and
`-p test_game_particles.py` (the latter needs `vpk numpy pillow srctools==2.6.2`).

### CS:GO (Dust II)

Counter-Strike: Global Offensive runs on the same browser Source engine with one map, `de_dust2`
(`CSGO_MAPS` in `lib/tf2-game/assets/game-maps.ts`, mode `de`; deathmatch plays the same package),
default loadouts and **skinless** weapons: no weapon finishes, stickers, agents or gloves beyond the
defaults. Its assets live under `csgo-game/` and are served by `GET /api/csgo-game/assets/…`
(`app/routes/api/csgo-game/assets/$.ts`, the same thin route as HL2's and Portal's).

**Where they come from.** `.github/workflows/csgo-assets-sync.yml` — separate from
`tf2-assets-sync.yml` so that job keeps its time and disk budget — downloads the CS:GO dedicated
server (Steam app 740) **anonymously** (`+login anonymous +app_update 740`, no Steam account), ≈33 GB
into `/mnt/csgo`, with retries. It shares the game's content depot, so materials and sounds are in
it; the "Verify the install's content" step samples textures, sounds, models and Panorama icons and
warns if their data is missing (the channels still build, untextured or silent, and say so in their
logs). The install cannot be fetched in a development container, so **this pipeline only runs in CI**;
every converter is unit-tested on synthetic files (`test_csgo.py`, and the TS suites below).
Triggers and gating mirror the TF2 job: after `deploy` on main, daily at 06:43 UTC, or by hand
(`force`, `limit`); the gate compares app 740's public build id and each channel's builder version
(`CSGO_GAME_BUILDER_*` in `versions.ts`) with the channel's state file, so an unchanged build
downloads nothing. Expected durations on a full rebuild: download 25–40 min, maps ~5 min, models
10–25 min, sounds 3–5 min, particles ~3 min, HUD data under a minute, uploads 5–10 min (≈60–90 min);
the install is deleted as soon as the conversions finish (and on failure).

| Channel          | What it holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Built by                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `csgo-maps`      | de_dust2's package as for every game ([Maps](#maps)): searched map pakfile → `csgo/pak01_dir.vpk` → loose `csgo/`; the bots' nav mesh generated for the **CS hull** (`NAV_HULL_CS`: 32 × 32 × 72, crouched 54, step 18, jump 56, drop 200; T / CT / deathmatch spawns, bomb sites and buy zones as POIs); and the manifest's optional **`radar`**                                                                                                                                      | `build-maps.ts --game csgo --maps de_dust2`                                     |
| `csgo-models`    | ONE default player model per team (the first `maps/de_dust2.kv` lists that the install has, else the classic factions) and its arms (the map's `<team>_arms`, the default `t_gloves` / `ct_gloves`, the faction's sleeves, bare hands); every default weapon's view, world, dropped and magazine models from `items_game.txt` (prefabs resolved), both default knives, C4 carried and planted, the defuse kit, every grenade's held / dropped / thrown models, shells; Dust II's props | `csgo-model-list.py` + `build-maps.ts --props-only` → `models.py --search csgo` |
| `csgo-sounds`    | ≤ 900 files, by priority: the default weapons' entries (every entry under the prefixes their `visuals.sound_*` name), knives, C4, grenades, taser; bomb; footsteps and impacts of the map's surfaces (with `CT_` / `T_` variants); player damage, death, headshot, kevlar, flashbang ringing; round and announcer events; UI and buy; a few radio commands (the picked factions' voice packs only); the map's ambient sounds and soundscapes                                           | `sound-list.py --game csgo` → `sounds.py --game csgo`                           |
| `csgo-particles` | muzzle flashes (and every effect the default weapons' visuals name), shell ejection, tracers, impacts per surface, blood, HE and C4 explosions, the smoke volume, molotov / incendiary fire, flashbang, decoy, the bomb's light — `csgo-particle-systems.txt` (patterns allowed), ≤ 220 roots                                                                                                                                                                                          | `game_particles.py --game csgo`                                                 |
| `csgo-ui`        | `ui/index.json` → sanitised Panorama SVG icons (`icons/<sha>.svg`: the default items' equipment icons and the HUD's `icons/ui/*`), localisation (`lang/<sha>.json`: every `resource/csgo_<language>.txt`, UTF-16, filtered to the HUD's tokens), and the default weapons' data (`data/<sha>.json`)                                                                                                                                                                                     | `csgo_ui.py`                                                                    |

- **Radar.** `resource/overviews/de_dust2.txt` (`pos_x`, `pos_y`, `scale`, `rotate`, `zoom`,
  `verticalsections`) and `materials/overviews/de_dust2_radar.vtf` (→ `tex/<sha>.webp`, alpha
  kept) become the manifest's `radar: { file, w, h, posX, posY, scale, size: 1024, rotate?, zoom?,
sections? }` (`mapRadarSchema`, additive: the other games' manifests do not carry it). Use
  `worldToRadar(radar, x, y)` / `radarToWorld` (map-manifest.ts): `u = (x − posX) / (scale · 1024)`,
  `v = (posY − y) / (scale · 1024)`, so it holds at any stored size.
- **BSP v21.** `lib/tf2-game/formats/bsp.ts` reads CS:GO's maps with the SDK's lump_t order (only
  L4D2's v21 reorders it), v1 leafs, static props v10 (76 bytes) and v11 (80, uniform scale),
  `dworldlight_t` v1 (100 bytes, `shadow_cast_offset`) and the `byte bevel, byte thin` brush side —
  each with a synthetic test in `bsp.test.ts`.
- **Frame animations.** CS:GO stores every weapon view model's sequences (and many others) as frame
  animations (`STUDIO_FRAMEANIM`): a header, a flag byte per bone, per-bone constants and fixed-size
  per-frame records (Quaternion48S / Quaternion48 rotations, Vector48 or full-float positions).
  `scripts/tf2-assets/srcanim.py` `decode_frame_anim` reads them — the layout as public model tools
  document it, refused when the sizes it computes disagree with the header's — and models builder 2
  rebuilds exactly the models that use them (`FRAMEANIM_VERSION` in their source hash). The run prints how
  many constant-rotation bones decode near the bind pose, a plausibility check on the real install
  (`test_frameanim.py` covers the format on synthetic data). The client draws a view model only once its
  weapon has clips, with the team's default gloves bone-merged onto the weapon; players stay the client's
  own original figures (lib/csgo-game/client/render.ts).
- **Models.** MDL v49 and VTF 7.5 read as TF2's do. VMT conditional keys (`srgb?`, `>=dx90?`,
  `GPU>=2?`, negations) are applied as a high-end Windows desktop; `CustomWeapon` (only its
  `$basetexture` — the default finish) and `Character` are converted as VertexLitGeneric with
  `extras.approx` naming the real shader; the run prints every approximated or unknown shader.
  Texture caps: 1024 px for players, arms and weapons, 512 px for props.
- **Particles.** CS:GO's PCFs go through srctools; a PCF or system it cannot read is logged and
  skipped, and the run prints the operator functions the exported graphs use. Operators the browser's
  `ParticleSimulation` does not implement stay in the bundle and are skipped at run time (they appear
  in `effect.unsupported`).
- **Weapon data — chosen: compact JSON, not the raw KeyValues.** `items_game.txt` is ≈6 MB of paint
  kits, stickers and other items; `csgo_items.compact` extracts the default weapons (and kevlar,
  assault suit, defuse kit) with their prefab chains merged — prices, clip sizes, damage, spread,
  speeds, sound and effect names, models — into `data/<sha>.json` (tens of KB), plus old-style
  `scripts/weapon_*.txt` if an install still ships them. The simulation parses it at run time; none
  of Valve's text is copied into the repository, and the localisation is loaded the same way.
- **SVG safety.** Icons are sanitised when published (`csgo_ui.sanitize_svg`: no script,
  foreignObject, iframe / object / embed, animation or `on*` attributes, no `href` / `url()` /
  `@import` outside the document, no DOCTYPE or entities; links unwrapped) and served with
  `Content-Security-Policy: default-src 'none'; …; sandbox` (`SVG_ASSET_CSP`).

**Storage estimate** (counted against the shared `TF2_GAME_STORAGE_BUDGET_GB` by the same guard,
which both workflows run over every `<game>-game/` channel): map package ≈ 60–90 MB (stripped BSP
≈ 10–15 MB after Brotli, ≈ 500–700 textures ≈ 45–70 MB, nav and radar ≈ 2 MB); models ≈ 250–450 MB
(≈ 150 player / arms / weapon models with their animation packs, ≈ 300 Dust II props, shared `tex/`);
sounds ≈ 20–40 MB; particles ≈ 20–60 MB; HUD data ≈ 2–3 MB — **≈ 0.4–0.65 GB in all**.

Local checks: `python3 -B -m unittest discover -s scripts/tf2-game -p test_csgo.py` (items_game
resolution, the model, sound and particle lists, CS:GO materials, the SVG sanitiser, localisation,
the HUD channel end to end, the workflow; `CSGO_ROOT=<install>` adds the real lists) and
`pnpm exec vitest run --config vitest.tf2.config.ts lib/tf2-game/assets scripts/tf2-game
lib/tf2-game/formats lib/tf2-game/bots` (asset paths and the route, the manifest's `radar`, storage
counting, BSP v21, the nav hull).

**Only CI can verify** (first run on the real install): that app 740 still downloads anonymously and
carries the texture and sound data; the real `maps/de_dust2.kv` / `items_game.txt` names (player
models, gloves, the sound-script and particle-system names the lists match by pattern); that
srctools reads every CS:GO PCF; MDL v49 animation details (CS:GO's `.ani` blocks, zero-frame data)
in `models.py`; and the actual sizes above.

#### The simulation (`lib/csgo-game/`)

Clean-room: there is no CS:GO source code in the SDK, and the leaked code was not used. Rules come from
public behaviour and documentation — the Valve Developer Community's CS:GO cvar list and entity pages,
the game's published defaults, and the community's well-known measurements (the CS:GO wiki's weapon and
equipment pages, Liquipedia's economy tables, the published grenade-trajectory analyses). Every
constant names its source in a comment; **weapon numbers are read at run time from the `csgo-ui`
channel's compact items_game JSON** (`ui/index.json` → `weapons`), never committed.

**Reuse, not a copy.** CS:GO runs on the shared simulation: `CsWorld extends GameWorld`,
`CsPlayer extends Player`, `CsGameRules extends GameRules`, `CsMatchHost extends Tf2MatchHost`,
`CsServerConsole extends Tf2ServerConsole`, and its bots drive the shared nav mesh, A* and
`PathFollower`. The engine was generalised (small, additive seams; TF2 / HL2 / Portal behave as before):

| Seam                                                                                                       | What it lets another game do                                                                                       |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `MoveParams.duckSpeedFraction`, `.bunnyJumpMaxSpeedFactor`, `MoveContext.jumpImpulseScale` (movement)      | CS's 34 % crouch speed, its 1.1 × bunny-hop cap, stamina lowering a jump                                           |
| `Player.hull`, `.standEyeHeight()`, `.hitboxSet()`; `buildHitboxSet` / `traceHitboxSet` (hitboxes)         | another body: CS's 32 × 72 hull (54 crouched), eyes 64 / 46, its hitboxes; spawns check the player's own hull      |
| `GameWorld.createPlayer` / `createRules` / `createSpawnSystem`; `traceAttackWith` (`hitTeammates`, `skip`) | a world with its own players, rules and spawn picking; bullets that hit teammates (friendly fire) and pass a wall  |
| `TeamSpawn(classname)`                                                                                     | info_player_terrorist / counterterrorist / info_deathmatch_spawn are TeamSpawns                                    |
| `Weapon.netSchema?()` (snapshot capture)                                                                   | a weapon's own prediction record (`cs_weapon`)                                                                     |
| `NET_BASE_FIELDS`, `netField`, `moveStateFields()`; ids 512–575                                            | CS's schemas (`cs_player`, `cs_weapon`, `cs_rules`, `cs_planted_c4`, `cs_grenade`, `cs_area`, `cs_dropped_weapon`) |
| `configureNavGeneration(world, { hull })` (bot manager)                                                    | runtime nav generation with NAV_HULL_CS                                                                            |
| `ConsoleGame 'csgo'`, `Tf2ServerConsole(game)`, `runGame` / `applyGame` / `baseMoveParams`                 | CS's commands and cvars in the shared table and console (permissions, rates, replication, the shared cheats)       |
| `MatchOptions.game` / `.variant`, `server/game-registry.ts`, the `Tf2MatchHost` hooks (below)              | a game's host on the unchanged runner, listen server, P2P session, checkpoints and migration                       |

The host hooks: `createWorld`, `installMode`, `createConsole`, `findLevel`, `decorateBot`, `playerScore`,
`helloMode`, `joinTeam` / `joinClass`, `roundTimeLeft`, and `restore` building the class it is called
on; `createTf2MatchHost({ game: 'csgo' })` and `Tf2MatchHost.restore` of a CS checkpoint dispatch to the
registered factory.

What is where:

- **Movement** (`movement.ts`): `CS_MOVE_PARAMS` on the shared `playerMove` — sv_accelerate 5.5,
  sv_friction 5.2, sv_airaccelerate 12, sv_stopspeed 80, sv_gravity 800, sv_maxspeed 320, a jump impulse
  of √(2·800·57) ≈ 301.99 (the measured 57-unit apex; the engine's half-step gravity peaks ≈ 54.7),
  crouch-jumping (base CGameMovement rules), the 1.1 × bunny-hop cap (sv_enablebunnyhopping 0). The max
  speed is the active weapon's `max player speed` (`… alt` scoped), × 0.52 walking, × the tagging slow
  (`flinch velocity modifier large / small`, recovering at 1 /s), × the stamina penalty: sv_staminamax 80,
  sv_staminajumpcost 0.08 (× the impulse), sv_staminalandcost 0.05 (× the landing speed),
  sv_staminarecoveryrate 60 /s, taking (100 − stamina) % off speed and jump. Fall damage is the SDK's
  multiplay rule (580 → 1024). Footsteps only when running. Ladders are not in the shared movement
  (de_dust2 has none).
- **Players** (`player.ts`): 100 health, kevlar / helmet, money, the defuse kit, the bomb; slots primary,
  pistol, knife, a grenade pouch (one weapon carrying every kind with a count; `slot4` again cycles), the
  C4. Damage: hit groups (head ×4, stomach ×1.25, chest / arms ×1, legs ×0.75), then armor by the weapon's
  `armor ratio` (health takes ratio / 2, armor loses half the rest; the head needs a helmet; legs never),
  friendly fire with ff_damage_reduction_bullets 0.33 / _grenade 0.85 / _other 0.4, deathmatch spawn
  protection (mp_respawn_immunitytime 2, ended by firing), assists past 40 damage. Death drops the best
  gun and the bomb (`cs_dropped_weapon`, picked up by walking over it into an empty slot); `drop` (G) too.
  `restoreCsPlayerFromRecords` restores a predicting client's player and weapons from its records.
- **Weapons** (`weapons/`): `CsGun` (every firearm, data-driven: cycle and alt cycle, automatic or
  semi-automatic, clip and per-weapon reserve, whole-clip reloads at the community-measured times and
  shell-by-shell for the Nova / XM1014 / Sawed-Off, scopes with `zoom levels` / `zoom fov` / `zoom time`,
  the bolt-action rescope), `CsKnife` (slash 40 / 25 / 90 from behind, stab 65 / 180: the CS:GO wiki),
  `CsGrenadePouch` + `CsGrenadeProjectile` + `CsArea`, `CsC4` + `PlantedC4`. Accuracy (`combat.ts`):
  inaccuracy from items_game (stand / crouch / move — ramping from 34 % to 95 % of the speed — / jump /
  land / fire, in thousandths of a radian), the fire penalty recovering to 10 % over `recovery time *`,
  the scoped values settling in over `zoom time`; the shot's offsets (an inaccuracy disc plus a spread
  disc per pellet) from the command's seeded stream. Recoil: a spray pattern generated from
  `recoil angle` / `magnitude` / their variances / `recoil seed` (a clean-room seeded random walk), kicking the
  aim punch, which decays by weapon_recoil_vel_decay 4.5, weapon_recoil_decay2_exp 8 and _lin 18 and moves
  the shot by weapon_recoil_scale 2 (the view shows view_recoil_tracking 0.45 of it); the recoil index and
  the penalty are networked, so the host and a predicting client fire the same spray. Damage ×
  `range modifier` ^ (distance / 500). **Penetration**: power `penetration` × 24 units of a modifier-1
  material (per-material modifiers by material-name keywords, as the manifest has no `$surfaceprop`),
  2 surfaces per point of power, 75 % kept plus a thickness loss.
- **Grenades**: carry limits (ammo_grenade_limit_total 4, flashbangs 2, every other kind 1, molotov and
  incendiary shared), throws by strength (full / medium / lob), gravity × 0.4, elasticity 0.45; HE from
  its `damage` / `range` with a Gaussian falloff (σ = radius / 3) through armor; flashbang blindness by
  view angle, distance (full to 300, none past 1500) and line of sight, up to ≈ 4.9 s; smoke 18 s, 144
  units, blocking sight (`smokeBlocksLine`: the bots, the flash) and putting out fires; molotov /
  incendiary fire (inferno_flame_lifetime 7, inferno_damage 40, inferno_max_range 150,
  molotov_throw_detonate_time 2); the decoy's fake shots.
- **Rules** (`rules.ts`, `economy.ts`): the shared round machine with PREROUND as the freeze time
  (mp_freezetime 15), RND_RUNNING the round (mp_roundtime 1.92), TEAM_WIN the restart delay
  (mp_round_restart_delay 7), a CleanUpMap every round and no humiliation. Bomb defusal: the C4 to a
  random Terrorist, planting inside a func_bomb_target in 3.2 s, mp_c4timer 40 with quickening beeps,
  defusing in 10 s / 5 s with a kit, the explosion (info_map_parameters' bombradius, reach 3.5 ×), the
  wins (elimination, bomb, defuse, time → CTs), MR15 (first to 16, 15–15 a draw) with the halftime switch.
  Money: start 800, max 16000, kill rewards from `kill award`, wins 3250 / 3500, the loss ladder 1400 →
  3400 (a win takes one step off), +800 to Terrorists who lose with the bomb planted, nothing for
  Terrorists alive at a time-out, +300 plant / defuse, −300 a teamkill; `buy` checked on the host (zone or
  mp_buy_anywhere, mp_buytime 20 past the freeze, team items, money, carry rules; a helmet alone $350).
  Deathmatch: random spawns (info_deathmatch_spawn, away from enemies), respawn after 2 s, free for all
  (mp_teammates_are_enemies), free buys, a rifle and armor by default, 10-minute matches, points.
- **Map entities** (`entities.ts`): info_player_terrorist / counterterrorist, info_deathmatch_spawn,
  func_bomb_target, func_buyzone, info_map_parameters, the `cs_gamerules` proxy; everything else
  de_dust2 places (func_door(_rotating), prop_dynamic, the trigger, env and logic entities) is the shared engine's.
- **Bots** (`bots/cs-bot-brain.ts`): buy by money, take a site together, plant, hold the bomb, fetch a
  dropped one; CTs split, rotate to the bomb, defuse when clear; deathmatch hunts. Sight by field of view
  and line of sight (smoke and flashes blind), the shared `BotSkill` reaction / aim error / turn rate,
  head aim and spray control by difficulty, counter-strafing, bursts, the occasional HE or flashbang.
- **Console** (`console.ts`): mp_roundtime, mp_freezetime, mp_buytime, mp_maxrounds, mp_startmoney,
  mp_maxmoney, mp_c4timer, mp_round_restart_delay, mp_buy_anywhere, mp_teammates_are_enemies,
  mp_respawn_immunitytime, bot_quota, bot_difficulty; buy, drop, bot_add / _t / _ct, bot_kick, bot_kill;
  cheats god, give <weapon>, impulse 101 (money, armor, ammo), plus the shared ones (noclip, setpos …).
- **Host** (`server/cs-match-host.ts`): `createCsMatchHost` (weapon data from `CsMatchDeps.weaponData`
  or `loader`, else already installed with `setCsWeaponData`), `CSGO_MATCH_FACTORY` registered as
  'csgo'; `checkpoint-catalog.ts` is the migration catalog that knows CS's classes.

**For the client** (not in this module): a CS listen worker passes `game: 'csgo'`, `variant` and the
csgo asset loader, installs the weapon data on both ends, imports `lib/csgo-game` (it registers the
schemas and the factory) and writes checkpoints with `csCheckpointCatalog()`; prediction restores with
`restoreCsPlayerFromRecords`; the view adds `aimPunch × VIEW_RECOIL_TRACKING`.

Tests (`pnpm exec vitest run --config vitest.tf2.config.ts lib/csgo-game`): movement numbers (speeds by
weapon, walk / crouch, the apex, stamina, crouch-jump, the hop cap), damage by hit group through armor,
range falloff, inaccuracy, the spray identical on host and predicting client, a wallbang in a box world,
the round flow and economy (freeze → buy → live → end → restart, the loss ladder, time-outs, kill
rewards, friendly fire), halftime and the match end, buy validation, the C4 (plant timing and cancel, the
defuse with and without a kit, the explosion), deathmatch respawns and protection, grenades (HE falloff
and walls, flash by angle, smoke duration and sight, the molotov and a smoke putting it out, throw
strengths, carry limits), the weapon data and de_dust2's entity classes on a synthetic lump, 5 v 5 bots on
a synthetic two-site map for six minutes (plants, defuses, both sides winning), a checkpoint round trip
through `Tf2MatchHost.restore`, a member playing through the P2P host session over the fake channels, and
the console.

**Gaps:** no ladders (shared movement), no burst fire (Glock / FAMAS), no silencer toggle, no Zeus, the
R8's alt fire, bullets do not penetrate players, dead CTs do not drop their kit, the defuse is not
predicted (the host holds the defuser still), and the penetration materials are classified by name.

## Maps

`scripts/tf2-game/build-maps.ts` turns each published map into a package under `<game>-game/maps/`;
the contract (zod schemas and the TypeScript types the renderer imports) is
`lib/tf2-game/assets/map-manifest.ts`, the maps each game publishes are
`lib/tf2-game/assets/game-maps.ts` (TF2: the hub allowlist in `data/maps.ts`; HL2: the demo's
`d1_trainstation_01`–`06`; Portal: First Slice's `testchmb_a_00`–`06`).

```bash
pnpm exec tsx scripts/tf2-game/build-maps.ts --root <install> --game tf2|hl2|portal --out out \
  [--maps a,b | --maps-file f] [--state state.json] [--prev-index maps/index.json] \
  [--props-list-out props.list] [--sizes] [--force]
pnpm exec tsx scripts/tf2-game/build-maps.ts --root <install> --game hl2 --props-only --props-list-out models.list
pnpm exec tsx scripts/tf2-assets/publish.ts push --dir out --prefix hl2-game/ \
  --state-key hl2-game/maps/_state.json --index maps/index.json --build <id>
```

- **Search paths** mirror each `gameinfo.txt` (sound packs left out): TF2 `tf2_textures`, `tf2_misc`,
  `hl2_textures`, `hl2_misc`, then loose `tf/`, `hl2/`; HL2 `hl2_pak`, `hl2_textures`, `hl2_misc`, loose
  `hl2/`; Portal `portal_pak`, `hl2_textures`, `hl2_misc`, loose `portal/`, `hl2/`. The map's own pakfile
  is searched first (its cubemap-patched materials resolve through their `include`).
- **`maps/<sha>.bsp`**: the map with every lump decompressed (game lumps too, offsets rewritten), the
  pakfile, cubemap and unused lighting lumps emptied (the HDR lightmaps and ambient cubes are kept when the
  map has them, else the LDR ones); everything else byte-identical. `parseBsp` reads it.
- **Materials**: every texdata name (faces, displacements, overlays, brush entities, water) plus
  entity-referenced materials (sprites, ropes, decals), resolved with `patch` includes and the DX9 shader
  blocks. Base textures are `$basetexture`, `$basetexture2` / `$texture2` and `$blendmodulatetexture`
  (never bump, env, detail maps). Tool textures are `nodraw` (`tools/toolsskybox*` are `sky`,
  `tools/toolsblack*` is unlit black); `color` is the texdata reflectivity, gamma-encoded, for every
  material — what a material without a texture (a dedicated-server install has none) draws.
- **Textures**: the largest mip ≤ 1024 px, frame 0, WebP q80, alpha kept only when the material uses it
  (translucent, alpha test, self-illumination in the base alpha) and the pixels have it. Named exactly as
  models.py names textures (`TEX_VERSION`, kind `base`, cap, alpha, VTF digest; textures ≤ 512 px take the
  512 cap name, which is what a prop gets), so a texture is stored once across maps and models.
- **Props**: every static prop model and every `prop_*`, `item_*` and `physics_cannister` entity model;
  their collision (the `.phy`'s first solid, via `world/prop-collision.ts`) is `maps/<sha>.hulls.bin`.
  `--props-list-out` / `--props-only` append the models models.py can read (not pakfile-only ones) to its
  list, so every prop gets a GLB, plus the game's `GAME_ALWAYS_MODELS` — models the client draws that no
  map names (Portal: `v_portalgun` / `w_portalgun`).
- **Incremental**: files are named by their content (textures by their source), so with `--state` an
  unchanged map writes nothing and decodes no texture, but is still listed in `wanted.json`. A map that
  fails keeps its previous index entry (`failed.json`).
- **Navigation mesh** (TF2, on by default; `--no-nav` skips it, `--nav` forces it for another game):
  `maps/<sha>.nav.bin`, generated from the BSP and the prop hulls — the same collision the game runs —
  within `NAV_TIME_BUDGET_MS` (60 s) per map; see [Bots](#bots). The manifest's `nav` names it.

Sizes (BSP raw / Brotli as stored; textures as encoded; local installs, 2026-10-29 — the TF2 dedicated
server has no texture data, so TF2's textures are an estimate from HL2's per-map figure):

| Game   | Map                 | BSP raw  | BSP Brotli | Textures              |
| ------ | ------------------- | -------- | ---------- | --------------------- |
| TF2    | ctf_2fort           | 22.1 MiB | 10.2 MiB   | (not in a DS install) |
| TF2    | ctf_turbine         | 5.9 MiB  | 2.4 MiB    |                       |
| TF2    | cp_dustbowl         | 21.2 MiB | 10.4 MiB   |                       |
| TF2    | cp_granary          | 22.5 MiB | 10.3 MiB   |                       |
| TF2    | cp_badlands         | 27.8 MiB | 11.5 MiB   |                       |
| TF2    | koth_viaduct        | 16.1 MiB | 7.7 MiB    |                       |
| TF2    | koth_harvest_final  | 13.6 MiB | 5.8 MiB    |                       |
| TF2    | pl_badwater         | 19.4 MiB | 9.4 MiB    |                       |
| TF2    | pl_upward           | 22.8 MiB | 10.6 MiB   |                       |
| HL2    | d1_trainstation_01  | 13.6 MiB | 6.6 MiB    | 237 (10.0 MiB)        |
| HL2    | d1_trainstation_02  | 11.0 MiB | 4.8 MiB    | 194 (8.5 MiB)         |
| Portal | testchmb_a_00       | 3.2 MiB  | 1.3 MiB    | 70 (1.2 MiB)          |
| Portal | testchmb_a_01       | 5.2 MiB  | 2.0 MiB    | 53 (0.9 MiB)          |
| Portal | testchmb_a_02 … _06 | 20.9 MiB | 8.3 MiB    | ≈ 1 MiB more          |

Projected stored size: TF2 ≈ 78 MiB BSP and ≈ 60 MiB textures (estimate) for 9 maps; HL2 ≈ 11 MiB BSP
and ≈ 14 MiB textures for its 2 maps (the demo licence ships data for `d1_trainstation_01` and `_02`
only; the rest of its depot is empty placeholders); Portal ≈ 12 MiB BSP and 2.5 MiB textures for all 7.
All maps of the three games come to about 0.2 GB, plus their props' GLBs (HL2: 208 props, 11.6 MiB;
Portal 2 maps: 47 props, 4.5 MiB; ctf_2fort: 326 props, 13.5 MiB untextured).
Tests: `HL2_ROOT=… PORTAL_ROOT=… TF2_ROOT=… pnpm test:tf2 scripts/tf2-game/build-maps.test.ts` (each game
skips without its install; prints the sizes above).

## Bots

`lib/tf2-game/bots/` fills empty seats online and is the opposition offline. Bots are ordinary players:
a `BotBrain` (`server/tf2-match-host.ts`) returns one `UserCmd` per tick and the host queues it, so bots
move through the same `playerMove`, weapons and rules as humans. `createTf2Match` and the listen server
play `TFBotBrain` at the match's `botDifficulty` by default; `Tf2MatchHostOptions.botBrain` replaces it
and `botClasses` / `setBotClassPreference(team, classes)` give a team's bots a fixed line-up (an
offline player's choice). The SDK's NextBot / TFBot code (`game/server/NextBot`, `tf/bot`,
`nav_*.cpp`) is the behavioural reference; the implementation is independent.

- **Nav mesh** (`bots/nav/`). `NavGenerator` samples walkable ground on a 25-unit grid with the TF
  player hull (48 × 48, 82 tall, 62 crouched), flood-filling from the map's spawns, control points,
  flags, capture zones, payload `path_track`s and pickups. Each sample tries its four neighbours as
  `CGameMovement` would move: a step (≤ 18), a walk off a ledge (a drop, ≤ 250), a crouch-jump up to
  64 (landing up to two cells away, over lips a hull cannot stand on), or swimming up out of water;
  ground steeper than 0.7, ledge corners whose centre is unsupported, and lethal `trigger_hurt`
  volumes are not walkable; a low lintel makes both ends crouch areas. Doors, toggled `func_brush`es
  and the cart are ignored while sampling; the areas they overlap remember the brush. Samples merge
  into coplanar rectangles (≤ 12 × 12 cells) that share their attributes: RED/BLU spawn room
  (`func_respawnroom`), capture area, capture zone, resupply, water, crouch, door. Connections carry
  their kind (walk / jump / drop, one-way when too high to climb back) and portal. Visibility is a
  sector PVS: areas grouped into ~512-unit sectors, pairs within 5000 units that the BSP's PVS allows
  sampled with line traces, stored as a bitset. `nav.bin` (`serialize.ts`) is the compact
  little-endian form. Generation is incremental (`step(traceBudget)`): when a package has no mesh
  the hub worker (or the browser listen server) builds one a slice per tick, cached per map.
- **Paths** (`bots/path.ts`). A\* over areas (distance, crouch/water/jump/drop costs, the per-team
  danger map of recent deaths; the enemy's spawn rooms and blocked doors are forbidden — doors per
  `CTFNavMesh::ComputeBlockedAreas`: a bare closed door or solid toggled brush blocks everyone, a
  trigger-opened door only the team its filter keeps out). An unreachable goal paths to the closest
  area (bots wait at setup gates). `PathFollower` steers to the portals (each leg stays inside one
  convex area, narrow ramps walked down the middle), jumps and crouch-jumps at jump connections,
  crouches through crouch areas, swims up, walks off perches the mesh does not know, and repaths when
  stuck or off the path. A world's bots share three searches a tick.
- **Brain** (`bots/brain/`). Perception every third tick: a vision cone and line of sight (pre-culled by
  the sector PVS), gunfire heard within 1800, whoever just hurt us; disguised spies pass as friends
  until they bump, attack or are seen through; cloaked ones show only when flickering or burning. Class
  choice follows TFBot's offense / defense rosters (`CTFBot::GetNextSpawnClassname`), re-chosen each
  death. Objectives (`objective.ts`) read the live entities: capture or block points (standing in the
  capture trigger), defend, KOTH, push or block the cart, fetch / escort / deliver / defend the
  intelligence, chase a carrier. Per class: scouts strafe and jump with the scattergun close, soldiers
  lead rockets at the feet (and rocket-jump toward far goals on hard+), pyros flame close and reflect
  incoming rockets and pipes, demomen arc pipes and lay sticky traps they detonate under enemies,
  heavies spin up before engaging, engineers build a sentry at a spot that sees what they defend, a
  dispenser and teleporters, and maintain them with the wrench, medics pick a patient (heavy first),
  heal, über when hurt, and defend themselves, snipers scope from vantage spots and wait for charge,
  spies disguise, cloak on the approach, backstab and sap sentries. Everyone retreats to health or
  ammo (pickups, resupply, dispensers), reloads when safe and calls lines (`voice` events).
- **Difficulty** (`difficulty.ts`):

| Knob                                     | easy | normal | hard | expert |
| ---------------------------------------- | ---- | ------ | ---- | ------ |
| Reaction time (s, `GetMinRecognizeTime`) | 1.0  | 0.5    | 0.3  | 0.2    |
| Aim tracking interval (s)                | 1.0  | 0.25   | 0.1  | 0.05   |
| Aim error (°; scoped rifle × 0.35)       | 4.5  | 2.2    | 1.2  | 0.5    |
| Turn rate (°/s)                          | 300  | 540    | 800  | 1200   |
| Field of view (°)                        | 90   | 90     | 100  | 110    |
| Retreat below health                     | 55 % | 45 %   | 35 % | 30 %   |
| Sniper charge before a body shot         | 30 % | 50 %   | 70 % | 85 %   |
| Projectile lead                          | 30 % | 65 %   | 85 % | 100 %  |
| Airblast reaction chance                 | 10 % | 35 %   | 60 % | 85 %   |
| Rocket jumps                             | no   | no     | yes  | yes    |

Nav meshes of the nine maps (local install, 2026-10-29; generation in Node, including the visibility
pass): ctf_2fort 866 areas / 80 KiB / 1.7 s, ctf_turbine 606 / 55 KiB / 0.8 s, cp_dustbowl 2132 /
202 KiB / 2.5 s, cp_granary 1841 / 181 KiB / 1.7 s, cp_badlands 2726 / 276 KiB / 2.8 s, koth_viaduct
1274 / 125 KiB / 1.5 s, koth_harvest_final 1165 / 115 KiB / 1.5 s, pl_badwater 1949 / 190 KiB / 1.8 s,
pl_upward 2592 / 262 KiB / 2.7 s.

Tests: `pnpm test:tf2 lib/tf2-game/bots` (the synthetic mesh test runs anywhere); with `TF2_ROOT`,
`bots.nav.maps.test.ts` checks every map's mesh (connectivity from each team spawn to every
objective, the `nav.bin` round trip) and walks a bot from each spawn to every current objective,
`bots.match.maps.test.ts` plays 12v12 bots for five minutes on each map (objective progress, kills for
every class, > 90 % of bots moving, the bots' share of a tick; ~15 minutes) and
`bots.offline.maps.test.ts` one human through the host's input path with eleven bots.

## Tests

The game's tests are their own suite, `pnpm test:tf2` (`vitest.tf2.config.ts`),
because the main suite is scoped to mission-critical code (see
[testing](testing.md)). Tests that need real game files read them from
`TF2_ROOT` (a Steam install) and skip when it is unset.

## Models

The game's model channel (`tf2-game/mdl/` and `tf2-game/tex/` in object storage) is built by
`scripts/tf2-game/models.py` from a list of MDL paths. `scripts/tf2-game/model-list.py --root <install>`
writes TF2's default list (class bodies and arms, stock weapons, projectiles, buildings, pickups, the flag,
player gibs); the map pipeline appends its props. Nothing in the converter is TF2-specific: `--search portal,hl2`
points it at another Source game.

```bash
python3 scripts/tf2-game/model-list.py --root <install> --out model-list.txt
python3 scripts/tf2-game/models.py --root <install> --list model-list.txt --out out [--state state.json] [--prev-index index.json]
pnpm exec tsx scripts/tf2-assets/publish.ts push --dir out --prefix tf2-game/ --state-key tf2-game/mdl/_state.json --index mdl/index.json --build <id>
```

- **Content addressed.** `mdl/<sha>.glb` and `tex/<sha>.webp` are named by the hash of their _source_
  (model, includes, VMTs, VTF bytes, encoder settings and `MODELS_VERSION` / `TEX_VERSION`), so an unchanged
  file keeps its name and is neither rebuilt nor uploaded. Textures are written once and shared by every
  model (and map) that uses them; a GLB references them as `../tex/<sha>.webp`. WebP q80, capped at 1024 px
  for player bodies, weapons and viewmodels and 512 px for everything else; alpha is kept when the VMT gives
  it a meaning (`alphaUse`). A missing texture (a dedicated-server install has none) leaves the material
  untextured but still named, and is listed in `untextured.json`.
- **`mdl/index.json`**: `{ <mdl path>: { glb, anims?, kind, bones, skinned, skins, attachments, hitboxes,
sequences, poseParameters? } }`. `mdl/players/<class>.anims.json` and `mdl/viewmodels/<class>.anims.json`
  hold `{ mdl, glb, anims, poseParameters, activities: { ACT_*: [{ seq, weight }] }, weightlists,
sequences: { <name>: { clips, looping, delta, post, fps, frames, blend?, layers?, weightlist? } } }`.
- **Body GLB.** LOD 0 of every body part; a switchable body group's submodels are separate primitives
  (`extras.bodygroup`, `extras.sub`); every primitive has `extras.slot` (its skin-reference slot) and uses
  skin family 0. Skinned (bones + inverse binds) unless it is a static single-bone prop. Positions are the
  MDL's compiled bind space in metres, unpermuted — so the axes depend on how the model was compiled, and
  the GLB does not record them:
  - TF2 players, arms, c_model weapons and buildings: Y up, Source (x, y, z) is glTF (y, z, x).
  - Most static props, pickups, the flag, HL2/Portal props and HL2 humans: Source axes (Z up).
  - Some rigid single-bone models: another axis rotation (`w_rocket`: Source X along glTF Y).

  Clips are re-expressed with the MDL's `ref` sequence root fix, or with the (y, z, x) mapping when the
  MDL has no `ref` — even when its bind pose is Z up (HL2 humans, most props), so a posed model can sit in a
  different frame from its bind pose. Child bones keep Source's bone-local frames; only the root differs.
  The renderer resolves both in one place, `lib/tf2-game/render/model-axes.ts`: `modelFrame()` matches the
  bind bounds against `extras.source.hullMin/hullMax` over the 24 axis rotations, `animatedFrame()`
  compares the root bone's rotation at the start of an idle clip with its bind rotation (kept only when the
  idle's bones fit the hull better that way, `checkPosedFrame`: an HL2 / Portal view model's `ref` pose
  turns its arm 90° and the idle swings it back, which is animation, not a frame change), and every model
  (static props included) is placed with `sourceTransformToMatrix(origin, angles) · frame`. (Writing the
  root fix into `scene.extras` would let the converter state this instead.)

- **Animation.** A model with `$includemodel`s (players, arms) gets a separate _anim pack_ GLB (skeleton +
  clips, no mesh); any other model carries its sequences in its own GLB. Players export every `ACT_MP_*`
  sequence except voice-command gestures, PASS Time and the CYOA PDA, plus the death sequences; arms every
  sequence with an activity; other models every sequence; plus, recursively, every sequence those layer on
  themselves (aim matrices, arm layers). Each animdesc is one glTF clip named `<sequence>` or
  `<sequence>@<cell>` (blend grids: cell = y × groupsize[0] + x). Rotations are normalized shorts and keys
  are reduced (0.06°, 0.01 unit). **Delta** clips (`extras.delta`) hold offsets from the identity: add the
  translation, and compose the rotation `d^w * base`, or `base * d^w` when the sequence is `post`; a bone
  with no track is the identity (delta) or the bind pose (absolute).

`scene.extras` of a body (all lengths in metres, matrices column-major 4×4, unless noted):

```jsonc
{
  "tf2game": 1, "mdl": "models/player/scout.mdl", "scale": 0.01905,
  "source": { "eyePosition": [x,y,z], "illumPosition", "hullMin", "hullMax", "viewMin", "viewMax" }, // Source units, Z up
  "flags": 0, "mass": 100, "contents": 1, "surfaceprop": "flesh", "keyvalues"?: "<raw $keyvalues>",
  "skinned": true,
  "bodyparts": [{ "name": "hat", "count": 2 }],            // every body part, in order (body index math)
  "skins": [[materialIndex per slot], ...per family],      // -1: no material for that slot
  "attachments": [{ "name": "muzzle", "bone": "weapon_bone", "flags": 0, "local": [16] }],
  "hitboxSets": [{ "name": "default", "hitboxes": [{ "bone", "group", "min": [3], "max": [3], "name"? }] }],
  "poseParameters": [{ "name": "body_pitch", "start": -45, "end": 90, "loop": 360 }],
  "boneControllers"?: [{ "bone", "axis": "XR", "type", "loop", "start", "end", "rest", "input" }],
  "includes"?: ["models/player/scout_animations.mdl"], "jiggle"?: [...], "proceduralBones"?: [{ "bone", "type" }],
  // models with their own sequences, and every anim pack (which also has "animPack": true):
  "sequences"?: [{ "name", "activity"?, "actweight"?, "flags", "looping", "delta", "post", "autoplay",
                   "hidden"?, "snap"?, "realtime"?, "world"?, "fps", "frames", "fadeIn", "fadeOut",
                   "clips": ["run_PRIMARY@0", ...],
                   "blend"?: { "groupsize": [3,3], "params": ["move_y","move_x"], "start": [..], "end": [..], "poseKeys"?: [[..],[..]] },
                   "layers"?: [{ "seq", "flags", "pose"?, "start", "peak", "tail", "end" }],
                   "events"?: [{ "frame", "cycle", "event", "type", "name"?, "options"? }],
                   "weightlist"?: 0, "nextSeq"?, "cyclePose"?, "modifiers"?, "keyvalues"? }],
  "activities"?: { "ACT_MP_RUN_PRIMARY": [{ "seq": "run_PRIMARY", "weight": 1 }] },
  "weightlists"?: [{ "<bone>": 0.0 }]   // per-bone weights that are not 1
}
```

A clip's `extras`: `{ fps, frames, looping, delta, source (animdesc name), movement?: [mstudiomovement_t, Source
units], groundSpeed? (units/s) }`. A material's `extras`: `{ material, vmt, shader, texture (VTF path),
translucent?, alphatest?, cutoff?, additive?, nocull?, selfillum?, selfillumTint?, selfillumMask?, vertexalpha?,
tintByBaseAlpha?, tintColorOverBase?, color?, color2?, phong?: { exponent, boost, fresnelRanges, tint?,
albedoTint?, baseAlphaMask?, exponentTexture? }, rimlight?: { exponent, boost, mask }, lightwarp?, bumpmap?,
envmap?, envmapTint?, envmapMask?, detail?, surfaceprop?, alphaUse?, eye?, missing? }` (texture names are
`materials/….vtf` paths).

Tests: `TF2_ROOT=<install> python -B -m unittest discover -s scripts/tf2-game -p test_models_game.py`.

## Entity rendering

`lib/tf2-game/render/entities/` draws everything that is not the map, from plain per-entity state —
`{ id, type: <net schema type>, fields: <the schema's field names>, origin?, angles? }` — so the client's
snapshot mirror and a single-player world feed it the same way, plus the simulation's events
(`index.ts` documents the per-frame calls: `beginFrame`, `sync`, `handleEvent`, `updateViewModel`,
`endFrame`, then the world, then `renderViewModel`).

- **Models** (`model-asset.ts`, `model-instance.ts`, `model-material.ts`): a `ModelLibrary` per game loads
  GLBs and anim packs by MDL path (it is also the world's static-prop `ModelProvider`); an instance clones
  the scene with its own skeleton, skin family, body groups and attachments, bone-merges weapons
  (`lib/tf2-loadout/bone-merge.ts`), and shades with VertexLitGeneric terms in linear space: the leaf
  ambient cube, the sun and up to two local world lights vrad left out of the cubes, half-Lambert through a
  lightwarp stand-in, phong and rim light per material extras, alpha test / translucency / additive,
  per-instance tint, screen-door fade and a noise dissolve (cloak). Untextured materials (a dedicated
  server install) draw their team colour.
- **Animation** (`animator.ts`): bone_setup.cpp's AccumulatePose over the clips — blend grids with pose
  keys, autolayers (aim matrices), weightlists, delta layers, gesture slots, autoplay sequences and events
  (footsteps). Sequence changes go through a CSequenceTransitioner port: the outgoing sequence keeps
  advancing and blends out over MIN(its `fadeOut`, the new `fadeIn`) (default 0.2 s) along the SDK's
  GetFadeout spline; up to 3 outgoing sequences stack (newest accumulated first, so a change during a change
  does not pop); `snap` sequences cut. Asking for the looping sequence already playing never restarts it;
  `restart` is the new-sequence parity (the same sequence from the start, cross-faded). Cycles advance per
  render frame at fps × playback rate; an authoritative cycle (`syncCycle`) bleeds its drift off over 0.1 s
  and cross-fades in only past 0.25 cycles. Gestures ramp in over their `fadeIn` and out over the last
  `fadeOut` (≤ half the gesture), and one restarted mid-play fades out under the new one. `lod`
  (`animLod` / `modelLod`): one transition and no faint gestures past 1200 units, cuts and no autoplay past
  3000, no pose evaluation off screen. Nothing allocates per frame.
- **Players** (`player-anim-state.ts`, `player-renderer.ts`): CMultiPlayerAnimState + CTFPlayerAnimState
  over the networked (interpolated, per render frame) record (activity selection, the SDK acttables per
  activity role — `acttables.ts`, transcribed from tf_weaponbase.cpp — 9-way move blend, feet-yaw lag with
  45° turn-in-place steps, `animEvent` gestures; move_x / move_y approach their goal at 6 /s and
  body_yaw / body_pitch at 720°/s), team / über skins, cloak, disguises, crit glow, burning, death sequences, gibs and
  corpses.
- **View model** (`viewmodel.ts`, `vm-anim.ts`): arms + c_model, the weapon's `vmActivity` → item
  `vmActivities` → the role's s_viewmodelacttable row (the minigun's and medigun's PREFIRE/POSTFIRE) → arms
  sequence; the change counter restarts a one-shot like the parity flag, a looping sequence re-sent (spin,
  fire loop, idle; prediction replays) keeps its cycle, changes cross-fade (snap sequences over 0.05 s);
  the minigun barrel is a procedural bone spun from an accumulated angle, TF weapon bob (no lag: `cl_wpn_sway_interp` 0), `viewmodel_fov` 54 in its own pass.
  `sp-viewmodel.ts` draws a single-player `v_` model the same way (Portal's `v_portalgun` from the model
  channel: ACT_VM_IDLE, ACT_VM_PRIMARYATTACK on either portal); nothing until it loads, nothing if the
  channel lacks it.
- **Objects** (`objects.ts`): projectiles and trails, buildings (blueprints, construction, sentry aim pose
  parameters and muzzle flashes, damage smoke, teleporter effects), pickups, the flag, `prop` / `entity`
  models with their sequence, `info_particle_system`.
- **Effects** (`effects.ts`): the game particle bundles (pooled, ≤ 64 live systems, LOD at 3000 units, soft
  particles and refraction off), instanced tracers and ring-buffer decals, gibs.
- **Items** (`loadout-models.ts`): unlock weapons and cosmetics from the loadout model channel — see
  [Items and loadouts](#items-and-loadouts).

The render harness shoots entity scenes too: `shoot.ts --scenes scripts/tf2-game/render-harness/entity-scenes.json`
(regenerate it with `entity-scenes.py`). With `--loadout <dir>` players wear their `items` (the `loadout-*`
scenes: teams, killstreak kits and weapon unusuals, boots, a 24-player crowd): `<dir>/catalog.json`,
`<dir>/models/*.glb` from `scripts/tf2-assets/convert.py` and `<dir>/particles/manifest.json` + effect
bundles. Each scene logs its entity draw calls (`meshes`, `itemMeshes`) and the entity frame's CPU time.
