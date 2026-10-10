# UX, delight & QoL — features other sites have, with build blueprints

_2026-10-10. Scope: user experience, enjoyability, quality of life. Every
blueprint is constrained to keep **runtime fast** (nothing new on the
first-paint path, no per-frame React work) and **compile times low** (no new
dependencies, plugins, server bundles or codegen)._

## §0 — How this differs from the existing backlog

The plans directory already holds ~12k lines of feature ideas
(`2026-07-20-parity-qol…`, `2026-07-31-feature-gap…`, `2026-08-04-*`,
`2026-08-05-next-100…`, `2026-09-19-next-phase…`). Those are mostly
**systems** — matchmaking, economy, AI, consolidation. This document is the
**feel** layer they skip: the small, platform-API-backed touches that make
Spotify, YouTube, Discord, Steam, Slack, Gmail and Wordle feel finished.

Every item below was checked against the tree on 2026-10-10. Where something
partly exists it is cited and the blueprint extends it rather than duplicating
it. Ideas already specced elsewhere (universal undo, resume rail, drafts,
gamepad layer, clips, focus mode, digests, device handoff…) are deliberately
**not** repeated.

### The performance & build contract every blueprint obeys

1. **Zero new npm dependencies.** Everything here is a web-platform API
   (Media Session, Document Picture-in-Picture, Wake Lock, Web Share, Badging,
   Web Audio, Notification actions, `beforeinstallprompt`) or reuses a module
   already in the repo.
2. **Nothing joins the critical bundle except hooks under ~1 KB.** Any UI is
   `lazy()`-imported, mounted behind `useIdleReady()` or on first interaction,
   the way `_site.tsx:47` already mounts the RMHMusic `MiniPlayer`.
3. **No per-frame React state, no per-frame writes to `<html>`.** Game-side
   additions run inside the game's existing loop or on refs.
4. **No new Vite plugin, no new server bundle, no generated files.** Server
   work goes through `defineHandler` routes and existing pg-boss jobs.
5. **At most two small new tables** across the whole document (`Reminder`,
   `GuestbookEntry`), both append-mostly with one index each.
6. **Gates are plain Vitest files** in `lib/__tests__/`, discovered by glob —
   nothing to register, negligible test-time cost.

---

## §1 — Priority summary

| #   | Feature                                        | Anchor (who has it)            | Effort | Runtime cost        |
| --- | ---------------------------------------------- | ------------------------------ | ------ | ------------------- |
| U1  | Media Session: lock-screen & media-key control | Spotify, YouTube               | **S**  | ~1 KB, lazy         |
| U2  | One site-wide sound mixer + mute hotkey        | Steam, consoles, Discord       | **S–M**| one tiny store      |
| U3  | The game session contract (pause/restart/wake) | Steam, Switch, every console   | **M**  | <1 KB hook          |
| U4  | "New PB" moment + one-tap share                | Strava, Wordle, Duolingo       | **S**  | lazy component      |
| U5  | Unread count in tab title + favicon            | Gmail, Discord, X              | **S**  | <1 KB, no polling   |
| U6  | Actionable push notifications                  | Slack, Discord, X              | **S**  | service-worker only |
| U7  | "Remind me about this" / snooze                | Slack, Gmail                   | **S**  | one table + job     |
| U8  | Smart PWA install prompt                       | Twitter Lite, Pinterest, Spotify | **S** | lazy, event-driven  |
| U9  | Ghost racing against PBs and friends           | Trackmania, Mario Kart, TETR.IO| **M**  | lazy, per game      |
| U10 | Pop-out player (Document Picture-in-Picture)   | YouTube, Spotify, Discord      | **M**  | lazy, Chromium-only |
| U11 | Swipe actions on mobile lists                  | iMessage, WhatsApp, Gmail      | **S**  | reuses `useFluidDrag` |
| U12 | Internal link previews                         | Wikipedia, GitHub, Notion      | **S–M**| lazy, cached        |
| U13 | Opt-in UI sound palette                        | Apple, Discord, Duolingo       | **S**  | 0 bytes of assets   |
| U14 | Photo mode for the 3D games                    | Forza, God of War, Fortnite    | **M**  | lazy chunk          |
| U15 | Profile guestbook (opt-in)                     | MySpace, Neocities, Steam      | **S–M**| one table           |

**Suggested order:** U1 → U5 → U4 → U3 → U2 (one week of small wins with
outsized feel), then U6/U7/U8 (retention), then U9/U10/U14 (delight), then
U11–U13/U15 as polish.

---

## U1 — Media Session: lock-screen and media-key control — **S**

**Anchor.** Spotify and YouTube in a browser tab respond to keyboard media
keys, AirPods taps, the macOS Now Playing widget, Android's lock-screen
player and Windows' volume flyout, with artwork and a scrubber.

**Gap.** `navigator.mediaSession` appears nowhere in the tree. RMHMusic
already keeps playback alive across navigation (the module singleton in
`lib/rmhmusic/spotify-player.ts:7`, surfaced by
`components/rmhmusic/MiniPlayer.tsx`), so the audio outlives the page — but
the OS shows a blank "rmhstudios.com" tile with no controls, and media keys
do nothing.

**Blueprint.**

- `lib/media/media-session.ts` (new, framework-free, ~80 lines):
  ```ts
  export function bindMediaSession(el: HTMLMediaElement, src: {
    getMeta(): { title: string; artist?: string; album?: string; artwork?: string } | null;
    next?(): void; prev?(): void;
  }): () => void
  ```
  Sets `metadata` on `play`/`loadedmetadata`, registers `play`, `pause`,
  `seekto`, `seekbackward`, `seekforward`, `previoustrack`, `nexttrack`
  handlers, and calls `setPositionState` on `durationchange`/`ratechange`/
  `seeked` only (**not** on `timeupdate` — the OS interpolates position
  itself; updating every tick is wasted work). Returns an unbind that nulls
  every handler. Feature-detect `'mediaSession' in navigator`; no-op
  otherwise.
- **RMHMusic:** call it once where the singleton is created.
  `next`/`prev` map to the queue store; in a room, only the host's session
  registers `nexttrack` (mirrors the existing host-only skip rule so OS
  controls can't desync a room).
- **RMHTube:** call it in `components/rmhtube/VideoPlayer.tsx` for the
  native-video path. For the YouTube iframe path, set metadata only (the
  iframe owns its own element) and route `play`/`pause` through the existing
  player API.
- **Artwork:** pass existing cover/thumbnail URLs at 96/256/512 via the image
  optimiser's sizes; no new image work.

**Perf/compile.** One small module, imported only by the two players (already
lazy). Zero first-paint cost.

**Acceptance.** Media keys play/pause/skip on desktop; Android lock screen
shows title, artist, artwork and a working scrubber; leaving RMHMusic keeps
the controls working via the mini-player.

---

## U2 — One site-wide sound mixer and a mute hotkey — **S–M**

**Anchor.** Steam Big Picture, Switch and Discord all have one place that
says "games are too loud", plus a global mute.

**Gap.** Volume is owned per app: separate stores and sliders in
`lib/rmhtube/store.ts`, `lib/altair/stores/settings-store.ts`,
`components/rmhbox/SettingsMenu.tsx`, `lib/synapse-storm/sounds.ts`,
`lib/bums-rush/audio/bus.ts` and others. A player who wants everything 50%
quieter, or silent on a call, visits each one. There is no global mute.

**Blueprint.**

- `stores/audio-prefs.ts` — a persisted Zustand store (same pattern as the
  theme store): `{ master, music, sfx, ui, voice, muted }`, each 0–1.
  Exposes a non-React getter `getGain(category)` and a `subscribe` for audio
  code that lives outside React.
- `lib/audio/AudioManager.ts` gains a per-category `GainNode` chain
  (`source → category → master → destination`). Games that already use
  `AudioManager` get the mixer for free.
- Games with their own buses multiply their local volume by
  `getGain('sfx' | 'music')` at the one place they set gain — a one-line
  change each. `HTMLMediaElement` players set `el.volume = local * getGain('music')`.
- **Settings UI:** a "Sound" section in the existing appearance settings
  (`components/settings/AppearancePanel.tsx` neighbourhood) using
  `components/ui/slider.tsx`.
- **Hotkey:** register `m` (outside text fields) as "mute everything" in
  `lib/shortcuts/registry.ts` so it appears in the shortcut sheet
  automatically; show a sonner toast "Sound off · M to undo".
- **Gate:** `lib/__tests__/audio-mixer.test.ts` greps `components/**` and
  `lib/**` for `new AudioContext(` and `.volume =` outside an allowlist, so new
  games route through the mixer instead of growing a seventh volume store.
  (Allowlist is one-directional, per the commit-gate rules.)

**Perf/compile.** One store (<1 KB). Gain nodes are created once per context.
No per-frame work.

---

## U3 — The game session contract: auto-pause, instant restart, wake lock — **M**

**Anchor.** Every console suspends a game when you look away and offers a
one-button retry. Steam pauses on overlay. Mobile games keep the screen on.

**Gap.** Of 18 games, roughly eight listen for `visibilitychange`; the rest
keep simulating (and dying) in a background tab. `requestScreenWakeLock()`
exists in `lib/shared/platform.ts:21` but only Slice It, Nightrail and Neon
Driftway call it. There is no shared "restart" binding; each game invents
its own (or none). Practical effect: alt-tab in most games and you come back
to a game-over screen.

**Blueprint.**

- `hooks/useGameSession.ts` (new, <1 KB):
  ```ts
  useGameSession({
    active: boolean,          // true while a run is in progress
    onPause(): void,          // called on tab hide, window blur, gamepad disconnect
    onResume?(): void,        // NOT auto-called — games resume behind a "tap to continue"
    onRestart?(): void,       // bound to R / gamepad Select, only while active or on results
  })
  ```
  Internally: `visibilitychange` + `pagehide` → `onPause`;
  `requestScreenWakeLock()` while `active`, released when inactive (and
  re-acquired on `visibilitychange` back to visible, which the spec requires);
  `R` registered through `lib/shortcuts/useShortcuts.ts` so it shows in the
  shortcut sheet and never fires inside text inputs.
- **Resume UX:** a shared lazy `<PausedOverlay>` (`.glass-overlay`, one
  "Continue" button, focus-trapped) so every game pauses the same way.
  Multiplayer games skip `onPause` (they can't pause) but still take the wake
  lock and restart binding.
- **Migration:** add the hook to each game's top component — typically 5–10
  lines replacing its bespoke listener.
- **Gate:** `lib/__tests__/game-session.test.ts` iterates `lib/games.ts` and
  asserts each game's entry component imports `useGameSession` (with an
  allowlist that only shrinks). This turns "every game pauses" into an
  invariant, the same way `design-consistency.test.ts` does for tokens.

**Perf/compile.** Two listeners and a wake-lock sentinel per mounted game;
removes duplicated listeners from the eight games that have them.

---

## U4 — The "New PB" moment, with one-tap share — **S**

**Anchor.** Strava's PR medal, Duolingo's streak screen, Wordle's share
grid — the instant after a good result is when people share.

**Gap.** The server side is ready — `lib/og/stat-card.server.tsx` already
renders "brag-worthy moment" cards — but the game never learns it was a
moment: `submitGameScore` returns `{ ok: true }`
(`lib/game/submit.server.ts:44`). So no game can say "new personal best",
"you passed @friend", or "top 5% this week", and the share card has no
trigger at the moment it matters.

**Blueprint.**

- **Server:** extend the success branch to
  `{ ok: true; moment?: { kind: 'pb' | 'rank' | 'friend-pass' | 'first-clear'; previous?: number; rank?: number; passed?: { handle: string } } }`.
  Computing `pb` is one indexed read of the player's previous best on the
  same row the adapter is about to write (or the adapter's upsert can return
  the old value, making it free). `rank` is one indexed `COUNT(*) WHERE score > $1`
  on the leaderboard table, computed **only when `pb` is true** (rare), so
  the hot path is unchanged. `friend-pass` reuses
  `lib/game/leaderboard-scope.server.ts`'s friends scope, again only on PB.
- **Client:** a shared `components/games/ResultMoment.tsx`, `lazy()`-loaded
  by the results screen only when `moment` is present. It shows the moment
  with `useCelebration()` (already respects reduced motion), and a Share
  button that calls `navigator.share({ url })` with a
  `components/ui/copy-button.tsx` fallback on desktop.
- **Persistence for the card:** already solved. `lib/moments.server.ts`
  creates a `SharedMoment` only when the user presses share, snapshots the
  payload, and serves it at `/moments/$id` with `ogCardPath('moment', id)`.
  Share calls `createMoment` with the server-returned `moment` (re-validated
  against the stored score, not trusted from the client) — no new table.

**Perf/compile.** No extra queries on non-PB submits. Component is lazy and
only loads on a PB.

---

## U5 — Unread count in the tab title and favicon — **S**

**Anchor.** Gmail "Inbox (3)", Discord's red favicon dot, X "(5) Home".
People with 20 tabs find you by the badge.

**Gap.** `useNotificationCount` and `useUnreadCount` (`lib/`) already feed
the in-app badges and `useAppBadge` sets the installed-PWA badge — but
browser-tab users see nothing. `document.title` is only touched in
`app/routes/v.$slug.tsx`.

**Blueprint.**

- `components/site/TabBadge.tsx` (mounted once in `__root.tsx`, renders
  `null`):
  - Reads the two counts the app already holds (no new fetch, no polling).
  - **Title:** TanStack `head()` owns `<title>`, so don't fight it — observe
    the router's `onResolved` event, strip any existing `^\(\d+\+?\) ` prefix,
    and re-apply `(${n}) ` when `n > 0`. Cap at `99+`.
  - **Favicon:** only when the count changes from 0↔non-0, draw
    `/favicon.svg` plus a dot onto a 32×32 `OffscreenCanvas` (fallback
    `<canvas>`), set the `<link rel="icon">` `href` to the blob URL, revoke the
    previous one. Dot colour reads `--site-accent` once via
    `getComputedStyle` so it follows the theme.
- **Setting:** a toggle in notification settings ("Show unread count in tab").
- Respect the existing quiet-hours preference: no badge during quiet hours.

**Perf/compile.** Renders nothing; work happens only when a count changes.

---

## U6 — Actionable push notifications — **S**

**Anchor.** Slack and Discord notifications have "Mark as read" and "Reply";
X has "Like" and "Retweet" on mobile.

**Gap.** `public/sw.js:570` handles `notificationclick` by opening a URL. No
payload built by `lib/push/send.server.ts` carries `actions`, so every
notification is "click to open the site".

**Blueprint.**

- **Server:** `send.server.ts` accepts an optional
  `actions: Array<{ action: 'like' | 'mark-read' | 'mute-thread' | 'reply'; title: string }>`
  and a signed `actionToken` (HMAC of `userId + targetId + action + exp`,
  15-minute expiry, same `createHmac` + `timingSafeEqual` shape as
  `lib/news-approval.server.ts` and `lib/slice-it/run-token.server.ts` — a
  third copy is the moment to extract `lib/signed-token.server.ts`). Each notification type declares its actions in one map
  (mentions → like/reply, DMs → mark-read/reply, replies → like/mute-thread).
  Titles are translated server-side with the recipient's locale.
- **Service worker:** in `notificationclick`, branch on `event.action`:
  - `like` / `mark-read` / `mute-thread` → `fetch('/api/push/action', { method: 'POST', body: { token } })`
    inside `event.waitUntil`, no window opened. If it fails, fall back to
    opening the target URL (never silently drop the user's intent).
  - `reply` → open the composer deep link pre-focused
    (`/thread/$id?reply=1`). True inline-text reply is non-standard across
    browsers, so this is the honest cross-browser version.
- **Route:** `app/routes/api/push/action.ts` with
  `defineHandler({ auth: 'none', rateLimit: 'write', body: schema })` — the
  token is the auth, verified with that helper, and replays are
  blocked by the expiry plus idempotent writes (like = upsert).
- Browsers cap visible actions at two; order by usefulness.

**Perf/compile.** Service-worker and one route only. Nothing in the page
bundle.

---

## U7 — "Remind me about this" and snooze — **S**

**Anchor.** Slack "Remind me about this in 1 hour", Gmail snooze, Reddit's
RemindMe bot.

**Gap.** Saves (`/saves`) are a pile, not a prompt; nothing resurfaces a
post, thread, event, listing or notification at a chosen time. (`remindMe`
doesn't exist in the tree.)

**Blueprint.**

- **Model:**
  ```prisma
  model Reminder {
    id        String   @id @default(cuid())
    userId    String
    kind      String   // 'post' | 'thread' | 'event' | 'listing' | 'notification' | 'game'
    targetId  String
    note      String?  @db.VarChar(140)
    remindAt  DateTime
    firedAt   DateTime?
    createdAt DateTime @default(now())
    @@index([remindAt, firedAt])
    @@unique([userId, kind, targetId])
  }
  ```
- **Firing:** one pg-boss cron in the existing jobs worker every minute:
  `SELECT … WHERE firedAt IS NULL AND remindAt <= now() LIMIT 500`, emit a
  normal notification (which then also gets U5's badge and U6's actions) and
  set `firedAt`. Uses the existing notification pipeline, so quiet hours and
  per-category prefs apply for free.
- **UI:** a "Remind me" item in the overflow menu of post/thread/event/
  listing cards, opening a tiny `anchored-menu` with presets — _In 1 hour ·
  Tonight (8 pm) · Tomorrow morning · Next week · Pick…_ — reusing
  `components/ui/schedule-control.tsx` for "Pick…". Presets resolve in the
  viewer's timezone on the client and send an absolute `remindAt`.
- **Snooze on notifications:** same table, `kind: 'notification'`; the
  notification is hidden until `remindAt`, then re-delivered.
- **Manage:** a "Reminders" tab on `/saves` (it's the same mental model).
  Hard cap of 200 pending reminders per user.

**Perf/compile.** One indexed table, one cron. The menu is part of an
already-lazy overflow menu.

---

## U8 — A smart PWA install prompt — **S**

**Anchor.** Pinterest, Spotify and Starbucks show their own install banner
at a good moment; Twitter Lite measured large retention lifts from it.

**Gap.** The site ships a manifest, service worker, share target and app
badging, but never listens for `beforeinstallprompt`, so installation only
happens if a user finds the browser's buried menu item. iOS has no prompt at
all and needs instructions.

**Blueprint.**

- `lib/pwa/install.ts`: capture `beforeinstallprompt` at module load
  (`preventDefault`, stash the event); expose `canPrompt()` and `prompt()`.
- **When to ask** (all must hold): not already standalone
  (`display-mode: standalone`), signed in, ≥3 visits on distinct days
  **and** a "moment" just happened (finished a game run, U4; created a post;
  joined a room). Never on first visit, never mid-game, never twice within 30
  days of a dismissal. Counters live in `localStorage` (try/catch'd).
- **UI:** a lazy `components/site/InstallNudge.tsx` — a `.glass-overlay`
  card at the bottom, one sentence of value ("Get notifications and
  full-screen games"), Install / Not now. On iOS Safari, the Install button
  opens a two-step "Share → Add to Home Screen" sheet instead.
- Record install via the `appinstalled` event to analytics so the trigger
  can be tuned.

**Perf/compile.** A ~300-byte listener in the shell; the card loads only when
all conditions pass.

---

## U9 — Ghost racing against your PB and your friends — **M**

**Anchor.** Trackmania and Mario Kart time trials, TETR.IO's ghost, Celeste
speedrun ghosts. The single best "one more try" mechanic in racing and
score-attack games.

**Gap.** The replay system is already there (`lib/game/replay.ts`,
`ReplayableGame`, `GameReplay` rows, deterministic and keyframe kinds), but
replays are only ever watched afterwards. Nothing plays one **alongside** a
live run. (`ghost` matches in the tree are all button variants.)

**Blueprint.**

- **Which games:** start with the deterministic/keyframe replay games where
  a second entity makes sense — Neon Driftway, Nightrail, Bums Rush, Slice It
  (as a "ghost combo meter" rather than a sprite). Add a
  `ghost?: true` capability to the `ReplayableGame` registration.
- **Fetching:** `GET /api/replays/ghost?game=…&vs=pb|friend:<id>|top` returns
  the replay payload (already capped at `REPLAY_SIZE_CAP`, 256 KB) with
  `Cache-Control: private, max-age=300`. Fetched **after** the first frame
  renders, on idle, so it never delays start.
- **Playback:** a game-side `GhostPlayer` that advances the stored input log
  through the same pure step function the verifier uses (deterministic
  games) or interpolates keyframes, inside the game's existing loop. It
  writes to a ref read by the renderer — no React state per frame. Render as
  the player's sprite/mesh at 35% opacity, no collisions.
- **UI:** a ghost selector on the pre-run screen (_None · My best · Friend… ·
  World #1_), and a live split delta ("−0.42") that uses existing HUD text.
  Ties naturally into U4: "You beat @friend's ghost" is a `friend-pass`
  moment.
- **Integrity:** ghosts are display-only; a run against a ghost submits like
  any other run.

**Perf/compile.** Per-game lazy module; one extra step-function call per
frame for deterministic games (they already run it server-side for
verification).

---

## U10 — Pop-out player with Document Picture-in-Picture — **M**

**Anchor.** YouTube's mini-player, Spotify Web's pop-out, Google Meet's
floating tile, Discord's pop-out call.

**Gap.** The music mini-player only lives inside the site shell
(`MiniPlayer.tsx`), so it disappears the moment you switch tabs. RMHTube's
`VideoPlayer.tsx` uses classic `requestPictureInPicture`, which shows bare
video only — no room chat, no queue, no reactions.

**Blueprint.**

- `components/shared/PopOut.tsx` (lazy): when
  `'documentPictureInPicture' in window`, call
  `documentPictureInPicture.requestWindow({ width: 360, height: 220 })`,
  copy the site's stylesheet `<link>`s and the current `data-theme` into the
  PiP document, then render children into it with `createPortal` — the same
  React tree, so stores, sockets and query cache are shared and there is no
  second app instance.
- **RMHMusic:** pop out the mini-player (artwork, play/pause, skip, seek).
- **RMHTube:** pop out video **plus** a compact chat strip and reaction bar.
  The `<video>`/iframe node is moved into the PiP document and moved back on
  `pagehide` of the PiP window.
- **Fallback:** Firefox/Safari keep today's behaviour (classic video PiP for
  RMHTube; the in-shell mini-player for music). Feature-detected, so no
  polyfill.

**Perf/compile.** Zero cost unless the button is pressed; no new bundle
entry.

---

## U11 — Swipe actions on mobile lists — **S**

**Anchor.** Swipe-to-reply in iMessage/WhatsApp/Telegram; swipe to archive
or mark read in Gmail and Apple Mail.

**Gap.** `hooks/useFluidDrag.ts` and `useFluidDragEnabled('(pointer: coarse)')`
already exist (used for sheets), but no list row uses them; DMs and
notifications are tap-and-menu only on phones.

**Blueprint.**

- `components/ui/swipe-row.tsx`: wraps a row; on coarse pointers only, uses
  `useFluidDrag` on the X axis with a threshold of 64 px, revealing one
  leading and one trailing action icon. Transform-only animation (no layout),
  `touch-action: pan-y` so vertical scroll is never blocked, haptic tick via
  `navigator.vibrate(8)` where supported.
- **DMs** (`components/messages/`): swipe right → reply-to that message.
- **Notifications:** swipe left → mark read; swipe right → snooze (U7).
- **Mobile baseline compliance:** every swipe action stays in the existing
  overflow menu (the plans' rule: no gesture-only affordances), and the row is
  inert under `useReducedMotion` other than the action firing.

**Perf/compile.** Reuses an existing hook; pointer listeners attach on
`pointerdown` only.

---

## U12 — Internal link previews — **S–M**

**Anchor.** Wikipedia page previews, GitHub's issue/PR hovercards, Notion and
Slack link cards.

**Gap.** `components/feed/ProfileHoverCard.tsx` does this for users only.
Links to games, apps, news, library entries, posts and builds — in posts,
blog articles, library text and DMs — are bare links.

**Blueprint.**

- **Server:** `GET /api/preview?path=/news/foo` (`defineHandler`,
  `auth: 'optional'`, `rateLimit: 'read'`) maps a same-origin path to
  `{ title, description, image, kind }` using the **same data the route's
  `head()`/`buildMeta` already computes** — factor that into a
  `previewFor(path)` server helper that dispatches on the route pattern for
  the ~8 kinds. Response `Cache-Control: public, max-age=600` for public
  objects so Cloudflare absorbs repeats.
- **Client:** generalise `ProfileHoverCard` into
  `components/ui/link-preview.tsx`; a single delegated `pointerover` listener
  on content containers (not one per link) opens it after 400 ms hover, or on
  long-press on touch. Data via React Query keyed on the path, so repeat
  hovers are instant, and `useIntentPreload` can piggy-back to warm the
  route chunk for the click that usually follows.
- Respect privacy: private posts return 404 to non-viewers, so the card
  degrades to plain link.

**Perf/compile.** One delegated listener; the card component loads on first
hover.

---

## U13 — An opt-in UI sound palette — **S**

**Anchor.** Apple's subtle system sounds, Discord's join/leave chimes,
Duolingo's correct/incorrect tones — sound is a large share of why those
products feel alive.

**Gap.** There is no UI-level sound anywhere (`uiSound`/`clickSound` don't
exist); every game ships its own SFX, the site shell is silent.

**Blueprint.**

- `lib/audio/ui-sounds.ts`: five sounds **synthesised with Web Audio**
  (oscillator + envelope, ~10 lines each) — _tap, success, error, message,
  level-up_. No audio files, so zero bytes of assets and nothing to cache.
  Created lazily on first play; routed through U2's `ui` channel.
- **Off by default**, enabled in the U2 Sound settings. Never plays while the
  tab is hidden, during quiet hours, or within 80 ms of the previous UI sound.
- Hook points (each one line): sonner success/error toasts, message received
  in an open conversation, achievement/level-up celebrations
  (`useCelebration`), and the like button.

**Perf/compile.** A ~1.5 KB module, imported only when the setting is on.

---

## U14 — Photo mode for the 3D games — **M**

**Anchor.** Forza, God of War, Fortnite and Spider-Man; photo-mode shots are
a large share of those games' social posts.

**Gap.** None of the 3D games (Neon Driftway, Nightrail, Forest Explorer,
Altair, Kowloon Knockout, Dream Rift, …) has one, and the feed has no easy
way to post an in-game image.

**Blueprint.**

- `components/games/PhotoMode.tsx` (lazy) + a per-game adapter:
  ```ts
  interface PhotoModeAdapter {
    pause(): void; resume(): void;
    camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer;
    hideHud(hidden: boolean): void;
  }
  ```
- **Controls:** orbit/dolly/roll on the existing camera (pointer + gamepad
  sticks), FOV slider, depth-of-field toggle only on games that already have
  a post-processing pass, and 4 CSS-filter looks applied at capture time
  (cheap; no new shader passes). Clamp the camera to a radius around the
  player so it can't fly through level geometry to reveal unfinished areas.
- **Capture:** render one frame at 2× the current resolution, `toBlob` as
  WebP, then hand the blob to the existing compose flow (the share-target
  pipeline already accepts media) with the game auto-tagged.
- **Entry:** `P` in the pause menu (and a button), registered via the
  shortcut registry. Single-player only.

**Perf/compile.** Lazy per game; zero cost until opened, and the game is
paused while it's open.

---

## U15 — An opt-in profile guestbook — **S–M**

**Anchor.** MySpace walls, Neocities guestbooks, Steam profile comments —
the most "personal website" feature there is, and it fits a site that already
leans into profile cosmetics.

**Gap.** Profiles (`components/profile/`) have links, cosmetics and posts,
but no way for visitors to leave a short note that lives on the profile.

**Blueprint.**

- **Model:** `GuestbookEntry { id, ownerId, authorId, body VarChar(280), hiddenAt?, createdAt }`
  with `@@index([ownerId, createdAt])`.
- **Rules:** off by default; owner chooses _everyone · people I follow ·
  off_. Blocks and mutes from `UserMute` apply. Rate limit `write` plus one
  entry per author per owner per day. Content runs through the same
  moderation/report path as comments; the owner can hide any entry (soft,
  restorable via the existing trash pattern).
- **UI:** a `.glass-pane` "Guestbook" panel at the bottom of the profile,
  10 newest entries server-rendered, "Load more" via the existing
  `pagination` primitive. Owner gets a notification (batched by the digest
  system already specced).
- Cosmetic tie-in (optional): guestbook frame styles as shop items.

**Perf/compile.** One indexed table; the panel is below the fold and can use
`useNearViewport` to defer its fetch.

---

## §2 — Deliberately not proposed

- **Cursor-following effects, cursor trails, live cursors** — retired
  2026-08-01 (CLAUDE.md design rules).
- **Anything already specced in the plans directory** — undo, resume rail,
  drafts, keyboard registry, notification digests, gamepad/remap, clips,
  focus mode, reader mode, device handoff, playable feed previews. Build
  those from their own docs.
- **Inline text reply inside push notifications** — non-standard across
  browsers; U6's deep-link reply is the portable version.
- **Animated/video favicons** — battery cost for little gain; U5's static dot
  is enough.

## §3 — Verification per feature

Each blueprint ships with: the gate test it names (if any), `pnpm
check:consistency` on the staged change, a reduced-motion pass, and a manual
check in the default, `light` and `high-contrast` themes at 375 px and
desktop. New strings go through `t()` with `pnpm i18n:extract`; no new
namespace is needed except possibly `reminders` and `guestbook`, which must
be added to `NAMESPACES` in `lib/i18n/config.ts`.
