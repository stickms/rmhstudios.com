# Feature Gap Ideas — 2026-07-31

**Document type:** Product idea list (no implementation)
**Method:** Read the live tree on `claude/website-feature-ideas-ax3l1v` — `lib/games.ts`,
`lib/apps.ts`, `app/routes/**` (~90 site routes, ~120 API namespaces), `prisma/schema.prisma`
(252 models), `server/`, `go-services/` — then subtracted everything already shipped **and**
everything already specced in the three existing idea docs so nothing here is a repeat:

- `docs/plans/2026-07-15-cross-system-feature-ideas.md` — 6 features (tournaments, wagers,
  prediction markets, creator coin bridge, AI residents, live-ops season)
- `docs/plans/2026-07-19-platform-expansion-design.md` — 12 features (arcade pass, creator
  studio, live spaces, party system, events, replays-as-content, marketplace, gifting v2,
  digest email, AI concierge, onboarding v2, stat cards)
- `docs/plans/2026-07-20-parity-qol-customization-design.md` — 16 features (lists, saves,
  history, game hubs, awards, wishlists, presence, status, close friends, profile v2,
  a11y suite, theme studio, dashboard, notifications v2, feed controls, search v2)

Every idea below states the **gap evidence** (what I actually checked) so none of it is
speculative. Effort is XS/S/M/L on the same scale the other plan docs use.

> **Framing.** This platform is past "build the basics." Nearly every consumer-social and
> gamification primitive exists. The gaps that remain cluster in three unglamorous places:
> **(1) the safety/compliance layer under a real-money-adjacent economy, (2) the operational
> surfaces that let you ship and un-ship safely, and (3) the connective tissue between
> systems that already exist but don't know about each other.** Those are ranked first.
> The "fun" ideas are real too, but they are worth less than #1–#6 on this list.

---

## Priority summary

| # | Idea | Category | Effort | Why it ranks here |
|:--:|---|---|:--:|---|
| 1 | Age assurance + regional gating for the wager/stake tier | Safety | M | Real-money-adjacent surfaces ship today with no age signal at all |
| 2 | Strike appeals + user-facing moderation record | Safety | S | `UserStrike` is admin-write-only; punished users get no notice, no recourse |
| 3 | Visibility tiers (limited reach) instead of binary ban | Safety | M | Only escalation available today is nuke-the-account |
| 4 | Feature flags + kill switches + staged rollout | Ops | M | No flag system anywhere; every launch is all-or-nothing with no runtime off-switch |
| 5 | Public status & incident page | Ops | S | A `status` Go service runs in prod with no public-facing page |
| 6 | Changelog / "what shipped" feed | Ops | S | `/roadmap` promises; nothing reports delivery |
| 7 | Keyword, phrase & tag mutes | Safety | S | `UserMute` is per-user only |
| 8 | Auctions, offers & price history on the market | Economy | M | `MarketListing` is fixed-price-only |
| 9 | Economy health dashboard (faucets vs sinks) | Economy | M | `CoinTransaction` has the data; nothing aggregates it |
| 10 | Unified matchmaking + anti-cheat service | Games | L | `EloRating` exists; per-game ad-hoc validation |
| 11 | OAuth 2.0 apps (third-party auth) | Dev platform | M | Only PATs (`DeveloperApiKey`); no "Sign in with RMH" |
| 12 | Semantic search across library/blog/builds | Discovery | M | Search is keyword-only |
| 13 | Colorblind-safe palettes + palette tester | A11y | S | Themes cover contrast/motion/dyslexia, not color vision |
| 14 | Translate-this-post (UGC translation) | i18n | M | 16 locales for chrome, zero for user content |
| 15 | Per-tag / per-user RSS + ActivityPub read-only | Discovery | M | RSS is blog+news only |
| 16 | Study groups + cross-content spaced repetition | Apps | M | `Flashcard*` is solo and deck-scoped |
| 17 | Co-authored posts & collab builds | Creator | S | Every content model is single-owner |
| 18 | Item crafting / fusion sink | Economy | M | `UserInventory` items are terminal |
| 19 | Import from other platforms | Portability | M | Export exists; no on-ramp |
| 20 | Spectate + watch-party for multiplayer games | Live | L | Replays are post-hoc only |
| 21 | Transparency report (automated) | Safety | S | Data exists in `ContentReport`/`AdminAuditLog` |
| 22 | Gift cards & regional pricing | Monetization | M | `GiftMembership` exists; no prepaid or PPP tier |
| 23 | Teen/supervised accounts | Safety | L | Pairs with #1 |
| 24 | Home-screen widgets + offline reading queue | Mobile | M | PWA + `sw.js` exist; no widget/offline-content story |

---

# A. Safety, trust & compliance

This is the weakest layer relative to everything else, and it is the one that carries
regulatory and platform-risk exposure rather than just product upside.

## 1. Age assurance + regional gating for the wager/stake tier

**Concept.** A one-time age/eligibility check that gates the money-adjacent surfaces —
`/wager`, `/predictions`, `/ranked` payouts, `CoinStake`, `TournamentPayout`,
`RedemptionRequest` — with a per-region policy table so a jurisdiction can be switched to
view-only without a deploy.

**Gap evidence.** `grep -ril "age-verification|parental"` across `app/ components/ lib/
server/` returns nothing. Meanwhile the schema ships `WagerMatch`, `CoinStake`,
`Prediction`/`PredictionPosition`, `TournamentPayout` and `RedemptionRequest` (coins →
something of value). There is a `birthdate`-free `User` model. So today a minor in any
jurisdiction can stake coins on a peer-to-peer wager and request redemption.

**Why it fits.** Reuses Better Auth account state, the existing `settings/privacy` surface,
and the admin console for review queues. Composes with idea #4 (flags) to make regions
switchable at runtime.

**Shape.** `UserEligibility { userId, ageBand, region, verifiedAt, method, expiresAt }` +
a policy table + a `requireEligibility()` guard in the standard API handler chain (session →
eligibility → rate limit → zod). Self-declared date-of-birth as tier 1; document/third-party
check only if you ever take real money in.

**Risks.** Don't store raw documents. Verification vendors are a cost center. Regional policy
is a legal question, not an engineering one — the code should just make the answer
configurable.

**Effort.** M (the guard is small; the policy matrix and the "what do we do about existing
accounts" backfill are the work).

---

## 2. Strike appeals + a user-facing moderation record

**Concept.** Give users a "Your account status" page listing every strike, its reason, its
expiry, and the content it attached to — plus a one-shot appeal per strike routed to a new
admin queue.

**Gap evidence.** `model UserStrike` (schema) has `userId, adminId, reason, expiresAt` and
**no** `acknowledgedAt`, `appealStatus`, or `contentId`. `app/routes/_site/admin/reports.tsx`
is the moderator side; there is no user-side counterpart anywhere under
`app/routes/_site/settings/`. The word "appeal" appears in the codebase only for
`admin/library-quota` (storage quota requests), not moderation.

**Why it fits.** `ContentReport`, `AdminAuditLog`, `Notification` and the admin shell all
exist — this is mostly one new page, one new queue tab, and three schema columns. The
library-quota request flow is already the exact UX pattern to copy.

**Effort.** S. Highest trust-per-line-of-code item on this list.

---

## 3. Visibility tiers instead of a binary ban

**Concept.** A graduated enforcement ladder — `NORMAL → LIMITED (replies/feed deranked,
no discovery surfaces) → RESTRICTED (existing followers only) → SUSPENDED` — so moderators
have a proportionate response for borderline cases.

**Gap evidence.** No `shadowban` or visibility-tier concept anywhere; `UserStrike` +
`ContentReport` + account deletion are the whole toolkit. `FeedSignal` already exists as the
ranking input, which is exactly where a tier multiplier would attach.

**Why it fits.** `lib/moderation/auto-moderate.server.ts` already classifies content — it
currently has nowhere proportionate to route a medium-confidence hit. Explicitly pair this
with #2: a hidden penalty with no notice is the failure mode every platform gets sued over,
so the tier must be visible on the user's own status page.

**Effort.** M (the ranking integration is the real work, not the enum).

---

## 7. Keyword, phrase & tag mutes

**Concept.** Per-user mute rules — word, phrase, hashtag, or regex-lite — with a duration and
a scope (feed / notifications / everywhere). Plus a "mute this conversation" on threads.

**Gap evidence.** `UserMute` and `UserBlock` are both user→user. `Hashtag`/`PostHashtag`
exist so tag muting is nearly free. Feature 15 in the parity doc covers *algorithm*
transparency but not *content* filters.

**Why it fits.** Slots into `settings/content`, applies at the same query layer as `UserBlock`.

**Effort.** S.

---

## 21. Automated transparency report

**Concept.** A quarterly public page: reports received by category, actions taken, median
time-to-action, appeals filed and overturned, government/DMCA requests.

**Gap evidence.** `ContentReport`, `AdminAuditLog`, `UserStrike` and
`app/routes/copyright.tsx` (DMCA) hold every input. Nothing aggregates or publishes it.

**Why it fits.** It's a scheduled job (pg-boss is already in `server/`) writing a static
JSON blob plus one `_site` route. Also a strong SEO/credibility artifact.

**Effort.** S — but it only means anything after #2 exists to generate appeal numbers.

---

## 23. Teen / supervised accounts

**Concept.** An account class with the economy tier disabled, DMs restricted to mutuals,
discovery surfaces limited, and an optional linked guardian who sees a weekly activity
summary.

**Gap evidence.** No parental/teen concept exists. Depends entirely on #1.

**Effort.** L. Only worth doing if the audience actually skews young — worth measuring first.

---

# B. Platform operations & release engineering

## 4. Feature flags, kill switches & staged rollout

**Concept.** A flag service — DB-backed, cached, evaluated server-side in the SSR pass and
exposed to the client via the root loader — supporting boolean kill switches, percentage
rollouts, per-user/per-role targeting, and an admin UI.

**Gap evidence.** `grep -ril "feature-flag|ab-test"` returns nothing across the tree. With
18 games, 12 apps and ~120 API namespaces behind a blue/green deploy, the only way to
disable a misbehaving subsystem today is to ship a commit through GitHub Actions → GHCR →
webhook → `deploy.sh`.

**Why it fits.** This is the multiplier on every other item in this document — including the
28 features already specced in the other three plan docs. It turns each of them from a
big-bang launch into a rollout you can halt. It also makes #1's regional policy runtime-
configurable, and gives `senior-review.yml`-gated risky changes a safety net.

**Shape.** `FeatureFlag { key, description, enabled, rolloutPct, targetRoles, targetUserIds,
updatedBy, updatedAt }`, an in-process cache with a short TTL + a pub/sub invalidation on the
existing socket tier, `useFlag()` on the client, `flag()` in server handlers, admin page under
`_site/admin/`. Ship the audit trail into `AdminAuditLog` from day one.

**Effort.** M. **This is the single highest-leverage item in the document.**

---

## 5. Public status & incident page

**Concept.** `status.rmhstudios.com` (or `/status`): live health of web SSR, socket hub,
rmhtube, rmhbox, the Go supervisor workers, Postgres, and Stripe — plus an incident timeline
with subscribe-by-email.

**Gap evidence.** `go-services/` ships a `status` service that runs in production (per
`CLAUDE.md` and `docker-compose.yml`), and `app/routes/api/health.ts` exists — but
`ls app/routes/_site/ | grep -i status` returns nothing. The data is being collected and
never shown to a user.

**Why it fits.** Mostly a read-only page over a service that already exists. Pairs with the
`Notification`/email infrastructure for incident subscriptions. Also the natural home for
scheduled-maintenance notices ahead of a blue/green flip.

**Effort.** S.

---

## 6. Changelog / "what shipped" feed

**Concept.** A `/changelog` route rendering release notes per deploy, with per-entry tags
(game, app, fix, economy) and an RSS feed — plus an opt-in "new since your last visit" toast.

**Gap evidence.** `app/routes/_site/roadmap.tsx` exists and tells users what's *planned*.
Nothing tells them what *landed*. `BlogPost` and `NewsArticle` exist but are editorial, not
release-scoped. The word "changelog" appears in the codebase only for User Build versions.

**Why it fits.** `deploy.sh` already receives a `<sha>`; the entries can be authored in
markdown alongside the code and surfaced through the existing blog rendering pipeline.
Cheap retention lever — the platform ships constantly and no one is told.

**Effort.** S.

---

# C. Economy depth

The economy is broad (coins, staking, market, tournaments, wagers, storefront, memberships,
redemptions) but every mechanism is a **transfer**. There are few sinks and no instrumentation.

## 9. Economy health dashboard (faucets vs. sinks)

**Concept.** An admin dashboard over `CoinTransaction`: coins minted per source per day
(quests, streaks, wheel, achievements, tips) vs. destroyed per sink (shop, market fees,
unlocks, staking losses), total float, Gini-style distribution, and a "days of runway before
inflation makes the shop meaningless" projection.

**Gap evidence.** `CoinTransaction` records everything with a type; `_site/admin/analytics.tsx`
covers product analytics, not currency supply. `DailyWheelSpin`, `UserQuest`, `DailyStreak`,
`ArcadeStreak`, `ContentAward` and `tips` are all faucets. Sinks: `StorefrontPurchase`,
`PostUnlock`, `BuildUnlock`, `MarketListing` (a transfer, not a sink unless there's a fee).

**Why it fits.** Pure read-side aggregation over existing data. Every subsequent economy
decision (#8, #18, #22) is a guess without it.

**Effort.** M.

---

## 8. Auctions, offers & price history

**Concept.** Extend the market with timed auctions (ascending bid, anti-snipe extension),
private offers on unlisted inventory, and a public price-history sparkline per item.

**Gap evidence.** `model MarketListing` has `priceCoins` + `status` + a unique escrowed
`inventoryId` — fixed price, no bid table, no closed-price index for history. The escrow
mechanism is already correct, which is the hard part.

**Why it fits.** Reuses escrow, `CoinTransaction`, the socket tier for live bid updates, and
`Notification` for outbid alerts. A market fee on settle is also the cleanest coin **sink**
you can add, which feeds directly into #9.

**Risks.** Auctions plus a peer-to-peer market is a wash-trading vector — needs the fee and
some velocity limits. Sniping/anti-snipe rules must be decided up front.

**Effort.** M.

---

## 18. Crafting / fusion sink

**Concept.** Combine N duplicate or themed `UserInventory` items into a higher-tier cosmetic;
seasonal recipes that expire. Optionally a "dismantle" that returns a fraction in coins.

**Gap evidence.** `UserInventory` items are terminal — acquired via shop/quests/achievements
and then held forever. Nothing consumes them.

**Why it fits.** Composes `UserInventory` + `StorefrontProduct` + `UserSeasonProgress` +
`useCelebration()`. Gives duplicates a purpose and creates the item sink the economy lacks.

**Effort.** M.

---

## 22. Gift cards & regional pricing

**Concept.** Prepaid coin/membership codes that can be bought and redeemed by someone else,
plus purchasing-power-adjusted membership pricing per region and an annual plan.

**Gap evidence.** `GiftMembership` and `PromoClaim`/`RedemptionRequest` exist, so the
redemption plumbing is there — but there's no prepaid-code product and Stripe pricing appears
single-tier. `_site/pricing.tsx` exists as the surface.

**Why it fits.** Stripe is already wired through Better Auth. Regional pricing is the single
biggest conversion lever for a platform with 16 locales.

**Effort.** M (mostly Stripe configuration and fraud rules around code resale).

---

# D. Games platform infrastructure

## 10. Unified matchmaking + anti-cheat / score attestation

**Concept.** One service that every multiplayer game calls for queueing (skill band, region,
party, latency) and one server-side score-attestation contract that every leaderboard write
goes through — replacing per-game ad-hoc validation.

**Gap evidence.** `EloRating` and `RankedChallenge` exist but are ranked-mode-specific.
Each game carries its own lobby model (`SSLobby`, `RMHboxMatch`, `AltairMatch`,
`RmhTypeMatch`, …) and its own socket handler. "anti-cheat" appears only inside two
individual game files (`wiki-race`, `synapse-storm`), i.e. it's per-game and inconsistent.
Meanwhile 18 games write to `SongLeaderboard`/`DailyPuzzleScore`/per-game score tables.

**Why it fits.** This is the infrastructure the already-specced **party system**
(expansion doc feature 4) needs anyway — building matchmaking without it means building it
18 times. Anti-cheat matters more now that scores route into wagers and tournament payouts
(real value at stake).

**Shape.** A Node hub service alongside socket-server, a `MatchTicket` model, a shared
`submitScore()` that signs and replays deterministic runs where the game supports it
(`GameReplay` already exists — replays are the attestation substrate).

**Effort.** L. Best done as a two-game pilot before a fleet migration.

---

## 20. Spectate + watch parties

**Concept.** Live spectating of in-progress multiplayer matches with a delay buffer, plus a
"watch party" room where a group co-watches a live match or a replay with synced chat.

**Gap evidence.** `GameReplay` + `/replays/$id` + `embed.replay.$id` are all post-hoc.
`RmhTubeRoom` proves the synced-co-watch pattern already works in this codebase — it's just
never been pointed at game state.

**Why it fits.** Directly monetizes the tournaments/wagers systems (people bet on things they
can watch) and reuses the RMHTube room mechanics wholesale.

**Effort.** L.

---

# E. Discovery & distribution

## 12. Semantic search

**Concept.** Vector search over `LibraryDocument`, `BlogPost`, `NewsArticle`, `UserBuild`,
`GameGuide` and `Flashcard` decks — "find me things about X" rather than exact-token matching,
with a hybrid keyword+vector rank.

**Gap evidence.** `app/routes/api/search/` + `search.ts` are keyword-based; parity feature 16
adds filters/recents/saved searches but not semantics. `pgvector` is not in the schema.

**Why it fits.** The library and blog corpus is the moat and it's currently only reachable if
you guess the right words. Postgres + `pgvector` keeps it in the existing DB; embeddings can
run on the existing Go worker fleet.

**Effort.** M.

---

## 15. Per-tag / per-user RSS + read-only ActivityPub

**Concept.** RSS/Atom for any hashtag, any user's public posts, and any community — then, as
a second step, read-only ActivityPub actors so RMHarks profiles are followable from Mastodon.

**Gap evidence.** `blog.rss[.]xml.ts` and `news.rss[.]xml.ts` exist; nothing else has a feed.
`grep -ril "activitypub|atproto"` returns nothing. `oembed.ts` and `embed.post.$id` show the
syndication instinct is already there.

**Why it fits.** Free distribution for a platform whose growth problem is discovery. Read-only
federation is a fraction of the work of full federation and carries none of the inbound-
moderation burden — which is the part that would collide with section A.

**Effort.** M (RSS is S; ActivityPub read-only is the M).

---

## 19. Import from other platforms

**Concept.** Bring-your-own-archive importers: Twitter/X and Mastodon archives → RMHarks
drafts, Anki decks → `FlashcardDeck`, YouTube playlists → RMHTube playlists, Goodreads →
library collections.

**Gap evidence.** `app/routes/api/account/export.ts` handles the exit; there is no entrance.

**Why it fits.** Every importer targets a model that already exists. The single highest-
converting onboarding step for a new social platform is "your stuff is already here" — pairs
naturally with the already-specced onboarding v2.

**Risks.** Import must respect the same auto-moderation path as fresh content, and be
rate-limited/queued through pg-boss rather than done inline.

**Effort.** M per importer; start with one.

---

# F. Creator & content

## 17. Co-authored posts and collaborative builds

**Concept.** Multiple credited authors on a `RMHark`, `UserBuild`, `GameGuide`, `Album` or
`BlogPost` — with revenue/tips split by an agreed ratio and all collaborators' followers
notified.

**Gap evidence.** Every content model uses a single `userId`/`authorId`. `BuildVersion` and
`GameGuideRevision` support history but not co-ownership. `CreatorTier`/`CreatorMembership`
monetize a single creator.

**Why it fits.** Small schema delta (a join table + a split ratio), large social effect — it
turns creators into a network instead of parallel silos, and doubles the distribution of every
collaborative work.

**Effort.** S–M.

---

## 16. Study groups + cross-content spaced repetition

**Concept.** Shared flashcard decks with a group review leaderboard, plus an SRS scheduler
that pulls from *any* content — library highlights, blog passages, game trivia — not just
manually authored cards. An exam mode with a scheduled target date that works backwards.

**Gap evidence.** `FlashcardDeck`/`Flashcard`/`FlashcardReview` + `RmhStudyProfile`/
`RmhStudySession` are all single-user and deck-scoped. `LibraryDocument` and `Album` content
is never a card source.

**Why it fits.** RMHStudy is the app with the clearest external value and the least social
surface. `GroupChat`, `Community` and the leaderboard system all already exist to hang it on.

**Effort.** M.

---

# G. Developer platform

## 11. OAuth 2.0 third-party apps

**Concept.** Real "Sign in with RMH" — an app registry, scoped consent screen, authorization
code + PKCE flow, refresh tokens, per-app rate tiers, and a user-facing "connected apps" page
with revocation.

**Gap evidence.** `DeveloperApiKey` is a personal access token model; `_site/developer/` is a
single page; `api/v1/openapi[.]json.ts` and `WebhookEndpoint`/`WebhookDelivery` exist. So the
API is documented and outbound-eventful, but there is no way for a *third party* to act on
behalf of a user. `grep -ril "oauth-app"` returns nothing.

**Why it fits.** Better Auth already handles the inbound direction (Discord/Google/GitHub).
This is the piece that turns a documented API into an ecosystem — and it's a prerequisite for
any future mobile app or `rmhcode` CLI acting as a user rather than a key holder.

**Effort.** M. Add a sandbox org + seeded test data alongside it if you want external
developers to actually build.

---

# H. Accessibility & internationalization

## 13. Colorblind-safe palettes + a palette tester

**Concept.** Deuteranopia/protanopia/tritanopia-safe theme variants, plus a shape/pattern
redundancy pass anywhere color alone encodes meaning (leaderboard deltas, prediction
up/down, rarity tiers, game state).

**Gap evidence.** `stores/themeStore.ts` covers `default`, `graphite`, `high-contrast`,
density (`cozy`/`compact`), `rmh-reduce-transparency` and dyslexia-friendly type — a genuinely
strong a11y story that has no color-vision axis. `grep -ril "color-blind"` returns nothing.
~8% of male users are affected, and this is a games platform where color *is* state.

**Why it fits.** The `--site-*`/`--app-*` token architecture means this is largely a new token
set plus an audit, not a rewrite. Extends parity feature 11 (a11y suite) rather than
duplicating it.

**Effort.** S for the palettes, M including the redundancy audit.

---

## 14. Translate-this-post

**Concept.** An inline "Translate" affordance on user-generated content — posts, comments,
build descriptions, reviews, guides — with the result cached per (content, target locale) and
the original always one tap away.

**Gap evidence.** 16 locales × 67 namespaces localize the *interface*; every piece of user
content is served in whatever language it was written. `i18n-translate.yml` already runs an
LLM translation pipeline in CI — for catalog strings only.

**Why it fits.** A 16-locale platform where users can't read each other's posts is 16 parallel
monolingual sites. The CI translation pipeline proves the plumbing exists; this points it at
runtime content with a cache table and a strict rate limit.

**Risks.** Cost control is the whole design — cache aggressively, translate on demand only,
never batch-translate the corpus.

**Effort.** M.

---

# I. Mobile

## 24. Home-screen widgets + offline reading queue

**Concept.** PWA widgets (streak status, daily puzzle, unread count) plus an explicit
"save for offline" that pins library documents, blog posts and news to the service worker
cache for flights/transit.

**Gap evidence.** `public/sw.js` + `lib/sw-register.ts` + `manifest.webmanifest` + VAPID push
are all live, and `app/routes/offline.tsx` exists — so the PWA shell is there, but nothing
caches *content* deliberately. `SavedItem`/`SaveFolder` (parity feature 2) is the natural
selection UI and doesn't currently imply offline availability.

**Why it fits.** Small delta on infrastructure that's already deployed, and it makes
`DailyStreak` far more defensible — the #1 cause of a broken streak is not having signal.

**Effort.** M.

---

## Suggested sequencing

**Do first (one sprint, unblocks everything else):** #4 feature flags → #5 status page →
#6 changelog. All three are ops surfaces, all are S–M, and #4 de-risks every launch after it.

**Do second (the compliance floor):** #1 age gating → #2 appeals → #7 keyword mutes →
#21 transparency report. #3 (visibility tiers) follows once #2 exists to make it visible.
This block is not optional if the wager/stake/redemption surfaces stay live.

**Then pick a lane:**
- *Economy* — #9 dashboard first (it's the instrument), then #8 auctions and #18 crafting.
- *Games* — #10 matchmaking/anti-cheat, which the already-specced party system needs anyway.
- *Growth* — #19 importers + #15 feeds + #12 semantic search.

**Long-horizon flagship:** #10 + #20 together — unified matchmaking with live spectating —
is the thing that makes 18 separate games feel like one arcade, and it's what the tournaments
and wager systems are currently missing an audience for.

---

## Explicitly not proposed

Things I checked for and deliberately left off, so the next reader doesn't re-derive them:

- **Party system, live audio spaces, replays-as-content, digest email, AI concierge, stat
  cards, lists, saves, history, awards, wishlists, presence, close friends, profile v2, theme
  studio, notifications v2, feed controls, search filters** — all already specced in the three
  prior plan docs.
- **hreflang / per-locale URLs** — already tracked as deferred in `website-improvement-plan.md`
  (architectural; needs per-locale routing first).
- **Feed virtualization, CSP enforcement, responsive images** — already tracked as deferred
  in the same doc.
- **Full inbound ActivityPub federation** — the moderation burden collides with section A;
  read-only (#15) captures most of the distribution value at a fraction of the risk.
- **Ads / sponsored posts** — technically feasible on `FeedSignal`, but it would compete with
  the membership and creator-coin models rather than complement them.
