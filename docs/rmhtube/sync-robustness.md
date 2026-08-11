# RMHTube — watch-together sync

> **Version**: 2.0
> **Date**: 2026-08-11
> **Status**: Implemented
> **Supersedes**: v1.0 (2026-06-20), whose design is described in §6 as the
> thing this replaced. Several of its mechanisms were the cause of the failures
> this version fixes, so it is worth reading that section before reintroducing
> any of them.

---

## 1. What the room agrees on

One **anchor**, and nothing else:

```ts
interface VideoState {
  mode: 'vod' | 'live';   // fixed timeline, or a sliding live edge
  playing: boolean;
  currentTime: number;    // true as of `updatedAt`; unused when live
  playbackRate: number;
  updatedAt: number;      // SERVER-clock ms
  stalled: boolean;       // the leader's playhead is not advancing
  rev: number;            // monotonic; drops out-of-order anchors
}
```

The leader's player is the source of truth. It reports every 2 s; the server
stores the anchor and **projects it forward** by wall-clock time so the room
does not freeze when the leader's tab is throttled. Every client projects the
same way, using the same pure function
([`lib/rmhtube/sync-math.ts`](../../lib/rmhtube/sync-math.ts)), so no two
participants can disagree about where the room is.

```
extrapolate(state, serverNow) =
  playing && !stalled && mode === 'vod'
    ? currentTime + (serverNow - updatedAt) / 1000 * playbackRate
    : currentTime
```

`stalled` and `mode` are the two terms that were missing before, and each one
was a class of desync on its own — see §6.

**One event moves playback**: `S2C.SYNC_STATE`, carrying a complete anchor. It
is broadcast on the 2 s heartbeat, immediately on any leader edge, and to a
single socket on `C2S.SYNC_REQUEST`.

---

## 2. The client tick

`components/rmhtube/VideoPlayer.tsx` samples its player every 250 ms and applies
**at most one** correction. Nothing is driven by a media event.

That is the central rule, and it is not stylistic. react-player v3 backs each
provider with a custom element, and `youtube-video-element` *synthesises*
`seeking`/`seeked` from its own 50 ms poll whenever the position moves more than
0.1 s between samples — which ordinary playback does the moment a timer is
throttled, and does constantly above 2× speed. Twitch, conversely, does not fire
`seeked` for a scrub at all. Neither event means what its name says.

So intent is read from the position itself:

```ts
observePosition(previous, current, elapsedMs, rate, playing, tolerance)
  → { delta, expected, jumped, stalled }
```

`jumped` is a position change playback cannot account for — a scrub. `stalled`
is a playhead that stopped while the player claimed to be playing — a rebuffer.
No provider can misreport either, because both are derived from a number the
provider has to get right for the video to play at all.

### Correction policy

`planSync()` ([`lib/rmhtube/sync-plan.ts`](../../lib/rmhtube/sync-plan.ts)) is
pure and returns one action:

| Condition                           | Action                                    |
| ----------------------------------- | ----------------------------------------- |
| `mode === 'live'`                   | hold — a broadcast has no shared position |
| suspended / not ready               | hold                                      |
| buffering **and behind**            | hold — never seek into a stall            |
| ended                               | hold                                      |
| `force`, or `\|drift\| > 2 s`       | seek                                      |
| `\|drift\| ≤ 0.5 s`                 | settled (restore the room's rate)         |
| mid-band, continuous rates          | nudge the rate ±5 %                       |
| mid-band, discrete rates            | hold — a seek costs more than the gap     |

Three guards keep a correction from causing the next one:

1. **Seek cooldown** (1.5 s). Nothing is measured or issued while a seek
   settles. A media element reports its old position for a moment after
   `currentTime` is assigned, and an embedded player can rebuffer for a second.
2. **Never seek forward into a stall.** Chasing a target the player cannot reach
   drops what it had buffered.
3. **Clock gate.** Corrections wait for the ping/pong handshake to calibrate.
   An uncalibrated clock seeks everyone by the size of their own clock offset.

### Play / pause

`playing` is deliberately **not** passed to react-player. Its `Player` component
calls `play()`/`pause()` from that prop inside an effect with no dependency
array — i.e. on every render — which meant the leader's own heartbeat echo
un-paused the leader, and a viewer who paused was force-played two seconds later
with no explanation. The tick drives both instead. The same effect writes
`playbackRate` and `volume` every render, so the rate nudge lives in React state
(where the per-render write agrees with it) and volume converges through the
store rather than fighting it.

A viewer paused by the environment (mobile backgrounding, autoplay policy)
cannot be resumed programmatically, so they get a **tap to rejoin** overlay
rather than a fight.

---

## 3. Livestreams

A broadcast has no fixed timeline. Its `currentTime` is a position in a sliding
DVR window that means something different on every viewer's machine, so a live
room **mirrors play/pause and synchronises nothing else** — no projection, no
seeking, no rate control, no duration.

Liveness is decided in two stages because it cannot be decided in one:

- **URL hint** (`parseMedia().liveHint`): `twitch.tv/<channel>` is live;
  `youtube.com/live/<id>` is live; a `.mp4` is not; an HLS/DASH manifest is
  unknown.
- **Runtime, authoritative**: a VOD's duration is fixed once metadata loads,
  while a broadcast's advances in real time. Growth above half real-time is the
  one signal every provider agrees on — YouTube reports a finite, *growing*
  duration for a live stream, while HLS and Twitch report `Infinity`.

The leader reports what its player found via `C2S.QUEUE_META`, which flips the
room's `mode` and the queue item's `live` flag. This matters because
`/watch?v=…` is equally how YouTube addresses a live broadcast, so no amount of
URL parsing can get it right.

---

## 4. Waiting for slow peers

Any viewer starved of data for ~2 s sends `C2S.SYNC_STALL { stalled: true }`.
When the room has `waitForSlowPeers` on (default), the server pauses and
broadcasts `S2C.PEERS_WAITING` — the same payload the shared
`ConnectionStatus`/`AppShell` overlay already renders for every other
multiplayer app.

Recovery is measured in **buffered-ahead seconds** (≥ 3 s), not "is the playhead
moving". While the room is paused waiting for you, your player is paused too, so
a playhead test would report recovery instantly, resume the room, and stall you
again — a loop. Buffered seconds is the only measure that still means something
while paused.

Bounded on both ends: a wait ends after 20 s regardless, and a 60 s cooldown
then prevents a connection that cannot sustain the stream from re-pausing
everyone every few seconds. A backgrounded tab never reports a stall.

---

## 5. Protocol

| Direction | Event                      | Payload                                            |
| --------- | -------------------------- | -------------------------------------------------- |
| C2S       | `rmhtube:sync:host_state`  | `{ playing, currentTime, playbackRate, timestamp, stalled, live }` |
| C2S       | `rmhtube:sync:play/pause`  | `{}`                                               |
| C2S       | `rmhtube:sync:seek`        | `{ time }` (ignored when live)                     |
| C2S       | `rmhtube:sync:set_speed`   | `{ speed }`                                        |
| C2S       | `rmhtube:sync:ping`        | `{ clientTime }`                                   |
| C2S       | `rmhtube:sync:request`     | `{}`                                               |
| C2S       | `rmhtube:sync:stall`       | `{ stalled }`                                      |
| C2S       | `rmhtube:queue:meta`       | `{ itemId, duration, live, title }`                |
| S2C       | `rmhtube:sync:state`       | `VideoState`                                       |
| S2C       | `rmhtube:sync:pong`        | `{ clientTime, serverTime }`                       |
| S2C       | `rmhtube:peers:waiting`    | `{ peers, since } \| null`                          |

`host_state.timestamp` is the leader's estimate of the **server** clock when it
read its playhead. The server anchors on it (within a 5 s sanity window) instead
of on arrival time, which keeps one-way network latency out of every anchor.

`S2C.SYNC_STATE` is the only server→client playback event. The four that stood
beside it — `sync:play`, `sync:pause`, `sync:seek`, `sync:speed_changed` — are
gone; see §6.

---

## 6. What v1.0 got wrong

Kept because each of these is a trap that looks like a good idea.

**Correcting from `seeked`.** v1.0 wired `onSeeked → handleSeek`, and for a
non-leader that forced a hard realignment, which assigned `currentTime`, which
fired `seeked` again. A self-sustaining seek storm, each pass dropping the
buffer and re-stalling the player. On YouTube the first `seeked` did not even
need a user to produce it (see §2). This is what "videos don't sync and
constantly buffer for other people" was.

**Snappy edge events.** `sync:play`/`pause`/`seek`/`speed_changed` were sent
just before the anchor that followed them, carrying a flag but no position. The
client re-stamped a stale `currentTime` as current, rewinding every viewer by
however long it had been since the last anchor — a visible jerk on every play,
pause and speed change, corrected milliseconds later by the message that should
have been the only one.

**Projecting through a stalled leader.** `playing` stays true while a player
buffers, so the room ran ahead of the person it was following and the leader's
next report yanked it back. The oscillation was indistinguishable from everyone
else's connection being bad.

**A rate nudge react-player overwrote.** The mid-band nudge assigned
`element.playbackRate` directly, and react-player's dependency-array-free effect
wrote the prop back over it on the next render — several times a minute. The
gentle correction never completed, so the drift reached the hard band and became
a seek anyway.

**A host-state limit set to exactly the client's rate.** Reports were sent every
1 s against a 60/min ceiling. Every extra report — one per tab-return, one per
edge — pushed the leader over, and the limiter's answer was to drop the room's
only source of truth and reply with an error toast.

**No model of live at all.** Position sync against a stream whose duration grows
in real time produces unbounded drift, so live viewers were hard-seeked forever.

---

## 7. Verification

- **Leader tabs out**: viewers keep playing via server projection; the anchor
  self-corrects on return with no visible jump.
- **Viewer tabs out**: hard resync on becoming visible; the tap-to-rejoin
  overlay appears where the OS paused playback.
- **Leader rebuffers**: the room holds rather than running ahead; no rubber-band
  when the leader recovers.
- **Viewer on a throttled connection**: the room pauses for them (or does not,
  with `waitForSlowPeers` off) — in neither case do they enter a seek loop.
- **A YouTube live stream and a Twitch channel**: no seeking at all, a LIVE
  badge, no duration, no speed control.
- **Clock skew**: offset the client clock; steady-state drift stays in the soft
  band.
- **Pure core**: `lib/__tests__/rmhtube-sync-math.test.ts` covers the timeline,
  the correction policy, the position observer and the URL parser.
