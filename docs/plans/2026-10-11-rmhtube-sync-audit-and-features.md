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

Not covered by an automated test: a real browser driving the real
YouTube/Twitch/Vimeo iframes (their APIs need the network and a visible
window). The tick logic they feed is the same code the simulation exercises.

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
