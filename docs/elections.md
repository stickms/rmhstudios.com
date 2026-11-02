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
