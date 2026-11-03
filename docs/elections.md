# Elections hub (`/elections`)

A standalone neo-brutalist page for U.S. general elections: live results, race
calls, a state tile map, every race, poll-closing times, a paint-your-own-map
predictor, AI summaries, live chat, stream embeds, share cards and coin markets.
It works for any cycle: Election Day is computed (the Tuesday after the first
Monday of November, even years), so 2028 and later need no code change.

## Data source (read this before election night)

Results, ratings, race calls, candidate rosters and chamber tallies come from
one **keyless, login-free static JSON feed** — one file per office per Election
Day:

    https://static01.nyt.com/elections-assets/pages/data/<YYYY-MM-DD>/results-<office>.json
    offices: president (presidential years) · senate · governor · house

This is an **unofficial** file, not a contract. It can change shape, lag, or
vanish. That is why:

- `lib/elections/nyt.ts` is the only adapter, is defensive (never throws on odd
  input) and is tested against feed-shaped fixtures. Everything above it speaks
  our own `Race` / `ChamberControl` / `ElectionSnapshot` types
  (`lib/elections/types.ts`). Swapping the source means rewriting that one file.
- Only a **404** means "not published yet" (the page then says ballots are not
  out). A 403/5xx is an *error*: the last good snapshot keeps being served
  (`source.server.ts`), never "no ballots".
- The UI always labels calls as projections, and the footer points to official
  state results and vote.gov.

Other free sources considered and rejected: Google Civic (needs a key), OpenFEC
(`DEMO_KEY` rate-limited), Wikipedia (no structured live results).

## Moving parts

| Piece | Where |
| --- | --- |
| Calendar, phases, countdown, cycle parsing | `lib/elections/calendar.ts` |
| Feed → our types | `lib/elections/nyt.ts` |
| Fetch + cache (single-flight; 20s live / 5min idle; stale on error) | `lib/elections/source.server.ts` |
| Summaries, facts for AI, fingerprint | `lib/elections/summary.ts` |
| Tile map model, predictions (+ compact share token) | `map-model.ts`, `tilegrid.ts`, `predict.ts` |
| Feed announcement card | `lib/elections/feed.ts` (+ `feed.server.ts`, `lib/feed/timeline.ts`) |
| AI summary + "ask the desk" | `lib/elections/ai.server.ts`, prompts `election-summary` / `election-ask` |
| Chat (ephemeral, SSE over the realtime bus) | `lib/elections/chat*.ts`, `/api/elections/chat[/stream]` |
| Stream embeds | `lib/elections/streams.ts` (built on RMHTube's `parseMedia`) |
| Coin markets | `lib/elections/markets*.ts`, resolvers in `lib/predictions/resolvers.server.ts` |
| OG cards | `/api/og/elections` (board, or `?p=` shared map) + static `/elections` section card |
| API | `GET /api/elections`, `/summary`, `/streams`, `/markets`; `POST /ask`, `/chat` |

## Operating it

- **`ELECTIONS_STREAMS`** — JSON array `[{"label":"…","url":"https://…"}]` of
  featured YouTube/Twitch streams. Live URLs change every election, so they are
  config, not code. Invalid entries are dropped.
- **`ELECTIONS_RESULTS_BASE`** — override the feed base (same
  `<base>/<date>/results-<office>.json` layout). Point it at a local mirror to
  rehearse: copy the pre-election files, or generate a simulated live night from
  them (votes, `outcome.won`, `partyControlData`), and serve with any static server.
- AI features need the usual `DEEPSEEK_API_KEY`; without it the page falls back
  to deterministic bullets and "ask" returns 503.
- Markets are seeded by the existing auto-market tick
  (`POST /api/internal/predictions-tick`, or the opportunistic tick on the
  markets GET) from 45 days before Election Day until trading closes.

## Safety rules (do not loosen without thinking)

- **Markets:** trading closes noon ET on Election Day (before any polls close);
  settlement is not eligible until noon ET the next day; resolvers return `null`
  (market stays open) for anything not mathematically decided, a derived tally,
  or a non-feed snapshot. A wrong settlement pays coins out irrecoverably.
- **Chat:** signed-in write, 8 msgs / 20s, 280 chars, **no links** (phishing and
  fake-results sites), invisible/bidi characters stripped, admin delete. Nothing is
  persisted.
- **OG cards:** nothing free-text from the URL is ever drawn; only computed numbers.
- **AI:** grounded in a computed facts JSON, wrapped with `asData()`, shared by
  all viewers and regenerated only when the snapshot fingerprint changes (≤ 1 per
  90 s), so anonymous traffic cannot run up a bill. "Ask" is sign-in only and
  charged to the asker's budget.
- **Streams:** the iframe `src` is built from the parsed id on hosts the CSP
  already allows; nothing loads until the visitor clicks.

## Known limitations

- Race/candidate names in the UI are English (they are data, not UI strings).
- Governor chamber tallies are derived from called races only (the feed has no
  governor control table), and are labelled "called so far".
- Chat history is per web instance (a late-joining instance starts from the
  moment it subscribed) and is lost on restart, by design.
- `?cycle=2028` redirects once to `?cycle="2028"` (TanStack quotes numeric-looking
  strings); harmless, and the canonical URL is `/elections`.

## Phase 2: government sources, primaries, news, live events

- **Official count (NC State Board of Elections):** `lib/elections/sources/ncsbe*.ts`. Keyless precinct
  results published for *every* NC election date including primaries
  (`dl.ncsbe.gov/ENRS/<YYYY_MM_DD>/results_pct_<YYYYMMDD>.zip`; a missing date is a clean 404). Only
  federal and governor contests are carried; NC's *state* `HOUSE OF REPRESENTATIVES` contests are not ours.
  Validated against the real 2026-03-03 primary, 2024-03-05 primary and 2024-11-05 general
  (`ncsbe-real.test.ts`, opt-in: set `ELECTIONS_REAL_DATA_DIR`). The file has no calls, so a FINAL count is
  called by rule (plurality; >30% in a primary to avoid a runoff; ties never) and labelled "Final count",
  never "AP called". On a general night the same file cross-checks the feed per race (`official.ts`).
- **Primary days:** `?cycle=YYYY-MM-DD` opens any election day from the official source; control meters,
  predictor and markets only exist for generals.
- **Calendar:** primaries/runoffs/specials come from (1) nominees' headshot ids in the feed (keyless) and
  (2) the FEC election-dates API. Set **`FEC_API_KEY`** (free, api.data.gov/signup): `DEMO_KEY` is a shared
  40 calls/hour pool; a 429 backs off 15 minutes.
- **News wire:** public RSS only (`news.ts` lists the feeds). Headline + ≤200-char snippet, always linked to
  the publisher; never article bodies, never paywalled HTML.
- **Live events:** `events.ts` diffs consecutive snapshots into calls / flips / lead changes (≥5% in) /
  clinches / polls closing; `events.server.ts` publishes them on the realtime bus; `/api/elections/events/stream`
  is the SSE feed. Ids are deterministic (`call:<raceId>`), so a race is announced once.
- **Rehearsing:** `ELECTIONS_RESULTS_BASE` points the feed at a mirror, and **`ELECTIONS_TTL_MS`** forces the
  refresh interval (e.g. `4000`) so you can swap files in the mirror and watch calls arrive within seconds.

## Phase 3: watch rooms and the Briefing Room

- **Rooms** (`ElectionRoom`, `rooms*.ts`): *solo* is browser-only (localStorage); *private* is stored and
  reachable only by its 8-character code (32^8 ≈ 10^12, no ambiguous characters; the code is the capability);
  *public* is listed per election day. Host-only edits are pushed live to everyone in the room; 10 active rooms
  per account; rooms expire 4 days after Election Day (expired rows are removed on list reads).
- **Chat and reactions** are channel-addressed (a room, or the election's main room): ephemeral on the
  realtime bus, signed-in write, no links. Reactions are a closed set of 8 emoji. A room host can delete
  messages in their own room.
- **The Briefing Room** (`components/elections/room/`): a full-screen Radix dialog (focus trap, scroll lock,
  Escape) with up to four panes in five layouts. Panes: stream (YouTube/Twitch; several at once; loads only on
  click), race, **live graph** (vote share over the count, from `history.server.ts`), map, wire, chat, events.
  Race/graph panes can be pinned to a state, follow the map selection, or **auto-follow**: major calls, every
  call, polls closing, or everything. `follow.ts` holds a dwell time (20 s; 8 s for major events) so the pane
  never flickers; an event inside the hold is deferred, not lost. Only events that arrive live move a pane:
  opening a room mid-night never replays the evening.


## Live streams: auto-discovery

`/api/elections/streams` returns the configured `ELECTIONS_STREAMS` first, then any newsroom broadcast that is
live right now, found automatically (`lib/elections/stream-discovery*.ts`). Each channel in the pool
(`CHANNEL_POOL`: PBS NewsHour, ABC, NBC, CBS, AP, C-SPAN, Reuters, Sky, Bloomberg) is probed through its
`/channel/<id>/live` page, which is trusted only if it names that channel, says `isLive`, and agrees with its
own canonical video id. Results are cached 3 minutes; a failing channel just drops out.

| Env | Effect |
| --- | --- |
| `ELECTIONS_STREAM_CHANNELS` | Comma-separated extra YouTube channel ids (`UC…`) to probe. |
| `ELECTIONS_STREAMS_AUTO=0` | Turn discovery off (configured streams only). |

Twitch has no keyless "is it live" check, so Twitch streams stay configured/pasted. Embeds still load only after
a click.

## Friends leagues

`/elections` (Predict section) lets signed-in users start a **league**, share an 8-character code (or the
`?league=CODE` link), and compare painted maps. Everyone submits their map from the Predict painter; the
leaderboard scores each member's Dem/GOP calls against the races as they are called (`scorePicks`), ranked by
right calls, then fewer wrong, then earlier submission. **No coins are involved.** Maps freeze when the first
polls close on a general election day (`firstCloseAt`), so nobody can edit after seeing results. Limits: 10
leagues per owner, 50 members each. The code is the invitation: anyone with it sees the league's name and size,
only members see the board. Tables `election_league` / `election_league_member`
(`prisma/migrations/20261103170000_election_leagues`); API under `/api/elections/leagues`.

## Also on the page

- **What to watch** (competitive open races by poll-closing hour), **path to control** per chamber, **2024 baseline
  and swing** on race cards (`/api/elections/swing`; the free feed has 2024 but not 2022/2020), a **night
  timeline**, per-race **share cards** (`/api/og/elections?race=ID`), and a CORS-open **JSON summary**
  (`/api/elections/public`).

## Alerts

- **In the browser:** the Night section's Alerts panel asks for notification permission and then raises a
  notification for big moments, every call, and/or anything in followed states — only for events that arrive live
  while the page is open (history is never replayed). Choices are kept in `localStorage`. iPhone needs the page on
  the Home Screen first.
- **Discord (optional):** set `ELECTIONS_DISCORD_WEBHOOK` to a Discord webhook URL (only discord.com hosts over
  https are accepted) and calls, flips, control changes and polls closing are posted in batches every 5 seconds,
  with mentions disabled. Each web instance relays its own events, so run it on the active instance only.

## Small extras

Nail-biters (thin-lead counting races), My states (followed states at a glance, shared with the Alerts list),
local-time poll closings, an **Explain** button on race cards (signed-in; asks the Briefing Room about that race),
**Follow** on race cards, a chime and keep-screen-on toggle in Alerts, `?state=PA` deep links, the browser tab
title as a live scoreboard, and a formula-safe CSV of every race at `/api/elections/races.csv`.

## Ballot measures

`/api/elections/measures` lists every measure on the cycle's ballots — statewide amendments, propositions and
initiatives, plus **local** city and county questions (the feed marks those `coverage: county`) — with live yes/no
counts, the share each needs (`win_threshold`, e.g. 60% for some Florida amendments), whether it is passing at this
count, and the AP call. The results feed publishes one page per measure plus a "search" index; the index URL is
read from an office page's config (override with `ELECTIONS_MEASURES_INDEX_URL`). Pages are fetched with ETags
(304 when unchanged), 8 at a time, cached 45 s on election day. The page's **Measures** section shows the night's
tallies (passed/failed, passing/failing now, supermajority count), the closest measures, and filters by
statewide/local, state, text, and followed states.

## Other offices (down the ballot and local)

`/api/elections/offices` lists everything on the ballot that is neither a headline race nor a measure: attorneys
general, secretaries of state, treasurers, lieutenant governors, comptrollers, supreme court seats, mayors and
other local offices (the feed marks those `coverage: county`) — with candidates, parties, live counts and calls. It
reads the same index and per-page ETag strategy as ballot measures (`lib/elections/downballot*.ts`). The page's
**Local** section filters by office, statewide/local, state, text (including candidate names) and followed states.
