# Per-game Community Hub — design (Phase D of the Steam library)

Steam gives every title a Community Hub: discussions, guides, reviews, the market, top
players. We already have guides, reviews, playtime leaders, groups and the card market; the
missing piece is **discussions**. This phase adds them and a hub page that gathers it all.
No screenshots feature (out of scope, by the owner). No coins or cards move.

## Discussions

- `GameThread (gameId, authorId, title 3-120, body 1-4000, lastPostAt, replyCount, locked, pinned)`
  and `GameThreadPost (threadId, authorId, body 1-2000)`.
- Plain text only, rendered with `white-space: pre-wrap`; no HTML, no autolinking, so there is
  no injection surface. Text is normalised (control characters stripped, blank-line runs
  collapsed) before it is validated and stored.
- Anyone reads; signed-in members write. Rate limited (`write`), plus per-account caps
  checked in the database: 10 new threads per rolling day, 30 replies per rolling hour.
  A banned account (`bannedUntil` in the future) cannot post.
- A reply to a locked thread is refused. A title the catalog does not track has no hub.
- Authors can delete their own thread (its replies go with it) or reply. Admins can delete any
  thread or reply and lock or pin a thread. Deleting a reply decrements `replyCount` in the
  same transaction; a reply bumps `lastPostAt` and `replyCount` in the same transaction that
  inserts it, so the counters cannot drift from the rows.

## Surfaces

- `/games/hub/$gameId`: the hub. Discussions (pinned first, then latest activity) with a New
  thread form, and a sidebar: friends who play, most played by, groups, player guides, latest
  reviews, cards on sale.
- `/games/hub/$gameId/t/$threadId`: a thread with its replies and a reply form.
- A Community Hub link on each game page.
- `POST /api/games/hub/{thread,post,delete,moderate}` under `defineHandler`.

## Data lifecycle

Account deletion removes the account's threads (with their replies) and replies. The data
export includes both. Threads are `noindex`: they are user-generated and per-session, and the
indexed pages stay the game hub and the guides.

## Not in this phase

Reactions, reports (use the site's existing flow), pagination beyond the first 100 replies,
screenshots, the workshop.
