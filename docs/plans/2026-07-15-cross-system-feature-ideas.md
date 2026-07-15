# Cross-System Feature Ideas — Design Document

**Date:** 2026-07-15
**Status:** Proposed (ideation → design doc; implementation to follow, per-feature sign-off needed)
**Scope:** Six new product features that compose *existing* platform systems (coin
economy, prediction markets, the game catalog, RMHTube sync, battle-pass seasons,
AI personas, the creator economy) into new loops. None of them require a new
service tier or a new external dependency — they are coordination layers over
plumbing that already ships.
**Companions:** [`website-improvement-plan.md`](../website-improvement-plan.md)
(the whole-platform roadmap — its deferred "product features" batch is distinct
from these), [`coins.md`](../coins.md) (note: the shipped economy is far larger
than that doc), [`design-language.md`](../design-language.md),
[`page-consistency.md`](../page-consistency.md).

> **Not in this doc:** a "Career Mode" build-out of RMHLadder (mock-interview
> rooms, employer-referral graph, application prediction markets) was part of the
> same brainstorm but is **owned by someone else** and intentionally excluded here.

> **For the implementing agent:** these are *designs*, not committed schema. Each
> feature that touches the database needs product sign-off before a Prisma
> migration (the `website-improvement-plan.md` gate on "schema-changing features"
> applies). Follow the repo conventions throughout: API-route order (session →
> `rateLimit` → zod `safeParse` → `Response.json`), `--site-*` tokens +
> `components/ui/` primitives, `t()` + `pnpm i18n:extract`, per-route `head()`
> SEO, zod-validate + rate-limit every write, never edit `routeTree.gen.ts`, and
> run `make gazelle` if any Go hub changes. All coin movement must go through the
> ledgered helpers in `lib/coins.server.ts` (`awardCoins` / the spend counterpart)
> so `CoinTransaction` stays the single source of truth — never mutate
> `UserProfile.coins` directly.

---

## 0. Thesis

RMH Studios is already the "everything platform": it owns a coin economy, a
casino, LMSR prediction markets, staking, ~20 games (several multiplayer/3D),
watch-together sync, ELO ranked play, AI personas, and a full creator economy —
**in one codebase, over one identity, one wallet, one social graph.** The
scarce, defensible move is no longer "build another feature in isolation"; it is
**wiring these systems into each other.** Every feature below is only cheap
*because* the platform already owns all the pieces it needs.

Two design rules shared by all six:

1. **Reuse the ledger, the sockets, and the season.** Coins move through
   `lib/coins.server.ts`; realtime rides the existing Socket.io / Go
   `gamehub` / `rmhtube` hubs; recurring cadence hangs off
   `lib/battlepass/season.ts`. New tables reference existing ones; they don't
   fork the economy.
2. **Every loop must have a coin source *and* a coin sink.** The economy already
   has healthy faucets (quests, streaks, wheel, casino wins) and sinks (shop,
   tips, memberships, staking). Anything we add participates in both sides so we
   don't inflate or deflate the currency.

---

## 1. Tournaments Hub *(flagship)*

### Concept
A first-class bracket/tournament system that any multiplayer game plugs into —
Kowloon Knockout, Rochester Offensive, Void Breaker, Slice It!, RMHType, and
RMHBox lobbies. Scheduled or on-demand, single/double-elimination or round-robin,
with coin entry fees, escrowed prize pools, live spectating, and betting.

### Why it fits (systems it composes)
This is the highest-leverage feature in the doc because it is a thin coordinator
over **five** shipped systems:

| Existing system | Anchor | Role in Tournaments |
|---|---|---|
| Coin ledger | `lib/coins.server.ts`, `CoinTransaction` | Entry fees in, prize pool escrow, payouts |
| Prediction markets (LMSR) | `lib/predictions/lmsr.ts`, `components/rmhcoins/PredictionCard.tsx` | Spectators bet on match/bracket outcomes |
| RMHTube sync | `server/rmhtube`, `api/rmhtube/` | Spectate live matches with chat/reactions (see §6) |
| ELO / ranked + leaderboards | `app/routes/_site/ranked.tsx`, `app/routes/_site/leaderboard.tsx` | Seeding, standings, post-event rating deltas |
| Battle-pass season | `lib/battlepass/season.ts` | Tournament *series* as seasonal recurring events; quest hooks |

Games are identified as tournament-eligible via a `tags` marker in
`lib/games.ts` (there is no dedicated `multiplayer` field today — reuse tags, or
add one small optional field `tournamentAdapter?: string`).

### Data model (proposed)
```
Tournament            id, gameId, format(SINGLE_ELIM|DOUBLE_ELIM|ROUND_ROBIN),
                      state(REGISTRATION|SEEDING|LIVE|COMPLETE|CANCELLED),
                      entryFeeCoins, prizePoolCoins, maxPlayers, startsAt,
                      seasonId?, createdById, visibility
TournamentEntrant     tournamentId, userId, seed, eliminatedAt?, placement?
TournamentMatch       tournamentId, round, slot, playerAId, playerBId,
                      state, winnerId?, gameSessionRef?, scheduledAt?
TournamentPayout      tournamentId, userId, placement, amountCoins, txId
```
Prize escrow uses the ledger: entry fees debit each entrant and credit a
system/escrow account (a reserved `userId` or a dedicated `entityType:'tournament'`
on `CoinTransaction`); payouts credit finishers from that pool. Nothing bypasses
`CoinTransaction`.

### Server / API
- `app/routes/api/tournaments/*` — create, register (fee debit), report-result,
  bracket read. Standard order: session → `rateLimit` → zod → `Response.json`.
- **Result integrity** is the hard part. Each eligible game reports match outcome
  to a `reportResult` endpoint via a signed server-to-server call from its
  authoritative hub (socket-server / `gamehub`), *not* from the browser, so
  results can't be forged. Games without an authoritative server (pure-client)
  are ineligible for coin-stakes tournaments until they gain server validation.
- A small Go/Node worker (or extend `ladder-worker` patterns) advances brackets:
  when both slots of a match resolve, generate the next match; on final, run
  payouts + ELO deltas atomically.

### UI surfaces
- `app/routes/_site/tournaments/` (index = browse/upcoming, `$id` = bracket view,
  `create`), plus a card on each game's page ("Tournaments in {game}").
- Live bracket component under `components/tournaments/`; embed the RMHTube
  spectator pane (§6) on the match view.
- Admin: `_site/admin/tournaments.tsx` for moderation, cancel + refund, disputes.

### Economy integration
Source: prize payouts. Sink: entry fees + a small rake (config, e.g. 3–5%) burned
or routed to a seasonal reward pool. Prediction-market betting on matches adds a
second, self-balancing sink/source (LMSR is house-neutral by construction).

### Risks / open questions
- **Result trust** — only server-authoritative games qualify for coin stakes.
  Ship *free-entry* tournaments for client-only games first.
- **No-shows / AFK** — need forfeit timers and refund rules.
- **Collusion** in small brackets — cap prize-to-entry ratios, flag suspicious
  win-trading against the existing anti-abuse signals.
- **Population** — pair with §5 (persona opponents) so brackets can fill during
  low-traffic windows.

### Effort
**Large.** Bracket engine + escrow + per-game result adapters. Recommend phasing:
Phase 1 = single-elim, free entry, one game (RMHType — already has server-side
race results). Phase 2 = coin entry + escrow + payouts. Phase 3 = betting +
spectating + seasons + more games.

---

## 2. Wager Matches / Challenges

### Concept
Today only casino games accept coin bets (`app/routes/api/coins/bet.ts`). Let a
user challenge another user (or open a public challenge) to *any* eligible skill
game — an RMHType race, a Slice It! run, a Kowloon Knockout match — for a coin
pot. Both stakes are escrowed; the winner takes the pot minus a small rake.

### Why it fits
Highest impact-to-effort ratio in the doc: the coin ledger and per-game result
plumbing that Tournaments (§1) needs *also* powers this, but without the bracket
engine. It turns all ~20 games from pure content into economy participants and
gives the social graph (`lib/social/`, DMs, group chats) a reason to convert to
gameplay. It is effectively "Tournaments, N=2, no bracket" and is the natural
first delivery of the shared match-result infrastructure.

### Data model (proposed)
```
Challenge   id, gameId, challengerId, opponentId?(null = open),
            stakeCoins, state(OPEN|ACCEPTED|LIVE|SETTLED|EXPIRED|CANCELLED),
            gameSessionRef?, winnerId?, expiresAt, createdAt
```
Escrow: on ACCEPTED, debit both players' stake to escrow; on SETTLED, pay winner.
On EXPIRED/CANCELLED, refund. Reuse the exact escrow pattern as §1 so it's built
once.

### Server / API
- `app/routes/api/challenges/*` — create, accept, cancel, and the same
  **server-authoritative `reportResult`** as §1 (shared module — build the
  result-verification layer once, both features consume it).
- Push notification + feed/DM hook when challenged ("Alex challenged you to
  Slice It! for 200 coins").

### UI surfaces
- A "Challenge" button on profiles (`_site/u/$userid`), in DMs, and on game pages.
- `components/challenges/ChallengeDialog.tsx` (pick game + stake), a challenges
  inbox surface, and a resolved-challenge card in the feed.

### Economy integration
Source/sink net-neutral between the two players; the rake is the sink. Optionally
let spectators tip the winner (existing `api/coins/tip.ts`).

### Risks / open questions
- Same result-integrity constraint as §1 — restrict coin stakes to
  server-authoritative games; allow free "friendlies" everywhere.
- Sandbagging / smurfing — surface challenger ELO and win/loss so users can
  decline mismatches; consider stake caps per ELO gap.
- Abuse: rate-limit challenge creation; block challenges to users who've blocked
  you (respect the existing social block graph).

### Effort
**Medium.** Ship this *first* as the vehicle for the shared match-result +
escrow layer, then build Tournaments (§1) on top.

---

## 3. Self-Referential Prediction Markets

### Concept
The LMSR market engine (`lib/predictions/lmsr.ts`) already runs. Today markets are
created manually (`components/rmhcoins/CreatePredictionModal.tsx`). Add an
**auto-generator** that spins up markets on *the platform's own* observable
events — zero external content sourcing, infinite supply:

- "Will **@user** top this week's RMHType leaderboard?"
- "Will **this User Build** pass 100 likes in 48h?"
- "Will **this week's tournament** (§1) be won by the #1 seed?"
- "Will the RMHarks post-of-the-day get 500 reactions?"
- "Will **Temple of Joy**'s weekly event goal be met?"

### Why it fits
The platform *owns the ground truth* for every one of these, so resolution is
automatic and unforgeable — the hardest part of any prediction market (a trusted
oracle) is free here. It deepens the single most-engaged surface
(`app/routes/_site/predictions.tsx` is the default tab of the coins page) and
creates a passive-engagement loop for users who don't play games themselves.

### Data model
Minimal — extend the existing prediction market schema with:
```
Market  + source(MANUAL|AUTO)
        + resolverKey (e.g. 'rmhtype.weekly_leader', 'build.likes>=100:{buildId}')
        + autoResolveAt
```
No new engine; reuse LMSR pricing, share accounting, and settlement.

### Server
- A **resolver registry** (`lib/predictions/resolvers/*`) — each resolver is a
  pure function `(market) => YES | NO | UNRESOLVED` reading existing tables
  (leaderboards, `Build.likeCount`, tournament results…).
- A cron/worker tick (extend the existing worker fleet) that (a) seeds a rotating
  set of auto-markets each period and (b) settles any past `autoResolveAt` via its
  resolver. Settlement pays out through the existing LMSR payout path.
- Guardrail: never auto-create a market whose outcome a *single* user can trivially
  control (self-dealing). Prefer aggregate/competitive outcomes.

### UI surfaces
No new page — auto-markets appear in the existing markets tab with an "Auto"
badge and a deep link to the subject (the build, the leaderboard, the tournament).
A "markets about you" filter on the profile is a nice touch.

### Economy integration
LMSR is house-neutral (the market maker's subsidy `b` is the only cost), so this
is a *balanced* loop by construction — it recirculates coins without minting.
Fund the market-maker subsidy from the same seasonal pool the rakes feed.

### Risks / open questions
- **Manipulation** — a user betting on their own metric then juicing it. Mitigate
  by (a) excluding single-actor-controlled outcomes, (b) position caps, (c)
  excluding the subject user from betting on their own market.
- Resolver correctness is safety-critical (it moves coins) — every resolver needs
  a unit test in `testing/` and must fail closed to `UNRESOLVED` + refund.
- Volume of low-interest markets — cap active auto-markets and rank by liquidity.

### Effort
**Small–Medium.** The engine exists; this is a resolver framework + a seeding
cron + a badge. Start with two resolvers (RMHType weekly leader, User Build
likes) and expand.

---

## 4. Creator Coin → Value Bridge

### Concept
Coins are currently a **closed loop**: creators earn them (tips, coin
memberships via `lib/memberships.server.ts`, storefront sales) but can only spend
them back inside the app. Add a one-way bridge that lets creators convert *earned*
coins into real value:

- **Subscription credit** — burn coins for a month of Starter/Pro (ties into
  `lib/entitlements.ts` + the existing Stripe/Better Auth tiers).
- **Merch / physical rewards** — redemption catalog (the public roadmap already
  names merch + "RMH Outpost").
- **Cash-adjacent payout** — gated Stripe Connect payout for verified creators
  above a threshold (the biggest lift; ship last, behind KYC).

### Why it fits
It closes the creator flywheel: *make content → earn coins → coins have real
weight → make more content.* Right now the earning side is rich but terminal,
which caps how hard creators push. It also gives the whole coin economy an
external anchor of value without turning casual play into gambling-for-cash (only
*creator-earned* coins, above a threshold, are bridgeable — casino winnings are
not, which keeps it clean legally and economically).

### Data model (proposed)
```
CreatorBalance     userId, earnedCoins (subset of coins provably from creator
                   sources — tips received, membership revenue, storefront sales),
                   lifetimeEarned, eligibleForPayout(bool)
RedemptionRequest  id, userId, kind(SUB_CREDIT|MERCH|PAYOUT), amountCoins,
                   fiatValue?, state(PENDING|APPROVED|FULFILLED|REJECTED),
                   stripeRef?, reviewedById?, createdAt
```
"Earned" vs "spendable" coins requires tagging inbound `CoinTransaction`s by
provenance (they already carry `type` + `entityType`), so `earnedCoins` is
derivable — no double-ledger.

### Server / API
- `app/routes/api/creator/redeem/*` — request + admin approve/fulfill. Payout
  path integrates Stripe Connect (new) behind an `isVerifiedCreator` gate + KYC.
- Sub-credit path is internal-only (grant an entitlement, burn coins) — lowest
  risk, ship first.

### UI surfaces
- Creator studio (`components/creator-studio/`) gets an "Earnings" tab: earned
  balance, redemption options, request history.
- Admin review queue under `_site/admin/` for merch/payout fulfillment.

### Economy integration
This is a **major coin sink** — the biggest one in the doc. Set exchange rates
conservatively and require an earned-coin threshold so it rewards real creators,
not farmers. Model the macro effect before enabling payout (it changes coin
demand across the whole app).

### Risks / open questions
- **Legal / financial** — real-money payout implies KYC/AML, tax reporting,
  and a hard line that only *creator-earned* (never gambled) coins are eligible.
  Legal sign-off is a hard gate. Sub-credit + merch avoid most of this and should
  ship independently first.
- **Exchange-rate policy** — must be a lever ops controls, not hardcoded.
- **Fraud** — self-tipping rings, fake memberships. Reuse anti-abuse signals;
  require account age/verification for payout tier.

### Effort
**Large** for the full ladder; **Small** for the sub-credit rung alone. Phase:
sub-credit → merch catalog → (behind legal) Stripe Connect payout.

---

## 5. AI Personas as Living Residents

### Concept
Personas (`lib/personas/`, `app/routes/_site/personas/`) are inert chat targets
today. Let them *inhabit* the platform: post to the RMHarks feed, react/comment,
trade in prediction markets with a capped coin allowance, host RMHMusic/RMHStudy
rooms — and, most valuably, act as **practice opponents / lobby-fillers** for
multiplayer games during low-population windows.

### Why it fits
It solves the **cold-start problem** that every multiplayer title and every
social room quietly has: a new user who opens Kowloon Knockout at 3am, or a
tournament (§1) one entrant short, hits a dead lobby. Personas make the world feel
alive at all hours and give single-player-inclined users something to do. The
persona system, feed-write path (`lib/social/engagement.server.ts`), and market
engine all already exist — this is orchestration.

### Data model (proposed)
```
ResidentPersona  personaId(FK), enabled, behaviors(json: feed|markets|rooms|play),
                 coinAllowance, dailyActionBudget, personalityProfile
ResidentAction   personaId, kind, entityRef, createdAt   (audit + rate-limit)
```

### Server
- A **behavior scheduler** (new worker, or extend the Go supervisor fleet) that,
  within per-persona budgets, drives actions through the **same server APIs users
  use** (so personas are subject to the same validation, rate limits, and ledger).
  No privileged backdoor.
- Game opponents: for server-authoritative games, a persona is a bot client the
  hub can spawn; difficulty scales to the human's ELO. Clearly labeled as AI.
- Persona feed/market activity uses the existing AI-generation stack
  (`lib/personas/chat.server.ts`) for content.

### UI surfaces
- Personas are **always visibly labeled** as AI (badge on avatar, profile, and in
  lobbies) — non-negotiable for trust.
- Admin controls to enable/disable residents, set budgets, and kill-switch all
  persona activity.

### Economy integration
Personas get a *capped, non-withdrawable* coin allowance so they can seed markets
and pay tournament entry without minting real value or draining the economy.
Their winnings recycle into the seasonal pool, never to a real wallet.

### Risks / open questions
- **Disclosure & trust** — users must never be deceived into thinking a persona
  is human. Label everywhere; disclose in ToS. This is the #1 constraint.
- **Feed spam** — strict per-persona action budgets; personas never appear in
  "recommended users"; easy user mute of all personas.
- **Game fairness** — bot opponents must be labeled and must not pollute human
  ELO/leaderboards (separate rating pool or excluded from ranked).
- **Cost** — AI inference per action; budget-cap and prefer cheap templated
  actions for high-frequency behaviors.

### Effort
**Medium–Large.** Start narrow: personas post/react on the feed (labeled) with a
tight budget, and fill *free-play* game lobbies. Add market participation and
tournament entry later once labeling/trust patterns are proven.

---

## 6. Unified Live-Ops Season + In-Platform Spectating & "Guess the ___"

Two tightly-related engagement engines that share a home.

### 6a. Unified Live-Ops Season

**Concept.** Battle pass, quests, XP, and achievements are all *per-app* today.
Layer a single sitewide themed Season ("Cyberpunk Summer") on top, with quests
that **route across apps** — play VELUM2099, win a music-trivia, post 3 RMHarks,
enter a tournament — and one shared track of seasonal cosmetics.

**Why it fits.** This is the retention meta that makes twenty apps feel like *one*
product with a heartbeat. It reuses `lib/battlepass/season.ts` and
`lib/quests/catalog.ts` — the piece missing today is a *cross-app quest router*
and a single seasonal theme surface, not new progression primitives.

**Data model (proposed).**
```
Season          id, theme, startsAt, endsAt, cosmeticTrackId, active
SeasonQuest     seasonId, appScope(feed|velum2099|music|tournament|...),
                objective, rewardXp, rewardCoins, order
SeasonProgress  seasonId, userId, xp, tier, claimedTiers(json)
```
Each app emits a normalized `SeasonEvent(userId, appScope, verb, meta)` to a
central handler (extend `lib/social/engagement.server.ts` patterns) that advances
matching quests — so apps stay decoupled and new apps opt in by emitting events.

**UI.** A `_site/season` hub (theme banner, quest board, reward track) plus small
season widgets embedded in each participating app. Seasonal cosmetics flow through
the existing shop/cosmetics system (`lib/shop/catalog.ts`).

**Economy.** Season rewards are the coin/XP *faucet*; the season store (exclusive
cosmetics) is the *sink*. Tournament rakes and market subsidies (§1, §3) can fund
the seasonal reward pool, tying the whole doc together.

**Risks.** Quest-router correctness across many apps; avoid making the season feel
like a chore (respect opt-out, keep quests light). **Effort: Medium.**

### 6b. In-Platform Spectating & "Guess the ___" Franchise

**Concept.** Two content-cheap loops built on shipped tech:

1. **Spectating / mini-esports** — reuse RMHTube's sync layer (`server/rmhtube`,
   Go `rmhtube:7003`) to broadcast live multiplayer matches (tournament finals,
   wager matches, ranked games) to spectators with chat and reactions. Streamers
   *within* the platform, no external tooling.
2. **"Guess the ___"** — generalize the paying "Guess the Song" music-trivia
   (`lib/music-guess.server.ts`, `app/routes/_site/music-trivia.tsx`) into a daily
   franchise over the platform's *own* content: **Guess the Build**, **Guess the
   Game** (screenshot), **Guess the Blog quote**, **Guess the Persona**. Daily,
   streak-bearing, coin-paying.

**Why it fits.** Spectating gives tournaments/wagers (§1, §2) an audience — and
audiences bet (§3) and tip. "Guess the ___" turns existing content (builds, game
art, blog posts) into daily engagement + a coin faucet at near-zero content cost,
reusing the trivia scoring/payout that already works for music.

**Data model.** Spectating adds a `spectatable` flag + viewer channel to
match/tournament sessions (reuse RMHTube room primitives). "Guess" adds a
`DailyGuess(kind, date, answerRef, choices, ...)` + `GuessAttempt` mirroring the
music-trivia tables.

**UI.** Spectator pane embedded in match/tournament views (§1); a `_site/guess`
daily hub (or fold modes into the existing `music-trivia` surface) with the
standard daily-puzzle streak UI.

**Economy.** "Guess" is a capped daily faucet (like the wheel/quests); spectating
drives betting (sink/source) and tips (sink). **Risks:** spectator sync load
(cap viewers per room, lean on the existing rmhtube scaling); "Guess" answer
leakage (server-side answers, hashed choices). **Effort: Small–Medium** (each
"Guess" mode is small; spectating is Medium and shares heavily with §1).

---

## 7. Prioritization

Recommended sequence — each row unlocks the next, and shared infrastructure is
built once:

| # | Feature | Effort | Depends on | Builds shared infra | Suggested order |
|---|---|---|---|---|---|
| 2 | Wager Matches | Medium | coin ledger, game results | ✅ match-result verify + escrow | **1st** |
| 1 | Tournaments Hub | Large | §2's escrow + result layer | ✅ bracket engine, spectating hook | 2nd |
| 3 | Self-Referential Markets | Small–Med | LMSR engine (exists) | resolver registry | 3rd (parallelizable) |
| 6b | "Guess the ___" | Small–Med | music-trivia scoring (exists) | daily-content franchise | 3rd (parallelizable) |
| 6a | Unified Season | Medium | battle-pass, quests (exist) | cross-app event router | 4th |
| 5 | AI Personas as Residents | Med–Large | persona + feed + game hubs | lobby-fill bot layer | 4th (pairs with §1 population) |
| 6b | Spectating | Medium | RMHTube sync + §1 | viewer channel | with §1 |
| 4 | Creator Coin→Value Bridge | Large (S for sub-credit) | entitlements, Stripe; **legal gate** for payout | provenance-tagged coins | sub-credit early; payout last |

**Two natural first deliveries:**
- **Wager Matches (§2)** — highest impact-to-effort; the coin ledger and
  per-game result plumbing already exist, and it builds the escrow +
  result-verification layer that Tournaments then reuses.
- **Self-Referential Markets (§3)** — smallest lift, immediate depth on the
  already-most-engaged surface, fully parallel to the wager/tournament track.

## 8. Cross-cutting constraints (apply to all)

- **Economy safety** — every feature has an explicit source and sink (§0 rule 2);
  model macro coin effects before enabling any large sink (§4) or faucet (§6).
  All movement through `CoinTransaction`.
- **Anti-abuse** — coin-stakes features attract collusion/farming; reuse existing
  anti-abuse signals, add position/stake caps, and gate high-value paths on
  account age/verification.
- **Result integrity** — coin stakes only on server-authoritative games; free
  play everywhere else until a game gains server validation.
- **AI disclosure** — personas (§5) and any AI-generated market/quest content are
  always visibly labeled.
- **Repo conventions** — API-route order, `--site-*` tokens + `ui/` primitives +
  `PageLayout`, i18n `t()` + extract, per-route SEO `head()`, a11y (test `light` +
  `high-contrast`, respect reduced motion), security headers in **both**
  `deploy/apache/rmhstudios.conf` and the Helm Traefik middleware if any endpoint
  changes them, `make gazelle` for Go, never touch `routeTree.gen.ts`.
- **Sign-off gate** — every schema-changing feature needs product sign-off before
  a migration (per `website-improvement-plan.md`); §4's payout rung additionally
  needs legal sign-off.
