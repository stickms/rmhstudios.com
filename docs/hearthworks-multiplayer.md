# Hearthworks multiplayer

How Hearthworks plays together, what was verified on real WebRTC and what cannot be verified
without a real network. Design intent: `docs/superpowers/specs/2026-11-04-hearthworks-design.md` §5.4.
Code: `features/hearthworks/engine/net/`, `lib/shared/p2p/`, `features/hearthworks/server/p2p.ts`
(on `server/socket-server/p2p/signal-hub.ts`), `features/hearthworks/ui/MultiplayerPanel.tsx`.

## Shape

- **The hub only introduces players.** It lists rooms, vouches for accounts, relays WebRTC offers /
  answers / candidates between a host and an admitted member, hands out TURN credentials, and promotes
  a successor when the host goes. No command, tick or world byte crosses it, except opaque relay
  frames for a member whose direct path failed (budgeted; `HW_RELAY_LIMITS`).
- **The host is authoritative.** Its browser orders every command (its own and peers') into 50 ms
  ticks. Every replica runs the same deterministic `stepWorld` over the same ordered stream, so worlds
  stay identical without shipping state. A new member gets a snapshot, then the tick stream.
- **Peers predict.** A peer shows its own command at once (confirmed replica + its unanswered commands
  replayed on top) and converges when the host's ticks arrive.
- **Host migration.** The host names its longest-connected peer as successor. When the host goes
  (closed tab, crash, frozen, left on purpose) the hub promotes that peer, which becomes a `HostSession`
  from its replica; everyone else re-joins it. Money, buildings and history survive; commands a peer had
  not seen confirmed are replayed to the new host and de-duplicated by `seq`.

## Wire protocol (v3)

Frames ride a `ReliableLink` (`lib/shared/p2p/reliable-link.ts`): fragmentation above 16 KB, 256 KiB
high-water backpressure, ping/pong keepalive, 10 s silence = closed.

| Direction     | Frame                                               | Notes                                                                                                                      |
| ------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| peer → host   | `cmd {seq, cmd}`, `resync`                          | ≤ 4 KB, zod-validated; `join` is the host's doing, never a peer's                                                         |
| host → peer   | `welcome {v, you, successor}`                       | `v` outside `[MIN_PROTOCOL_VERSION, PROTOCOL_VERSION]` → the peer refuses the host (`incompatible`)                        |
| host → peer   | `tick {n, cmds, acks}`                              | the ordered commands of one tick; `acks` = highest `seq` applied per peer                                                  |
| host → peer   | `successor {id}`                                    |                                                                                                                            |
| host → peer   | **`reject {items: [[seq, reason], …]}`** (v2)       | **to the issuing peer only.** `reason` is the world's `RejectReason`, or `rate-limited` for a command dropped unread       |
| host → peer   | snapshot (binary)                                   | whole world + acks; at most one per `SNAPSHOT_MIN_TICKS` per peer (a `resync` flood is coalesced, never lost)              |

**Versions.** v1: welcome / tick / successor. v2 added `reject` and was compatible both ways (a v2 host and a v1 peer
carried on). **v3 changed the simulation itself** — the `setTaxRate` command, a tax rate and a town event in the city
state, and save/snapshot version 3 — and every replica must run identical rules or the worlds drift without any
error. So `MIN_PROTOCOL_VERSION` rose to 3 with `PROTOCOL_VERSION`: a v3 peer refuses a v2 host (it would send
commands the host's schema rejects and apply ticks the old sim would not reproduce), and a v2 peer refuses a v3
host (it would fail to decode the version 3 snapshot). Anything that changes a world rule or the state shape bumps
the protocol and moves `MIN_PROTOCOL_VERSION` with it; an additive frame (like `reject`) need not. The town's tax
rate and event live in `World.city`, so snapshots, host migration and late joiners carry them with no extra frame.

Every host frame is parsed with `hostMessageSchema` before a peer acts on it (a modified host cannot
crash or confuse the replicas). A refused command surfaces as the same `rejected` world event the
single-player sim emits; the peer driver returns it from `advance()`, the store puts it in `lastEvents`
and the HUD shows the same sonner toast. `rate-limited` is silent (a flood is not something to tell the
player about) but still takes the prediction back. A command nobody answers stops being predicted after
`PENDING_TTL_MS` (8 s); a peer holds at most `MAX_PENDING` (256) unanswered commands.

The host driver filters the world's `rejected` events to the host's own, so a peer's refusal is not
toasted at the host.

## Room password

Optional, set when hosting (public or private). 4–32 characters (`HW_LIMITS.PASSWORD_MIN/MAX`).

- The hub stores only a **salted scrypt hash, in memory** (`server/socket-server/p2p/room-password.ts`),
  compares with `timingSafeEqual`, and never logs, echoes or lists the password: the room list carries
  `locked: true` and nothing else. Hub errors: `password-required`, `wrong-password`.
- Guesses are limited per account and room (5 per 5 min; a right guess gives them back), per socket
  (10) and per room (120), using the hubs' shared sliding-window limiter. After five wrong guesses even
  the right password is refused until the window passes.
- An account already seated in the room (a reconnect) is not asked again. The lock lives in the room's
  hub record, so a **host change keeps it**; a host that re-claims its room after the hub restarted
  re-sends the password with `resume` (the tab keeps it in memory only).
- UI: a labelled password field when hosting, a password field next to the code when joining, a lock
  badge in the room list and the room title, and the wrong-password / password-required errors. An invite
  link to a locked room lands on the join form with the code filled in.

## Remote players' motion

`features/hearthworks/engine/net/poses.ts`. A `move` command teleports a player (≈10 Hz while walking), so drawing
`player.x/z` steps the avatar. Each remote player has a buffer of (tick, x, z); the avatar is drawn
`INTERP_DELAY_MS` (100 ms) in the past, interpolated between the two samples around that moment, and
extrapolated along its recent velocity for at most `EXTRAPOLATE_MAX_MS` (250 ms) before holding. Time is
sim time (tick × 50 ms), mapped to the frame clock by a smoothed offset, so a late or duplicate tick does
not move anyone backwards; a teleport (> 6 tiles) snaps; a host migration that rewinds the tick counter
discards the dead timeline's samples. `MultiplayerDriver.poses.sample(id, now)` also returns `speed`
(tiles/s) and `yaw` (radians, `atan2(vx, vz)`, held while standing) for the animation layer. It costs
nothing on the wire. `RemotePlayers.tsx` positions its groups from it each frame.

## Real-browser e2e

The unit and fake-channel suites run the real hub handler and the real connector over in-memory
channels. They cannot say whether ICE, DTLS/SCTP, negotiated DataChannels, fragmentation and the timers
behave in a browser. `testing/hearthworks-e2e/` does:

- a Node harness (`hub.ts`) runs socket.io with the REAL `registerHearthworksP2pHandlers` on the real
  `SignalHub`; only the session lookup is injected (a token table sets `socket.data.userId/userName`,
  as `server/socket-server/index.ts` does from the DB);
- an esbuild-bundled page (`page/entry.ts`) boots the real hub client (`hub-client-core.ts` on the shared
  realtime client), `webrtcConnector()` → `DirectConnection` (real `RTCPeerConnection`, two negotiated
  DataChannels) → `ReliableLink` → `HostSession` / `PeerSession` / `HearthworksConnector` and the game store;
  no DB, no TanStack Start server, `iceServers: []` (loopback host candidates);
- Playwright drives real Chromium pages. The host lives in its own Chromium **process** so "the host
  tab closes" can be `kill -9` (no close frame, no FIN) or `SIGSTOP` (a frozen tab: sockets stay open,
  nothing answers).

```bash
pnpm test:hearthworks:e2e                     # = pnpm exec tsx testing/hearthworks-e2e/run.ts   (~35 s)
pnpm exec tsx testing/hearthworks-e2e/run.ts core lock   # named scenarios
pnpm exec tsx testing/hearthworks-e2e/run.ts freeze      # slow (production 25 s/20 s heartbeat, ~1 min)
pnpm exec tsx testing/hearthworks-e2e/run.ts --list
HW_E2E_TRACE=1 pnpm exec tsx testing/hearthworks-e2e/run.ts freeze   # hub events with timestamps
```

Needs Chromium (`playwright`'s, else `CHROMIUM_PATH`, `/opt/pw-browsers/chromium`, `/usr/bin/chromium`).
Opt-in: not in `pnpm test` (the file is `run.ts`, not `*.test.ts`) and not in CI.

| Scenario       | What it proves on real WebRTC                                                                                                                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core`         | host + 2 members join → welcome + snapshot (64×64 world, several fragments) → commands round-trip → worlds **converge** (hash of the whole world at the same tick) → a peer's refused command comes back to that peer only → host `kill -9` → successor promoted in ~2 s, others rebind, money and buildings intact → play continues → a **late joiner** joins the new host by the same code → the new host leaves gracefully, the next takes over |
| `big`          | 96×96 world (92 KB snapshot = 6 fragments): two members joining at once, a burst from three sides, a late joiner during play                                                                                                              |
| `flood`        | 300 commands in one burst: the host rate-limits, nobody is disconnected, the flooder's predicted state is taken back                                                                                                                      |
| `hub-restart`  | the hub restarts mid-game: links never notice, the host re-claims the room, members re-join, a new player can join                                                                                                                        |
| `lock`         | missing / wrong password refused by the real hub, right one admitted over WebRTC, room list says `locked` and never the password, **the lock survives a host crash**                                                                       |
| `motion`       | a member walking at 10 Hz of `move` is drawn with ~⅓ of the world's per-frame jump                                                                                                                                                        |
| `freeze`       | the host is SIGSTOPped: members notice (10 s link timeout), report the silent host, the hub probes it and hands the room over (~17 s total)                                                                                               |

### Timing sensitivity on slow machines

Two steps depend on timing and can fail on a machine that is busy or renders in software, even though each
passes on its own:

- `motion` compares the largest per-frame jump of the drawn avatar with the world's (`drawn < 0.5 × raw`). The
  ~⅓ above holds at about 60 frames per second; at about 25 fps (headless Chromium on software GL while other
  work is running) each frame is naturally a bigger step and the ratio reads ~0.6 with the interpolation working.
- `hub-restart` checks that two replicas agree at the newest common tick; right after the hub comes back it
  can sample while one replica is a tick behind. The hashes at the common ticks it prints were equal in the one
  failure seen.

Run a failing scenario alone first (`run.ts motion`) before treating a red run as a regression. Neither
step runs in CI.

### Bugs found while verifying (all fixed, with regression tests where deterministic)

Items 1–2 were found by the real-browser run itself (it failed, then passed after the fix). Items 3–11 were
found by reading the code the run exercised; their regression tests are unit tests.

1. **A flood left ghosts.** The host rate-limited a peer's commands silently, so the peer's prediction of
   them stayed on its screen for good (`flood`). Now every dropped command is answered (`reject`
   `rate-limited`), unanswered ones expire (`PENDING_TTL_MS`), and the peer caps unanswered commands.
2. **A frozen or vanished host stranded the room** (`freeze`). Members give up after ≈12 s of
   re-joining; the hub's own heartbeat needs 25 + 20 s to notice a socket that goes silent without closing
   (frozen tab, dead network, lid closed). Two defects compounded: (a) the hub took no notice of the members'
   reports; (b) a member re-asking to join (every 3 s while migrating) was reset to *pending* and lost
   its seat in the line of succession, so when the hub finally acted **nobody was eligible** — the room
   was handed to nobody, or to a tab that had already walked away. Now a member reports
   `host-silent`, the hub probes the host with a socket.io ack (`PROBE_MS` 5 s) and promotes at once if it
   is silent; a re-join of an admitted account keeps its seat, join order and successor mark; the deposed
   host is told (`closed`) so a thawed tab stops hosting. The old SIGKILL case only worked because the
   socket's FIN beat the 3 s re-join.
3. **A giving-up client stayed on the hub's books.** When a connector gave up (`lost`, timeout, …) it
   reset locally without telling the hub, leaving its socket as a member (or host) nobody ran. `fail()` now
   always sends `leave`.
4. **A peer could make the host re-send the world every tick** (`resync` skipped the rate limit). Resyncs
   are coalesced and answered at most once per `SNAPSHOT_MIN_TICKS` (1 s); a peer that never got its
   snapshot asks again after 4 s.
5. **Host frames were trusted.** A peer applied any `tick` it was sent. All host frames are now validated
   (`hostMessageSchema`), a command the sim cannot apply triggers a resync instead of a half-stepped replica,
   and `welcome.v` is checked.
6. **The host was toasted its peers' refusals** (the world reports everyone's `rejected` events). Filtered
   in the host driver.
7. **A promoted successor lost its own unconfirmed commands.** They are now re-issued on the new timeline.
8. **A member could sit in "migrating" for good** if the new host admitted it but the link never opened:
   the connect deadline is armed again on admission.
9. **A hidden host tab froze the world for everyone** (no animation frames, so no ticks). While hosting
   and hidden, `background.ts` steps the world from a timer.
10. **One refused ICE candidate abandoned the whole negotiation** (`DirectConnection` threw from the
    queued-candidates loop before creating the answer). Each is now applied independently.
11. An unknown refusal reason (a newer host's rule) produced an empty toast; the HUD now has a generic line.

No defect was found in the fragmentation / reassembly, backpressure, MTU or data-channel ordering of
`ReliableLink` on a real channel: the 92 KB snapshot, 300-command bursts and concurrent joins all arrived
intact and ordered (`big`, `flood`). That is evidence for loopback only.

### What loopback cannot prove

- **NAT traversal.** Both ends are on one machine with `host` candidates; no STUN/srflx pairing, no
  symmetric-NAT or hairpin behaviour, no mDNS candidate obfuscation (Chrome's default, disabled here with
  `WebRtcHideLocalIpsWithMdns`).
- **TURN relay.** `iceServers` is empty. Credential minting, TURN allocation latency and the `turn`
  connection label are untested (`fake` + unit tests only), and so is the **hub relay fallback on real
  channels** (covered with fakes in `p2p-e2e.test.ts`).
- **Mobile and lossy networks.** Loopback has no loss, jitter or reordering, so SCTP retransmission,
  bufferbloat, the 256 KiB backpressure path, the 10 s liveness timeout under packet loss and
  interpolation under real jitter were not exercised. Radio handover, Wi-Fi ↔ cellular switches, ICE
  restarts and iOS/Safari WebRTC quirks are likewise untested; only Chromium was run.
- **Real hub deployment.** socket.io behind Apache/Cloudflare (WebSocket upgrade, idle timeouts), the
  Better Auth session lookup, and the 25 s / 20 s heartbeat across a real proxy. The harness's hub is the
  production handler but not the production process.
- **Many players.** Three to four players were run, not eight.
- **Background-tab timer throttling** and `visibilitychange` (the pump is unit-tested, not driven in a
  hidden real tab).
- **UI.** The password field, lock badges and toasts are not driven by a browser test.
