# Next-Phase Feature Ideas — 2026-09-19

**Document type:** Feature generation, phase-setting
**Prepared:** 2026-09-19, after `be7a951`
**Prior art:** [`2026-07-15-cross-system-feature-ideas.md`](./2026-07-15-cross-system-feature-ideas.md) ·
[`2026-07-19-platform-expansion-design.md`](./2026-07-19-platform-expansion-design.md) ·
[`2026-07-20-parity-qol-customization-design.md`](./2026-07-20-parity-qol-customization-design.md) ·
[`2026-07-31-feature-gap-ideas.md`](./2026-07-31-feature-gap-ideas.md) ·
[`2026-08-03-feature-generation-and-consolidation.md`](./2026-08-03-feature-generation-and-consolidation.md) ·
[`2026-08-04-competitive-feature-gaps.md`](./2026-08-04-competitive-feature-gaps.md) ·
[`2026-08-04-untapped-feature-ideas.md`](./2026-08-04-untapped-feature-ideas.md) ·
[`2026-08-05-next-100-feature-ideas.md`](./2026-08-05-next-100-feature-ideas.md)
**Method:** The house rule from 08-04 — **every absence asserted here was grepped for against
the tree before it was written down**, and every claim carries a file, model, or line anchor so
it can be re-checked rather than re-derived.

---

## §0 — The thesis: the next phase is depth, not surface

Eight prior documents generated features. They were right to: the platform was thin in places
and the gaps were real. But look at what the last three months actually shipped, because it
changes what "next" should mean.

Since 2026-08-05 the tree gained `/breaches`, `/sohumbum2`, `/sohumtracker`, `/pf2ecal`,
`/rmh-capital`, `/rmh-pmc`, `/adaptive-intelligence`, `/rmh-datacenter`, `/services/rebar-rutabaga`,
the RMH car family, and RMH Fashion — **eleven new destinations in six weeks**, on top of the 23
games in `lib/catalog/games/` and the 12 apps in `lib/catalog/apps/`. That is a remarkable rate
of surface production and it is not the problem.

The problem is what four greps turned up while auditing for this document:

1. **The party system is finished and switched off.** `server/socket-server/handlers/party.ts`
   implements create/invite/accept/leave/kick/transfer/queue with rate limits, disconnect
   handling and single-use join tickets. Line 22 of that file says it plainly:
   *"no games are registered as party-enabled yet — `party:queue` returns a 'not party-enabled'
   error until a game calls `registerPartyGame(...)`"*. The registry at
   `server/socket-server/party-contract.ts:55` is empty. **Thirteen** games declare
   `online-versus` or `online-coop` in `lib/game-capabilities.ts`. None of them can be
   partied into.
2. **Replays exist for 2 of 23 games.** `lib/game/replay.ts` is a well-built, verifiable
   seed-plus-input-log contract with a generic player at
   `components/replays/GameReplayPlayer.tsx` and a shareable embed at
   `app/routes/embed.replay.$id.tsx`. `replayableGames` (line 262) has exactly two entries:
   `lights-out` and `slice-it`.
3. **Ranked is a challenge, not a ladder.** `RANKED_GAMES` in `lib/ranked/elo.ts:22` lists nine
   games, and the only way to move a rating is `applyChallengeResult` — someone you already know
   must accept a `RankedChallenge`. There is no queue, no season, no placement, no decay.
4. **The conglomerate is brochureware.** `/services` (6 verticals) and `/ventures` (5 microsites)
   are eleven destinations backed by **zero Prisma models** — `grep -ci "rebar|datacenter|fashion"
   prisma/schema.prisma` returns 0. The single interactive control across all of them is a
   `mailto:` in `components/rebar-rutabaga/Reservations.tsx:95`. A signed-in member and a
   search-engine crawler get exactly the same page.

Those four findings are the same finding. **The platform has far more surfaces than connections,
and three of its best-built systems are sitting unadopted behind a registry nobody has filled
in.** The highest-return work available right now is not a twelfth app or a twenty-fourth game.
It is turning the things that already exist into things the whole platform shares.

So this document proposes a phase organised around five pillars:

| Pillar                                       | One sentence                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| **P — Multiplayer as a platform service**     | Build the lobby once; 13 games adopt it instead of 13 games reimplementing it.    |
| **W — The conglomerate gets state**           | Eleven microsites stop being posters and become places a member can *do* something. |
| **B — The platform becomes programmable**     | User Builds graduate from hosted pages to real apps with a manifest and an SDK.   |
| **M — The platform gets a memory**            | One embedding store and one recommender behind search, discovery and every AI surface. |
| **L — The platform gets a *when***            | A schedule, so the site is something you show up for rather than something you check. |

And a sixth, smaller section — **K, the kit** — for the consolidation debt the eleven-microsite
sprint just created, which will only get more expensive as the twelfth is built.

### What this document is not

It does not restate the 08-05 AI/QoL/consolidation catalogue. Where it touches one of those
items, the overlap is named and the reason it is being re-raised is given (usually: it was
proposed as a feature and the next phase makes it a *dependency*). Checked against the tree,
several 08-05 items **have** shipped and are treated here as available infrastructure, not as
proposals: the AI provider seam and spend budget (`lib/ai/provider.server.ts`,
`lib/ai/budget.server.ts`), the difficulty director (`lib/game/director.server.ts`), catch-up and
recap summarisation (`lib/ai/catch-up.server.ts`, `lib/ai/recap.server.ts`), moderation triage
(`lib/ai/triage.server.ts`), OG copy generation (`lib/ai/og-copy.server.ts`) and the unified
activity stream (`Activity`, schema:7803).

---

## §1 — Priority summary

Effort: **S** ≤ 2 days · **M** ≤ 2 weeks · **L** > 2 weeks.
"Ratio" is value per unit of effort, which is the only column that matters when picking the first
three.

| #      | Feature                                                       | Pillar | Effort | Ratio     |
| ------ | ------------------------------------------------------------- | ------ | ------ | --------- |
| **P1** | **Turn the party system on** (fill the empty registry)        | P      | **S**  | **Highest** |
| **W1** | **Rebar & Rutabaga reservations that are not a `mailto:`**    | W      | **S**  | **Highest** |
| **P4** | **Replay adoption: 2 games → 10**                             | P      | M      | Very high |
| **M1** | **pgvector + embeddings behind search and similarity**        | M      | M      | Very high |
| **P2** | One matchmaking queue for all 13 online games                 | P      | M      | Very high |
| **K1** | The vertical kit — stop building microsite #12 from scratch   | K      | M      | High      |
| **P5** | Ranked seasons with a queue, placement and decay              | P      | M      | High      |
| **L1** | The programming grid — the platform's schedule                | L      | M      | High      |
| **W3** | Ventures as stakes: members hold a piece of the company       | W      | L      | High      |
| **B1** | A build manifest and a permission model                       | B      | M      | High      |
| **P3** | Spectate as a platform primitive                              | P      | M      | Med-high  |
| **M2** | One recommender behind games, apps, feed and library          | M      | M      | Med-high  |
| **W2** | RMH Datacenter sells compute that actually exists             | W      | M      | Med-high  |
| **B2** | The Build SDK: storage, leaderboards, presence, identity      | B      | L      | Med-high  |
| **P7** | The cross-game assist layer `game-capabilities.ts` promises   | P      | M      | Med       |
| **M3** | One member memory the AI surfaces share                       | M      | M      | Med       |
| **L2** | Premieres and watch parties as first-class objects            | L      | M      | Med       |
| **W4** | Fashion becomes the avatar layer for the whole site           | W      | M      | Med       |
| **B3** | A build store with revenue share in coins                     | B      | M      | Med       |
| **L3** | One season that spans the platform                            | L      | M      | Med       |
| **P6** | Bots, so no lobby is ever empty                               | P      | L      | Med       |
| **W5** | The car family becomes the rideshare fleet                    | W      | M      | Med       |
| **M4** | "Why am I seeing this", and controls that mean it             | M      | S      | Med       |
| **W8** | **Responsible play: self-exclusion, cool-off, daily caps**    | W      | **S**  | **High**  |
| **W7** | A supply audit and a real coin sink                           | W      | S      | Med       |
| **B4** | The vibe → build promotion path                               | B      | M      | Med       |
| **P8** | Rejoin and host migration as shared infrastructure            | P      | M      | Med       |
| **L4** | A live-ops console                                            | L      | M      | Low-med   |
| **B5** | Security review in the build publish pipeline                 | B      | M      | Low-med   |
| **W6** | The weekly company tick                                       | W      | M      | Low-med   |
| **K2** | One microsite SEO and sitemap contract                        | K      | S      | Low-med   |

**If only three things happen this phase: P1, P4, M1.** P1 because it is two days of work against
a system that is already written and tested. P4 because replays are the single highest-leverage
content type this platform has and 21 games cannot produce one. M1 because four separate pillars
below (M2, M3, L1, B3) all want an embedding store and none of them should build their own.

---

# Pillar P — Multiplayer as a platform service

The argument for this pillar in one line: **there are 13 online games and 13 implementations of
"how do I play with my friend".** `lib/lobby-link.ts` documents the damage — the module exists
because every multiplayer game had exactly one way in, a six-character code, and two different
URL shapes had to be supported because "two shapes already existed". That module is a good patch.
The underlying condition is that lobby, invite, queue, spectate, rejoin and rank were each solved
per-game by whoever shipped that game.

The platform already decided to fix this. It built the party system, the replay contract, and the
Elo engine as *shared* services. Then it shipped nine more games without adopting them.

## P1 — Turn the party system on — **S, do this first**

### The gap

`server/socket-server/party-contract.ts:55` — *"The registry of party-enabled games, keyed by
game id"* — is empty. The handler's own header comment names the intended rollout: **RMHBox,
Synapse Storm, Hold'em, Kowloon Knockout**. That rollout never happened. Every piece of the
feature that is hard — invite delivery to a user's other sockets, leader transfer, disconnect
cleanup, a single-use ticket so a room id never travels in a URL — is written.

### Design

For each of the four named games, one function call in its socket handler:

```
registerPartyGame('rmhbox', {
  minSize: 2,
  maxSize: 8,
  createRoom: async (members) => { /* the game's existing room-create path */ },
});
```

The work per game is small and identical in shape: the game already knows how to make a room for
N players from a join code; `createRoom` hands it N members instead of waiting for N codes.

Three things to add alongside:

1. **`partyCapable` in `lib/game-capabilities.ts`.** That module's honesty rule (its header:
   *"Every field here is a claim about code that exists today"*) makes it the right place, and
   `lib/__tests__/game-capabilities.test.ts` already holds it to key parity with the catalog —
   so the field can be mechanically checked against the registry rather than asserted.
2. **A party bar entry point on the game cards**, not only in `components/party/PartyBar.tsx`.
   If a party exists, every card for a party-enabled game gets "take the party here".
3. **Party invites through the existing notification bus** (`lib/notify/dispatch.server.ts`) so an
   invite reaches someone who is on the site but not in the socket namespace.

### Acceptance criteria

- `party:queue` succeeds for all four games; the four land in the same room with no code typed.
- A leader who disconnects mid-queue transfers leadership and the queue survives.
- `game-capabilities.test.ts` fails if a game claims `partyCapable` without a registry entry.

### Why first

Two days of adoption work unlocks a feature the site has already paid for in full, and it is the
prerequisite for P2 — a matchmaking queue is a party of one.

## P2 — One matchmaking queue for all 13 online games — **M**

### The gap

Thirteen games declare online play. Every one of them requires that you **already know who you
are playing with**. There is no "find me a game" anywhere on the platform. The nine games in
`RANKED_GAMES` have a rating and no way to earn one from a stranger.

This is the single biggest reason a multiplayer game here feels empty: not that nobody is online,
but that there is no mechanism to put two online strangers in the same room.

### Design

A `matchmaking` service in the socket tier, sitting on top of the party contract:

- **One queue per `(game, mode)`**, in Redis (`lib/redis.server.ts` is already the socket tier's
  shared state). Entry: `{ partyId | userId, rating, queuedAt, region? }`.
- **Widening bands.** Match within ±100 Elo for the first 15s, ±200 to 45s, then anything. The
  band schedule is per-game data, not code — a 4-player party game wants different patience from
  a 1v1 fighter.
- **Parties queue as a unit** and are never split, which is the reason P1 comes first.
- **The result is a party ticket**, so the existing `createRoom` path is the only room-creation
  path. Matchmaking adds no new way to make a room.
- **A visible queue.** Estimated wait from the last 20 matches in that queue, and a live count —
  the platform already renders online counts, and an honest "3 in queue" beats a spinner.

### Related

This subsumes the 08-05 A14 ("bot opponents so no lobby is ever empty") as a *fallback policy* of
the queue rather than a per-game feature — see P6.

## P3 — Spectate as a platform primitive — **M**

### The gap

`Space`, `SpaceMessage`, `Call`, and the RMHTube room models all exist, so the platform knows how
to put people in a room together to watch something. No game can be watched. A tournament
(`Tournament`, `TournamentMatch`) has entrants, matches and payouts — and no way for anyone not
in the match to see it happen.

### Design

Spectating is a read-only socket subscription plus a policy. Three tiers, chosen per game by what
its netcode already does:

1. **Authoritative-state games** (the hub already holds the truth): spectators join the room in a
   `spectator` role and receive the same state broadcasts with input rights withheld. Cheapest
   tier; most of the hub games qualify.
2. **Host-authoritative games** (Bum's Rush, per its §9.1 decision): the host relays a
   downsampled state stream to the hub, which fans it out. Costs the host bandwidth, so it is
   opt-in per lobby and capped.
3. **Deterministic games**: no live spectate; they get P4 replays instead, which are better.

Plus the delay control every spectator system needs: **a 30-second broadcast delay by default for
ranked and tournament matches**, so a spectator cannot feed information back to a player. That
single rule is what separates a spectate feature from a cheating vector.

### Payoff

Tournaments become watchable, which is what makes them worth entering; `/wager/$id` becomes
something you can actually follow; and the feed gets a live-object type it does not have.

## P4 — Replay adoption: 2 games → 10 — **M, highest content leverage in this document**

### The gap

`lib/game/replay.ts` is one of the best-designed modules in the tree. It stores a run as
`(seed, inputs)`, re-simulates server-side to produce the authoritative score, versions the
re-simulation so a logic change degrades to a "version mismatch" screen instead of silently
mis-rendering, and stays pure so the client player and the server verifier share one schema. Its
header states the adoption cost: *"Adopting a new game = add one entry to `replayableGames`."*

Two games have adopted it. The platform has a generic replay player, a shareable replay embed
route, an OG card path for replays, a `SpeedrunEntry` model whose whole premise is
replay-verified runs (`lib/speedrun/verifier.ts`), and **twenty-one games that cannot produce
one.**

### Design

Adoption is not uniform, so triage the 23 by what the game already is:

- **Deterministic, pure logic** (`daily-puzzles`, `laundry-sort`, `gabriels-horn`, the
  `lights-out` family, `cookgame`, `isleworks`): direct adoption, one entry each. The verify
  function is the game's own reducer, which already exists.
- **Deterministic with a physics step** (`slice-it` is here already; `void-breaker`,
  `neon-driftway`): adoptable, but only if the physics step is fixed-timestep and seeded. Where
  it is not, the first commit is making it so — which is worth doing anyway, because a
  variable-timestep game has a leaderboard that rewards frame rate.
- **Non-deterministic or networked** (`rmhbox`, `altair`, `synapse-storm`, `bums-rush`): these
  need the tier the module doesn't have — **keyframe replays**: periodic full-state snapshots plus
  deltas, stored as JSON, not re-simulated and therefore *not* score-verifying. Worth adding as
  an explicit second contract (`ReplayKind: 'deterministic' | 'keyframe'`) so the value —
  watchable, shareable — is available without diluting the guarantee that makes the first kind
  trustworthy.

### Why this is the content play

Every replay is a shareable object with an OG card, an embed, a feed post, and a reason for the
person in it to link to the site. The platform generates thousands of runs a week and keeps none
of them. This is the cheapest content the site will ever produce, and 21 games are throwing it
away.

## P5 — Ranked seasons with a queue, placement and decay — **M**

### The gap

`EloRating` is a lifetime number with no season, `applyChallengeResult` is the only way to move
it, and a `RankedChallenge` requires a named opponent who accepts. `lib/ranked/tiers.ts` gives the
tiers; nothing gives them a calendar. A rating earned in March and a rating earned last week are
indistinguishable, and a rating never decays, so the ladder is a permanent record of whoever
played first.

### Design

- **Seasons** (~8 weeks), with `AppSeasonStat` and `UserSeasonProgress` already in the schema to
  hang them on. A rating belongs to `(user, game, season)`.
- **Placement**: first 5 matches of a season have a widened K-factor and no visible rank.
- **Decay** only above a threshold tier and only after 14 days idle, and shown as "provisional"
  rather than silently subtracted — invisible decay is indistinguishable from a bug.
- **A queue** (P2) as the primary path in; challenges stay for friends.
- **End-of-season settlement** through the existing rewards paths: an `AchievementRarity`-aware
  badge, a coin payout via `lib/economy/ledger.server.ts`, and an entry on the profile.

### The dependency worth naming

Ranked without spectate (P3) and without replays (P4) is a number that goes up. Ranked with both
is a competitive scene. Sequence accordingly.

## P6 — Bots, so no lobby is ever empty — **L**

Proposed as 08-05 A14 and unbuilt. Re-raised here as **a queue policy rather than a game feature**:
after the widening bands in P2 exhaust, the queue fills the room with bots, the match is flagged
`unranked`, and the UI says so before the first input. The per-game work is a bot policy
implementing the same input interface the game already takes — which for the deterministic games
in P4 is a function the replay verifier already proves is sufficient to drive the game.

**The hard rule, borrowed verbatim from the difficulty director** (`lib/game/director.server.ts`):
a match with bots can never reach a leaderboard or move a rating. The director established that
rule for adaptive difficulty; it is the same rule for the same reason.

## P7 — The cross-game assist layer — **M**

`lib/game-capabilities.ts` says this out loud, in its own header, as a known absence:

> `accessibility` in particular is empty for almost every game, and that is not an oversight; the
> cross-game assist layer has not been built.

That is a documented promise with a `[TODO]` shape. The layer: a shared settings group
(`AppearancePreference` and `UserTheme` are the precedent) carrying **hold-to-press instead of
mash**, **input remapping**, **a speed floor**, **a flash/shake suppressor** honoured by
`useReducedMotion`, and **a colour-blind-safe palette switch** for games that encode state in
colour. Games opt in field by field; `game-capabilities.ts` then stops being empty *honestly*,
because the test file can check each claim against the game actually reading the setting.

Pairs naturally with P6 — an assist-enabled run gets the same "not leaderboard-eligible" envelope
the director already defines, and that machinery exists.

## P8 — Rejoin and host migration as shared infrastructure — **M**

Bum's Rush specced host migration and a 90-second reconnect window (its §9.6). Every other
networked game here drops you on a bad tunnel. Since Bum's Rush had to build it, the next phase
should **lift it into the socket tier** as a room-lifecycle service — a grace window, a seat
reservation keyed to the user, and a migration handshake — so it is the twelfth game's default
rather than the twelfth game's project.

---

# Pillar W — The conglomerate gets state

Eleven microsites, zero models, one `mailto:`. Whatever the eleven are for, right now they are
posters — and a poster is the one kind of page this platform is worst at justifying, because
every other surface here remembers you.

The opportunity is bigger than fixing that. **The site already has a currency, a ledger, a supply
model, staking, pools, a market and a storefront** (`lib/economy/`, `lib/staking/`, `Pool`,
`MarketListing`, `StorefrontProduct`). And it has a fictional conglomerate with a restaurant, a
datacenter, a car company, a fashion house, a capital arm and a PMC. Those two facts have never
been introduced to each other.

## W1 — Rebar & Rutabaga takes a reservation — **S, do this with P1**

### The gap

`components/rebar-rutabaga/Reservations.tsx:95` is a `mailto:bord@rebarochrutabaga.se`. The
component's own comment defends this as deliberate — and as a launch decision it was right. As a
steady state it means the most-finished microsite on the platform cannot tell you it is full.

### Design

One model, one API route, one panel:

- `RebarReservation { id, userId?, name, email, partySize, seating (enum: dining|bar|chef),
  slotAt, status, note }`.
- Slots come from `lib/rebar-rutabaga/menu.ts`'s service periods plus a capacity table — the
  `RoomSchedule.tsx` component already renders the rooms.
- `defineHandler` with `auth: 'optional'` (a guest can book with an email) and
  `rateLimit: 'write'`.
- Signed-in members get the reservation in `/notifications` and a calendar file through
  `lib/events-ics.ts`, which exists.
- The `mailto:` **stays** as the large-party path, exactly as the component comment reasons.

### Why it matters beyond one restaurant

It is the reference implementation for "a microsite with state", and it is small enough to be the
one that proves the K1 kit.

## W2 — RMH Datacenter sells compute that actually exists — **M**

### The gap

`/rmh-datacenter` renders capacity meters, halls, power and network pages from
`lib/datacenter/campuses.ts` — a static file. Meanwhile the platform genuinely *sells compute*:
`lib/ai/budget.server.ts` meters AI spend per tier, `ImageGenBudget` caps image generation,
RMHVibe bills generation against Kimi and DeepSeek (`lib/rmhvibe/vibe-types.ts`), and
`AiUsage` records it.

The fiction and the infrastructure are describing the same thing and not talking.

### Design

Make the datacenter the **member-facing face of the real compute budget**:

- The capacity meters read live numbers: AI tokens spent this month, vibe builds running,
  image-gen quota consumed, socket rooms live. `lib/otel/` and the `status` Go service already
  collect most of it.
- **Members buy compute with coins.** A coin price for extra vibe generations, image-gen quota, a
  bigger library quota (`LibraryQuotaRequest` exists and is manual today — this automates it).
  The purchase is an ordinary `CoinTransaction` against the existing ledger.
- Each campus in `campuses.ts` maps to a real resource pool, so "Hall 2 is at 78%" is true.

### Why this is the strongest coin sink available

The economy's problem (see W7) is that coins enter and rarely leave. Compute is a sink that
**costs the platform real money** to provide, which means it is the one sink whose price can be
set honestly rather than arbitrarily.

## W3 — Ventures as stakes: members hold a piece of the company — **L, the phase's big swing**

### The concept

`/ventures` lists RMH Capital, RMH Datacenter, RMH PMC and Adaptive Intelligence as the company's
arms. `/services` lists Homes, Ladder, Rideshare, the restaurant, the cars and Fashion. Members
read about them. Let them **own** them.

- A venture issues a fixed supply of **stakes**, bought with coins.
- Each venture has a **yield tied to a real platform metric** it plausibly owns: Datacenter yields
  on compute sold (W2), Rideshare on rides completed, Ladder on applications submitted, Homes on
  listings posted, the restaurant on reservations kept (W1). Real numbers the platform already
  records — `LadderApplication`, `Ride`, `HomeListing`, `RebarReservation`.
- Yield pays weekly into the coin ledger; stakes trade on the existing `MarketListing`
  infrastructure.

### Why this works here specifically

Every ingredient exists and none of them is currently load-bearing for anything else:
`CoinStake`, `Pool`/`PoolContribution`, `MarketListing`, `lib/staking/`, `lib/economy/supply.server.ts`.
It converts eleven read-only microsites into eleven reasons to come back weekly, and it makes the
*platform's own activity* the thing members speculate on — which is a flywheel, because the way to
make your Ladder stake pay is to get people applying to jobs.

### The three risks, and what they demand

1. **It must never touch real money.** Coins in, coins out, no redemption path from a stake —
   `RedemptionRequest` must not accept them. State it in the schema comment, not just in a doc.
2. **Yield must be capped and supply-aware.** `lib/economy/supply.server.ts` is the authority; a
   yield that mints unbounded coins breaks everything else in the economy. Yield comes out of a
   funded pool, not out of thin air.
3. **It is gambling-adjacent, and the guard rails it would reuse do not exist.** This was the
   most surprising result of the audit for this document: grepping the tree for
   `selfExclu|self-exclusion|ageGate|age-gate|isAdult|over18` returns exactly one file, and it is
   `components/site/LanguageFirstRunModal.tsx` — unrelated. `/wager`, `/predictions`, the casino
   lobbies, `CoinStake` and `DailyWheelSpin` ship today with **no age gate, no self-exclusion, no
   cool-off and no spend limit**. `lib/wager/constants.ts` caps a single stake at 100,000 coins
   and stops there; nothing caps a day.

   So W3 does not get to reuse a responsible-play tier — **it has to build the one the platform
   already owed**: a self-exclusion flag honoured by every coin-risking surface, a member-set
   daily spend cap, a cool-off timer, and an audit trail. That work is worth doing on its own
   merits and ahead of W3 regardless of whether venture stakes are ever built, which is why it is
   listed separately as **W8** rather than buried in this risk note.

## W4 — Fashion becomes the avatar layer for the whole site — **M**

RMH Fashion is *"a wardrobe built around a figure you design"*, living inside a `?tab=fashion`
panel on `/services` and going nowhere. Meanwhile the platform has `UserProfile`, `ProfileLayout`,
`UserTheme`, `EmojiPack` and `UserInventory` — a whole self-expression tier with no body in it.

Connect them: the figure you design in Fashion becomes **your avatar**, rendered as a still for
the feed, as a presence token in party bars and lobbies, and as a full 3D figure on your profile.
Garments become `UserInventory` items — earned from quests and achievements, bought in the shop,
awarded for season finishes (P5). This is the mechanism that gives every cosmetic reward on the
platform somewhere to go.

## W5 — The car family becomes the rideshare fleet — **M**

`components/rideshare/cars/CarFamily.tsx` is described in the `/services` hub as *"the fleet
behind RMH Rideshare"*. The rideshare feature (`RideshareDriver`, `Ride`, `RideMessage`) does not
reference it. Make the claim true: a driver picks a model, the ride card and the live ride view
render that car, vehicle class affects fare and capacity, and models unlock through driver
standing. It is the cheapest way to make two existing features each other's reason to exist.

## W6 — The weekly company tick — **M**

Once W1–W5 land, the conglomerate has state that changes. Give it a heartbeat: a weekly job (the
`pg-boss` tier in `server/jobs/` runs the platform's scheduled work) that closes the books —
settles venture yield, rolls capacity, posts a **company report** to the feed as a first-class
announcement (`FeedAnnouncement` exists, polls included), and seeds the next week's numbers. The
report is the artefact: one post a week that tells members what the company they partly own
actually did.

## W7 — A supply audit and an honest sink — **S**

Before W3 issues a single stake, run the audit `lib/economy/supply.server.ts` is built for and
write down the answer: **how many coins exist, where they enter, where they leave, and what the
weekly net is.** Faucets are easy to find (quests, streaks, the wheel, achievements, referrals,
promos); sinks are the shop, the storefront, gifts, and the wager and tournament rake —
`WAGER_RAKE_BPS = 250` and `TOURNAMENT_RAKE_BPS = 500` in `lib/wager/constants.ts`, both
annotated `Sink`. Note the shape of that: the rake removes 2.5–5% of a pot and **recirculates the
other 95%**, so wagering is a weak sink that looks like a strong one in a dashboard counting
volume. If net issuance is positive and unbounded, every economic feature in this
pillar is building on sand, and W2's compute sink becomes a prerequisite rather than an
enhancement.

## W8 — The responsible-play tier the platform already owed — **S, and it is overdue**

### The gap

Stated in full under W3's risks, and it is the one finding in this document that is a live defect
rather than a missed opportunity. The platform runs `/wager` (coin stakes up to 100,000),
`/predictions` (an LMSR market — `lib/predictions/lmsr.ts`), `CoinStake`, `DailyWheelSpin`, and
casino lobbies including blackjack, baccarat, roulette, hold'em and plinko (`lib/blackjack/`,
`lib/baccarat/`, `lib/roulette/`, `lib/holdem/`, `lib/plinko.ts`). Between them there is **no age
gate, no self-exclusion, no cool-off and no daily limit** — only per-stake ceilings.

Coins are not real money and cannot be cashed out, which is the reason this is an **S** and not a
crisis. It is not a reason to keep shipping risk surfaces without it.

### Design

Small, and almost entirely one shared check:

- `UserPlayLimits { userId, dailyCoinCap?, selfExcludedUntil?, coolOffUntil?, updatedAt }`.
- One `assertPlayAllowed(userId, coins)` guard in `lib/economy/`, called by every coin-risking
  path. The ledger is already the single chokepoint (`lib/economy/ledger.server.ts`), which is
  what makes this cheap — there is one place to put it.
- Member-set limits **tighten immediately and loosen only after 24 hours**. That asymmetry is the
  entire feature; without it a limit is a speed bump.
- A settings panel in the existing settings tier, and the limits included in the account export
  `lib/account-lifecycle.ts` already produces.
- Self-exclusion hides the surfaces rather than only blocking them — `/wager`, `/predictions` and
  the casino lobbies drop out of the radial hub and search for an excluded member.

### Why it is listed here rather than left for the QoL backlog

Because W3 would multiply it. Venture stakes put a speculative instrument in front of every member
on the platform, and doing that on top of a tier with no cool-off is how a fun economy becomes
somebody's bad month.

---

# Pillar B — The platform becomes programmable

This pillar is the one with the largest ceiling, and it is closer than it looks. `UserBuild`,
`BuildVersion`, `BuildCategory`, `BuildTag`, `BuildLike`, `BuildComment`, `BuildView`,
`BuildUnlock` are in the schema. `cli/` ships `rmhcode`, which publishes User Builds. RMHVibe
generates pages from a prompt against Kimi and DeepSeek and versions them (`VibePage`,
`VibePageVersion`). `/user-builds` and `/builds` are live routes.

What is missing is the part that turns hosted pages into a platform: **a manifest, a permission
model, an SDK, and a store.** Without those, a build is a web page that happens to live here.
With them, a build is an app that can use the platform — and that is a categorically different
product.

## B1 — A build manifest and a permission model — **M**

Every build declares, in a versioned manifest checked at publish time:

- **identity** (slug, title, version, entry point);
- **capabilities requested** — `storage`, `leaderboard`, `presence`, `identity:basic`,
  `coins:spend`, `notifications` — each shown to the member on first open in the same shape as an
  OAuth consent, with `coins:spend` always carrying a per-session cap the member sets;
- **a CSP profile.** Builds run sandboxed, same-origin-isolated, with no ambient credentials —
  the platform's own session cookie must never be reachable from a build frame. This is the load-
  bearing security decision of the pillar and it belongs in the first commit, not a later one.

`lib/ssrf-guard.server.ts` and the CSP in `deploy/apache/rmhstudios.conf` are the existing
precedents for how this platform handles untrusted egress; the manifest extends that posture to
untrusted *code*.

## B2 — The Build SDK — **L**

A small `postMessage` bridge, versioned, exposing exactly what the manifest granted:

| Capability     | What it maps to                                                        |
| -------------- | ---------------------------------------------------------------------- |
| `storage`      | Per-build, per-user KV with a quota — the `GameSave` pattern, generalised |
| `leaderboard`  | The 08-05 C2 unified leaderboard endpoint, scoped to the build          |
| `presence`     | Read-only "who else is in here", from the existing presence tier        |
| `identity`     | Display name, avatar, handle — never email, never session               |
| `coins`        | A spend intent the *platform* renders and confirms, never the build     |
| `party`        | Join the party that is already queued (P1), so builds are partyable too |

The rule that keeps this safe: **the build never receives a credential and never draws a
confirmation.** Anything that costs the member something is rendered by the platform shell.

## B3 — A build store with revenue share — **M**

`BuildUnlock` already models a paywalled build. Finish it into a store: a coin price set by the
author, a platform cut, payouts into the author's coin balance via the existing ledger, and the
analytics author-side (`PostAnalyticsDaily` is the precedent). Plus the things a store needs and
`/builds` lacks: **ratings with review-bombing resistance**, **a "made by someone you follow"
shelf** off the existing follow graph, and **weekly featured slots** — which is also L1's first
customer.

## B4 — The vibe → build promotion path — **M**

Today RMHVibe makes a page and User Builds hosts a build, and they are separate products with
separate models. Make the path explicit: **"promote this vibe page to a build"** — which forks the
`VibePageVersion` into a `BuildVersion`, prompts for a manifest, and runs B5. This is how the
build catalogue gets populated by people who have never opened `rmhcode`, and it turns the vibe
generator from a toy into the top of a funnel.

## B5 — Security review in the publish pipeline — **M**

Proposed at 08-05 as A16 and unbuilt; it becomes **mandatory** the moment B2 hands builds real
capabilities. Every publish runs: a static pass for the obvious (credential exfiltration patterns,
unsandboxed `eval` on remote content, requests to hosts outside the manifest), an LLM review
through the existing `lib/ai/provider.server.ts` seam with the findings attached to the
`BuildVersion`, and a human queue for anything requesting `coins:spend`. Findings are public on
the build page — a security report a member can read is worth more than a badge.

---

# Pillar M — The platform gets a memory

## M1 — pgvector and embeddings — **M, and four other ideas depend on it**

### The gap

`prisma/schema.prisma:1065` has a generated `tsvector` with a GIN index, and
`lib/search/posts.server.ts:68` runs `websearch_to_tsquery` plus trigram for typos. That is a
good lexical search. It is the *only* search. `grep -in "vector|embedding" prisma/schema.prisma`
returns four hits, all of them either that `tsvector` or the word "vector" in a comment about
abuse. There is no pgvector extension, no embedding column, and no semantic retrieval anywhere.

Proposed at 08-05 as A5 and never built — and in the intervening six weeks the number of things
that want it has only grown.

### Design

- `pgvector` extension; an `Embedding` table keyed `(kind, entityId)` with the model id and
  dimension recorded, so a model change is a backfill and not a mystery. `BackfillCheckpoint`
  exists for exactly this shape of job.
- Embed on write through the outbox (`OutboxEvent`), not inline — a post must not wait on an
  embedding provider to appear in the feed.
- **Hybrid retrieval**: reciprocal-rank fusion over the existing `ts_rank` result and the vector
  result. Never replace lexical with semantic; an exact-title match must stay first.
- Kinds to cover first: posts, library documents, news articles, blog posts, game and app catalog
  entries, and builds.

### What it unlocks

M2 (recommendation), M3 (member memory), B3's discovery shelves, L1's programming suggestions,
duplicate detection for `FeatureRequest`, and "more like this" on every long-form surface. Five
consumers, one dependency — which is the definition of infrastructure worth building before the
features that need it.

## M2 — One recommender behind games, apps, feed and library — **M**

Today: `lib/explore.server.ts` ranks explore, `lib/social/follow-graph.server.ts` suggests people,
`lib/sidebar-data.ts` decides what the sidebar shows, and the games and apps catalogs are ordered
by hand. Four surfaces, four hand-rolled orderings, no shared signal — and `FeedSignal`
(schema:7214) collects exactly three kinds of feedback (`less_author`, `mute_tag`, `follow_tag`)
which only the feed consumes.

Build one `lib/recommend/` service: candidate generation (recent, popular, followed, semantically
near via M1), scoring against a per-member profile assembled from `Activity` (schema:7803) and
`FeedSignal`, then diversification so a single interest cannot take a whole rail. Every surface
calls it with a slot type. One place to improve, one place to explain (M4), one place to test.

## M3 — One member memory the AI surfaces share — **M**

`lib/ai/` has `coach.server.ts`, `recap.server.ts`, `catch-up.server.ts`, `summarize.server.ts`
and `lib/persona-chat.server.ts` — five surfaces that each rebuild their idea of the member from
scratch on every call. The assistant does not know you just finished a season, the coach does not
know what you asked the assistant, and the recap re-derives what the coach already computed.

A `MemberMemory` store: durable, inspectable, member-editable facts (preferred games, active
goals, recent milestones, stated preferences), written by the surfaces that learn them and read by
all of them. **Member-editable and member-deletable is not optional** — a memory the member cannot
see is a liability, and `lib/account-lifecycle.ts` already establishes that everything about a
member must be exportable and erasable.

## M4 — "Why am I seeing this", and controls that mean it — **S**

Once M2 exists, every recommended item can carry its reason ("you played Slice It", "three people
you follow saved this"), and every reason can carry a control that writes a `FeedSignal` — which
today has three kinds and should have the handful M2's scoring actually reads. Small, cheap, and
the thing that makes an algorithmic surface feel operated rather than done to you.

---

# Pillar L — The platform gets a *when*

Every surface here is on-demand. Nothing on this platform happens **at a time**, which is why
there is no reason to open it at 8pm rather than never. The pieces for a schedule exist and are
scattered: `CommunityEvent`/`EventRsvp`, `Tournament`, `ScheduledPost`, `DailyPuzzle`,
`DailyWheelSpin`, `ArcadeStreak`, the RMHTube rooms, `Space`.

## L1 — The programming grid — **M**

One model (`ScheduledSlot`) and one page: what is on today and this week. Daily puzzle drops, the
tournament slate, community events, a featured build (B3), a premiere (L2), the weekly company
report (W6). Members subscribe to slot types and get a reminder through the existing push and
notification tiers; `lib/events-ics.ts` already emits calendar files, and the 08-05 B24 timezone
work applies directly.

The grid is also the platform's own editorial surface — the answer to "what should I do here",
which right now the radial hub answers with 40 equally-weighted doors.

## L2 — Premieres and watch parties as first-class objects — **M**

RMHTube has rooms, sync and chat (`RmhTubeRoom`, and the sync path was rewritten in `#821`).
A premiere is that plus a start time, an RSVP, a feed announcement and a grid slot. Same for a
**tournament finals watch party** once P3 makes matches spectatable. The infrastructure is built;
what is missing is the scheduled, announced, collective version of it.

## L3 — One season across the platform — **M**

`UserSeasonProgress`, `AppSeasonStat`, `QuestChainProgress`, `UserQuest`, `lib/battlepass/season.ts`
and `lib/xp/` all exist, per-app. A platform season ties them: one calendar, one track, progress
from *any* surface — a ranked win (P5), a published build (B3), a venture held a full week (W3), a
library document finished. It ends with a settlement and a `/wrapped` (which already exists) that
has something to summarise.

This is also the mechanism that makes the conglomerate legible: a season themed on one venture
sends members to the microsites they currently have no reason to open.

## L4 — A live-ops console — **M**

Once there is a grid, someone has to run it. An admin surface (the `/admin` tier exists) for
scheduling slots, promoting a build, triggering the company tick, adjusting a queue's widening
bands and a venture's yield cap, and killing any of it without a deploy. Every number in W and P
that is currently a constant in a file wants to be a row in this table — otherwise every balance
change is a deploy, and balance changes need to be hourly.

---

# Pillar K — The kit, before microsite #12

## K1 — The vertical kit — **M**

Eleven microsites shipped in six weeks, each with its own components directory:
`components/rebar-rutabaga/`, `components/rmh-datacenter/`, `components/rmh-capital/`,
`components/rmh-pmc/`, `components/rmhfashion/`, `components/rideshare/cars/`. Each rebuilt a
masthead, a hero, a reveal-on-scroll, a section grid and a contact block. The reveal primitive is
the clearest tell: `useReveal` is defined at `components/library/LibraryReveal.tsx:163` — inside
the *library* feature directory — so Rebar & Rutabaga wrote its own `Reveal.tsx` rather than
import a hook that lives somewhere it had no reason to look.

Before the twelfth: extract the kit. A `components/vertical/` set — masthead, hero, section,
stat row, capacity meter, CTA, contact — parameterised by a per-vertical token group in the way
`components/shared/app-theme.css` already parameterises the `--app-*` tier. Rebar & Rutabaga's
Scandinavian daylight palette (`#860`) and the datacenter's dark industrial one are then two
token sets, not two component trees.

The test: **microsite #12 should be a content file and a token block**, and W1's reservation panel
should drop into any of them.

## K2 — One microsite SEO contract — **S**

`3fcf074` ("Classify /breaches in the sitemap, so main's own coverage test passes again") and
`16c4308` (the same for `/sohumbum2`) are the same commit twice: a new top-level route broke the
sitemap coverage test and was patched by hand. The coverage test is doing its job — the fix is
that a vertical registered in the kit should register its sitemap classification, canonical, OG
card and locale coverage **in the same declaration**, so the third occurrence of that commit never
gets written.

---

## §2 — Sequencing

A phase is an order, not a list.

**Weeks 1–2 — the free wins and the foundation.**
P1 (party registry), W1 (reservations), **W8 (responsible play)**, W7 (supply audit),
K2 (SEO contract), M4 scaffolding.
Start M1 (pgvector) immediately, because four later items block on it.

**Weeks 3–6 — the services.**
P2 (queue), P4 (replay adoption), M1 lands and M2 follows, K1 (the kit), L1 (the grid).

**Weeks 7–10 — the depth.**
P5 (seasons), P3 (spectate), B1+B2 (manifest and SDK), W2 (compute sink), L2 (premieres),
M3 (memory).

**Weeks 11+ — the swing.**
W3 (venture stakes) with W6 behind it, B3+B5 (store and review), L3 (platform season),
P6/P7/P8 as the multiplayer tier matures, L4 to run all of it.

Two gates worth stating as gates rather than intentions:

- **W3 does not start until W8 has shipped and W7's audit is written down.** Issuing stakes against an economy whose
  net issuance nobody has measured is the one mistake in this document that cannot be shipped and
  then fixed.
- **B2 does not start until B1's sandbox posture is committed and tested.** Capabilities before
  the permission model is how a platform gets an incident instead of an ecosystem, and `/breaches`
  exists because this repo already believes in writing those up honestly.

## §3 — What this document deliberately leaves alone

- **New games and new apps.** Twenty-three and twelve. The bottleneck is not catalogue size.
- **The AI catalogue from 08-05.** The seam shipped; the remaining items there are still valid and
  still cheap, and they do not need re-proposing.
- **The QoL list from 08-05 §3 and the parity gaps from 08-04.** Both remain the right backlog for
  the gaps between these pillars. Nothing here supersedes them — in particular I1 (recycle bin) and
  H1 (DM edit/unsend) are still the cheapest high-severity items on the platform.
- **Anything requiring real-money payouts.** Stripe memberships in, coins throughout, no path out.
  W3 makes that rule load-bearing rather than incidental.
