# RMHTube — sync audit, control matrix, and feature roadmap (2026-10-11)

> Status: **audit fixes and items marked ✅ ship in PR #887**; everything else is
> a blueprint. Companion to
> [`2026-10-10-ux-delight-qol-blueprints.md`](2026-10-10-ux-delight-qol-blueprints.md).
> Code: `server/rmhtube/`, `lib/rmhtube/`, `components/rmhtube/`.

## 1. What "never desyncs" means here

RMHTube is leader-authoritative. The hub holds one **anchor** per room
(`VideoState`: playing, position, rate, `updatedAt` in server time, `rev`);
every client projects it with `extrapolate()` against an NTP-lite clock
(`clock.ts`) and corrects its own player toward it (`planSync`). "In sync"
therefore has a precise meaning, and a measurable one: *a viewer's playhead
minus the projected anchor*. The goals the tests hold the code to:

| Condition                                | Bound                                 | Where it is asserted                        |
| ---------------------------------------- | ------------------------------------- | ------------------------------------------- |
| Steady state (after settling)            | median ≤ 0.2 s, p90 ≤ 0.5 s           | `lib/__tests__/rmhtube-sync-sim.test.ts`    |
| After a join / seek / stall              | ≤ 2 s by 6 s, ≤ 0.5 s by 20 s         | same (seeded simulation, jittery networks)  |
| Correction seeks                         | bounded — no seek loops               | same                                        |
| Out-of-order / duplicate anchors         | never applied backwards               | `rmhtube-sync-math.test.ts` (`acceptServerAnchor`) |
| Leader leaves                            | someone present is in control in ≤ 8 s | `server/rmhtube/__tests__/sync.integration.test.ts` |
| Leader's tab freezes at end of video     | queue advances anyway                 | same                                        |
| Duplicate `ended` from several players   | exactly one advance                   | same                                        |

Those suites run in `pnpm test`; the integration suite drives the real
RoomManager / SyncEngine / MediaQueue over real sockets. Each of them was
mutation-checked: reverting the fix makes its case fail.

### 1.1 Live run (three browsers)

A Playwright script drove three signed-in Chromium sessions (host, two
viewers) against `vite dev` + the real hub + Postgres, on a 10-minute WebM
served as a raw link, and measured `<video>.currentTime` across tabs. Final
run, 19/19 checks:

| Scenario | Viewer − leader (median) |
| -------- | ------------------------ |
| Site Play, steady state | 0.04 s (B), 0.04 s (C) |
| Leader native scrub → viewers | 0.004 s |
| Site −10 s | 0.10 s |
| Leader native pause | 0.000 s (same frame) |
| Leader native play | 0.14 s, closing |
| Leader native 1.5× | 0.16 s, closing |
| Viewer native scrub +20 s → snapped back | 0.03 s |
| Viewer native 2× → restored to 1× | 0.10 s |
| Viewer native pause | stays local, "You paused", Resync → 0.10 s |
| Leadership → Bob, Bob scrubs natively | 0.003 s; old leader's native play overruled |
| Leader tab closed → failover to host → leader returns | 0.045 s / 0.036 s |

Start-at (`#t=30`) put both players at exactly 30.00.

The same script then ran against streams generated locally with ffmpeg
(VP9/Opus in fMP4, served cross-origin):

| Source | Result (final round, after every fix below) |
| ------ | ------ |
| Native WebM, full scenario ×2 | 19/19 both — steady state 0.002–0.08 s, native scrub 0.01–0.07 s, native pause 0.000 s, Resync 0.02–0.03 s, failover 0.05 s |
| HLS VOD (`hls.js`), full scenario | 19/19 — steady state 0.03 s, native scrub 0.01 s, Resync 0.02 s, failover 0.01 s |
| DASH VOD (`dash.js`), controls scenario | 14/14 — steady state 0.08–0.09 s, native scrub 0.007 s, Resync 0.05 s |
| Live HLS (sliding 20 s window) | 10/10 — all players start ~8 s behind the edge together; site + native play/pause mirrored; a viewer's DVR seek and local pause left alone; Jump to live returns them to the edge |

YouTube, Twitch and Vimeo could not be run: this environment's network
policy denies their hosts. The script is not
checked in (it needs a database, a session per user and a media file); the
unit, simulation and hub suites are the regression gate.

## 2. Desync causes found and fixed

| # | Cause | Symptom | Fix |
| - | ----- | ------- | --- |
| 1 | Leader disconnects; nobody else may drive | Room frozen until the leader returns, queue stuck | `scheduleLeaderFailover` hands control to the host (else the longest-connected member) after `RMHTUBE_LEADER_FAILOVER_MS`; the designated leader gets it back on return (`restoreDesignatedLeader`) |
| 2 | Leadership given to a disconnected member | Same as 1, by choice | `setLeader` refuses with `NOT_CONNECTED` |
| 3 | Every player sends `ended`; the second skip lands on the next item | An unwatched video skipped | `QUEUE_SKIP { itemId }` — a skip naming a stale item is ignored |
| 4 | Leader tab frozen/throttled at the end | Room "playing" past the end forever | Heartbeat advances a known-length VOD at `duration + RMHTUBE_END_GRACE_S` |
| 5 | Optimistic local anchor with a phantom `rev` | Server anchors rejected for seconds after a click | `acceptServerAnchor`: a pending optimistic rev expires after 3 s |
| 6 | YouTube applies a rate asynchronously and echoes the old one | Speed change reverted by the leader's own report | Rate reports ignored for `RATE_SETTLE_MS` after the leader applies one |
| 7 | Viewer changes speed in the provider's menu | Slow drift → seek every few seconds | Native-rate drift corrected on the tick + "the leader controls playback" toast |
| 8 | New/blocked leader's unplayed element reported as "paused" | Whole room paused on a handoff | `LEADER_HANDOFF_GRACE_MS`; a leader that needs a tap asks for one instead of reporting |
| 9 | Seek aimed at where the room *was* | Viewer lands ~seek-latency behind, then nudges | Seek lead = measured seek cost (EMA), capped |
| 10 | Residual 0.3–0.5 s drift accepted as "settled" | Audible echo between two devices in one room | Hysteresis: once nudging, settle to 0.1 s; proportional nudge rate |
| 11 | ←/→ and media-key seek from the stale anchor | Jump measured from up to 2 s ago | `roomPosition()` projects the anchor first |
| 12 | Start time (`?t=`) reached only the player | Leader at 1:30, room at 0:00, one dragged to the other | Start offset is the item's first anchor (`startOffset` / `playableUrl`) |
| 13 | Leader spent a room `rev` while its new source was loading | Leader never applied the new item's anchor | `rev` consumed only once the element is ready |
| 14 | Seek cost timed from "seek issued" to "next tick that sees playback" | Even an instant player learned a ~1.4 s lead and landed that far **ahead** after every correction | `refineSeekLead`: the residual drift after the seek measures the cost directly |
| 15 | A native pause anchored at the server's projection, not the leader's frame; paused gaps < 0.5 s never corrected | Room frozen with viewers ~0.4 s apart, and resumed that way | `SYNC_PAUSE/PLAY { time }` from the leader's player; paused tolerance 0.2 s |
| 16 | Room changes applied on the next 250 ms tick, and unevenly (leader vs. viewers) | Everyone settled a fixed ~0.2 s off the leader, inside the band nothing corrects | Out-of-band tick on every new `rev`, for leader and viewers |
| 17 | `connectToRmhTube` checked for a client before awaiting the session | Two sockets per tab; the hub kicked one with `DUPLICATE_SESSION` | The in-flight connect is shared |
| 18 | Sync chip read the plan's drift, which is 0 while corrections are suspended | "In sync" shown to a viewer who had paused | Offset measured directly; "You paused" state |
| 19 | A player that wasn't already nudging treated anything under 0.5 s as settled | An HLS viewer started 0.40 s off and stayed there | Nudge-capable players start correcting past 0.2 s (`SYNC_NUDGE_ENTER_S`) |
| 20 | An `.m3u8` is assumed VOD until the leader reports it live; viewers were placed by that VOD anchor at "0" | On a live HLS stream, viewers sat at the start of the DVR window, ~20 s behind the leader, for good | Once per live item a player well behind the live edge moves up to it; "Resync now" becomes **Jump to live** |
| 21 | A viewer who paused their own player was still "corrected" | Seeked forward every 1.5 s while paused — a re-fetch and a jumping frame — then resumed from a stale chase position ~0.4 s off | No corrections during a local pause; the tap/Resync that ends it forces one seek (lands within 0.01 s) |
| 22 | Nudge gain 0.08 | A 0.4 s residual ran at the 5 % floor: 8 s to close | Gain 0.25 — 0.4 s and up runs the full 10 % |

Rows 14–22 were found by a live run (§1.1), not by the unit suites — the
simulation measured seek cost with perfect knowledge of when frames resumed,
which a real player never has. It now uses the same tick-based feedback.

## 3. Control matrix — native vs. site controls

"Site controls" = the control bar, seek bar, keyboard shortcuts, media keys
(Media Session), chat timestamp links. "Native" = the provider's own UI inside
the player (YouTube/Vimeo/Twitch chrome, `<video controls>`).

| Action | Leader, site controls | Leader, native | Viewer, site controls | Viewer, native |
| ------ | --------------------- | -------------- | --------------------- | -------------- |
| Play / pause | Room `rev` → all | Edge detected on the tick → `SYNC_PLAY/PAUSE` | Disabled, "Request control" offered | Play: re-paused + toast. Pause: kept local, "tap to resync" overlay |
| Seek | Seek bar, ±10 s, ←/→ → `SYNC_SEEK` | Jump detected on the tick → `SYNC_SEEK` | Read-only bar | Snapped back to the room + toast |
| Speed | Speed menu → `SYNC_SET_SPEED` | Rate report (settle-gated) | Read-only | Rate restored + toast |
| Volume / captions / quality / fullscreen / PiP | Local | Local | Local | Local |

Per source type: **progressive** (`.mp4`, `.webm`, raw links) — everything
above, plus the Document PiP pop-out. **HLS / DASH VOD** — everything above,
via react-player's hls.js / dash.js elements. **YouTube / Vimeo** — everything
above; Vimeo, like native video, closes small gaps with an invisible ±5–10 %
rate nudge, while YouTube only offers discrete speeds and so corrects by seek.
**Twitch VOD** — seek-only correction, and no speed control. **Live (Twitch
channel, YouTube live, live HLS)** — no timeline, so play/pause is mirrored and
position is never compared; the seek bar and ±10 s hide.

Not yet run in a real browser: the YouTube, Twitch and Vimeo iframes (the
test environment's network policy denies their hosts). The tick logic they
feed is the same code the simulation and the HLS/DASH/native runs exercise;
what differs per provider is the custom element's media API, i.e. how
faithfully `currentTime`, `paused`, `playbackRate` and `seekable` report.

## 4. Features

### Shipped in this PR ✅

1. **Owner picks the leader** — host can hand control to any *connected*
   member from the member list; "Take control" back at any time.
2. **Request control** — a viewer asks; host and leader get a toast and a
   highlighted "Make leader" button. Rate-limited (3/min).
3. **Leader failover + restore** (§2 #1).
4. **Seek bar in the site controls** — projected position at 4 Hz without
   React renders; leader drags, everyone else sees it read-only.
5. **±10 s buttons**, also on ←/→ and media keys.
6. **Raw video links** — any http(s) URL the host identifies as video by
   `Content-Type` or by sniffing its first 32 bytes, through `safeFetch`.
   Extension-less HLS/DASH get a `#.m3u8` / `#.mpd` engine hint.
7. **Start-at links** — `?t=1m30s`, `?start=`, `#t=1:30`, Twitch `?t=`; or type
   it in the Add dialog's "Start at" field. The whole room starts there.
8. **Paste several links at once** — the Add dialog queues every playable link
   in the pasted text (up to 15, inside the hub's add rate limit).
9. **Sync status chip** — "In sync" / "Catching up" / "Buffering" / "You
   lead", with stats for nerds (offset from room, rate, correction seeks, seek
   cost, clock offset, round trip) and **Resync now**.

### Next — cheap, high value

10. **Up next card** — at `duration − 10 s`, show the next item's title and
    thumbnail over the player corner; leader can "Play now" or "Hold". Data is
    already on the client (`queue[currentIndex+1]`); zero server change.
11. **Pause after this video** — a leader toggle; the hub's advance path
    pauses on the next item's first anchor instead of playing it. One boolean
    on the room (not persisted).
12. **Sleep timer** — local: pause *my* player after N minutes / at end of
    item, leaving the room. Pure client.
13. **Subtitle tracks for raw links** — add a `.vtt` URL alongside a direct
    video; render via `<track>`; fetch through the existing asset proxy for
    CORS. Store on the queue item URL fragment like the start offset
    (`#sub=`) so no schema change.
14. **Chapters** — parse `0:00 Intro` lines from a YouTube description (oEmbed
    has no chapters; needs the Data API key) or let the adder paste them;
    render ticks on the seek bar, click = seek (leader).
15. **Reaction heat map** — the hub already relays reactions; count them per
    10 s bucket per item and draw a sparkline under the seek bar.
16. **"Jump to live"** for live HLS/YouTube live — viewers drift behind the
    live edge independently; a button seeks to `seekable.end − 3 s`.
17. **Resume where the room left off** — on rejoin after a crash, the snapshot
    already carries the anchor; add a toast "Resumed at 12:34" so the jump is
    explained.
18. **Per-member latency badges** — the hub knows each socket's last ping RTT;
    show it in the member list for the host when someone complains of lag.
19. **Queue from a YouTube playlist** — expand `list=` into items server-side
    (Data API, quota-bound; cache per playlist for an hour).
20. **Drag a file link from another tab** — `onDrop` on the queue panel with
    `text/uri-list`; reuses the batch-add path.

### Later — bigger, still bounded

21. **Watch-party scheduling** — "Starts at 8 pm": room locked to a lobby
    card with a countdown; RSVP feeds the existing event reminders (U7).
22. **Co-leaders** — a small set allowed to drive, with last-writer-wins on
    `rev` (already the semantics); UI shows who moved it ("Sam seeked to 4:12").
23. **Activity line in chat for control changes** — "Alex paused at 12:03";
    system messages already exist (`SystemMessage.event`).
24. **Clip & share** — leader marks in/out; generates a link that opens a room
    at the start offset (reuses #7) with an end offset that auto-pauses.
25. **Watch history & resume per user** — `RmhTubeWatchProgress (userId,
    url, position)`; prompts "Continue from 41:10?" when re-queued.
26. **Audio-only mode** — hide the video, keep the element (saves GPU and
    battery on phones); the sync loop is unchanged.
27. **Ambient mode** — blurred, scaled copy of the current frame behind the
    player via a 1 fps `drawImage` into a small canvas (native video only;
    iframes are cross-origin). Off under `perf-lite` and reduced motion.
28. **Room presets** — "Movie night" (wait-for-peers on, chat slow mode,
    reactions only), "Music" (loop, auto-sort by votes).
29. **Discord Activity** — the rmhbox hub already speaks Discord's OAuth; the
    same pattern would put RMHTube in a voice channel.
30. **Host-side bandwidth hint** — when one viewer stalls repeatedly, suggest
    the leader lower quality (YouTube) or pick an HLS rendition cap.

### Runtime budget

All shipped items keep the existing envelope: the player tick stays at 250 ms
and writes refs (the sync chip polls at 500 ms and renders only its word);
the seek bar paints through refs; the only new server work is one probe per
added raw link (HEAD + at most a 32-byte ranged GET, 5 s timeout) and a
string parse per item change. No new dependency, no schema migration.
