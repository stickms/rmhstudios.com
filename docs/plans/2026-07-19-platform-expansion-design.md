# Platform Expansion Design — Twelve Features

**Document type:** Product + engineering design (dated snapshot)
**Prepared:** 2026-07-19
**Branch:** `claude/website-ideas-j5yvjy`
**Companion docs:**
[`2026-07-15-cross-system-feature-ideas.md`](./2026-07-15-cross-system-feature-ideas.md)
(tournaments hub, wagers, prediction markets, creator coin→value bridge, AI
residents, live-ops seasons, spectating), [`../coins.md`](../coins.md) (economy
foundation), [`../website-improvement-plan.md`](../website-improvement-plan.md)
(cross-cutting audit).

> **How to read this.** Twelve feature designs, each grounded in what the code
> actually ships today (§1) and specified as a **delta** over it — not a
> greenfield fantasy. Every section follows the same shape as the 2026-07-15
> doc: _Concept → Why it fits → What exists / the gap → Data model → Server &
> API → UI surfaces → Economy integration → Risks → Effort._ Prioritization
> and cross-cutting constraints are at the end. Where a feature overlaps a
> section of the 2026-07-15 doc, this doc **defers** to it and designs only
> the complementary part; overlaps are called out explicitly.
>
> **Scope note:** RMHShorts (vertical short-video feed) was considered and
> **excluded** — the storage/transcode footprint is out of budget for the
> current VPS + R2 posture.

---

## 0. Thesis

The platform's growth constraint is no longer _missing systems_ — it is
_missing connective tissue_. The codebase already ships a coin ledger with
tips/gifts/wagers (`CoinTxnType`), a battle pass (`lib/battlepass/season.ts`),
a quest engine (`lib/quests/`), creator earnings with real-money redemption
(`lib/creator/earnings.server.ts`, `RedemptionRequest`), gift memberships
(`lib/gifting/gift.server.ts`), a durable job queue (`lib/jobs/boss.server.ts`,
pg-boss), Web Push (`lib/push/`), Resend email (via
`lib/rmhladder/alerts/dispatch.server.ts`), OG-image renderers (`lib/og/`),
presence (`lib/presence.server.ts`), and a Socket.io hub with 18 per-game
handlers (`server/socket-server/handlers/`).

Each feature below composes at least three of those systems. The rule of
thumb throughout: **new tables only where a new noun exists; new
infrastructure only in the last wave; every coin flow lands in the existing
`CoinTransaction` ledger so `lib/creator/earnings.server.ts`'s derived
"earned" view and the admin audit trail stay truthful.**

---

## 1. Ground truth — what already exists (verified 2026-07-19)

Read this before any section; it is why several "ideas" collapse into small
deltas.

| System                                     | Where                                                                                                                                       | State                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Coin ledger                                | `CoinTransaction` + `CoinTxnType` (`TIP GIFT PURCHASE REWARD ADMIN MEMBERSHIP WAGER`)                                                       | Shipped. Tips carry `entityType`/`entityId` (e.g. `"rmhark"`, `"profile"`).                                       |
| Creator earnings + payout                  | `lib/creator/earnings.server.ts`, `RedemptionRequest`, `MIN_PAYOUT_COINS`                                                                   | Shipped. "Earned" is a **derived** ledger view (tips + coin memberships + storefront/paywalled-post/build sales). |
| Creator memberships                        | `CreatorMembership` (single `priceCoins` per creator)                                                                                       | Shipped — **one tier only**.                                                                                      |
| Paywalled posts / paid builds / storefront | `PostUnlock`, `BuildUnlock`, `StorefrontProduct`/`StorefrontPurchase`                                                                       | Shipped.                                                                                                          |
| Gift memberships (coins)                   | `lib/gifting/gift.server.ts`, `GiftMembership` (600/mo starter, 1800/mo pro)                                                                | Shipped. Folded into `getUserTier`.                                                                               |
| Quests                                     | `lib/quests/catalog.ts` (6 daily + 3 weekly, code-driven), `engine.server.ts`, progression via pg-boss `engagement.progression`             | Shipped — **only one generic `game_play` type; no per-game targeting**.                                           |
| Battle pass                                | `lib/battlepass/season.ts` (S1, 20 tiers, premium via coins), `UserSeasonProgress`                                                          | Shipped.                                                                                                          |
| XP / levels                                | `lib/xp/engine.server.ts` (lifetime + season XP, level-up notifications, milestone achievements)                                            | Shipped.                                                                                                          |
| Achievements                               | `lib/achievements/`, `UserAchievement`                                                                                                      | Shipped.                                                                                                          |
| Streaks / check-in                         | `DailyStreak`, `lib/streak.server.ts`, `DailyWheelSpin`                                                                                     | Shipped.                                                                                                          |
| Onboarding                                 | `lib/onboarding.server.ts` — server-verified checklist (post, 3 follows, check-in, theme) → 100 coins                                       | Shipped — **single-day checklist only**.                                                                          |
| OG renderers                               | `lib/og/post-image.server.tsx`, `post-story.server.tsx`, `profile-image.server.tsx`; Wrapped (`lib/wrapped/`), Recap, `/share`              | Shipped — **no generic stat/achievement card**.                                                                   |
| Realtime                                   | `server/socket-server/` (port 7001) with 18 game handlers, `lib/realtime-bus.server.ts`, feed SSE, presence heartbeat                       | Shipped — **no cross-game party, no platform "live" surface**.                                                    |
| Watch/listen together                      | `RmhTubeRoom*` (chat/queue/rooms), `RmhMusicRoom*`                                                                                          | Shipped — app-scoped, not community-scoped; no audio.                                                             |
| Jobs                                       | pg-boss (`lib/jobs/boss.server.ts`) with graceful inline fallback                                                                           | Shipped.                                                                                                          |
| Email                                      | Resend HTTP API, used only by RMHLadder alert dispatch (which already has digest scheduling: `isDigestDue`, quiet hours, per-user timezone) | Shipped — **ladder-only; no shared `lib/email` module, no platform digest**.                                      |
| Push                                       | `PushSubscription`, `lib/push/`, `usePushSubscription`                                                                                      | Shipped.                                                                                                          |
| AI plumbing                                | `lib/ai/text.server.ts`, `lib/persona-chat.server.ts`, `AiPersona*`, `lib/rmhark-ai/`, `ImageGenBudget`                                     | Shipped — **no site-wide assistant**.                                                                             |
| Moderation                                 | `ContentReport`, `UserStrike`, `UserBlock/Mute`, `lib/moderation/`, `AdminAuditLog`, `lib/admin-review.server.ts`                           | Shipped.                                                                                                          |
| Inventory / cosmetics                      | `UserInventory`, shop items (badges, frames, name colors), profile customization page                                                       | Shipped — **no peer-to-peer transfer**.                                                                           |
| Deterministic replay precedent             | `DoctrinePuzzleReplay`; deterministic plinko (`lib/plinko.ts`)                                                                              | Partial — per-feature, no shared replay system.                                                                   |

**Consequences for this doc:**

- "Coin gifting & gift memberships" from the original idea list is **mostly
  shipped**; §8 designs only the small remaining delta (P2P coin gifts +
  public gift moments).
- "Creator tips" are shipped; §2 designs the **Creator Studio** layer above
  them (multi-tier memberships, dashboard, supporter perks).
- "Arcade Pass" is not a new pass; §1 designs **per-game quest targeting and
  a hub** feeding the existing pass.

---

## 2. Feature 1 — Arcade Pass: cross-game daily challenges + hub

### Concept

One page — `/arcade` — that answers "what should I play _today_?" Every day,
three rotating **per-game challenges** ("Score 500+ in Laundry Sort", "Win a
Kowloon Knockout round", "Clear 3 Void Breaker waves") plus the existing
generic dailies. Completing any arcade challenge extends an **arcade streak**;
all rewards flow into the _existing_ battle pass season XP and coin ledger.
The catalog of ~20 games stops being 20 islands and becomes one retention
loop.

Complements (does not replace) the 2026-07-15 doc's §6a "Unified Live-Ops
Season": that section themes a season; this section supplies the _daily
verbs_ inside it.

### Why it fits

- Quest engine, period keys (`dailyKey`/`weeklyKey`), claim flow, pg-boss
  progression pipeline: **all shipped** (`lib/quests/`).
- Season XP sink already exists (`lib/xp/engine.server.ts` mirrors XP into
  `UserSeasonProgress`).
- Every game already reports _something_ — leaderboard writes
  (`lib/leaderboard.server.ts`), per-game player models
  (`LaundryPlayer`, `VoidBreakerPlayer`, …), socket handlers for multiplayer
  results.
- Streak UI/patterns exist (`DailyStreak`, `useStreak`).

### What exists / the gap

`QuestType` has a single generic `'game_play'`. The gap is (a) **quest
parameterization** — which game, which metric, what threshold; (b) a
**standardized game-result event** so quests don't need bespoke wiring per
game; (c) the **hub UI**; (d) the **arcade streak**.

### Data model (proposed)

No new quest storage — `UserQuest` already keys on `(userId, questId,
periodKey)` and arcade challenges are just quests with generated ids
(`a.2026-07-19.laundry-sort.score500`). Two additions:

```prisma
/// One row per user for the arcade streak (mirrors DailyStreak's shape).
model ArcadeStreak {
  userId    String   @id
  current   Int      @default(0)
  best      Int      @default(0)
  lastDay   String?  @db.VarChar(10) // "2026-07-19" (UTC day key)
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("arcade_streak")
}
```

Challenge _definitions_ stay code-driven like the quest catalog:

```ts
// lib/quests/arcade.ts
export interface ArcadeChallengeDef {
  game: GameId;                 // from lib/games.ts
  metric: 'score' | 'win' | 'plays' | 'clear';
  target: number;
  xp: number;
  coins: number;
}
// Deterministic rotation: seed = hash(dayKey) -> pick 3 games from the
// eligible pool, thresholds from a per-game difficulty table. No DB, no
// cron — pure function of the day key, same answer on every server.
export function challengesForDay(dayKey: string): ArcadeChallengeDef[] { … }
```

### Server & API

1. **Standardized result event.** New `lib/game/results.server.ts`:
   `reportGameResult(userId, { game, score?, won?, cleared? })`. Called from
   the places that already persist results (score-submit API routes and
   socket handlers at match end). It enqueues onto the existing
   `engagement.progression` pg-boss queue, which fans out to:
   `progressQuest('game_play')` (unchanged), arcade challenge matching
   (does today's rotation include this game + does the payload meet the
   threshold?), and streak update.
2. **Anti-forgery.** Results are only reported from server code that already
   validates gameplay (existing score routes with their existing
   plausibility checks; socket handlers for authoritative multiplayer).
   _No new client-trusted endpoint is added_ — this is the same trust level
   as today's leaderboards, no worse.
3. **API routes** (standard order: session → `rateLimit` → zod):
   - `GET /api/arcade` — today's challenges + per-user progress + streak.
   - `POST /api/arcade/claim` — claim a completed challenge (idempotent;
     mirrors quest claim).
4. **Streak semantics:** completing ≥1 arcade challenge marks the day;
   `current` increments if `lastDay` was yesterday, else resets to 1.
   Milestones (7/30/100) grant achievements via
   `lib/achievements/engine.server.ts` and a wheel-spin bonus.

### UI surfaces

- `/_site/arcade.tsx` — hub page (PageLayout, sidebar shell): today's three
  challenge cards with game art, progress bars, streak flame, countdown to
  UTC reset, "play now" deep links into each game, and the existing
  quest/pass widgets so the whole progression story lives in one place.
- A compact "Today's Arcade" card on `/` (feed right rail) and on each
  game's landing screen ("this game is featured today — 2× reason to play").
- Sidebar entry under the games group (`lib/sidebar-data.ts`).

### Economy integration

Rewards are quest-shaped: XP into season pass + coins as `REWARD`
transactions — both existing sinks-and-sources. Tuning starts conservative
(challenge ≈ 1.5× a generic daily) since three extra dailies otherwise
inflate coin supply; totals reviewed against the coin-supply dashboards from
`docs/coins.md`.

### Risks / open questions

- **Threshold calibration** per game is the real work — needs a first pass
  from leaderboard percentile data (aim: ~40–60% of players who _try_ can
  clear it).
- Single-player score integrity is only as good as today's plausibility
  checks; arcade raises the incentive to cheat slightly. Mitigation: arcade
  rewards are small; flag daily-challenge completions that come with
  top-0.1% scores for the existing admin review queue.
- Which games are "eligible"? Start with the ~10 that already have robust
  score/win reporting; expand as `reportGameResult` adoption spreads.

### Effort

**M (≈1.5–2 wk).** Zero new infra; one tiny table; most work is
`reportGameResult` call-site adoption and the hub page.

---

## 3. Feature 2 — Creator Studio: multi-tier memberships, dashboard, supporter perks

### Concept

A single `/studio` surface where a creator sees earnings (already computed
server-side), configures **up to three membership tiers** (today:
exactly one `priceCoins`), and grants perks that the platform enforces:
supporter badge next to the name, supporter-only posts (reusing `PostUnlock`
mechanics), early access to builds, and a supporters-only chat channel.
Supporters get a "Supporting" shelf on their profile.

Defers to 2026-07-15 §4 ("Creator Coin → Value Bridge") for redemption/
payout mechanics — that pipeline **already exists** (`RedemptionRequest`).
This section is purely the _product layer_ that makes more coins flow into
it.

### Why it fits

- Earnings math is done: `lib/creator/earnings.server.ts` already derives
  earned coins from tips + memberships + storefront/post/build sales.
- `CreatorMembership` exists with expiry + unique `(creatorId, supporterId)`.
- Perk enforcement points exist: `PostUnlock` (paywalled posts),
  `BuildUnlock`, `GroupChat` (supporters channel), badge rendering in
  user-display.

### What exists / the gap

Gap = (a) multiple tiers with per-tier perks; (b) a creator-facing dashboard
(earnings are currently computed for redemption, not visualized); (c)
perk _enforcement wiring_ (supporter-only visibility as a post audience,
not a per-post price); (d) supporter badge + discovery surfaces.

### Data model (proposed)

```prisma
/// A creator-defined membership tier (max 3 per creator, enforced in code).
model CreatorTier {
  id         String   @id @default(cuid())
  creatorId  String
  name       String   @db.VarChar(40)
  priceCoins Int      // per 30 days
  perks      Json     @default("[]") // ordered perk keys: 'badge' | 'posts' | 'chat' | 'early_builds'
  sortOrder  Int      @default(0)
  active     Boolean  @default(true)
  createdAt  DateTime @default(now())

  creator User @relation(fields: [creatorId], references: [id], onDelete: Cascade)

  @@index([creatorId, active])
  @@map("creator_tier")
}
```

`CreatorMembership` gains a nullable `tierId` (migration backfills existing
rows to a creator's auto-created "Supporter" tier at the current
`priceCoins`; the legacy single-price path keeps working until the studio UI
ships). `RMHark` gains an `audience` enum value `supporters` alongside the
existing visibility values (post-visibility filtering already runs through
`lib/feed`; one more predicate).

### Server & API

- `GET/PUT /api/studio/tiers` — CRUD tiers (zod: 1–3 tiers, price bounds
  e.g. 100–10 000 coins/30d, perk keys from a fixed enum).
- `GET /api/studio/earnings` — the existing derived view, exposed with a
  monthly breakdown + per-source split (tips / memberships / sales) for the
  dashboard chart. Read-only; no new ledger semantics.
- `POST /api/creators/:id/join` — subscribe at a tier (existing membership
  purchase flow, now tier-aware): single Prisma transaction — balance check,
  `MEMBERSHIP` ledger row (sender=supporter, recipient=creator), upsert
  membership with `tierId` + `expiresAt = now+30d`.
- Perk enforcement:
  - **badge** — `lib/user-display.server.ts` includes `supporterOf` when
    rendering a comment/post author _in the creator's own threads_ (badge
    shows in context, not globally — keeps it meaningful and cheap to
    resolve).
  - **posts** — feed queries add
    `audience = 'supporters' ⇒ viewer has active membership` (one indexed
    lookup, cacheable per viewer×creator for the session).
  - **chat** — auto-managed `GroupChat` per creator with membership-sync on
    join/expiry (pg-boss daily sweep expires members out).
  - **early_builds** — `UserBuild` visibility window: supporters see it at
    publish, public sees it after `earlyAccessUntil`.

### UI surfaces

- `/_site/studio/` route group: **Overview** (earnings chart, supporter
  count, recent tips — sonner-toast a "thank your supporters" prompt),
  **Tiers** editor, **Supporters** list, link out to the existing redemption
  flow.
- Profile: "Support" button opens tier picker sheet; a "Supporting" shelf on
  the supporter's profile (opt-out in settings).
- Post composer: audience picker gains "Supporters only" (already has a
  visibility picker — one more option).

### Economy integration

No new transaction types. More `MEMBERSHIP`/`TIP` volume in → more
redemption volume out; both ends already exist and the earnings view already
counts exactly these sources, so **Creator Studio requires zero changes to
`earnings.server.ts`** (tier revenue is `MEMBERSHIP` rows like today).

### Risks / open questions

- Tier _downgrades/upgrades_ mid-cycle: keep v1 dumb — new tier applies at
  next renewal; no proration.
- Supporter-audience posts leak via embeds/OG images: `embed.post.$id` and
  `lib/og/post-image` must respect the audience check (add to the existing
  visibility guard — same code path as private posts today).
- Is 3 tiers the right cap? Start at 3; it's a code constant.

### Effort

**M–L (≈2–3 wk).** Mostly product surface; the risky part is feed-query
audience filtering (touch `lib/feed` carefully, add tests).

---

## 4. Feature 3 — Live Spaces: community live rooms (text-first, audio later)

### Concept

A **Space** is a scheduled or spontaneous live room attached to a community
(or a creator profile): a host, optional co-hosts ("stage"), and an
audience with live text chat, reactions, and pinned content (a post, a
YouTube embed, an RMHMusic queue). Phase 1 is **text + presence + programmed
content** — deliberately not audio — because that alone creates the "the
site is alive right now" surface. Phase 2 adds voice via a self-hosted SFU.

A "Live now" rail on the feed and community pages surfaces active Spaces —
this becomes the platform's single _liveness_ indicator, also advertising
active RMHTube/RMHMusic rooms and (per 2026-07-15 §6b) spectatable matches.

### Why it fits

- Socket.io hub + room patterns + chat message models are proven twice over
  (`RmhTubeRoom*`, `RmhMusicRoom*` — chat, membership, queues).
- Presence heartbeat exists (`lib/presence.server.ts`,
  `usePresenceHeartbeat`).
- Communities exist and need programming (`Community*` models,
  `CommunityAnnouncement`).
- Scheduling + reminders ride Feature 5 (RMHEvents) and pg-boss + push.

### What exists / the gap

Watch/listen rooms are app-scoped silos with their own models. The gap is a
**generic, community-attachable live room**, a **stage/audience role
model**, and the **"Live now" discovery rail**. (Audio is a phase-2 gap
gated on infra appetite.)

### Data model (proposed)

```prisma
enum SpaceStatus {
  SCHEDULED
  LIVE
  ENDED
}

model Space {
  id          String      @id @default(cuid())
  hostId      String
  communityId String?     // null = profile-hosted
  title       String      @db.VarChar(120)
  status      SpaceStatus @default(SCHEDULED)
  scheduledAt DateTime?
  startedAt   DateTime?
  endedAt     DateTime?
  pinned      Json?       // { kind: 'post' | 'url' | 'music_room' | 'tube_room', id/url }
  recordChat  Boolean     @default(true) // transcript visible after end
  createdAt   DateTime    @default(now())

  host      User       @relation(fields: [hostId], references: [id], onDelete: Cascade)
  community Community? @relation(fields: [communityId], references: [id], onDelete: SetNull)

  @@index([status, startedAt(sort: Desc)])
  @@index([communityId, status])
  @@map("space")
}

model SpaceMessage {
  id        String   @id @default(cuid())
  spaceId   String
  userId    String
  body      String   @db.VarChar(500)
  createdAt DateTime @default(now())

  space Space @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([spaceId, createdAt])
  @@map("space_message")
}
```

Live participant/role state (audience count, stage membership, hand-raises)
is **ephemeral in the socket handler** — same choice the game handlers make;
a socket-server restart ends the live session gracefully (status flips to
`ENDED` on reconnect-timeout sweep), which is acceptable and documented.

### Server & API

- New `server/socket-server/handlers/spaces.ts`: join/leave, chat
  (rate-limited via the hub's existing `rate-limit.ts`), reactions
  (ephemeral burst events), host controls (invite to stage, remove/mute
  participant, pin content, end space). Auth: the hub already validates
  sessions.
- API routes: `POST /api/spaces` (create/schedule — host must be community
  mod for community spaces), `POST /api/spaces/:id/start|end`,
  `GET /api/spaces/live` (the rail), `GET /api/spaces/:id` (SSR + post-end
  transcript page if `recordChat`).
- Going-live fanout: notification to community members + space followers via
  existing `createNotification` + Web Push (respecting
  `NotificationPreference`), enqueued on pg-boss so the start request stays
  fast.
- **Moderation:** host controls above; `ContentReport` gains
  `entityType: 'space_message'`; community mods inherit mod powers in
  community spaces; blocked users (existing `UserBlock`) can't join a
  profile-hosted Space of someone who blocked them.

### Phase 2 — audio (explicitly gated)

Self-hosted **LiveKit** SFU as one more docker-compose service behind
Apache (WebRTC over UDP + TCP-fallback; needs ports opened — a deploy/infra
decision). The Space handler mints short-lived LiveKit tokens for stage
members only; audience receives-only. Live audio is _unmoderatable in
real time_ at current team size, so gate hosting audio Spaces to
trusted tiers (account level N+ or membership) at launch, keep
report-and-strike (`UserStrike`) as the backstop, and don't record audio.
**Do not start Phase 2 until Phase 1 proves demand.**

### UI surfaces

- `/_site/spaces/$id.tsx` — the room: pinned content on top, chat, audience
  strip with presence avatars, host toolbar. Reduced-motion honored for
  reaction bursts.
- "Live now" rail component on `/` and community pages (also lists live
  RMHTube/RMHMusic rooms via their existing room queries — unified
  liveness surface).
- Schedule card auto-posts into the community feed (reuses
  `CommunityAnnouncement`).

### Economy integration

Light-touch v1: coin "cheers" in Space chat = `TIP` transactions with
`entityType: 'space'` — automatically counted as creator earnings by the
existing derived view (it sums tips). No new sink needed.

### Risks / open questions

- Liveness is a chicken-and-egg feature: mitigate by programming it —
  weekly official RMH Space (devlog/AMA), tournament pre-shows (2026-07-15
  §1), music listen-alongs.
- Chat scale: one Space with 500 viewers is fine on Socket.io; 5 000 is
  not (single hub process). Acceptable at current scale; noted as a future
  fanout-tier item (the scalability audit already tracks hub scaling).
- Transcript privacy: `recordChat` is host-set and shown in-room before
  joining.

### Effort

**M (≈2 wk)** for Phase 1. Phase 2 audio: **L + infra decision** — separate
go/no-go.

---

## 5. Feature 4 — Party system: bring your friends into any game

### Concept

A platform-level **party**: up to 8 users, formed from the feed/profile/DMs,
with a persistent party bar at the bottom of the site shell. The leader
picks a multiplayer game; everyone gets a "party is joining X" prompt and
lands in the _same_ lobby/room — no codes pasted into Discord. Games adopt
this incrementally through one tiny contract.

### Why it fits

- All multiplayer already routes through one hub
  (`server/socket-server/handlers/` — 18 handlers) with per-game
  lobby/room concepts (`SSLobby`, RMHBox rooms, hold'em tables, Kowloon
  lobbies…).
- Social graph + invites exist: `Follow`, DMs, `GroupChat`,
  `createNotification`, presence.
- Deep links exist (`deeplink.$page.ts`).

### What exists / the gap

Every game invented its own invite loop (room codes). The gap is the
**cross-game party object**, the **invite/accept flow**, and a **join-ticket
handoff contract** each game handler can implement in a few lines.

### Data model

**None (deliberately).** Parties are ephemeral: they live in the socket
hub's memory keyed by party id, mirrored into Redis (`lib/redis.server.ts`)
with a TTL so the web tier can render invite state. A hub restart dissolves
parties — acceptable, same blast radius as in-progress matches today.
Invites are regular `Notification` rows + a realtime event; no schema
changes.

### Server & API

- `server/socket-server/handlers/party.ts`:
  - `party:create`, `party:invite` (rate-limited; only to followers/mutuals
    or DM contacts to prevent invite spam; respects `UserBlock/Mute`),
    `party:accept`, `party:leave`, `party:kick` (leader), `party:transfer`.
  - `party:queue { game }` (leader): validates the game supports parties and
    party size ≤ game max, creates the game-side room via that game's
    handler, then emits `party:ticket { game, roomRef, token }` to every
    member. `token` is a short-lived HMAC (party id + user id + room ref,
    60 s expiry) minted with the hub's existing internal secret.
- **Per-game contract** (`server/socket-server/party-contract.ts`):
  ```ts
  interface PartyJoinable {
    maxPartySize: number;
    createRoomForParty(members: PartyMember[]): Promise<RoomRef>;
    seatWithTicket(socket, ticket): Promise<void>; // validate HMAC, seat player
  }
  ```
  Roll out to the four best-fit games first (RMHBox, Synapse Storm, Hold'em,
  Kowloon Knockout), then the rest opportunistically.
- Client: `party:ticket` triggers a sonner toast + auto-navigation to the
  game route with the ticket in router state (never in the URL — tickets
  are single-use bearer secrets).

### UI surfaces

- **Party bar**: docked pill in the site shell (above the mobile dock)
  showing member avatars + presence, leader crown, "choose game" button
  (opens a sheet listing party-enabled games with size fit indicated).
- "Invite to party" on profiles, DM headers, and member lists.
- In-game: party members visually grouped where the game shows a lobby
  roster.

### Economy integration

None directly — this is a multiplier for everything else (wager matches and
tournaments from the 2026-07-15 doc get dramatically easier to start with a
party attached). A `w.party` weekly quest ("play 3 party games") is a
one-line catalog addition.

### Risks / open questions

- Handoff races (member closes tab between ticket and seat): tickets expire
  in 60 s and seats release on disconnect — the party stays intact, the
  member can rejoin from the party bar ("rejoin match" if the room is
  still open).
- Cross-process: web tier renders party state from Redis; the hub is the
  single writer. Blue/green flips (web) don't touch the hub, so parties
  survive web deploys.
- Full-screen game routes don't render the site shell — the party bar must
  also mount inside game shells (small shared component, ~one import per
  game page).

### Effort

**M (≈2 wk)** for the core + 4 games; each additional game is **S** (hours,
not days).

---

## 6. Feature 5 — RMHEvents: community events, RSVP, reminders

### Concept

First-class events: a community mod (or any user, profile-scoped) schedules
an event — a tournament, a Space, a watch party, a game night, or an
external/IRL thing — members RSVP, get reminders (push + digest), and the
event auto-links to its venue (a Space, a tournament id, a game room, or a
URL). A `/events` page and per-community event tabs give the platform a
calendar spine that Spaces, tournaments, and parties all hang off.

### Why it fits

- Venues already exist (Tournaments, Spaces §4, RMHTube/Music rooms, games).
- Reminder machinery exists: pg-boss (delayed jobs are native to it), Web
  Push, notifications, and — once Feature 9 ships — digests.
- Communities need programming; `CommunityAnnouncement` shows the demand but
  has no time/RSVP semantics.
- Discord bot exists (`go-services/internal/discordbot`) for cross-posting.

### Data model (proposed)

```prisma
enum EventVenueKind {
  SPACE
  TOURNAMENT
  GAME
  URL
  IRL
}

model CommunityEvent {
  id          String         @id @default(cuid())
  hostId      String
  communityId String?        // null = profile-hosted
  title       String         @db.VarChar(120)
  description String         @db.VarChar(2000)
  startsAt    DateTime
  endsAt      DateTime?
  venueKind   EventVenueKind
  venueRef    String?        @db.VarChar(191) // spaceId / tournamentId / game id / URL (SSRF-guarded)
  capacity    Int?
  canceledAt  DateTime?
  createdAt   DateTime       @default(now())

  host      User       @relation(fields: [hostId], references: [id], onDelete: Cascade)
  community Community? @relation(fields: [communityId], references: [id], onDelete: Cascade)
  rsvps     EventRsvp[]

  @@index([communityId, startsAt])
  @@index([startsAt])
  @@map("community_event")
}

model EventRsvp {
  id        String   @id @default(cuid())
  eventId   String
  userId    String
  status    String   @db.VarChar(8) // 'going' | 'maybe'
  createdAt DateTime @default(now())

  event CommunityEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user  User           @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([eventId, userId])
  @@index([userId, createdAt])
  @@map("event_rsvp")
}
```

### Server & API

- CRUD: `POST/PATCH /api/events` (community events require mod role — same
  check as announcements; URL venues run through
  `lib/ssrf-guard.server` + `lib/url-safety`), `POST /api/events/:id/rsvp`.
- Listings: `GET /api/events?scope=community|mine|upcoming`.
- **Reminders:** on RSVP, enqueue two pg-boss delayed jobs (T-24 h, T-15 m)
  keyed `event-reminder:{eventId}:{userId}:{offset}` (pg-boss dedupes by
  key; cancel-on-unRSVP by key too). Job sends notification + push. This is
  exactly the delayed-job shape pg-boss is for — no cron scanning.
- **ICS:** `GET /api/events/:id/ics` (single VEVENT) and
  `/api/events/feed.ics?token=…` (per-user tokenized calendar feed) so
  events land in real calendars.
- Venue lifecycle sugar: an event with `venueKind: SPACE` and no `venueRef`
  auto-creates the scheduled Space; "starts in 15m" reminder deep-links
  into the venue.
- Discord: optional per-community setting to cross-post event creation to a
  linked channel via the existing bot (community settings already exist).

### UI surfaces

- `/_site/events.tsx` — upcoming grid (filter: my communities / RSVP'd /
  all-public) + past-events archive.
- Community page **Events** tab; event detail sheet with RSVP button,
  attendee avatars, add-to-calendar, and the venue launch button that goes
  live at start time.
- Event cards embeddable in feed posts (compose attachment, like polls).

### Economy integration

Optional per-event **coin door charge** (host sets 0–N coins; `PURCHASE`
with `entityType: 'event'`) is deferred to v2 — v1 events are free, and
paid tournaments already handle entry fees via `WAGER` escrow (2026-07-15
§1). Attending an event can progress a weekly quest (`w.event`).

### Risks / open questions

- Timezone display: store UTC, render with the user's locale/timezone
  (ladder already has `formatInUserTimezone` — lift it into `lib/shared`).
- Capacity + waitlist: v1 hard-caps RSVP at capacity, no waitlist.
- IRL-event safety (doxxing risk): IRL venue free-text is only visible to
  RSVP'd members of the community, never in public listings.

### Effort

**M (≈1.5–2 wk).** Straightforward CRUD + the pg-boss reminder pattern; ICS
is a day.

---

## 7. Feature 6 — Replays as content

### Concept

Finish a great run → **save the replay** → it becomes a shareable, embeddable
artifact: watchable on-site at `/replays/:id`, attachable to a feed post,
embeddable off-site (like `embed.post.$id`), and linked from leaderboard
rows ("watch this score"). Replays turn gameplay into feed content and make
leaderboards trustworthy-by-inspection.

Overlap note: 2026-07-15 §6b owns **live spectating**; this section owns
**recorded replays**. They share the "watch someone play" render path per
game, so build replays first — spectating later reuses each game's
playback view with a live event stream instead of a stored log.

### Why it fits

- Precedents in-tree: `DoctrinePuzzleReplay` (stored replays) and
  deterministic plinko (`lib/plinko.ts`) prove both storage and
  determinism patterns.
- Feed attachments, `embed.post.$id`, and OG images exist for distribution.
- Leaderboards exist to hang "watch" links off.

### What exists / the gap

No shared replay model, no capture contract, no playback surface. Games
divide into **deterministic** (replay = seed + input log: Slice It!,
Lights Out, Void Breaker, plinko-likes, Altair's engine) and
**non-deterministic** (replay = periodic state snapshots + events:
server-authoritative multiplayer). V1 targets 3–4 deterministic
single-player games where a replay is tiny (KB-scale JSON) — **no video
anywhere**, so the RMHShorts storage objection does not apply.

### Data model (proposed)

```prisma
model GameReplay {
  id         String   @id @default(cuid())
  userId     String
  game       String   @db.VarChar(32)
  version    String   @db.VarChar(16) // game logic version for playback compat
  score      Int?
  durationMs Int
  data       Json     // { seed, inputs: [...] } | { snapshots: [...] } — zod-validated per game
  sizeBytes  Int      // enforced cap (e.g. 256 KB)
  visibility String   @default("public") @db.VarChar(8) // 'public' | 'unlisted'
  createdAt  DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([game, score(sort: Desc)])
  @@index([userId, createdAt(sort: Desc)])
  @@map("game_replay")
}
```

### Server & API

- **Capture contract** (`lib/game/replay.ts`):
  ```ts
  interface ReplayableGame {
    game: GameId;
    version: string;
    schema: ZodType<ReplayData>; // validates uploaded logs
    verify?(data: ReplayData): { score: number } | null; // re-simulate server-side
  }
  ```
  For deterministic games, `verify` re-runs the sim from `(seed, inputs)`
  and **derives the score server-side** — a saved replay _becomes the
  anti-cheat_: submitting a replay is the strongest score proof the
  platform has. Games with `verify` get a "verified ✓" marker on
  leaderboard rows backed by a replay.
- Routes: `POST /api/replays` (session → rate limit → per-game zod →
  size cap → optional `verify`), `GET /api/replays/:id`,
  `DELETE /api/replays/:id` (owner).
- Retention: keep every replay referenced by a post, a leaderboard top-100
  row, or starred by its owner; a pg-boss weekly sweep prunes unreferenced
  replays older than 90 days (logged, not silent).
- Playback = the game's own renderer in a read-only mode driven by the log
  (each adopting game ships a `<GameReplayPlayer data={…}>`), with a shared
  scrubber/speed chrome component around it.

### UI surfaces

- `/replays/$id` (full-screen, like game routes) + `embed.replay.$id` for
  off-site embeds; OG image via a new `lib/og` variant (Feature 12) showing
  game art + score.
- Post-game screen: "Save replay" / "Share to feed" (composer pre-filled
  with the replay attachment).
- Leaderboard rows: ▶ icon when a verified replay backs the entry.

### Economy integration

None required. Optional later: featured "replay of the week" chosen by
admins earns the author coins (`REWARD`).

### Risks / open questions

- **Version drift** is the hard problem: a balance patch breaks old
  replays. `version` gates playback ("recorded on an older version" fallback
  screen); deterministic sims must bump `version` on any logic change —
  add this to the per-game CLAUDE.md conventions of adopting games.
- Re-simulation cost on submit: cap sim time (e.g. 2 s budget) and queue
  long verifies through pg-boss instead of blocking the request.
- Don't promise replays for the socket-authoritative games in v1; snapshot
  replays are a v2 per-game decision.

### Effort

**M (≈2 wk)** for the framework + 2 launch games; **S** per additional
deterministic game.

---

## 8. Feature 7 — Player Marketplace: peer-to-peer cosmetic trading

### Concept

A `/market` where users list **tradable** inventory items (cosmetics from
the shop/battle pass/events) for coins. Fixed-price listings only — no
auctions, no bidding — with a 10% coin fee burned as a sink. Scarce event
cosmetics get a real secondary market; coins get their strongest sink yet;
the roadmap's "RMH Outpost — verifiable ownership" gets its economy leg.

### Why it fits

- `UserInventory` (ownership), `StorefrontProduct/Purchase` +
  shop (primary market), `CoinTransaction` ledger, and the escrow pattern
  from `WAGER`/`CoinStake` all exist.
- Profile customization (equipped cosmetics) shipped recently — items are
  visible, so scarcity is meaningful.
- Admin surface: `AdminAuditLog`, strikes, and the review queue cover
  dispute handling.

### What exists / the gap

No transfer of inventory between users, no listing object, no
tradability metadata on items.

### Data model (proposed)

Item catalog is code-driven (shop items); add per-item `tradable: boolean`
to the catalog defs (default **false**; explicitly whitelist — achievements-
linked, promo, and membership items are never tradable). Then:

```prisma
enum ListingStatus {
  ACTIVE
  SOLD
  CANCELED
}

model MarketListing {
  id          String        @id @default(cuid())
  sellerId    String
  inventoryId String        @unique // the exact UserInventory row held in escrow
  itemId      String        @db.VarChar(64)
  priceCoins  Int
  status      ListingStatus @default(ACTIVE)
  buyerId     String?
  createdAt   DateTime      @default(now())
  closedAt    DateTime?

  seller User  @relation("MarketSeller", fields: [sellerId], references: [id], onDelete: Cascade)
  buyer  User? @relation("MarketBuyer", fields: [buyerId], references: [id], onDelete: SetNull)

  @@index([status, itemId, priceCoins])
  @@index([sellerId, status])
  @@map("market_listing")
}
```

`CoinTxnType` gains one value: `MARKET` — sale proceeds must be
distinguishable in the ledger because `lib/creator/earnings.server.ts`
derives "earned" coins from transaction types, and **secondary-market
proceeds must NOT count as creator earnings** (they'd otherwise open a
coins→cash laundering path through redemption; see Risks).

### Server & API

- `POST /api/market/listings` — session → rate limit → zod → transaction:
  verify the inventory row is owned, tradable, and **not equipped**; mark
  it escrowed (listing's `@unique inventoryId` is the lock); price bounds
  (e.g. 10–100 000; and ≥ 25% of primary shop price if the item is still
  sold there, so the primary market isn't undercut to nothing).
- `POST /api/market/listings/:id/buy` — single Prisma transaction:
  re-check `ACTIVE` (row-lock via `status` update-where-active), balance
  check, three ledger rows — buyer `PURCHASE` debit (`entityType:
'market'`), seller `MARKET` credit of 90%, 10% fee to the system sink
  (the pattern `docs/coins.md` sinks already use) — and re-parent the
  `UserInventory` row to the buyer. Self-purchase rejected.
- `DELETE …/:id` — cancel, release escrow.
- `GET /api/market?item=…&sort=price` — browse; price history per item
  (aggregate of `SOLD` listings) for the detail sheet.
- **Fraud controls:** minimum account age + level to sell (constants);
  per-user active-listing cap; per-day purchase cap; every trade in
  `AdminAuditLog`-queryable form via the ledger; anomaly flag (price ≥ 10×
  30-day median for the item) queues admin review before funds release
  (held listing state, auto-release after review or 24 h).

### UI surfaces

- `/_site/market.tsx` — browse grid with item art (reuse shop item
  renderers), filters, price history sparkline (dataviz-consistent).
- "Sell" action in the inventory/customization page for tradable items;
  "listed" badge on escrowed items.
- Item detail: current listings ladder + last-10-sales history.

### Economy integration

The 10% burn is the headline: the economy currently has strong faucets
(quests, pass, wheel) and this is the first _demand-driven_ sink that scales
with engagement. Watch supply metrics for a month post-launch before tuning
the fee. `MARKET` proceeds are spendable but **excluded from redemption**
(enforced by type in the earnings derivation — one guard clause + test).

### Risks / open questions

- **RMT / laundering:** the `MARKET`-excluded-from-earnings rule closes the
  redemption path; off-platform RMT remains a ToS-enforcement matter
  (trade telemetry makes ring detection feasible later).
- Item duplication bugs are catastrophic for trust: the `@unique
inventoryId` escrow lock + single-transaction transfer is the whole
  defense — this endpoint gets tests before launch regardless of the
  no-tests-by-default stance (same bar as Stripe code).
- Should battle-pass premium exclusives be tradable? Launch **no**; revisit
  per-season (tradability is per-item metadata, so seasons can differ).

### Effort

**L (≈3 wk)** including the admin review hooks and tests. Highest-risk
feature in this doc; ship after the economy dashboards exist.

---

## 9. Feature 8 — Gifting v2: P2P coin gifts & gift moments _(small delta)_

### Concept

Ground truth first: **gift memberships are fully shipped** (coin-funded,
`lib/gifting/gift.server.ts`) and tipping is shipped. The remaining gap is
tiny but socially valuable: a first-class **"send coins"** action with a
message and an optional public **gift moment** (a system comment "🎁 X
gifted Y 200 coins" on a post of the recipient's choice, or a DM-only
delivery), plus a birthday-style prompt surface. This is a UX feature over
the existing `GIFT` transaction type more than a new system.

### Design (condensed — one section, it's small)

- **Server:** `POST /api/coins/gift` — session → rate limit → zod
  (amount 10–10 000, optional 280-char note — the ledger's `note` column
  already fits, optional `public: boolean`): balance check + single `GIFT`
  ledger row + notification. Daily per-sender gift cap (constant) to keep
  pressure/spam down; recipients can disable receiving gifts in settings
  (`NotificationPreference`-adjacent flag on `UserProfile`).
- **Gift moments:** if `public`, the notification renders with a
  "show off" action that posts a pre-filled quote-style RMHark from the
  _recipient_ (recipient chooses to publicize — never auto-posted, avoids
  gift-shaming dynamics).
- **UI:** "Gift coins" on profiles + DM composer attachment (renders as a
  wrapped-gift card that "opens" on tap — respect reduced motion); gifting
  enters the existing wallet history UI untouched (it's just ledger rows).
- **Economy:** pure transfer, no faucet/sink pressure. `GIFT` is already
  excluded from creator "earned" derivation (it sums tips/memberships/
  sales), so no redemption interaction. Keep it that way — gifts are
  social, not monetization.
- **Risks:** begging/pressure dynamics — mitigations: no public "request
  coins" mechanic, caps, receive-toggle. Minors/compliance posture is
  unchanged (coins already are non-withdrawable except the
  creator-earnings path, which gifts don't touch).

### Effort

**S (2–4 days).**

---

## 10. Feature 9 — Weekly digest email

### Concept

One well-crafted weekly email per user: your streak/quest/pass status, the
best posts from your follows/communities since you last visited, new games
or blog/news highlights, and upcoming events you RSVP'd to (Feature 5). The
platform's only re-engagement channel today is push (opt-in, mobile-lean);
email closes the loop for the logged-out-lapsed.

### Why it fits

- Resend integration exists (ladder alert dispatch) — including a working
  **digest scheduler** precedent: `isDigestDue`, quiet hours, per-user
  timezones in `lib/rmhladder/alerts/schedule.ts`.
- pg-boss for the batch job; Wrapped/Recap already compute "your activity"
  summaries; `NotificationPreference` exists for the opt-out surface.

### Design

- **Extract `lib/email/send.server.ts`** from the ladder dispatch (Resend
  HTTP call, from-address config via env, dev-mode log-instead-of-send) and
  refit ladder to use it — one shared email module, no behavior change.
- **Preference:** `NotificationPreference` gains `emailDigest: 'weekly' |
'off'` (default `'weekly'` for new signups, **`'off'` backfilled for
  existing users** — opt-in for the existing base, both to respect
  expectations and deliverability ramp).
- **Pipeline:** pg-boss cron (weekly, staggered by user-id hash across
  Sunday evening in the user's timezone — reusing the ladder timezone
  helpers): batch users with digest on → per-user content assembly
  (top-3 posts by engagement from follow graph since last visit; quest/
  streak/pass snapshot from the existing progress queries; events;
  1 editorial slot from blog/news) → render (React Email-style template
  in-repo, tokens _not_ used — email needs inline styles; single
  hand-rolled template) → send with `List-Unsubscribe` header +
  one-click unsubscribe route `GET /api/email/unsubscribe?token=…`
  (HMAC-signed user token, no login required — required for deliverability
  and CAN-SPAM/GDPR hygiene).
- **Skip rule:** users active in the last 48 h get a lighter "what you
  missed elsewhere" variant or are skipped entirely (constant to tune) —
  never email someone about posts they already saw.
- **Metrics:** send/open/click via Resend webhooks into a small
  `EmailEvent` log table (or skip opens — click-through on links with a
  `?src=digest` param is enough and more privacy-respecting; **recommend
  the latter**).

### Risks / open questions

- Deliverability is earned slowly: warm up volume (staged rollout by cohort),
  authenticated domain (SPF/DKIM already needed for ladder — verify), and
  the strict opt-in default for existing users.
- Content quality is the whole feature: if the top-3 picker surfaces junk,
  unsubscribes follow. Reuse the feed-ranking signals, and hand-review the
  first cohort's output.

### Effort

**M (≈1–1.5 wk)**, half of which is the shared email extraction + template.

---

## 11. Feature 10 — Site-wide AI concierge

### Concept

⌘K-adjacent assistant available everywhere (a "?" affordance in the shell):
ask it anything about the platform — "what's a quick 2-player game?",
"explain wagers", "what did I miss this week?", "where do I change my
theme?" — and it answers grounded in the games catalog, docs/help content,
and (for the personal questions) the user's own progress data, with
**navigation suggestions as links**. It never mutates state in v1.

Relationship to 2026-07-15 §5 (AI personas as residents): personas are
_characters in the social fabric_; the concierge is _product UI_. They share
`lib/ai` plumbing and quota machinery but are deliberately separate
surfaces with separate prompts.

### Why it fits

- `lib/ai/text.server.ts` (model calls), persona-chat streaming patterns,
  and `ImageGenBudget`-style quota precedent all exist.
- Grounding sources are already structured: `lib/games.ts` (catalog),
  `lib/apps.ts`, blog/news/library content, the user's own quest/pass/
  wallet state via existing server functions.

### Design

- **Retrieval, not fine-tuning:** a build-time-generated `site-knowledge`
  pack — game catalog entries (name, genre, players, description, route),
  app descriptions, ~50 hand-written help snippets (how coins work, how to
  join a tournament, settings map). Small enough (<100 KB) to keyword-rank
  server-side and stuff top-k into the prompt; no vector DB, no new infra.
  A `scripts/` step regenerates the pack (same pattern as other generated
  data), so it can't drift from `lib/games.ts`.
- **Personal context tools:** 3–4 read-only server functions the model may
  call (get my quest/streak/pass status; get my recent notifications
  summary; search site content). Tool results are the user's own data
  fetched under their own session — no cross-user access by construction.
- **Server:** `POST /api/assistant` — session → rate limit → zod → quota
  check (per-day message budget by tier via `lib/entitlements`, mirroring
  the AI-quota approach flagged in the improvement plan) → streamed
  response (SSE, like persona chat). Conversation history: last N turns
  client-held and replayed (stateless server, no new table) — a
  `AssistantThread` table is a v2 nicety.
- **Prompting/safety:** system prompt scopes it to the platform ("you are
  the RMH Studios guide"); refuses off-platform tasks politely; every
  response can carry `links: [{label, to}]` rendered as real router links
  (never auto-navigate). No moderation-sensitive generation surface beyond
  what persona chat already has; reuse its guardrails.
- **UI:** floating entry in the site shell + `/help` route hosting the same
  panel full-page; suggested starter chips ("What's new this week?",
  "Find me a game for 3 friends" — the latter pairs beautifully with the
  party bar, Feature 4).

### Risks / open questions

- Cost control: tier-gated daily budgets + short context (retrieval pack
  keeps prompts small). Free tier gets a taste (e.g. 10/day).
- Staleness: the knowledge pack regenerates in CI on every build — the
  drift risk is the hand-written help snippets; assign them an owner and a
  quarterly review note in `docs/`.
- Don't over-tool it: v1 has zero write-tools by design; "buy this for me"
  style actions are a separate, consent-heavy project.

### Effort

**M (≈1.5–2 wk).**

---

## 12. Feature 11 — Onboarding v2: the First Week arc

### Concept

Extend the shipped day-0 checklist (`lib/onboarding.server.ts`: post,
3 follows, check-in, theme → 100 coins) into a **seven-day arc** that walks
a new user through each pillar once: play a game (arcade challenge counts
double here), visit the wallet and spin the wheel, join a community, try a
daily puzzle, customize your profile, send a DM or party invite. Each step
server-verified (the v1 philosophy, kept), each paying a small reward, with
a **graduation moment** — a starter cosmetic pack + a prompted intro post.

### Why it fits / the gap

The checklist proves the server-verified pattern; `UserQuest` +
`periodKey` can host multi-day chains without new tables; every step's
verification signal already exists as a queryable fact (game plays, wheel
spins, community membership, DMs). The gap is the chain definition, the
tour UI, and the graduation reward.

### Design

- **Chain as quests:** new `QuestPeriod`-style constant `'chain'` with
  `periodKey: 'onboarding'` — rows live in `UserQuest` untouched
  (`@@unique([userId, questId, periodKey])` already permits it). Steps
  defined in `lib/quests/onboarding.ts` with the same server-verified
  check functions the v1 checklist uses (extend `getOnboardingStatus`
  into a step-verifier map). Steps unlock day-by-day (step N available
  `max(N-1 done, account age ≥ N days)` — prevents day-0 speedrun, keeps
  the 7-day rhythm honest).
- **Tour UI:** a dismissible "First Week" card pinned atop the feed for
  accounts < 14 days old, with per-step spotlight links (router navigation
  - a highlight pulse on the target control — CSS only, reduced-motion
    safe). No modal takeover tours — they test terribly and fight the
    full-screen game routes.
- **Graduation:** completing all steps grants a `starter.pack` inventory
  bundle (badge + frame — new shop item defs, zero schema), a `REWARD`
  coin bonus, and opens the composer pre-filled with an intro-post
  template + `#introductions` hashtag (existing hashtag system) — posting
  it is optional but is the single highest-leverage social hook.
- **Measurement:** define D1/D7 retention + step-funnel events via the
  existing analytics path (`lib/analytics.server.ts`) _before_ launch, so
  the arc's effect is provable; each step's completion rate identifies the
  drop-off step to redesign.

### Risks

- Reward inflation for throwaway accounts: total arc payout stays modest
  (~300 coins) and the graduation cosmetics are untradable (Feature 7
  metadata).
- Don't nag: one card, dismissible per-day, hard-hidden after 14 days
  regardless of completion.

### Effort

**S–M (≈1 wk).**

---

## 13. Feature 12 — Shareable stat cards

### Concept

Any brag-worthy moment — an achievement unlock, a rank-up, a streak
milestone, a pass-tier hit, a wrapped stat, a market sale, an arcade
clear — renders as a beautiful **share card**: an OG image + a share sheet
(copy link / share to feed / native share / download for stories). Every
card links back to a public landing page. This is organic acquisition
infrastructure: the platform already _generates_ the moments; it just
doesn't hand users the artifact.

### Why it fits / the gap

`lib/og/` already renders three card types (post, post-story, profile) and
Wrapped/`/share` prove the share-sheet UX. The gap is a **generic stat-card
renderer** + a stable public route per moment + the trigger points.

### Design

- **Renderer:** `lib/og/stat-card.server.tsx` — one layout system, themed
  variants per moment kind (`achievement | rank | streak | pass_tier |
arcade | wrapped_stat`), taking `{kind, title, value, subtitle, user}`.
  Both landscape (OG 1200×630) and story (1080×1920) outputs, mirroring the
  existing post/post-story split. Brand-consistent but **not**
  theme-token-driven (OG images are rendered server-side on brand
  colors, like the existing renderers).
- **Routes:** `GET /api/og/stat/:kind/:ref` (image; cache-forever with a
  content hash, same caching discipline as existing OG routes) and a
  public landing `/_site/moments/$id.tsx`-style page per moment with
  `head()` meta pointing at the image — **only for moments the user chose
  to share** (see privacy below).
- **Moment records:** tiny `SharedMoment` model (id, userId, kind, payload
  Json, createdAt) created **only when the user hits share** — nothing is
  public by default, deleting it kills the landing page, and the OG route
  404s for missing/deleted moments. (Achievements/profiles that are
  already public render cards statelessly without a moment row.)
- **Trigger points:** the existing celebration surfaces
  (`useCelebration`, level-up/achievement toasts, wheel milestones,
  Wrapped panels, ranked promotion screens) gain a "share" action that
  opens the sheet — one shared `<ShareMomentSheet>` component.
- Share-to-feed pre-fills the composer with the landing link (unfurls via
  the OG image — the feed's own link-preview path).

### Risks

- Cache correctness: card content is immutable per moment id (payload
  snapshot at share time) so CDN-forever caching is safe — never render
  live data behind an immutable URL.
- Renderer sprawl: keep one layout engine + variant data, resist
  per-feature bespoke cards.

### Effort

**S–M (≈1 wk)** for renderer + sheet + 3 trigger points; each further
trigger is hours.

---

## 14. Prioritization

Impact = expected effect on retention/engagement/acquisition at current
scale. Risk = product/econ/abuse risk, not eng difficulty.

| #   | Feature        | Impact | Effort    | Risk                 | Depends on                |
| --- | -------------- | ------ | --------- | -------------------- | ------------------------- |
| 1   | Arcade Pass    | ★★★★★  | M         | Low                  | —                         |
| 12  | Stat cards     | ★★★★   | S–M       | Low                  | —                         |
| 11  | Onboarding v2  | ★★★★   | S–M       | Low                  | Arcade (1 step)           |
| 8   | Gifting v2     | ★★     | S         | Low                  | —                         |
| 2   | Creator Studio | ★★★★   | M–L       | Med                  | —                         |
| 4   | Party system   | ★★★★   | M         | Low                  | —                         |
| 9   | Digest email   | ★★★★   | M         | Med (deliverability) | Events (1 slot, optional) |
| 5   | RMHEvents      | ★★★    | M         | Low                  | Spaces (venue, optional)  |
| 3   | Spaces (text)  | ★★★★   | M         | Med (moderation)     | —                         |
| 6   | Replays        | ★★★    | M         | Low                  | —                         |
| 10  | AI concierge   | ★★★    | M         | Med (cost)           | —                         |
| 7   | Marketplace    | ★★★★   | L         | **High**             | econ dashboards           |
| —   | Spaces audio   | ★★★    | L + infra | High                 | Spaces text               |

**Recommended waves** (each wave shippable independently; ~one wave per
cycle):

1. **Wave 1 — compounding loops, zero new infra:** Arcade Pass → Stat
   cards → Onboarding v2 → Gifting v2. (Retention + acquisition first;
   all pure composition.)
2. **Wave 2 — social & creator surfaces:** Party system → Creator Studio →
   Digest email. (Party makes every multiplayer feature better before
   Wave 3 leans on liveness.)
3. **Wave 3 — liveness & content:** Spaces (text) → RMHEvents → Replays.
   (Events wants Spaces as a venue; replays feed the share-card machine.)
4. **Wave 4 — the big bets, individually gated:** Marketplace (after a
   month of economy dashboards), AI concierge, Spaces audio (go/no-go on
   Phase-1 demand + infra appetite).

---

## 15. Cross-cutting constraints (apply to every feature above)

Restating the repo bar (`CLAUDE.md`) as it applies here:

1. **API shape:** every new route follows session →
   `rateLimit(getClientIp(request), …)` → zod `safeParse` →
   `Response.json`. Admin checks via the existing `isAdmin` pattern; new
   admin actions log to `AdminAuditLog`.
2. **Economy discipline:** every coin movement is a `CoinTransaction` row
   with a meaningful `type` + `entityType`; anything touching creator
   earnings or redemption gets a guard-clause review against
   `lib/creator/earnings.server.ts` (the `MARKET` exclusion in §8 is the
   template). New faucets are tuned against the supply dashboards before
   launch, not after.
3. **Async discipline:** anything off the hot path (fanout, reminders,
   digests, sweeps, slow verifies) goes through pg-boss with the existing
   graceful inline fallback — no new queues, no cron daemons.
4. **Design language:** `--site-*` tokens, `PageLayout`/`_site` shell for
   pages, full-screen only for game-like surfaces (Spaces room, replay
   player), lucide + sonner, `docs/page-consistency.md` checklist per new
   page. Reduced motion respected on every celebration/animation moment.
5. **i18n:** all strings `t()`'d with `defaultValue` + `pnpm i18n:extract`;
   new namespaces per feature (arcade, studio, spaces, events, market…);
   RTL-check the party bar and share sheet (docked/overlay UI is where RTL
   breaks).
6. **Moderation & safety:** every new user-generated surface (Space chat,
   event descriptions, gift notes, market listings) is reportable via
   `ContentReport` with an `entityType`, respects `UserBlock/Mute`, and
   rate-limits creation. URL inputs go through `lib/ssrf-guard.server` +
   `lib/url-safety`.
7. **Privacy defaults:** nothing becomes public without an explicit user
   action (stat-card moments, gift moments, "Supporting" shelf — all
   opt-in or user-triggered).
8. **Testing bar:** the repo currently runs a light test posture, but three
   endpoints in this doc are money-critical and get tests regardless:
   marketplace buy/list/cancel, tier join/renewal, gift send. (Same
   standard the Stripe code holds.)
9. **SEO:** public landing surfaces (moments, replays, events, spaces
   transcripts) get `head()` + `buildCanonical` + JSON-LD via
   `jsonLdScript()` where a schema.org type fits (Event for §6 is a
   natural `Event` markup win).
10. **Docs:** each shipped feature adds/updates its `docs/` entry and the
    relevant directory `CLAUDE.md` (e.g. the replay `version`-bump rule in
    adopting games' docs).

---

## 16. KPI appendix

| Feature        | Primary KPI                                                       | Guardrail metric                 |
| -------------- | ----------------------------------------------------------------- | -------------------------------- |
| Arcade Pass    | DAU playing ≥1 challenge; D7 retention of challenge-clearers      | Coin faucet volume vs. baseline  |
| Creator Studio | Active supporters; coin volume into `MEMBERSHIP`/`TIP`            | Redemption queue health          |
| Spaces         | Weekly live-minutes; % of communities hosting monthly             | Reports per 1 000 space-messages |
| Party          | Party-originated match starts                                     | Invite spam reports              |
| Events         | RSVPs per community per month; reminder→attendance rate           | Reminder push opt-outs           |
| Replays        | Replays shared to feed; replay-backed leaderboard %               | Verify-queue latency             |
| Marketplace    | Coin burn via fees; weekly trades                                 | Anomaly-flag rate; dispute count |
| Gifting v2     | Gifts sent/week                                                   | Receive-toggle-off rate          |
| Digest         | Click-through rate; resurrection rate (7-day-inactive who return) | Unsubscribe rate < 0.5%/send     |
| Concierge      | Questions answered/day; link-click-through                        | Cost/user/day vs. tier budget    |
| Onboarding v2  | D7 retention delta vs. holdout; arc completion rate               | Per-step drop-off                |
| Stat cards     | Cards shared/week; landing-page → signup conversion               | —                                |

---

_End of document. Feature sections are numbered §2–§13 in document order;
the table in §14 uses the original idea numbering (1–12) for continuity
with the discussion that produced this doc._
