# Parity, QOL & Customization Design — Sixteen Features

**Document type:** Product + engineering design (dated snapshot)
**Prepared:** 2026-07-20
**Branch:** `claude/site-features-docs-hsb5f1`
**Companion docs:**
[`2026-07-19-platform-expansion-design.md`](./2026-07-19-platform-expansion-design.md)
(arcade, creator studio, spaces, parties, events, replays, marketplace,
digest, concierge, onboarding, stat cards),
[`2026-07-15-cross-system-feature-ideas.md`](./2026-07-15-cross-system-feature-ideas.md)
(tournaments, wagers, predictions, coin bridge, AI residents, live-ops),
[`../coins.md`](../coins.md) (economy foundation),
[`../design-language.md`](../design-language.md) (token contract this doc
extends).

> **How to read this.** The previous two feature docs asked "what new systems
> can we compose from what we have?" — and nearly all of it shipped
> (`ArcadeStreak`, `CreatorTier`, `Space`, `CommunityEvent`, `GameReplay`,
> `MarketListing`, `Tournament`, `WagerMatch`, `Prediction`, `SharedMoment`
> are all live models with live routes). This doc asks a different question:
> **what does every comparable platform have that we still don't, and what
> does daily use feel like once the novelty systems exist?** It is organized
> in four pillars:
>
> - **A. Parity must-haves** — table stakes from Twitter/Bluesky, YouTube/
>   Spotify, Steam, and Reddit that users arrive expecting.
> - **B. Social & presence** — changes that make the people on the site
>   visible to each other moment-to-moment.
> - **C. QOL & user customization** — the settings, appearance, and layout
>   control pillar (the largest one, per the brief).
> - **D. Cross-cutting changes** — search and notifications, which every
>   pillar above leans on.
>
> Every section follows the established shape: _Concept → Why it fits →
> What exists / the gap → Data model → Server & API → UI surfaces → Economy
> integration → Risks → Effort._ Each was checked against the schema and
> routes on 2026-07-20 — the "gap" claims below are verified absences, not
> guesses.

---

## 0. Thesis

The platform now has more **novel** systems than most competitors — a coin
economy with wagers and prediction markets, a P2P cosmetic marketplace,
live Spaces, a cross-game arcade loop. What it is missing is the **boring
layer**: the affordances users have been trained to expect by every large
platform they already use. Nobody churns because we lack prediction
markets; people churn because they can't find a post they saved last week,
can't resume a video, can't quiet notifications overnight, and can't make
the UI comfortable on their own eyes.

Parity features are also the cheapest features we will ever build: their
design space is fully explored (we copy the converged pattern), their
backing data often already exists (`SongPlay`, `RMHarkView`,
`RmhTubeUserStats`, `RMHarkBookmark`), and their retention effect is
well-documented industry-wide. The rule of thumb throughout: **copy the
converged UX, back it with the tables we already have where possible, and
route every new coin flow through the existing `CoinTransaction` ledger.**

---

## 1. Ground truth — what already exists (verified 2026-07-20)

Delta over the 2026-07-19 inventory (which remains accurate); only rows
relevant to this doc are listed.

| System                     | Where                                                                                                          | State                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Bookmarks                  | `RMHarkBookmark` (flat, unique `(userId, rmheetId)`), `/bookmarks`                                             | Shipped — **posts only, no folders, no cross-content saves**.                                             |
| Play/view logs             | `SongPlay` (per-user per-song counts), `RmhTubeUserStats` (aggregates), `RMHarkView`, `BuildView`              | Shipped as analytics — **no user-facing history page, no resume positions, no pause/clear controls**.     |
| Notification prefs         | `NotificationPreference` — six booleans + `emailDigest`                                                        | Shipped — **no per-channel (in-app/push/email) matrix, no quiet hours, no batching** (quiet hours exist   |
|                            |                                                                                                                | only in RMHLadder's `LadderUserPrefs`).                                                                    |
| Appearance prefs           | `AppearancePreference` — `style`, `accent`, `reduceTransparency`; schema comment explicitly reserves "density, | Shipped, cross-device synced — **no font scale, density, custom accent, or a11y font; the schema was      |
|                            | font scale, …" as future nullable knobs                                                                        | designed for this doc's additions**.                                                                       |
| Muted words                | `api/preferences/muted-words`, filtering in `FeedList`/`FeedColumn`, settings UI in `settings/privacy`         | Shipped.                                                                                                   |
| Data portability           | `api/account/export`, `api/account/delete`, `DeleteAccountPanel`                                               | Shipped.                                                                                                   |
| Command palette, shortcuts | `components/site/CommandPalette.tsx`, `KeyboardShortcuts.tsx`, `command-palette-bus.ts`                        | Shipped — **shortcut bindings are fixed, not remappable** (acceptable; out of scope).                     |
| Post audiences             | `RMHarkAudience`: `PUBLIC / FOLLOWERS / PRIVATE / SUPPORTERS`                                                  | Shipped — **no close-friends circle**.                                                                     |
| Presence                   | `lib/presence.server.ts`, heartbeat hook; party system (`useParty`)                                            | Shipped — **presence is a boolean; no "what they're doing", no friends-activity surface**.                |
| Status                     | —                                                                                                              | **Absent** — no custom user status.                                                                        |
| Cosmetics & shop           | `ShopItemKind` (`THEME PET NAME_COLOR BADGE BANNER POST_FLAIR AVATAR_FRAME`), `UserInventory`, `MarketListing` | Shipped — themes are already a sellable/tradable item kind. **No user-authored cosmetics.**               |
| Game meta-content          | `BuildComment`/`BuildLike` on User Builds                                                                      | Shipped for builds — **no per-game reviews/ratings, no user-authored guides for the ~20 first-party games**. |
| Wishlist                   | `HomeFavorite`/`HomeWatch` (homes), `LadderWatchlistEntry` (jobs)                                              | Watch patterns proven twice — **nothing for shop items or builds**.                                        |
| Awards on posts            | Tips (`TIP` ledger rows with `entityType: "rmhark"`), reactions                                                | Adjacent systems shipped — **no public award badge on content**.                                           |
| Saved searches             | `LadderSavedSearch`                                                                                            | Ladder-only — **no site-wide saved searches**; global search exists at `/search`.                          |
| Sidebar / home layout      | `lib/sidebar-data.ts` (static groups), `useRecents`, `navStore`, `/` feed + right-rail widgets                 | Shipped — **no pin/hide/reorder, no widget layout control**.                                               |

**Consequences for this doc:**

- History (§4) and Saves (§3) are mostly _surfacing_ work over existing
  rows, plus small new tables for resume positions and folders.
- The appearance schema was explicitly future-proofed for §11 — those
  fields land exactly as the schema comment anticipated.
- Awards (§6), Theme Studio (§12), and Wishlists (§7) each open a new coin
  **sink**, which the economy needs as arcade/quest **sources** keep
  growing (see `docs/coins.md` supply dashboards).

---

# Pillar A — Parity must-haves

## 2. Feature 1 — Lists & custom feeds

### Concept

User-curated **Lists** of accounts (Twitter Lists / Bluesky's converged
pattern): create a list ("Game devs", "Close reads"), add any accounts,
and read that list as its own chronological timeline. Lists can be
private, shared (link), or public (followable by others). Pinned lists
appear as swipeable tabs at the top of the home feed next to the existing
Home/Following tabs.

### Why it fits

The feed is the site's front door, and power users have no way to carve
it. Every mature social product converged on lists because they solve the
"I follow 300 accounts for 5 reasons" problem without algorithmic work.
List timelines are the _cheapest possible feed_: `authorId IN (…)`,
chronological, no ranking.

### What exists / the gap

`Follow`, feed queries in `lib/feed`, feed tabs UI, `FeedColumn`
virtualization — all shipped. Gap is the list noun, membership, and a tab
integration.

### Data model (proposed)

```prisma
enum ListVisibility {
  PRIVATE
  UNLISTED // link-shareable
  PUBLIC   // discoverable, followable
}

model UserList {
  id         String         @id @default(cuid())
  ownerId    String
  name       String         @db.VarChar(50)
  bio        String?        @db.VarChar(200)
  visibility ListVisibility @default(PRIVATE)
  pinned     Boolean        @default(false) // owner shows it as a feed tab
  createdAt  DateTime       @default(now())

  owner   User             @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  members UserListMember[]

  @@index([ownerId])
  @@map("user_list")
}

model UserListMember {
  listId  String
  userId  String
  addedAt DateTime @default(now())

  list UserList @relation(fields: [listId], references: [id], onDelete: Cascade)
  user User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([listId, userId])
  @@index([userId]) // "lists you're on"
  @@map("user_list_member")
}
```

Cap: 20 lists/user, 500 members/list (code constants). List _follows_ (for
`PUBLIC` lists) reuse the same member table with a separate
`UserListFollow` join only if public lists prove out — v1 ships without.

### Server & API

- `GET/POST /api/lists`, `PATCH/DELETE /api/lists/:id`,
  `PUT/DELETE /api/lists/:id/members/:userId` — standard order (session →
  `rateLimit` → zod).
- `GET /api/feed?list=:id` — one new branch in the existing feed query:
  membership subquery + chronological order; honors blocks/mutes/audience
  exactly like the following feed (same predicates, one shared helper).
- Being added to a list is **not** notified (Twitter's lesson: it invites
  harassment audits); "lists you're on" is visible in settings, with a
  "remove me" action (deletes the membership row — allowed for the member
  themselves).

### UI surfaces

- `/_site/lists/` (index + `$id`) — management + list timeline via the
  existing `FeedColumn`.
- Home feed: pinned lists render as tabs after Following (mobile:
  horizontally scrollable tab row — the pattern the feed tabs already use).
- Profile overflow menu: "Add/remove from list" sheet.

### Economy integration

None. Deliberately — lists are plumbing.

### Risks / open questions

- Audience leakage: `FOLLOWERS`/`SUPPORTERS`-audience posts must apply the
  same visibility predicate inside list timelines — covered by sharing the
  feed helper, plus a regression test per audience value.
- Public lists as harassment vectors ("blocklist"-style lists): launch
  with `PRIVATE`+`UNLISTED` only; `PUBLIC` gated on a moderation pass
  (name/bio through the existing content-report flow).

### Effort

**M (≈1–1.5 wk).** Two tables, one feed branch, straightforward UI.

---

## 3. Feature 2 — Unified Saves: folders + save-anything

### Concept

One **Saved** hub that replaces the flat posts-only bookmark page:
anything on the platform — post, build, song, video, library document,
news article, replay, market listing — can be saved into user-created
folders ("Read later", "Base designs", "Bangers"). Default folder
"Saved" keeps the one-tap flow; the folder picker is a long-press/right
click affordance, matching Twitter folders and Steam collections.

### Why it fits

Every content surface already has its own partial answer (post bookmarks,
`Playlist` for music, `RmhTubePlaylist`, `LibraryCollection`,
`HomeFavorite`) — which is exactly the problem: five save buttons, five
inboxes. A unified save is the platform-shaped version, and it's what a
multi-app site needs more than any single-app one does.

### What exists / the gap

`RMHarkBookmark` is flat and post-only. The polymorphic
`entityType`/`entityId` addressing convention already exists in the coin
ledger — reuse it here. Gap: generic save table, folders, hub UI,
per-surface save buttons.

### Data model (proposed)

```prisma
model SaveFolder {
  id        String   @id @default(cuid())
  userId    String
  name      String   @db.VarChar(40)
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())

  user  User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  items SavedItem[]

  @@index([userId, sortOrder])
  @@map("save_folder")
}

model SavedItem {
  id         String   @id @default(cuid())
  userId     String
  folderId   String?  // null = default "Saved"
  entityType String   @db.VarChar(24) // 'rmhark' | 'build' | 'song' | 'tube_video' | 'library_doc' | 'news' | 'replay' | 'listing'
  entityId   String
  createdAt  DateTime @default(now())

  user   User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  folder SaveFolder? @relation(fields: [folderId], references: [id], onDelete: SetNull)

  @@unique([userId, entityType, entityId])
  @@index([userId, folderId, createdAt(sort: Desc)])
  @@map("saved_item")
}
```

Migration: backfill every `RMHarkBookmark` row into `SavedItem`
(`entityType: 'rmhark'`), keep the old table + API reading from the new
one behind the same route for a release, then drop.

### Server & API

- `POST/DELETE /api/saves` (`{ entityType, entityId, folderId? }`),
  `GET /api/saves?folder=`, folder CRUD under `/api/saves/folders`.
- Hydration: the hub resolves entities in **batches per type** (one query
  per entityType present in the page of results — the pattern
  `lib/feed`'s reaction/author hydration already uses). Deleted/private
  targets render as a "no longer available" tombstone and offer removal.
- Saving is private and never notifies the author (bookmark semantics,
  not likes).

### UI surfaces

- `/_site/saves/` replaces `/bookmarks` (route stays as a redirect):
  folder rail + type filter chips + the card grid, each type rendered by
  its existing card component.
- Every save button site-wide converges on one `SaveButton` component
  (tap = default folder + sonner toast with "Move to folder…" action;
  long-press/context = picker).

### Economy integration

None directly; saves become a strong candidate-signal input for the
digest email and "jump back in" widgets (§13).

### Risks / open questions

- Polymorphism means no FK integrity — accepted (matches the ledger's
  convention); tombstone handling is the mitigation.
- Scope creep: per-surface adoption is many small PRs. Ship the hub with
  posts + builds + songs first; the component makes the rest incremental.

### Effort

**M (≈1.5–2 wk)** including migration and three surfaces; +S per
additional surface.

---

## 4. Feature 3 — History & resume everywhere

### Concept

A **History** page (filterable: watched, listened, played, read) plus
**resume**: RMHTube videos and RMHMusic sessions continue where you left
off, games with sessions surface "continue" cards, library documents
remember scroll position. Includes the converged privacy contract: pause
history, clear all, per-app opt-out.

### Why it fits

YouTube/Netflix/Spotify trained everyone: content apps without history
and resume feel broken. The raw events are already recorded (`SongPlay`,
`RmhTubeUserStats`, `RMHarkView`, `BuildView`, per-game save models) —
nothing user-facing exists.

### What exists / the gap

Logs exist as analytics aggregates, which is the wrong grain for a
history page (no per-item recency for RMHTube; `SongPlay` has
`lastPlayedAt` and works as-is). Gap: a unified recency table with resume
positions, the page, the privacy controls.

### Data model (proposed)

```prisma
model HistoryEntry {
  id         String   @id @default(cuid())
  userId     String
  entityType String   @db.VarChar(24) // 'tube_video' | 'song' | 'game' | 'library_doc' | 'news'
  entityId   String
  position   Int?     // seconds (media) | percent*100 (docs) | null (games: session-based)
  duration   Int?     // for progress bars
  updatedAt  DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, entityType, entityId]) // upsert on re-visit; history is "most recent per item"
  @@index([userId, updatedAt(sort: Desc)])
  @@map("history_entry")
}
```

`UserProfile` (or `AppearancePreference`'s sibling) gains
`historyPaused Boolean @default(false)`. Retention: pg-boss sweep deletes
entries older than 180 days (constant).

### Server & API

- `POST /api/history/beat` — throttled heartbeat (client sends at most
  every 15s while media plays / doc scrolls; zod-capped payload;
  `rateLimit` generous but present). Upserts the row. Respects
  `historyPaused` server-side (silently no-ops).
- `GET /api/history?type=&cursor=`, `DELETE /api/history/:id`,
  `DELETE /api/history` (clear-all — confirm dialog; also offered from
  `settings/privacy` next to the existing export/delete controls).
- Resume: media players request `GET /api/history/position?type&id` on
  mount (or it piggybacks on the entity payload) and seek if >30s in and
  <95% complete — the converged thresholds.

### UI surfaces

- `/_site/history.tsx` — filter chips, day-grouped rows with progress
  bars, per-row remove, pause/clear controls linking to privacy settings.
- "Continue watching / listening" shelf: home dashboard widget (§13) and
  the RMHTube/RMHMusic landing pages.

### Economy integration

None. History is deliberately outside the reward loop (rewarding it
incentivizes idle playback).

### Risks / open questions

- Heartbeat write volume: one upsert per user per 15s of active media is
  fine at current scale (single indexed upsert); revisit with the
  scalability audit's batching advice if needed.
- Don't record `PRIVATE`-audience or paywalled items the viewer lost
  access to — history hydration reuses the same visibility guards as
  saves (§3).

### Effort

**M (≈1.5 wk)** for the table, page, and RMHTube+RMHMusic resume; games
and library follow incrementally.

---

## 5. Feature 4 — Game hubs: reviews, ratings & player guides

### Concept

Each first-party game gets a **hub page** (`/games/:id`) with three
Steam-shaped elements: a **rating** (five stars, one per user,
editable), **reviews** (short text + thumbs "helpful" votes, sorted
helpful-first), and **player guides** — long-form markdown documents
("Altair opening theory", "Void Breaker wave 12 route") with revisions,
authored by players, coin-tippable like posts. The games directory gains
sort-by-rating and a "well reviewed" shelf.

### Why it fits

~20 games and zero player-generated meta-content: strategy lives in
Discord and evaporates. Steam proved guides+reviews are the retention
layer around a catalog. Every ingredient exists: markdown rendering
(blog/library), revisions precedent (`RMHarkEdit`, `BuildVersion`),
comments/likes precedent (`BuildComment`/`BuildLike`), tips by
`entityType`, moderation pipeline (`ContentReport`).

### What exists / the gap

`lib/games.ts` registry, per-game landing screens, `BuildComment` for
user builds. Gap: ratings, reviews, guides — all three nouns — and the
hub route (games currently deep-link straight into play).

### Data model (proposed)

```prisma
model GameReview {
  id        String   @id @default(cuid())
  userId    String
  gameId    String   @db.VarChar(40) // from lib/games.ts
  stars     Int      // 1..5 (zod)
  body      String?  @db.VarChar(2000)
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())

  user  User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  votes GameReviewVote[]

  @@unique([userId, gameId])
  @@index([gameId, createdAt(sort: Desc)])
  @@map("game_review")
}

model GameReviewVote {
  reviewId String
  userId   String
  helpful  Boolean

  review GameReview @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  user   User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([reviewId, userId])
  @@map("game_review_vote")
}

model GameGuide {
  id        String   @id @default(cuid())
  authorId  String
  gameId    String   @db.VarChar(40)
  title     String   @db.VarChar(120)
  body      String   // markdown, current revision
  published Boolean  @default(false)
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())

  author    User                @relation(fields: [authorId], references: [id], onDelete: Cascade)
  revisions GameGuideRevision[]

  @@index([gameId, published, updatedAt(sort: Desc)])
  @@map("game_guide")
}

model GameGuideRevision {
  id        String   @id @default(cuid())
  guideId   String
  body      String
  note      String?  @db.VarChar(120)
  createdAt DateTime @default(now())

  guide GameGuide @relation(fields: [guideId], references: [id], onDelete: Cascade)

  @@index([guideId, createdAt(sort: Desc)])
  @@map("game_guide_revision")
}
```

### Server & API

- Reviews: `PUT /api/games/:id/review` (upsert own),
  `GET /api/games/:id/reviews?sort=helpful|recent`,
  `POST /api/reviews/:id/vote`. **Play-gating:** reviewing requires a
  recorded play (per-game player model row or `reportGameResult` history)
  — the Steam "verified player" property, and our cheap anti-brigading
  measure.
- Guides: CRUD + publish; each save with a changed body appends a
  revision. Markdown rendered through the existing sanitizing pipeline
  (same as blog) — no raw HTML.
- Aggregates: per-game star average + count maintained on a denormalized
  `GameRatingAgg` row or computed+cached (start cached; the games
  directory reads it once per load).
- Moderation: reviews and guides are reportable `ContentReport` entity
  types; strikes apply as elsewhere.

### UI surfaces

- `/_site/games/$id` hub: art header, rating summary + your-rating stars,
  play CTA, leaderboard snippet, top reviews, guides list. (Play remains
  full-screen at the existing top-level route — the hub is the wrapper,
  matching the sidebar-shell vs full-screen convention.)
- Games directory: rating badges + sort control.
- Guide reader: library-style typography page with author byline, tip
  button, "history" revision viewer.

### Economy integration

Guide tips are ordinary `TIP` rows (`entityType: 'guide'`) — they flow
into creator earnings automatically, giving the creator pipeline its
first non-social content source. Optional later: a small `REWARD` for a
guide that crosses N helpful-votes (admin-triggered at first).

### Risks / open questions

- Review-bombing: per-user unique + play-gating + rate limit covers v1;
  keep an admin "freeze reviews" flag per game as the escape hatch.
- Guides need genuinely good typography to be worth writing — budget the
  reader page as design work, not an afterthought.

### Effort

**L (≈2–3 wk)** — four tables, hub route, two content editors. The most
new-surface-area feature in this doc, and the strongest games-retention
play.

---

## 6. Feature 5 — Post awards

### Concept

Reddit-style **awards on content**: spend coins to pin a public award
(Bronze/Silver/Gold + a few seasonal designs) onto a post, comment,
build, or guide. The award renders as a badge row on the content; the
recipient gets a share of the coins; the giver is credited (or
anonymous). Distinct from tips: tips are private income, awards are
**public recognition** — a status purchase that beautifies the content.

### Why it fits

The ledger already models value transfer to content
(`TIP` + `entityType`/`entityId`); reactions already render badge-ish
rows on posts. Awards are the missing coin **sink with social output** —
they take supply out of circulation (the platform cut) while making the
feed richer, and they're proven (Reddit ran on this for a decade).

### What exists / the gap

Nothing renders a persistent, paid badge on content. Gap: award catalog
(code-driven, like the shop), an award row, the badge UI, and the split
semantics.

### Data model (proposed)

```prisma
model ContentAward {
  id         String   @id @default(cuid())
  awardId    String   @db.VarChar(32) // catalog key (lib/awards/catalog.ts)
  giverId    String
  anonymous  Boolean  @default(false)
  entityType String   @db.VarChar(24) // 'rmhark' | 'comment' | 'build' | 'guide'
  entityId   String
  createdAt  DateTime @default(now())

  giver User @relation(fields: [giverId], references: [id], onDelete: Cascade)

  @@index([entityType, entityId])
  @@index([giverId, createdAt(sort: Desc)])
  @@map("content_award")
}
```

Catalog entries define price, art, and recipient share (e.g. Gold: 500
coins, 60% to recipient). No new `CoinTxnType`: one transaction moves the
recipient share as `TIP` (keeps earnings derivation untouched), and the
platform cut is a `PURCHASE` to the house — both existing semantics,
matching how `docs/coins.md` describes sinks.

### Server & API

- `POST /api/awards` — session → `rateLimit` → zod → single Prisma
  transaction: balance check, ledger rows, award row; notify recipient
  (`system` notification type).
- Award rows hydrate onto content the same way reaction summaries do
  (grouped count per awardId, top 3 shown + overflow).

### UI surfaces

- Award picker sheet from the post/content overflow menu — catalog grid
  with art and prices, anonymous toggle, wallet balance footer.
- Badge row on `PostCard`, comments, build and guide pages; tapping opens
  "awarded by" (respecting anonymity).
- Seasonal award art rotates with the live-ops season (2026-07-15 §6a) —
  content, not code.

### Economy integration

The platform's first significant **recognition sink**. Tuning starts at
Reddit-like ratios (award price ≫ typical tip; recipient share < 100% so
awards net-burn). Supply telemetry lands in the existing coin dashboards.

### Risks / open questions

- Awards on reported/removed content: badge hides with the content;
  no refunds (stated in the picker).
- Harassment via ironic awards: catalog contains only positive designs;
  recipients can hide an award (row flag) — cheap and sufficient.

### Effort

**S–M (≈1 wk).** One table, one sheet, one badge row, ledger reuse.

---

## 7. Feature 6 — Wishlists & follow-alerts for shop, market & builds

### Concept

A **wishlist** on shop items and marketplace cosmetics, and
**follow-alerts** on builds/creators: get notified when a wishlisted shop
item goes on sale or returns from rotation, when a `MarketListing` for a
wishlisted cosmetic appears at/below a target price, or when a followed
creator publishes a build. Wishlist is public-by-default on the profile
(opt-out) — which quietly powers **gifting**: friends see what you want.

### Why it fits

The watch pattern is proven twice in-house (`HomeWatch` with alerts,
`LadderWatchlistEntry`), and the P2P `MarketListing` economy from the
2026-07-19 doc creates real price dynamics worth alerting on. Wishlists
are Steam's engine for converting intent into purchases and gifts — and
gifting already exists (`lib/gifting`).

### What exists / the gap

Alerts infra (pg-boss + push + notifications) shipped. Gap: the wishlist
row, the match sweep, the surfaces.

### Data model (proposed)

```prisma
model WishlistEntry {
  id          String   @id @default(cuid())
  userId      String
  entityType  String   @db.VarChar(24) // 'shop_item' | 'market_cosmetic' | 'creator_builds'
  entityId    String   // catalog key | itemId | creatorId
  targetPrice Int?     // coins; market alerts only
  createdAt   DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, entityType, entityId])
  @@index([entityType, entityId]) // sweep: who wants this?
  @@map("wishlist_entry")
}
```

`UserProfile` gains `wishlistPublic Boolean @default(true)`.

### Server & API

- `POST/DELETE /api/wishlist`, `GET /api/wishlist` (+
  `GET /api/users/:id/wishlist` honoring the visibility flag).
- Matching: new-`MarketListing` creation and shop rotation/sale changes
  enqueue a pg-boss job that fans notifications to watchers via the
  reverse index — the exact `HomeWatch` shape. Alerts respect §15's
  channel matrix and quiet hours.
- Gifting hook: the existing gift flow accepts a `fromWishlist` referral
  param so the "gift moments" surface can say "granted a wish".

### UI surfaces

- Heart-with-bookmark icon on shop cards, market listings, build/creator
  pages; `/_site/wishlist.tsx` management page (grouped by type, target
  price editor).
- Profile: "Wishlist" shelf (respecting the flag); a gift CTA for
  viewers with sufficient balance.

### Economy integration

Pure demand-side accelerant for existing sinks (shop, market, gifting).
No new ledger semantics.

### Risks / open questions

- Alert spam on hot cosmetics: coalesce per-user per-day per-entity
  (dedupe key in the job).
- Public wishlists + prices could enable value-signaling pressure; the
  opt-out and gift-first framing are the mitigations.

### Effort

**S–M (≈1 wk).** One table + one sweep + thin UI.

---

# Pillar B — Social & presence

## 8. Feature 7 — Rich presence & the Friends rail

### Concept

Presence grows from a boolean to **activity**: "In a Void Breaker match",
"Listening in Jazz Room", "Live in a Space", "Idle". A **Friends rail**
(right rail on desktop home, a sheet on mobile) shows mutuals who are
online, what they're doing, and one-tap context actions: _join_ (party
invite via the shipped party system), _watch_ (spectate per 2026-07-15
§6b), _hop in_ (room/space join). This is Steam's friends list + Discord's
member sidebar — the single strongest "the site is alive" surface that
isn't a feed.

### Why it fits

Heartbeat presence, the party system, socket hubs, rooms, and spaces all
shipped. Activity is a payload upgrade on infrastructure that already
exists; the rail is a read of it.

### What exists / the gap

`lib/presence.server.ts` tracks liveness only. Gap: an activity payload,
privacy controls, and the rail UI. **Privacy is the design center**: an
activity ticker without controls is a stalking tool.

### Data model (proposed)

No new table for presence itself (stays in the existing ephemeral store —
rows expire with the heartbeat). Activity is set server-side by the
surfaces the user is in (socket handlers on match join/leave, room
join/leave, space join) — never client-asserted.

`UserProfile` gains:

```prisma
  presenceVisibility String @default("mutuals") @db.VarChar(12) // 'mutuals' | 'followers' | 'nobody'
  presenceDetail     Boolean @default(true) // false → online/offline only
```

### Server & API

- `lib/presence.server.ts` gains `setActivity(userId, activity | null)`
  with a fixed activity vocabulary
  (`{ kind: 'game'|'music_room'|'tube_room'|'space', id, label }`);
  call sites are the existing join/leave handlers (≈10 touch points).
- `GET /api/friends/active` — mutuals ∩ online, activity filtered through
  the target's visibility settings, cached 15s per viewer. Socket pushes
  a lightweight `presence:changed` to keep the rail live without polling.
- Join actions delegate to the shipped party/room/space join APIs —
  the rail adds zero new join logic.

### UI surfaces

- `FriendsRail` on desktop home + a `Cmd-K`-reachable "Friends" sheet;
  avatar stack with activity line + context button.
- Settings → Privacy: visibility + detail controls next to the existing
  DM privacy options.
- Profile header shows the same activity line under the same rules.

### Economy integration

None directly; the rail is expected to lift party/spectate/room entry —
all of which have their own loops.

### Risks / open questions

- Default visibility: `mutuals` is the safe default (Discord-like);
  `followers` is opt-in.
- Activity fan-out volume stays trivial while the rail scopes to mutuals;
  revisit if a "who's in this game now" public surface is ever wanted.

### Effort

**M (≈1.5 wk)** — mostly touch points and the rail component.

---

## 9. Feature 8 — Custom status & now-playing

### Concept

A short **custom status** (emoji + ≤80 chars, optional expiry: 30m / 1h /
today / until cleared) shown on profile, hover cards, DMs, and the
Friends rail. Optional **auto now-playing**: while rich presence reports
music/game activity and the user opted in, the status auto-reflects it
("♪ Neon Nights — RMHMusic").

### Why it fits

Discord's most-loved tiny feature; near-zero cost once §8 exists (it
shares the rail and hover-card surfaces). Statuses add texture to
profiles without any feed noise.

### What exists / the gap

Nothing. Gap is one column-set and rendering.

### Data model (proposed)

On `UserProfile`:

```prisma
  statusEmoji   String?   @db.VarChar(16)
  statusText    String?   @db.VarChar(80)
  statusExpires DateTime?
  statusAuto    Boolean   @default(false) // mirror rich presence when idle-status
```

Expiry enforced at read time (`expires < now` renders as no status; a
weekly sweep nulls stale rows).

### Server & API

`PUT /api/profile/status` (zod; moderated vocabulary via the existing
text-moderation helper used for bios); status joins the user-display
payload (`lib/user-display.server.ts`) so every existing avatar/name
surface can render it without new queries.

### UI surfaces

Status editor in the profile menu (emoji picker + presets like
"🎮 Grinding the pass"); rendered on profile header, hover card, DM
header, Friends rail.

### Economy integration

Optional cosmetic later: animated status frames as a `ShopItemKind` —
noted, not designed.

### Risks / open questions

Abuse surface equals bio surface; same moderation path, reportable via
profile report.

### Effort

**S (≈2–3 d).**

---

## 10. Feature 9 — Close Friends circle

### Concept

An Instagram-style **Close Friends** audience: one private circle per
user; posts (and moments) can target it. Circle members see a subtle
green-ring treatment on such posts. Nobody is notified about being added
or removed; membership is never publicly visible.

### Why it fits

`RMHarkAudience` already has four values enforced through one feed
predicate and the OG/embed guards (per the 2026-07-19 doc's supporter-
audience work) — a fifth value rides the same rails. Close Friends is the
single highest-leverage posting feature for making a feed feel _safe_,
which the platform's social graph (friends playing games together) is
exactly shaped for.

### What exists / the gap

Audience enum + enforcement shipped. Gap: the circle itself and the enum
value.

### Data model (proposed)

```prisma
model CloseFriend {
  ownerId  String
  memberId String
  addedAt  DateTime @default(now())

  owner  User @relation("CircleOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  member User @relation("CircleMember", fields: [memberId], references: [id], onDelete: Cascade)

  @@id([ownerId, memberId])
  @@index([memberId]) // viewer-side feed predicate
  @@map("close_friend")
}
```

`RMHarkAudience` gains `CIRCLE`. Cap 150 members (code constant).

### Server & API

- `GET/PUT /api/circle` (bulk set from a follower picker).
- Feed predicate: `audience = 'CIRCLE' ⇒ EXISTS close_friend(ownerId =
  author, memberId = viewer)` — same shape as the supporters predicate,
  added in the same shared helper, with the same embed/OG regression
  tests.

### UI surfaces

- Composer audience picker gains "Close friends" with the member-count.
- Circle manager in settings (search-your-followers picker).
- Green ring on avatar + "Close friends" chip on circle posts (viewer
  side only).

### Economy integration

None.

### Risks / open questions

The classic screenshot caveat — circle content is private-ish, not
private; the chip communicates trust, not security. Copy in the composer
says so once.

### Effort

**S (≈3–4 d)** thanks to the existing audience machinery.

---

## 11. Feature 10 — Profile v2: modular showcase

### Concept

Profiles become **composable**: the owner picks, orders, and configures
up to 6 **modules** from a catalog — Featured posts, Achievement
showcase, Build shelf, Stat card (from `SharedMoment`/Wrapped data),
Now-playing/status, Wishlist, Supporting shelf, Guide list, Pet habitat.
Today's fixed layout becomes the default module set, so unedited
profiles look unchanged.

### Why it fits

The platform generates more per-user artifacts than any comparable site
(achievements, builds, replays, moments, cosmetics, guides) but the
profile shows a fixed slice. Steam's showcases proved the model: profile
curation is an endgame loop that costs the platform nothing per-user —
and it composes with the shop (§12's themes, existing banners/frames/
pets) into one identity pillar.

### What exists / the gap

Profile page, customization page (cosmetics equip), all the module
_content_ sources. Gap: the layout row and the module renderers.

### Data model (proposed)

```prisma
model ProfileLayout {
  userId  String @id
  modules Json   @default("[]") // ordered [{ kind, config }] — zod-validated against the module catalog
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("profile_layout")
}
```

JSON is the right shape here (heterogeneous per-module config, ordered,
always read/written whole, never queried into). The zod catalog is the
schema of record — the same pattern as `Space.pinned`.

### Server & API

`GET/PUT /api/profile/layout` (zod: known kinds, ≤6 modules, per-kind
config schemas). Module data reuses the endpoints their source pages
already expose; the profile route's loader batches them per present kind.

### UI surfaces

- Profile edit mode: drag-reorder (framer-motion), add/remove sheet,
  per-module config (e.g. pick 3 featured achievements).
- Renderers are thin wrappers around existing cards
  (`PostCard`, achievement tiles, build cards…), inside `PageLayout`
  sections — the design-language checklist applies per module.

### Economy integration

Module *slots* stay free; premium module **skins** (layouts/frames for
showcases) are a natural `ShopItemKind` addition later — noted, not
designed.

### Risks / open questions

- Every module must degrade to empty-state gracefully (new users).
- SSR cost: cap at 6 modules and batch loaders; profile is already a
  loader-heavy route, so measure before/after.

### Effort

**M–L (≈2 wk):** the editor is the work; renderers are recomposition.

---

# Pillar C — QOL & user customization

## 12. Feature 11 — Appearance & accessibility suite

### Concept

Settings → Appearance grows from theme+accent into a **comfort panel**:

- **Font scale** — 87.5% / 100% / 112.5% / 125%.
- **Density** — Cozy (today) / Compact (tighter spacing, smaller
  paddings) — feed, tables, sidebars.
- **Readable font** — an OpenDyslexic-style optional face for body text.
- **Custom accent** — a full color picker (with an automatic
  contrast-guard that nudges chosen colors to pass AA against both glass
  surfaces), alongside the curated presets.
- **Reduce motion** — an explicit account-level toggle that feeds the
  existing `useReducedMotion` (currently OS-level only).
- Existing `reduceTransparency` moves into this panel.

All synced via `AppearancePreference`, whose schema comment already
reserves exactly these knobs.

### Why it fits

The token system makes this nearly free: every surface already derives
from `--site-*` variables, so font scale and density are token remaps,
not page rewrites. It is also the accessibility story the a11y convention
(#7) promises but currently only half-delivers (OS-level only).

### What exists / the gap

Token contract, theme store, cross-device sync, `reduceTransparency`.
Gap: the four new knobs + panel UI.

### Data model (proposed)

```prisma
// AppearancePreference — new nullable fields (null = built-in default),
// exactly as the model's comment anticipated:
  fontScale    Int?     // 875 | 1000 | 1125 | 1250 (‰, avoids floats)
  density      String?  @db.VarChar(8)  // 'cozy' | 'compact'
  readableFont Boolean  @default(false)
  customAccent String?  @db.VarChar(7)  // '#rrggbb' — wins over `accent` preset when set
  reduceMotion Boolean  @default(false)
```

### Server & API

Extend the existing appearance sync endpoint's zod schema; the
localStorage no-flash cache carries the same fields (that mechanism is
already the pattern of record per the schema comment).

### UI surfaces

- `themeStore` applies: `fontScale` → root `font-size`; `density` → a
  `data-density` attribute that a small set of spacing tokens key off;
  `customAccent` → the accent token trio (with the contrast guard
  computing hover/foreground pairs — reuse the preset-generation math);
  `reduceMotion` → `useReducedMotion` ORs it with the media query.
- Settings → Appearance: live-preview panel (the theme picker pattern),
  with the a11y options grouped and explained.
- Test matrix: each knob × `light` + `high-contrast` (convention #7).

### Economy integration

None — **comfort settings are never paywalled** (themes are cosmetic;
type size is not). Worth stating as policy.

### Risks / open questions

- Compact density is a real design pass over the core surfaces (feed,
  tables, sidebar) — scope it to those, let the rest inherit.
- Readable font ships as a bundled woff2 subset (licensing checked);
  body-text only, headings keep the brand face.

### Effort

**M (≈1–1.5 wk)**, mostly the density pass and contrast guard.

---

## 13. Feature 12 — Theme Studio & the theme economy

### Concept

A **Theme Studio** at `/studio/themes` (creator studio tab): build a
site theme from the token palette — base surfaces, accent, glass
opacity, radius — with a live preview across sample components. Save
privately, apply, and (for creators in good standing) **publish**: a
published theme becomes a marketplace cosmetic other users can buy with
coins, with revenue flowing through the creator earnings pipeline.

### Why it fits

Themes are already first-class economy objects (`ShopItemKind.THEME`,
inventory, equip flow) and the P2P `MarketListing` market shipped. The
missing piece is **supply**: user-authored themes turn the platform's
most distinctive surface (liquid glass theming) into a creator category —
UGC that is pure data, zero moderation-heavy media, and infinitely
shelvable.

### What exists / the gap

Token system with theme definitions in `globals.css`; shop/inventory/
equip; earnings pipeline. Gap: a theme-as-data format, the editor, a
validation gate, and the publish/purchase path.

### Data model (proposed)

```prisma
enum UserThemeStatus {
  DRAFT
  PUBLISHED
  DELISTED
}

model UserTheme {
  id         String          @id @default(cuid())
  authorId   String
  name       String          @db.VarChar(40)
  tokens     Json            // zod-validated token map (fixed key set, color/number values only)
  status     UserThemeStatus @default(DRAFT)
  priceCoins Int?            // null while draft; bounds enforced in code
  sales      Int             @default(0)
  createdAt  DateTime        @default(now())
  updatedAt  DateTime        @updatedAt

  author User @relation(fields: [authorId], references: [id], onDelete: Cascade)

  @@index([status, sales(sort: Desc)])
  @@map("user_theme")
}
```

Ownership = `UserInventory` rows with `kind: THEME` and
`itemId: "user:<themeId>"` — the equip flow needs no changes.

### Server & API

- Theme values are a **closed token map** (fixed keys, color/number
  values, zod-validated server-side) — never CSS strings, so publishing a
  theme can't inject styles or content. `themeStore` applies a token map
  from either source (built-in or user theme) identically.
- **Validation gate on publish:** automated contrast checks (text/surface
  pairs must pass AA in both light-ish and dark-ish renderings) — fail
  closed with actionable errors in the editor.
- `POST /api/themes`, `PUT /api/themes/:id`, `POST /api/themes/:id/publish`,
  `POST /api/themes/:id/buy` (single transaction: balance → `PURCHASE`
  ledger row with author as recipient → inventory row → `sales++`).
  Purchases count into `lib/creator/earnings.server.ts`'s derived view via
  the existing storefront-sale semantics.
- Delisting keeps existing owners' inventory working (themes are copied
  into inventory-resolvable data at purchase, or resolved with
  `DELISTED`-visible reads — pick the former: snapshot `tokens` into the
  purchase for immutability).

### UI surfaces

- Editor: token controls grouped (surfaces / accent / glass / shape),
  live preview pane rendering a sample feed card, button set, and dialog
  in-place; contrast lint inline.
- Shop: "Community themes" shelf (top sellers, new); theme cards show a
  live mini-preview swatch.
- Profile module (§11) "Themes by me".

### Economy integration

New creator category with a real coin sink; platform cut mirrors
storefront (existing constant). Prices bounded (e.g. 200–5 000 coins) to
keep the market sane at launch.

### Risks / open questions

- Taste floor: the contrast gate enforces *legible*, not *good* — accept
  that, and let sales sort quality (plus a report path for
  trademark/offense in names).
- Token-map versioning: if the token contract evolves, published themes
  need a migration map — keep the key set versioned (`v: 1` in the JSON).

### Effort

**L (≈2–3 wk).** The editor and validation gate are the work; commerce
reuses everything.

---

## 14. Feature 13 — Home dashboard & sidebar customization

### Concept

Two layout controls with one philosophy — *your daily surfaces, your
order*:

1. **Home widgets.** The home right-rail (and mobile home top section)
   becomes a widget stack the user reorders/hides: Today's Arcade,
   Streak/wheel, Continue watching (§4), Friends rail (§8), Ladder
   digest, Live now, Community events, Wallet snapshot. Defaults match
   today's layout.
2. **Sidebar pinning.** Pin/hide/reorder apps in the sidebar's app
   groups; a "More" overflow keeps hidden ones reachable. Recents
   (already tracked by `useRecents`) can be promoted to pins in place.

### Why it fits

The platform is ~10 apps and ~20 games behind one sidebar — no fixed
ordering can be right for both the RMHLadder-first job seeker and the
games-first player. Layout preference rows are the cheapest retention
investment there is: people stay where it feels like *their* desk.

### What exists / the gap

`lib/sidebar-data.ts` static groups; `navStore`; `useRecents`; widgets
exist but hard-placed. Gap: preference storage + editing affordances.

### Data model (proposed)

```prisma
model LayoutPreference {
  userId    String   @id
  sidebar   Json     @default("{}") // { pinned: [...], hidden: [...] } — app ids from sidebar-data
  homeStack Json     @default("[]") // ordered widget kinds; [] = default stack
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("layout_preference")
}
```

(Kept separate from `AppearancePreference`: appearance is *how it looks*,
layout is *what's where* — and the JSON shapes churn on different
schedules.) Unknown ids in stored JSON are dropped at read time, so app
catalog changes never break layouts.

### Server & API

`GET/PUT /api/preferences/layout` (zod against the app/widget catalogs);
served with the shell so first paint respects it (same
localStorage-cache-then-sync pattern as appearance).

### UI surfaces

- Sidebar edit mode (pencil at the group header): drag to reorder pins,
  eye to hide; exits on blur.
- Home "Edit layout" affordance: widget stack with drag handles +
  add/remove sheet.
- Both honor `useReducedMotion` (no spring re-layouts when reduced).

### Economy integration

None. (Resist making widget slots purchasable — layout is comfort, per
§12's policy line.)

### Risks / open questions

Widget registry needs the same empty-state discipline as profile modules
(§11) — shared `WidgetFrame` component solves both.

### Effort

**M (≈1 wk).**

---

## 15. Feature 14 — Notification center v2: channels, quiet hours, batching

### Concept

Rebuild notification *preferences* (not delivery) around the converged
matrix: **per-category × per-channel** (in-app / push / email) toggles,
**quiet hours** (start–end + timezone, push held and delivered as a
morning summary), and **batching** ("12 people liked your post" as one
row). Categories: Social (likes/reposts), Replies & mentions, Follows,
Economy (tips/awards/sales/wagers), Events & live (RSVP'd events, spaces,
wishlist alerts), System.

### Why it fits

The current `NotificationPreference` (six booleans + `emailDigest`)
predates the platform's notification volume: awards (§6), wishlist alerts
(§7), events, tournaments, and the digest all compete for the same bell.
RMHLadder already proved the full pattern in-house — `LadderUserPrefs`
has quiet hours, per-channel alerts, and digest scheduling — this
promotes it to the platform.

### What exists / the gap

Delivery infra all shipped (in-app `Notification`, Web Push, Resend
email, pg-boss). Gap: the preference matrix, the quiet-hours gate in the
dispatch path, and grouping.

### Data model (proposed)

Replace the boolean columns (migration maps old values):

```prisma
model NotificationPreference {
  userId     String  @id
  matrix     Json    @default("{}") // { category: { inapp, push, email } } — zod against category enum; missing = defaults
  quietStart Int?    // minutes from midnight, user tz
  quietEnd   Int?
  tz         String? @db.VarChar(40)
  emailDigest Boolean @default(false) // unchanged

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("notification_preference")
}
```

Batching is delivery-time, not storage-time: in-app rows gain a
`groupKey String?` (e.g. `like:rmhark:<id>:2026-07-20`) and the
list/badge queries collapse on it — no new table, backfill-free.

### Server & API

- One **dispatch gateway** (`lib/notify/dispatch.server.ts`) that every
  notifier is refactored to call: it resolves the category, applies the
  matrix, defers push during quiet hours (pg-boss delayed job at
  `quietEnd` sending one summary push), writes the in-app row with
  `groupKey`. RMHLadder's dispatcher stays separate (it already has its
  own richer prefs) — new platform features must use the gateway.
- Settings API: `GET/PUT /api/preferences/notifications` (zod).

### UI surfaces

- Settings → Notifications: category rows × three channel switches,
  quiet-hours range picker with timezone (default from browser).
- Notification list renders grouped rows with facepile ("A, B and 10
  others"); expanding shows the members.

### Economy integration

Economy category gives tips/awards/sales their own lane — creators can
turn on push for sales only, which the creator dashboard should link to.

### Risks / open questions

- The refactor onto the gateway is the real cost — inventory every
  `Notification.create` call site first (grep-driven checklist in the
  implementation PR).
- Quiet-hours summary push must respect platform push-payload limits —
  cap the summary at counts, not content.

### Effort

**M–L (≈2 wk)**, dominated by call-site migration.

---

## 16. Feature 15 — Feed controls: algorithm transparency & tuning

### Concept

Give readers the converged control set over the home feed:

- **Default tab choice** — make Following (chronological) sticky as the
  default if chosen (never silently reset — the anti-pattern every
  platform gets dragged for).
- **"Show fewer like this"** on the post overflow — a lightweight signal
  captured per author/hashtag pair with an immediate visible effect.
- **Topic tuning** — follow/mute hashtags from one settings surface
  (mute-hashtag joins the shipped muted-words filtering in
  `FeedList`/`FeedColumn`).
- **Sensitive-content handling** — authors can mark a post spoiler/
  sensitive (blurred media + reveal tap); readers choose blur/show
  defaults. Distinct from moderation: this is *courtesy labeling*.

### Why it fits

Muted words shipped; hashtags exist (`Hashtag`, `PostHashtag`);
`feedStore` already tracks tab state. These four are small deltas that
together read as "this feed respects you" — a differentiator the big
platforms keep fumbling.

### What exists / the gap

No sticky tab preference, no negative signal capture, no hashtag mute,
no spoiler flag.

### Data model (proposed)

```prisma
model FeedSignal {
  userId    String
  kind      String   @db.VarChar(16) // 'less_author' | 'mute_tag' | 'follow_tag'
  targetId  String   @db.VarChar(64) // authorId | tag
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, kind, targetId])
  @@map("feed_signal")
}
```

`RMHark` gains `sensitive Boolean @default(false)` +
`spoilerOf String? @db.VarChar(80)` (optional "spoilers for: Altair S2
finals" label). Default-tab + blur prefs live in `feedStore` synced via
the layout preference row (§14) — they're layout-ish, not new tables.

### Server & API

- `POST /api/feed/signal` (idempotent upsert; `less_author` decays —
  rows older than 90 days ignored, sweep-deleted).
- Ranked-feed query applies `less_author` as a demotion factor and
  `mute_tag` as a filter; Following tab applies only filters (its
  chronology is the contract).
- Composer accepts `sensitive`/`spoilerOf` (zod); media payloads carry
  the flag into the blur component; embeds/OG render the blurred variant
  for sensitive media (same guard chain as audiences).

### UI surfaces

- Overflow: "Show fewer from @x", "Mute #tag" with undo toast.
- Settings → Content: managed lists (muted tags/authors-demoted) so every
  signal is inspectable and reversible — the transparency half of the
  feature.
- Spoiler toggle in composer; blur-with-label treatment on cards.

### Economy integration

None.

### Risks / open questions

- Demotion tuning is a ranking change — ship behind a per-user flag and
  compare session depth before defaulting on.
- Sensitive-flag abuse (marking everything to dodge previews) is
  harmless; the reverse (not marking) is already moderation's job.

### Effort

**M (≈1–1.5 wk).**

---

# Pillar D — Cross-cutting

## 17. Feature 16 — Universal search v2: filters, recents & saved searches

### Concept

`/search` grows into the platform's junction: **type-filtered tabs**
(All / People / Posts / Games / Builds / Music / Videos / Library /
News / Market), **query operators** (`from:@user`, `in:community`,
`has:media`, `before:/after:`), **recent searches** (local, clearable),
and **saved searches** with optional new-result alerts (the
`LadderSavedSearch` pattern promoted site-wide — e.g. save
`#altair has:media` and get a weekly bundle notification).

### Why it fits

Every feature in this doc adds findable nouns (guides, themes, lists);
search is where a 10-app platform either coheres or fragments. The
command palette already handles *navigation* search — `/search` owns
*content* search, and the two should share the recents store.

### What exists / the gap

`/search` route with basic cross-entity matching; `LadderSavedSearch` +
alert plumbing in ladder only. Gap: operators, tabs at full coverage,
recents, site-wide saved searches.

### Data model (proposed)

```prisma
model SavedSearch {
  id        String   @id @default(cuid())
  userId    String
  query     String   @db.VarChar(200) // raw query incl. operators
  types     Json     @default("[]")   // entity-type filter chips
  alerts    Boolean  @default(false)  // weekly new-results bundle
  lastRunAt DateTime?
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("saved_search")
}
```

Recents stay client-side (localStorage via the command-palette bus) —
private by construction, no table.

### Server & API

- Operator parsing server-side into the per-entity Prisma predicates
  (each operator maps to indexed columns that exist: author, community,
  media presence, createdAt). Postgres FTS/`pg_trgm` per the scalability
  audit's search notes — no new search infra in this wave.
- Saved-search alerts: weekly pg-boss job per alert-enabled row, runs the
  query bounded to `> lastRunAt`, bundles into one notification through
  §15's gateway (Events & live category).
- All result queries pass through the same visibility guards as their
  home surfaces (audience, blocks, published-only) — enforced by reusing
  each entity's list-query helper rather than fresh queries.

### UI surfaces

Tab row + filter chips, operator hints in an empty-state cheatsheet,
star-to-save with alert toggle, saved list in a left rail; recents under
the input with per-item × and clear-all.

### Economy integration

Market tab makes saved searches a demand tool ("alert me on `frame` under
500 coins") — overlaps §7's wishlist intentionally; wishlist is the
one-tap version, saved search the power-user version.

### Risks / open questions

Operator queries can be expensive — cap combined predicates, rate-limit,
and `EXPLAIN` the hot shapes against real data before launch.

### Effort

**M–L (≈2 wk)** across parsing, tabs, and alerts.

---

## 18. Prioritization

Sequenced for dependency and compounding value; efforts from the
sections. Waves are ~a person-month each at the stated efforts.

| Wave  | Features                                                                                 | Rationale                                                                                                                                              |
| ----- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1** | §12 Appearance suite · §3 Unified Saves · §4 History & resume · §9 Custom status          | Pure daily-comfort wins, no economy risk, three of four are mostly surfacing work. Appearance first — it's the promise the schema already made.        |
| **2** | §15 Notification center v2 · §2 Lists · §10 Close Friends · §14 Dashboard/sidebar layout  | The "respects you" wave: control over attention (notifications), reading (lists), audience (circle), and space (layout). §15 lands before wave 3 so new alert types launch on the matrix. |
| **3** | §8 Rich presence + Friends rail · §6 Post awards · §7 Wishlists · §16 Search v2           | Social liveness + the two demand-side economy features, then search once guides/lists/themes exist to find.                                            |
| **4** | §5 Game hubs (reviews/guides) · §13 Theme Studio · §11 Profile v2                          | The three L-sized creator/curation flagships — each depends on earlier waves (tips lanes, saves, layout machinery) and each opens a UGC category.       |

Drop-anytime pressure valve: §9, §10, and §14 are severable without
weakening their waves.

---

## 19. Cross-cutting constraints (apply to every feature above)

1. **Conventions are law.** API route order (session → `rateLimit` →
   zod), `--site-*` tokens only, `PageLayout`, i18n via
   `t(key, { defaultValue })` + `pnpm i18n:extract`, per-route `head()`
   with `buildMeta`/`buildCanonical`, a11y checklist against `light` and
   `high-contrast`, `useReducedMotion` on every new animation.
2. **Visibility guards are shared, never re-implemented.** Lists, saves,
   history, search, and embeds all read content through the same
   audience/block/mute helpers; every new read surface adds the audience
   regression tests (the 2026-07-19 doc's embed/OG lesson).
3. **One ledger.** Awards, theme sales, and guide tips are existing
   `CoinTxnType` rows so `lib/creator/earnings.server.ts` and the admin
   audit trail stay truthful with **zero changes**. New enum values are a
   design smell in this doc — none are proposed.
4. **Comfort is never paywalled.** Appearance/accessibility knobs, layout
   control, and notification control are free, forever. Cosmetics
   (themes, skins, frames) are the monetizable layer.
5. **Privacy defaults conservative.** Presence: mutuals; being listed:
   silent but auditable; history: pausable/clearable and inside the
   existing export (`api/account/export` gains the new tables); circle
   membership: invisible; wishlist: the one public-by-default (it exists
   to be seen), with a flag.
6. **Preference JSON is validated and forward-safe.** Every Json
   preference column (layout, matrix, modules, tokens) is zod-validated
   against a code catalog, unknown keys dropped at read time, versioned
   where migration is plausible (theme tokens).
7. **No new infrastructure.** Everything above runs on
   Postgres/Prisma, pg-boss, the Node socket hub, Resend, and Web Push
   as deployed today. (Search stays on Postgres per the scalability
   audit; revisit only at its stated thresholds.)
8. **New tables are cheap, new write paths are not.** The heartbeat
   (§4) and presence fan-out (§8) are the only new sustained write/push
   loads — both are bounded and measured before default-on.

---

## 20. KPI appendix

| Feature              | Primary KPI                                                | Guardrail                                          |
| -------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| Appearance suite     | % of WAU with ≥1 non-default comfort setting               | No CLS/regression in Lighthouse on themed pages    |
| Saves                | D7 return rate of savers vs non-savers                     | Save-to-revisit ratio (dead saves = noise)         |
| History & resume     | Resume-tap rate on continue shelves                        | Heartbeat write p95 latency                        |
| Lists                | % of feed sessions on a list tab (target: power-user 20%)  | Report rate on list names                          |
| Game hubs            | Guides published / games covered; review coverage          | Review report rate; play-gate rejection rate       |
| Awards               | Coin burn/week via awards; awarded-post share rate         | Award-driven complaint rate                        |
| Wishlists            | Wishlist→purchase/gift conversion                          | Alert opt-out rate                                 |
| Presence rail        | Join/watch actions per rail impression                     | Presence visibility downgrades (privacy distrust)  |
| Status               | % of WAU with a status set                                 | Status report rate                                 |
| Close Friends        | Circle posts per posting user; circle sizes                | —                                                  |
| Profile v2           | % of profiles edited; profile dwell time                   | Profile SSR p95                                    |
| Theme Studio         | Published themes; theme sales/week                         | Contrast-gate failure rate (editor UX signal)      |
| Layout customization | % of WAU with custom layout; retained after 30d            | Support tickets about "lost" apps                  |
| Notifications v2     | Push opt-out rate (should **fall**); quiet-hours adoption  | Notification CTR (batching shouldn't crater it)    |
| Feed controls        | Sticky-Following adoption; signals per user                | Session depth on demotion cohort                   |
| Search v2            | Search success (result-click) rate; saved-search alerts CTR | Search p95 latency                                 |

---

*Prepared 2026-07-20. Gap claims verified against `prisma/schema.prisma`,
`app/routes/`, `lib/`, and `components/` on this date; if a feature above
appears to exist when you read this, trust the code and treat that section
as historical (per the docs trust order).*
