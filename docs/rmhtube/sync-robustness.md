# RmhTube — Sync Robustness Design

> **Version**: 1.0
> **Date**: 2026-06-20
> **Status**: Implemented
> **Scope**: Make host-authoritative video sync reliable for everyone, including users who tab out or briefly background the page (especially on mobile).

---

## 1. Problem Statement

RmhTube uses a host-authoritative sync model: the room **leader's** player is
the source of truth. The leader reports its state on a 1 s interval
(`SYNC_HOST_STATE`), the server stores the latest report as the canonical
`videoState`, and a 2 s heartbeat (`SYNC_STATE`) rebroadcasts it to everyone.
Non-leaders compare their local position to the broadcast and hard-seek when the
drift exceeds 2 s.

In practice this desyncs for a meaningful fraction of users. The reported
symptoms — *"sometimes YouTube doesn't sync properly"* and *"breaks when
someone tabs out or briefly switches tabs, especially on mobile"* — trace back
to the following concrete defects.

### 1.1 Wall-clock divergence (no clock sync)

Drift compensation computes:

```ts
const latency = (now - videoState.updatedAt) / 2;        // VideoPlayer.tsx
const expectedTime = videoState.currentTime + (playing ? latency / 1000 : 0);
```

`videoState.updatedAt` is stamped with the **server's** `Date.now()`, while
`now` is the **viewer's** `Date.now()`. Consumer-device clocks routinely differ
from server time by seconds (and occasionally much more). That delta is fed
directly into the "how far has the video advanced since the report" estimate, so
the correction target is wrong by exactly the clock skew. There is no
handshake to measure or remove this offset.

### 1.2 The timeline freezes when the leader's tab is throttled

The leader reports via `setInterval(…, 1000)`. Background tabs throttle timers
(≥ 1 s on desktop; on mobile the page is frequently **frozen or suspended**
entirely, and the media element is paused by the OS). When the leader
backgrounds the app:

- Host reports stop, so `videoState.updatedAt` goes stale.
- The server is **purely passive** — the heartbeat rebroadcasts the last
  frozen report verbatim. It never advances the timeline itself.
- Every viewer is now anchored to a stale `currentTime`/`updatedAt` pair, so
  the whole room drifts together and never recovers until the leader returns.

### 1.3 No resync when a viewer returns to the tab

When a *viewer* briefly switches tabs, the media element is throttled (desktop)
or suspended/paused (mobile). On return there is **no `visibilitychange`
handling** — the player just waits for the next 2 s heartbeat, then the
0.5 s-debounced, 2 s-tolerance drift check. On mobile, where the video was
hard-paused by the OS, the viewer can sit seconds behind (or fully paused) with
no corrective action and no affordance to fix it.

### 1.4 Mobile auto-pause fights the user

When a non-leader's video is paused **by the environment** (mobile
backgrounding, autoplay policy), `onPause` fires and the client:

1. shows `"Only the leader can control playback"` (toast spam), and
2. re-applies the playing state to force resume.

But you **cannot** programmatically resume an HTML5/YouTube video on mobile
without a user gesture. The result: the viewer is stuck paused, spammed with
toasts, with no clear "tap to continue" path. The code cannot distinguish a
real user pause from an environment pause.

### 1.5 Buffering accumulates phantom drift

While a viewer buffers, `expectedTime` keeps advancing but the player is
stalled. The drift check then hard-seeks them forward, which triggers another
buffer, which causes another seek — a stutter loop. There is no
`onBuffer`/`onBufferEnd` awareness.

### 1.6 Host "playing" state is read incorrectly

```ts
playing: !player.props.playing === false   // VideoPlayer.tsx
```

This reads the **controlled React prop**, not the real player state, and the
expression is a no-op obfuscation of `player.props.playing`. If autoplay is
blocked or the player is buffering/ended, the leader reports `playing: true`
while nothing is actually playing, corrupting the canonical state for everyone.

### 1.7 Hard-seek-only correction is janky and loose

Every correction is a hard `seekTo`, and the tolerance is a full 2 s. Small,
routine desyncs either cause a visible jump (if over tolerance) or are ignored
(under tolerance, so the room is loosely synced by design). There is no gentle
correction band.

---

## 2. Goals & Non-Goals

**Goals**

- The room stays in sync even when the **leader** backgrounds the tab.
- A **viewer** who tabs out and returns is re-synced within a fraction of a
  second, automatically, including on mobile.
- Mobile environment-pauses never spam toasts and always offer a one-tap
  resync.
- Corrections are smooth (no constant jumping) but tight (sub-second steady
  state).
- No regression to leader controls or the existing event protocol semantics.

**Non-Goals**

- Frame-accurate sync (network jitter makes this impossible for embedded
  players). Target steady-state accuracy is **≤ ~0.5 s**.
- Changing the host-authoritative model (still one leader = source of truth).
- Multi-leader / peer-to-peer sync.

---

## 3. Design Overview

Four pillars:

1. **Clock synchronization** — measure the client↔server clock offset so all
   timeline math is done in a shared time base.
2. **Server-authoritative extrapolated timeline** — the server advances the
   playhead by wall-clock when `playing`, so leader-report gaps (throttling,
   freezing) no longer freeze the room. Leader reports become *corrections*.
3. **Visibility / buffering aware client** — explicit resync on tab-return and
   buffer-end; suspend correction while hidden/buffering.
4. **Two-tier drift correction + mobile pause CTA** — gentle `playbackRate`
   nudges for small drift, hard seek for large drift; a non-spammy "tap to
   resync" overlay when the environment pauses a viewer.

```
            ┌─────────────────────────────────────────────┐
  Leader ──►│  SYNC_HOST_STATE (real player state, 1s)     │
  client    │  + immediate play/pause/seek/speed events    │
            └───────────────┬─────────────────────────────┘
                            ▼
            ┌─────────────────────────────────────────────┐
            │  Server canonical videoState                 │
            │  effective(t) = playing                      │
            │      ? currentTime + (now-updatedAt)*rate    │
            │      : currentTime                           │
            │  → advances even with NO leader reports      │
            └───────────────┬─────────────────────────────┘
                 SYNC_STATE (effective + serverTime), 2s
                 SYNC_STATE (on-demand via SYNC_REQUEST)
                            ▼
            ┌─────────────────────────────────────────────┐
  Viewer ──►│  clock offset → server "now" in local base   │
  client    │  target = effective + age-since-serverTime   │
            │  drift = target - localTime                  │
            │   |drift| < 0.5s  → do nothing               │
            │   0.5–2s          → nudge playbackRate ±5%   │
            │   > 2s / resync   → hard seek                │
            │  visibilitychange/buffer-end → SYNC_REQUEST  │
            └─────────────────────────────────────────────┘
```

---

## 4. Detailed Design

### 4.1 Clock synchronization (NTP-lite)

New events:

- `C2S.SYNC_PING { clientTime }`
- `S2C.SYNC_PONG { clientTime, serverTime }`

On connect (and every 30 s thereafter, plus once on tab-return) the client
sends a small burst of pings. For each pong it computes:

```
rtt    = nowLocal - clientTime
offset = serverTime + rtt/2 - nowLocal      // add to local time → server time
```

It keeps the offset from the **lowest-RTT** sample in the burst (least
jitter-contaminated). A shared helper `getServerNow()` returns
`Date.now() + offset`. All timeline comparisons happen in server time.

This is implemented as a tiny stateful module `lib/rmhtube/clock.ts`; it is
intentionally independent of the Zustand store (pure timing, high-frequency).

### 4.2 Server-authoritative extrapolated timeline

A shared **pure** function (used by both client and server) lives in
`lib/rmhtube/sync-math.ts`:

```ts
export function extrapolate(vs: VideoState, serverNow: number): number {
  if (!vs.playing) return vs.currentTime;
  const elapsed = Math.max(0, serverNow - vs.updatedAt) / 1000;
  return vs.currentTime + elapsed * vs.playbackRate;
}
```

Server changes (`sync-engine.ts`, `room-manager.ts`):

- The heartbeat and every snapshot send an **effective** `VideoState`: the
  stored `currentTime` is replaced with `extrapolate(videoState, Date.now())`
  and `updatedAt` is re-stamped to `Date.now()`, plus a `serverTime` field.
- Because the server extrapolates, a leader whose reports are throttled or
  frozen no longer freezes the room — the playhead keeps moving correctly. When
  the leader's reports resume, they gently correct any accumulated estimation
  error.
- Leader `SYNC_HOST_STATE` reports are still accepted and overwrite the stored
  state (they are the authority for *corrections*, pause edges, and seeks), but
  they are no longer the *only* thing that moves the timeline.

`SYNC_STATE` payload becomes `VideoState & { serverTime: number }`.

### 4.3 On-demand resync

New event `C2S.SYNC_REQUEST` → the server replies to **that socket only** with a
fresh effective `SYNC_STATE`. Clients call it when they need an immediate,
authoritative position rather than waiting up to 2 s for the next heartbeat:

- on socket (re)connect,
- on `visibilitychange` → visible,
- on `onBufferEnd`.

### 4.4 Client correction algorithm (non-leader)

On each `SYNC_STATE` / resync, with `serverNow = getServerNow()`:

```
target = extrapolate(state, serverNow)           // state already effective+serverTime
drift  = target - player.getCurrentTime()
```

- **Hidden / buffering** → store the latest state, do nothing (no fighting a
  throttled/stalled element).
- **|drift| ≤ SOFT_TOLERANCE (0.5 s)** → in sync; ensure playbackRate is back to
  the room's chosen speed.
- **SOFT < |drift| ≤ HARD_TOLERANCE (2 s)** → *nudge*: set playbackRate to
  `roomSpeed * (1 ± NUDGE)` (NUDGE = 0.05) in the direction that closes the gap,
  reverting to `roomSpeed` once inside the soft band. Smooth, no jump.
- **|drift| > HARD_TOLERANCE**, or a forced resync (tab-return, seek event,
  media change) → **hard `seekTo(target)`**.

Play/pause edges from the leader are still applied immediately via the existing
`SYNC_PLAY` / `SYNC_PAUSE` events.

### 4.5 Visibility awareness

A single `visibilitychange` listener in `VideoPlayer`:

- **→ hidden**: set an internal `hiddenRef`; stop applying drift corrections.
  (The leader keeps its report interval, but we also rely on server
  extrapolation to cover throttling.)
- **→ visible**: re-run a clock sync ping burst, emit `SYNC_REQUEST`, and force
  a **hard** resync on the next state. The leader additionally emits an
  immediate fresh `SYNC_HOST_STATE` so the server's anchor is corrected the
  moment it returns.

### 4.6 Mobile auto-pause CTA

The player tracks whether a pause was **user-initiated**. For a non-leader,
when the player pauses but the canonical state says `playing`, we treat it as an
**environment pause** (mobile background / autoplay block). Instead of toast
spam + a futile forced resume, we surface a lightweight overlay:

> ▶ **Paused — tap to resync**

Tapping it counts as the required user gesture: it resyncs to the live position
and resumes playback. The "Only the leader can control playback" toast is
rate-limited (≤ once per few seconds) so genuine attempts still inform without
spamming.

### 4.7 Buffering awareness

`onBuffer` sets a `bufferingRef` that suspends correction; `onBufferEnd` clears
it and fires one `SYNC_REQUEST` so the viewer snaps back to the live position
after the stall instead of being repeatedly seek-looped during it.

### 4.8 Correct leader state reporting

Replace the controlled-prop read with the **real** player state:

```ts
let playing: boolean;
if (internal instanceof HTMLMediaElement) {
  playing = !internal.paused && !internal.ended;
} else if (typeof internal?.getPlayerState === 'function') {
  playing = internal.getPlayerState() === 1;   // 1 = PLAYING (YT)
} else {
  playing = liveVideoState.playing;            // fallback
}
```

This stops the leader from broadcasting `playing: true` while the video is
actually blocked/buffering/ended.

---

## 5. Protocol Changes

| Direction | Event | Payload | Notes |
|-----------|-------|---------|-------|
| C2S | `rmhtube:sync:ping` | `{ clientTime: number }` | clock sync |
| S2C | `rmhtube:sync:pong` | `{ clientTime: number; serverTime: number }` | clock sync |
| C2S | `rmhtube:sync:request` | `{}` | on-demand resync |
| S2C | `rmhtube:sync:state` | `VideoState & { serverTime: number }` | **extended** (was `VideoState`) |

All other events are unchanged. The `serverTime` addition is backward
compatible (old clients ignore the extra field).

Rate limits added: `rmhtube:sync:ping` (≤ 60/min), `rmhtube:sync:request`
(≤ 30/min).

---

## 6. Constants (new / changed)

```ts
// lib/rmhtube/constants.ts
export const SYNC_SOFT_TOLERANCE_S = 0.5;   // below: in sync
export const SYNC_HARD_TOLERANCE_S = 2.0;   // above: hard seek  (was SYNC_TOLERANCE_S)
export const SYNC_NUDGE_RATE = 0.05;        // ±5% playbackRate nudge
export const CLOCK_SYNC_SAMPLES = 5;        // pings per burst
export const CLOCK_SYNC_INTERVAL_MS = 30_000;
```

`SYNC_HEARTBEAT_INTERVAL_MS` (2 s) and `HOST_STATE_INTERVAL_MS` (1 s) are kept —
server extrapolation + on-demand resync remove the need to tighten them.

---

## 7. Affected Files

- `lib/rmhtube/events.ts` — add `SYNC_PING`, `SYNC_REQUEST` (C2S); `SYNC_PONG` (S2C).
- `lib/rmhtube/schemas.ts` — `PingSchema`.
- `lib/rmhtube/constants.ts` — tolerances, nudge, clock-sync constants.
- `lib/rmhtube/sync-math.ts` — **new**: pure `extrapolate` / drift helpers (shared).
- `lib/rmhtube/clock.ts` — **new**: client clock-offset manager.
- `lib/rmhtube/socket.ts` — clock-sync handshake; `SYNC_STATE` carries `serverTime`.
- `server/rmhtube/sync-engine.ts` — ping/request handlers; extrapolated heartbeat & broadcasts; correct fields.
- `server/rmhtube/room-manager.ts` — `buildClientState` sends effective `videoState`.
- `server/rmhtube/config.ts` — rate limits for new events.
- `components/rmhtube/VideoPlayer.tsx` — clock-based correction, visibility/buffer handling, mobile CTA, correct leader reporting.

---

## 8. Testing & Verification

- **Leader tabs out (desktop & mobile)**: viewers continue in sync via server
  extrapolation; on leader return the anchor self-corrects without a visible
  jump for viewers.
- **Viewer tabs out briefly and returns**: hard resync within ~1 frame of
  becoming visible; on mobile the "tap to resync" CTA appears if the OS paused
  playback.
- **Clock skew**: artificially offset the client clock; steady-state drift stays
  within the soft band (offset is removed by the handshake).
- **Buffering**: throttle network; confirm no seek-loop during stalls and a
  single snap-back after.
- **Permissions**: non-leader controls still blocked, toast rate-limited.
- **Type/lint**: `pnpm typecheck` / `pnpm lint` clean for touched files.
```
