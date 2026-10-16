# Feature ideas for every surface — 170 new ones, 15 with template code

_2026-10-12. Scope: every part of the site — feed, messaging, profiles,
communities, the arcade and each game, each app, economy, library/blog/news,
calendar, safety, developer platform, accessibility, i18n, mobile, delight,
AI and ops. Many ideas are lifted from other sites; each one says where from._

## §0 — How to read this

**What is new here.** The plans directory already holds ~400 ideas
(`2026-07-15-cross-system…`, `2026-07-31-feature-gap…`,
`2026-08-03-feature-generation…`, `2026-08-04-*`, `2026-08-05-next-100…`,
`2026-09-19-next-phase…`, `2026-10-10-ux-delight…`). Their headings were read
before writing this, and every idea below was grepped against the tree on
2026-10-12. Anything already shipped or already specced is left out:
reply controls, custom status, saved searches, flashcard generation, API
usage, webhook redelivery, tournaments, wagers, spectating, clips, recaps,
recommendations, badges, link-in-bio, the request board and so on. Where an
idea extends something that exists, it names that thing.

**Template implementations.** Fifteen ideas (marked **▣ template**) come with
a working core: a pure, client-safe module in that feature's own `lib/`
directory, holding the algorithm the feature depends on. These are the parts
that are easy to get subtly wrong (a draw that can assign someone to
themselves, a rent split that is a cent off, a regex built from member input,
a Swiss round that pairs a rematch) and hard to fix after launch. The
schema, route and UI are left for whoever builds the feature, because those
are where the product decisions are. Four of the fifteen meet the suite's
mission-critical bar (`docs/testing.md` §What is not tested) and have
committed tests, because they decide where coins go or run on every post:

| Template                         | Idea | Test                                          |
| -------------------------------- | ---- | --------------------------------------------- |
| `lib/feed/thread-splitter.ts`    | X1   | —                                             |
| `lib/search/keyword-alerts.ts`   | A6   | `lib/search/__tests__/keyword-alerts.test.ts` |
| `lib/profile/webring.ts`         | P6   | —                                             |
| `lib/tournaments/swiss.ts`       | E4   | `lib/tournaments/__tests__/swiss.test.ts`     |
| `lib/rmhstudy/exam-planner.ts`   | F4   | —                                             |
| `lib/rmhladder/pay.ts`           | F7   | —                                             |
| `lib/homes/rent-split.ts`        | F10  | —                                             |
| `lib/rmhtube/bingo.ts`           | T2   | `lib/rmhtube/__tests__/bingo.test.ts`         |
| `lib/economy/savings-goal.ts`    | C1   | —                                             |
| `lib/gifting/secret-santa.ts`    | G3   | `lib/gifting/__tests__/secret-santa.test.ts`  |
| `lib/predictions/calibration.ts` | G7   | —                                             |
| `lib/library/text-anchor.ts`     | L1   | —                                             |
| `lib/creator/readability.ts`     | L4   | —                                             |
| `lib/schedule/availability.ts`   | K1   | —                                             |
| `lib/spaces/slow-mode.ts`        | S3   | —                                             |

The other eleven were exercised by a throwaway test file during development
(45 assertions, all green) that was then deleted, per the suite's scope rule.
Each module's header comment is the spec: why the feature exists, where it
comes from, and the decisions inside it.

**Sizes.** S = a few days, one surface. M = a week or two, schema + API + UI.
L = multi-week or new infrastructure.

**Conventions every idea inherits** (from the root `CLAUDE.md`):
`defineHandler` routes, zod input, `--site-*` / `--app-*` tokens and glass
roles, `t()` strings, `awardCoins()` as the only coin faucet, `.server.ts`
for anything touching Prisma, nothing new on the first-paint path.

## §1 — Twelve to start with

Ranked by payoff over cost, with the template already carrying the hard part:

1. **K1 Availability polls**: every community, study group and tournament needs a time, and today a reply thread is the only way to find one.
2. **E4 Swiss tournaments**: every entrant plays every round. `bracket.ts` only has single elim and round robin.
3. **A6 Keyword alerts**: the push half of saved searches.
4. **X1 Thread composer**: the one composer feature every modern feed has.
5. **S3 Slow mode + raid protection**: four chat surfaces, zero rate controls a host can set.
6. **L1 Highlights & margin notes**: the library becomes somewhere you read, not only a shelf.
7. **F7 Pay normalization**: RMHLadder becomes sortable by pay.
8. **T2 Watch-party bingo**: a second-screen game for every RMHTube room.
9. **G3 Gift exchange**: a seasonal event built entirely on existing gifting.
10. **P1 Top Four**: cheapest profile upgrade with the biggest identity payoff.
11. **E2 Backlog & play status**: turns the arcade into a library people curate.
12. **Z5 Community pixel canvas**: the single most-shared community event format on the web.

---

## X — Feed & posting (RMHarks)

- **X1 · Thread composer** (S) **▣ template** — _from Typefully, Threads._ Write one long draft; the composer previews it as N posts under `MAX_RMHARK_LENGTH`, each ending `k/N`, cut at paragraph → sentence → word boundaries, with `---` as a manual break. Publishes as a self-reply chain. Template handles the cut points, surrogate-safe hard cuts and the suffix-width fixpoint (N going from 9 to 10 changes the budget).
- **X2 · Hidden replies** (S) — _from X, Instagram._ The author can collapse any reply under "Hidden replies (3)". Softer than blocking or reporting; uses the existing reply-control module (`lib/feed/reply-control.server.ts`).
- **X3 · Context notes** (L) — _from X Community Notes._ Members propose a note on a misleading post. It only shows once it has been rated helpful by raters who usually _disagree_ with each other (bridging-based ranking). Needs the M1 embeddings or a simple rater-agreement matrix.
- **X4 · Question of the day** (S) — _from Threads prompts, Tumblr "Answer Time"._ A daily site prompt; answers form one browsable thread and count toward the daily streak (`lib/streak.server.ts`).
- **X5 · Post series** (S) — _from Medium and Substack series._ Link posts into a named, ordered series with prev/next on each post and a "follow series" button that notifies on new parts.
- **X6 · Take meter** (S) — _from Kialo-lite polls._ The author marks a post as a take; readers vote agree/disagree and only see the split after voting. Uses the poll counting in `lib/feed/poll-count.ts`.
- **X7 · "You're all caught up" divider** (S) — _from Instagram._ A marker where the last session's unseen items end, so scrolling past it means you've seen everything new.
- **X8 · Post expiry & auto-delete** (S) — _from Mastodon auto-delete, Snapchat._ A per-post TTL (1h–7d) and an account setting to auto-delete posts older than N months, with bookmarked and pinned posts kept.
- **X9 · Bookmark notes** (S) — _from Pocket, Raindrop._ A private note on any bookmark ("why I saved this"), searchable from `/bookmarks`.
- **X10 · Quote tree** (S) — _from Bluesky's quotes view._ A "Quotes" tab on each post showing every quote-post, nested when quotes are themselves quoted.
- **X11 · Dead-link rescue** (M) — _from archive.today, Wikipedia's IABot._ A weekly job re-checks unfurled links. When one 404s, the card swaps to its Wayback snapshot and says so. Fetches go through `safeFetch`.
- **X12 · "Require alt text" mode** (S) — _from Mastodon._ An account toggle that blocks posting images without alt text, plus an `ALT` chip on images that have it. Pairs with the existing AI alt-text suggestion idea (L1 in 08-04).

## A — Discovery, search & alerts

- **A1 · Surprise me** (S) — _from StumbleUpon, Wikipedia Random._ One button that drops you into a random game, app, library item, build or well-liked post you haven't seen.
- **A2 · Why it's trending** (S) — _from X trend context._ Each trending tag gets a card: when it started, the three posts that started it, and growth versus its baseline.
- **A3 · Today on RMH** (M) — _from Techmeme, Google News._ A generated daily front page: top posts, new builds, records broken, tournament results, news. One URL, cacheable, and it gives the site a reason to be checked daily.
- **A4 · Custom feeds** (M) — _from Bluesky feed generators._ A member defines a feed (tags + people + keywords + post kinds), gets a column for it, and can publish it for others to subscribe to.
- **A5 · On this day** (S) — _from Facebook Memories, Google Photos._ Your own posts, PBs and moments from this date in past years, opt-in, at the top of notifications once a day.
- **A6 · Keyword alerts** (S) **▣ template** — _from Google Alerts, Reddit keyword notifications._ "Notify me when anyone posts 'slice it charts' but not 'leak'." Case/accent-insensitive whole-word and phrase matching, `-exclusions`, `#tag` form, at most 10 alerts. Member input never becomes regex syntax (ReDoS on the fan-out path). The fan-out hook is the existing notification bus.
- **A7 · Watch anything** (M) — _from GitHub watch levels._ Watch a leaderboard (notify when someone passes you), a market item, a library item, a build, or a community, at "everything / important / nothing" levels.

## M — Messaging & group chat

- **M1 · Chat folders** (S) — _from Telegram._ User-defined folders ("Friends", "Tournament", "Unread") as tabs over the DM list.
- **M2 · Saved Messages** (S) — _from Telegram._ A note-to-self conversation for links, drafts and media, shown pinned at the top.
- **M3 · Disappearing messages** (M) — _from Signal, WhatsApp._ A per-conversation timer (1h / 1d / 7d). Expiry is enforced at read time like custom status, and a sweep job deletes the rows.
- **M4 · Slash commands** (M) — _from Discord, Slack._ `/roll 2d6`, `/flip`, `/poll`, `/gif`, `/remind`, `/tip 50` in DMs and group chats, with a typed command registry shared with `lib/shortcuts/registry.ts`.
- **M5 · Shared checklists** (S) — _from WhatsApp lists, Messenger plans._ A message that is a checklist anyone in the chat can tick, for "who's bringing what" and game-night prep.
- **M6 · Pinned messages & shared media** (S) — _from Telegram._ RMHTube chat already pins. Bring pinning to DMs and group chats, plus a per-chat gallery of every image, link and file sent.
- **M7 · Threads in group chats** (M) — _from Slack._ Reply in a side thread so a busy group chat doesn't bury the side conversation.
- **M8 · Receipt & presence privacy** (S) — _from WhatsApp._ Per-conversation toggles for read receipts, typing indicators and last-seen, each reciprocal (turning one off hides others' from you too).
- **M9 · Chat themes** (S) — _from Messenger._ A per-conversation accent and wallpaper chosen from token-safe presets, visible to everyone in the chat.
- **M10 · Forward labels & limits** (S) — _from WhatsApp anti-virality._ A "Forwarded" label, and a "forwarded many times" label once a message has hopped more than 5 times, with forwarding of those limited to one chat at a time.

## P — Profiles & identity

- **P1 · Top Four** (S) — _from Letterboxd._ Four favourite games, apps, albums or books pinned on the profile. Cheap to build and says a lot about the person.
- **P2 · /now section** (S) — _from nownownow.com._ A longer "what I'm doing now" block than custom status allows, with a "last updated" stamp that greys out after 60 days.
- **P3 · Name pronunciation & pronouns** (S) — _from LinkedIn._ A 5-second recorded pronunciation and a pronouns field, both optional and shown in the profile header and mention hovercards.
- **P4 · Local time** (S) — _from Slack._ "It's 2:14am for Ana" in DMs and on profiles, from an opt-in timezone. It prevents a lot of late-night pings.
- **P5 · Stamp wall** (S) — _from deviantArt stamps, Neocities 88×31 buttons._ Collectible tiny badges members design and others add to their profile wall. Retro, cheap, very shareable.
- **P6 · Webrings** (S) **▣ template** — _from the indie web._ Member-run rings ("pixel artists") with a `← prev · ring · next →` strip on each member's profile plus a random hop. Template: stable join-order ring, and navigation that skips private, departed and blocked members so a hop never lands on a profile you can't see.
- **P7 · Profile song** (S) — _from MySpace._ An RMHMusic track preview on your profile. It never autoplays and plays on tap.
- **P8 · Skill endorsements** (S) — _from LinkedIn._ Members vouch for creator skills ("beatmaking", "pixel art", "level design"), weighted by the endorser's own work in that area.
- **P9 · Visitor counter** (S) — _from the 2000s web._ An opt-in retro hit counter widget, unique-visitor based via `hash-ip.server.ts`.
- **P10 · Profile card QR** (S) — _from Snapcodes, Linktree QR._ A downloadable QR/business-card image of your profile, rendered by the existing OG card pipeline.

## N — Communities

- **N1 · Community post flair** (S) — _from Reddit._ Community-defined flairs on posts ("Guide", "Bug", "Art"), filterable, with optional required flair.
- **N2 · Starboard** (S) — _from Discord starboard bots._ Posts that reach N ⭐ reactions get pinned to a community "hall of fame" tab.
- **N3 · Onboarding questions** (M) — _from Discord onboarding._ On joining, a few questions ("Which games do you play?") set roles and tailor the community feed.
- **N4 · AutoMod rules** (M) — _from Reddit AutoModerator._ A rules builder for community mods (account age, keywords, link domains, post kind) that can filter, flag or hold. Extends E1 (mod queue) from 08-03 rather than duplicating it.
- **N5 · Weekly challenge** (M) — _from Dribbble, r/photoshopbattles._ A prompt, a submission window, a voting window and a winner's flair. Works for art, builds, studio beats and photo mode.
- **N6 · Community census** (S) — _from Reddit community surveys._ An annual survey with aggregate-only results published as a page.
- **N7 · Top contributors** (S) — _from Discord and Stack Exchange._ A helpfulness leaderboard per community (accepted answers, starboarded posts, welcome replies), not post counts.
- **N8 · Sister communities** (S) — _from Reddit sidebars._ Mods link related communities; a "related" rail shows on each.

## E — Arcade-wide game systems

- **E1 · Daily mutator** (M) — _from Spelunky Daily, Hades Heat._ One game per day with one modifier and one global seed, one attempt that counts, and a leaderboard just for that day.
- **E2 · Backlog & play status** (S) — _from Backloggd, HowLongToBeat._ Mark games playing / finished / 100% / dropped / want-to-play, and show the community's median completion time on each game card.
- **E3 · Phone as controller** (L) — _from AirConsole, Jackbox._ Scan a QR on the big screen and your phone becomes a gamepad over the existing socket tier, for couch play in any game that implements the A2 input layer (08-04).
- **E4 · Swiss tournaments** (M) **▣ template** — _from chess, Magic, esports opens._ Everyone plays ⌈log2 n⌉ rounds, paired within score groups, never a rematch, at most one bye each, with Buchholz tiebreaks. The template adds a third format beside `bracket.ts`'s single elim and round robin. Its backtracking pairer has a step budget, and a bye that leaves an unpairable field falls through to the next candidate.
- **E5 · Bracket pick'em** (M) — _from March Madness brackets._ Predict a tournament bracket before it starts. Points for accuracy, a pick'em leaderboard, no stakes.
- **E6 · Achievement guides** (S) — _from TrueAchievements._ Community-written, voted tips per achievement, shown on the achievement's detail sheet.
- **E7 · Game jams** (M) — _from itch.io jams, Ludum Dare._ Theme reveal, submission window via User Builds, rating categories, results page. Brings people into the build tools.
- **E8 · Game-night rotation** (M) — _from Fall Guys show rotation, Jackbox nights._ A weekly scheduled lobby that rotates through party games every ~20 minutes, with a schedule slot in L1's programming grid.
- **E9 · Handicaps** (M) — _from golf, Mario Kart smart steering._ For unranked friendly matches, an optional handicap derived from the Elo gap (a head start, extra lives, a time bonus) via a per-game hook.
- **E10 · "What changed since you last played"** (S) — _from Steam news._ A per-game patch-notes sheet shown once on the next launch after an update.
- **E11 · Auto rivals** (S) — _from Need for Speed Autolog._ The game picks the friend (or stranger) just above you on each leaderboard and tells you when they beat your time.
- **E12 · Shareable seeds** (S) — _from roguelike seed sharing._ "Play my seed" links for the procedural games (Velum2099, Nightrail, Versecraft, Synapse Storm) with a per-seed mini-leaderboard.

## R — Per-game ideas

- **R1 · RMHBox audience mode** (M) — _from Jackbox Audience._ Hundreds of spectators vote on prompts and answers. Their votes count as one "audience" player.
- **R2 · RMHBox custom packs** (M) — _from Quiplash custom episodes._ Member-made prompt packs with a share code, reporting, and a curated "featured packs" shelf next to the static packs in `data/`.
- **R3 · Kowloon Knockout training room** (M) — _from Street Fighter training mode._ Frame data, hitbox overlay, input display, a dummy that records and plays back, and combo trials.
- **R4 · Rochester Offensive aim range** (S) — _from Valorant's range and crosshair codes._ A warm-up range with bot drills, and crosshair settings as a copy-paste code.
- **R5 · Neon Driftway livery editor** (M) — _from Forza._ Paint layers and decals on the car, saved as a shareable code, shown in multiplayer.
- **R6 · Isleworks island visits** (M) — _from Animal Crossing dream addresses._ Publish a read-only snapshot of your island. Visitors walk it and leave a postcard.
- **R7 · Forest Explorer garden visits** (M) — _from FarmVille neighbours._ Water a friend's real-time garden once a day. They get a small growth bonus and a note.
- **R8 · Farming Sim festivals** (M) — _from Stardew Valley._ Seasonal festival days with a one-day shop, a contest, and co-op farm tour codes.
- **R9 · Temple of Joy away ledger** (S) — _from Cookie Clicker._ A "while you were away" breakdown, plus an efficiency leaderboard (gladness per real hour) so idling well, not just long, ranks.
- **R10 · Dream Rift spell practice** (S) — _from Touhou spell practice._ Replay any bullet pattern you've reached on its own, with capture/attempt stats.
- **R11 · Gabriel's Horn table read** (S) — _from poker HUDs._ After a game, your bluff rate, call accuracy and "tell" stats against the table average.
- **R12 · Velum2099 contract board** (M) — _from Death Stranding's asynchronous play._ Players post a delivery route and their time. Others take the contract and try to beat it, and the record holder is credited on the route.
- **R13 · Versecraft seed gallery** (S) — _from AI Dungeon scenarios._ Rate and browse story seeds. "Continue this story" forks someone's seed with your own cast.
- **R14 · Synapse Storm custom storm** (S) — _from Aim Lab's custom tasks._ Pick which micro-challenges appear, to train a weakness, in an unranked mode.
- **R15 · User-made Connections grids** (M) — _from Puzzgrid._ Members author 4×4 grids; good ones (by solve rate and rating) get scheduled as the daily.
- **R16 · Void Breaker boss rush** (S) — _from every arena shooter._ Bosses back to back, a separate leaderboard, unlockable after the first clear.
- **R17 · Laundry Sort daily basket** (S) — _from Wordle._ One seeded basket a day, one attempt, a share grid.
- **R18 · Massive March signals** (M) — _from Dark Souls messages._ Leave short templated hints at puzzle spots for later players, who rate them. Fits a game about telling someone what you can see.
- **R19 · House Always Wins NG+** (S) — _from metroidvania New Game+._ Remixed ghost placements and one new House rule on a second run.
- **R20 · Altair codex** (S) — _from Mass Effect's codex._ Lore entries unlock as you find them, can be shared as cards, and the full codex is a profile completion stat.
- **R21 · Nightrail trick of the week** (S) — _from skate. clips._ Members submit replay snippets of tricks and the community votes. Builds on the replay adoption push (P4 in 09-19).
- **R22 · Bums Rush party modifiers** (S) — _from Gang Beasts custom rules._ Low gravity, sticky hands, giant heads, as lobby toggles for unranked rooms.

## F — Full apps

- **F1 · RMHTube timed comments** (M) — _from Niconico danmaku, SoundCloud timed comments._ Comments pinned to a timestamp that replay at that moment for later viewers of the same media, with a toggle to hide them.
- **F2 · RMHMusic mixtape exchange** (S) — _from mixtape swaps._ Curate 10 songs on a theme, and the G3 draw assigns whose mixtape you get. Reuses the gift-exchange template.
- **F3 · RMHType code & lore modes** (S) — _from SpeedCoder, TypeRacer's quote library._ Type real code snippets (indentation-aware) or passages from the site library.
- **F4 · RMHStudy exam planner** (S) **▣ template** — _from MyStudyLife, Notion exam templates._ Exam date + topics + confidence + hours per weekday → a day-by-day plan in 30-minute blocks, interleaved, with the last day reserved for review, and a shortfall in hours when it doesn't fit. Hooks into existing room timers to start a planned block.
- **F5 · RMHStudy body-doubling match** (M) — _from Focusmate._ Book a 25/50-minute slot and get matched with another member studying the same subject. Uses the K1 availability model.
- **F6 · RMHLadder referral board** (M) — _from Blind referral threads._ Members at a company offer referrals. Applicants request with a short pitch, and the referrer accepts or passes, with rate limits on both sides.
- **F7 · RMHLadder pay normalization** (S) **▣ template** — _from Levels.fyi._ Parse "$45/hr", "$80K–$95K", "£3,000 a month", "$8,500/mo stipend" into an annualized range with currency, so jobs sort and filter by pay. Refuses rather than guesses on ambiguous strings, and labels internships as "annualized".
- **F8 · RMHLadder interview reports** (M) — _from Glassdoor interviews._ Structured community reports per company/role: rounds, question types, outcome, difficulty. Distinct from G2's AI interview prep (08-04).
- **F9 · RMHHomes roommate match** (M) — _from SpareRoom, Roomster._ A short lifestyle quiz (sleep, guests, cleanliness, pets) and a compatibility score on roommate-wanted listings.
- **F10 · RMHHomes fair rent split** (S) **▣ template** — _from Spliddit, Splitwise._ Rent = an even shared part + a private part split by room points (area × feature multipliers: private bath, no window…). Whole cents that always sum to the total via largest-remainder rounding, with every number explained in the UI.
- **F11 · RMHCalculator notebook mode** (M) — _from Soulver, Numi._ A plain-text notebook where every line evaluates locally with units and variables (`rent = $1,450 / 3`, `5 ft in cm`). No model call needed for arithmetic.
- **F12 · Studio sample flip** (M) — _from Splice challenges, r/makinghiphop._ A weekly sample, a submission window, and community voting on the flips.
- **F13 · Studio live jam** (L) — _from BandLab Live._ Two to four people edit one project in real time over the socket tier, with per-track locks.
- **F14 · RMHCode runnable embeds** (M) — _from CodePen embeds._ Post a snippet that runs in a sandboxed iframe inside the feed card.
- **F15 · Marathon planner for any franchise** (M) — _from Dunesday itself._ Generalize the MCU+Dune scheduler to any watch-order list (Star Wars, Ghibli, a member's own list) with a deadline.
- **F16 · RMHdle custom words** (S) — _from Wordle custom links._ Challenge a friend with a word you pick, via an obfuscated link, plus hard mode.
- **F17 · RMHTube watch later** (S) — _from YouTube Watch Later._ A personal queue you can add to from anywhere and dump into any room you host.

## T — Together & live

- **T1 · Watch-party predictions** (S) — _from Twitch predictions._ The host asks "does the hero survive?". Viewers pick with points (not coins), and points pay out to a room leaderboard.
- **T2 · Watch-party bingo** (S) **▣ template** — _from stream bingo._ Each viewer's 5×5 card is a pure function of (pool, room seed, user), so cards are never stored. The host calls squares, and wins are verified on the server by regenerating the claimant's card, never trusting the client's line.
- **T3 · Most-replayed strip** (M) — _from YouTube's "most replayed" graph._ Aggregate reactions and rewinds per second across rooms into a heat strip on the seek bar.
- **T4 · Community radio** (M) — _from turntable.fm, plug.dj._ A 24/7 room with a DJ rotation: members queue a track, take the decks in turn, and listeners vote "woot/meh".
- **T5 · Commentary tracks** (M) — _from RiffTrax, director's commentary._ Record a text or voice commentary synced to a video for others to watch along with later.

## C — Coins, store & market

- **C1 · Savings goals** (S) **▣ template** — _from Monzo pots._ Pick a store or market item as a goal, see a progress ring and an ETA. The projection uses an exponentially weighted _net_ (earned − spent) daily rate with a 7-day half-life. A goal is a view over the balance and never locks coins, so it never touches the ledger.
- **C2 · Rotating daily shop** (S) — _from Fortnite's item shop._ A deterministic daily rotation of featured cosmetics with a countdown. Scarcity of attention, not of supply.
- **C3 · Build-your-bundle** (S) — _from Humble Choice._ Pick any 3 of 8 featured items for a bundle price.
- **C4 · Monthly coin statement** (S) — _from bank statements._ A monthly CSV/PDF of every `CoinTransaction` by category (earned, spent, gifted, staked) with opening and closing balance.
- **C5 · Community goal pots** (M) — _from Kickstarter's all-or-nothing._ Members pledge coins toward a site-wide unlock (a new theme, a new RMHBox pack). If the goal isn't hit by the deadline every pledge is refunded through the ledger.
- **C6 · Loadout presets** (S) — _from Fortnite lockers._ Save sets of equipped cosmetics and switch between them in one tap.
- **C7 · Scheduled gift delivery** (S) — _from Steam gift scheduling._ Send a store gift that arrives on a date (a birthday, a holiday), wrapped, with an unwrap moment.
- **C8 · Wishlist price-drop alerts** (S) — _from Steam wishlists._ Notify when a wishlisted store or market item drops in price or enters the daily shop.

## G — Gifting, events & predictions

- **G1 · Birthdays** (S) — _from Facebook birthdays._ An opt-in birthday (month/day only). Followers get a nudge, the profile gets confetti for a day, and C7 gifts can be scheduled for it.
- **G2 · Advent calendar** (S) — _from game advent events._ December doors that unlock a cosmetic or a small coin grant per day through `awardCoins()`.
- **G3 · Gift exchange draw** (M) **▣ template** — _from Elfster._ A group opts in, and each member is drawn exactly one recipient. Nobody gets themselves, exclusions are honoured ("not my roommate"), and a single cycle is preferred so nobody just swaps. Seeded and deterministic, so a disputed draw can be re-run from the stored seed. Gifts flow through existing coin gifting.
- **G4 · Kudos** (S) — _from Slack HeyTaco, LinkedIn kudos._ Free, non-coin thank-you notes with a reason ("helped me with my chart"), shown on the profile.
- **G5 · Forecasting seasons** (M) — _from Metaculus tournaments._ A fixed question set each season, scored on accuracy with points, not coins, so skill shows without stakes.
- **G6 · Positions on comments** (S) — _from Manifold._ Comments on a market show the commenter's position at the time they commented.
- **G7 · Calibration profile** (S) **▣ template** — _from Metaculus, Manifold._ Brier score, a decile calibration curve (forecast vs observed), and a Brier skill score against always saying 50%, flagged as "not enough data" under 20 resolved forecasts. Profit rewards having coins. Calibration rewards being right about how sure to be.

## L — Library, blog & news

- **L1 · Highlights & margin notes** (M) **▣ template** — _from Kindle, Medium, Hypothesis._ Highlight passages and add private or public notes. Anchors survive edits: the template stores the exact quote with 32 chars of context on each side, re-anchors by position, then by unique match, then by best context match, and _orphans_ rather than guesses when the text is gone.
- **L2 · Sidenotes & hover footnotes** (S) — _from Gwern.net, Tufte CSS._ Footnotes render in the margin on wide screens and as popovers on phones.
- **L3 · Reading challenge** (S) — _from Goodreads' yearly challenge._ Set a yearly books or pages goal and track it from the library reader.
- **L4 · Readability meter** (S) **▣ template** — _from Hemingway Editor._ In the blog, news and community-page editors: reading time (238 wpm), a Flesch–Kincaid grade (English only; hidden rather than wrong elsewhere), and the specific 30+-word sentences to fix. Markdown, code and link URLs are excluded from the count.
- **L5 · News story timelines** (M) — _from Google News Full Coverage._ Cluster related articles into one story with a timeline, using M1 embeddings or tag overlap.
- **L6 · Lore glossary links** (S) — _from wiki hovercards._ Known lore terms auto-link to a glossary popover in posts, news and library pages, at most once per term per page.
- **L7 · Shelves** (S) — _from Goodreads._ Want-to-read, reading and read shelves for library items, public or private.
- **L8 · Popular highlights** (S) — _from Kindle._ An aggregate "N readers highlighted this" underline, built on L1 public highlights.

## K — Calendar & scheduling

- **K1 · Availability polls** (M) **▣ template** — _from When2Meet, Doodle._ A grid of slots in UTC rendered in each viewer's timezone, with yes / if-need-be answers and required attendees. The template computes the heat map and a ranked shortlist: required people present, then most available, then fewest "if need be", then earliest. Adjacent slots are merged into runs, and each run is ranked by its weakest slot.
- **K2 · Office hours booking** (M) — _from Calendly._ Creators publish bookable slots for feedback, coaching or co-op sessions, using the same slot model as K1.
- **K3 · Personal calendar feed** (S) — _from Google Calendar subscriptions._ One private ICS URL with every event you've RSVP'd, tournaments you've entered and scheduled game nights. Extends `lib/events-ics.ts`, which does single events today.
- **K4 · Recurring group events** (S) — _from Meetup._ Weekly or monthly events where an RSVP can carry over to the next occurrence and the host can rotate.

## S — Safety, moderation & trust

- **S1 · "Reconsider" nudge** (S) — _from Instagram and X reply prompts._ When AI triage scores a reply as likely hostile, ask "Want to review this before posting?" once, then post if the author insists.
- **S2 · Community verification levels** (S) — _from Discord._ Per community: verified email, account older than N days, or members of N minutes before posting.
- **S3 · Slow mode + raid protection** (S) **▣ template** — _from Twitch slow mode, Discord raid protection._ A per-user cooldown the host sets, an auto mode that engages on message bursts and relaxes after a calm period (never lowering the host's setting), and a first-message hold for brand-new accounts while auto mode is on. One class with injected time, so the Node hub enforces it and the composer shows the countdown.
- **S4 · Mod macros** (S) — _from Zendesk macros._ Saved moderator responses with variables, used when removing content or replying to appeals.
- **S5 · View as member** (M) — _from Stripe "view as"._ Admins see a read-only render of the site as a given member sees it (mutes, blocks, entitlements) to debug reports. Every use is written to `AdminAuditLog`.
- **S6 · Link warnings** (S) — _from Discord._ An interstitial for links to known-bad or first-seen domains, with the real destination shown in full.
- **S7 · Pile-on guard** (S) — _from Bluesky and X reply limits._ When a post gets a sudden burst of replies from non-followers, suggest limiting replies to followers for 24h, with one tap to accept.

## D — Developer platform

- **D1 · Test-mode keys** (M) — _from Stripe test mode._ `rmh_test_…` keys that hit the real API against a sandboxed, resettable data set, so integrations can be built without touching real accounts.
- **D2 · Stat badges** (S) — _from shields.io._ `/api/badge/<user>/<game>.svg` SVG badges (rank, PB, streak) for READMEs and other sites, cached at the edge.
- **D3 · Typed SDK** (M) — _from Stripe's SDKs._ Generate a TypeScript client from `lib/api/openapi.ts` and publish it, versioned with the API.
- **D4 · Bot accounts** (S) — _from Mastodon's bot flag._ Accounts driven by a key are labelled "automated", rate-limited as bots, and filterable from feeds.
- **D5 · Recipes** (M) — _from IFTTT, Zapier._ No-code "when X then Y" over the existing webhooks: "when I set a PB, post to my Discord", "when a market item drops below N, DM me".

## Y — Accessibility & i18n

- **Y1 · Text spacing override** (S) — _from WCAG 1.4.12._ A setting for line height, letter and word spacing beyond what the dyslexia theme sets.
- **Y2 · Reading ruler** (S) — _from Edge Immersive Reader._ A line-focus band that follows the caret or keyboard position in the library reader and long posts. Never cursor-tracked, per the design language.
- **Y3 · Pseudo-locale** (S) — _from Android pseudolocales._ A dev-only `en-XA` that wraps and lengthens every string, catching untranslated text and truncation before real translators do.
- **Y4 · Community translation portal** (M) — _from Weblate, Crowdin._ Members suggest and vote on translations for their locale. Accepted strings override machine translation in `locales/`.
- **Y5 · Format preferences** (S) — _from OS region settings._ 24h clock, week start and number format independent of UI language.
- **Y6 · Captions for cutscenes & trailers** (M) — _from console accessibility settings._ WebVTT captions with size and background options for every narrative game and game-card trailer.
- **Y7 · Plain-language legal summaries** (S) — _from plain-language policy summaries._ A reviewed, human-approved summary box at the top of privacy, terms and cookies pages.

## W — Mobile, PWA & wellbeing

- **W1 · Shake to report** (S) — _from Instagram._ On phones, a shake opens the feedback sheet with a screenshot attached. Opt-out, and off while a game is in focus.
- **W2 · Offline mini-game** (S) — _from Chrome's dino._ The offline page gets a tiny self-contained game with a local high score.
- **W3 · Ongoing-activity notifications** (S) — _from iOS Live Activities._ A persistent notification for a running study timer or an active match, updated in place.
- **W4 · Bedtime mode** (S) — _from Digital Wellbeing._ During quiet hours, an optional desaturated, dimmed theme tier.

## Z — Delight, old web & seasonal

- **Z1 · Seasonal skins** (S) — _from Google Doodles._ Light-touch site skins for real holidays, respecting reduced motion and all three themes.
- **Z2 · Site-wide hunt** (M) — _from ARGs, Google easter eggs._ Clues hidden across pages, games and news posts, with a badge for finishers and a leaderboard by completion time.
- **Z3 · Site museum** (S) — _from the Wayback Machine._ A timeline of past versions of the site with screenshots and the changelog of each era.
- **Z4 · Fortune cookie** (S) — _from Unix `fortune`._ One community-submitted, moderated one-liner a day on the home page.
- **Z5 · Community pixel canvas** (M) — _from Reddit r/place._ A shared canvas, one pixel per member per N minutes, running for a limited event window, with a timelapse at the end. Uses S3 slow mode for the cooldown.
- **Z6 · Photo of the day** (S) — _from Flickr Explore._ The best photo-mode capture or uploaded image each day, voted on, featured on the home page.
- **Z7 · Time capsule posts** (S) — _from FutureMe._ Write a post sealed until a date. It publishes itself then, using the existing scheduled-post path.
- **Z8 · April Fools mode** (S) — _from every big site._ One feature-flagged day of harmless silliness with a visible off switch.

## I — AI

- **I1 · "How do I play?"** (S) — _from game wikis._ An AI companion grounded in each game's own rules text and settings, answering rules questions in-game.
- **I2 · Release notes writer** (S) — _from GitHub's generated release notes._ Draft changelog entries from merged PR titles and bodies, for a human to edit before publishing to `whats-new`.
- **I3 · Devil's advocate** (S) — _from debate tools._ On a prediction market, the strongest argument for the side you _don't_ hold, generated on request with sources.
- **I4 · Group-chat game master** (M) — _from AI Dungeon multiplayer._ A persona that runs a dice-and-narrative game in a group chat, with M4 slash commands.

## O — Ops & admin

- **O1 · Cohort retention** (M) — _from Mixpanel._ Weekly signup cohorts × return rate in the admin dashboard, from data already in sessions and activity.
- **O2 · Targeted announcements** (S) — _from Intercom._ In-product announcements to a segment (new members, a game's players, a locale) with dismiss tracking.
- **O3 · Dead feature detector** (S) — _from product analytics._ RUM page views per route over 90 days. Routes nobody visits get flagged for the consolidation backlog.
- **O4 · Error inbox** (M) — _from Sentry._ Client errors grouped by fingerprint with "first seen in release" and a regression flag, over the existing `client-errors` beacons.
- **O5 · Experiments** (M) — _from GrowthBook._ A/B assignment on top of the feature-flag proposal (#4 in 07-31) with a significance readout. Only after flags exist.

---

## §2 — Count

| Section                 |   Ideas | Templates |
| ----------------------- | ------: | --------: |
| X Feed & posting        |      12 |         1 |
| A Discovery & alerts    |       7 |         1 |
| M Messaging             |      10 |         0 |
| P Profiles              |      10 |         1 |
| N Communities           |       8 |         0 |
| E Arcade systems        |      12 |         1 |
| R Per-game              |      22 |         0 |
| F Apps                  |      17 |         3 |
| T Together & live       |       5 |         1 |
| C Coins & store         |       8 |         1 |
| G Gifting & predictions |       7 |         2 |
| L Library & news        |       8 |         2 |
| K Calendar              |       4 |         1 |
| S Safety                |       7 |         1 |
| D Developer             |       5 |         0 |
| Y Accessibility & i18n  |       7 |         0 |
| W Mobile & wellbeing    |       4 |         0 |
| Z Delight               |       8 |         0 |
| I AI                    |       4 |         0 |
| O Ops                   |       5 |         0 |
| **Total**               | **170** |    **15** |

## §3 — Building on a template

Each template is the algorithm, not the feature. To ship one:

1. **Schema.** Add the model(s) the header comment implies (an availability
   poll + responses, a gift exchange with its stored seed, a highlight with
   its `TextAnchor` columns), with a migration (`pnpm db:migrate`).
2. **Route.** A `defineHandler` route that validates input with zod and calls
   the template. Server-side verification (bingo wins, gift draws, Swiss
   pairings) runs the template on the server, never trusting a client result.
3. **UI.** Under `components/<feature>/`, with glass roles and `t()` strings,
   lazy-loaded off the first-paint path. Run `pnpm i18n:extract`.
4. **Tests.** Add tests only when the feature meets one of the five criteria
   in `docs/testing.md`: money moves, saved data, private state, auth or
   leaderboard integrity, service health. The four templates already tested
   meet it. The rest likely will once they're wired to coins or leaderboards.
