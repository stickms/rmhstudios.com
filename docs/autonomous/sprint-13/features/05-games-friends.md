# 05 — What the people you follow are playing

Surface: the games library home (`/games`, the "Friends" section), the game hub's player list. Wave 6. Namespace
`games-friends`. App tier (the games library's own look, `components/steam/steam.css`, L8).

## User story

As a member who plays the site's games, I want the library's home to show which of the people I follow are in a game
right now and what they have done lately (an achievement, a badge, a review, a new thread, hours played this week), so
that I can join them or try what they are enjoying.

## Requirements elicitation

- **What exists (verified):**
  - The read and the assembly are written and never called: `getFriendActivity(viewerId)` in
    `lib/games/activity.server.ts` (the viewer's newest 200 follows; their achievements, crafted badges, reviews and
    hub threads of the last 14 days; playtime of the last 7 days; who is in a game now), and the pure
    `assembleActivity` in `lib/games/activity.ts` ("Playtime-derived entries obey the owner's playtime privacy;
    everything else … is already public on their profile"), typed by `FriendActivity` in
    `lib/games/activity-types.ts`. Only `getNowPlayingFor` from that file is used (`lib/games/profile.server.ts`).
  - `lib/games/activity.server.ts` is already classified as an own-data follow reader in
    `lib/social/__tests__/follow-list-privacy.test.ts` (it reads the viewer's own follows).
  - The library home is `components/steam/LibraryHomePage.tsx` (`app/routes/games/_library/index.tsx`); a game page
    already shows friends who play that game (`SteamFriends` in `components/steam/SteamPeople.tsx`).
  - The read checks no blocks, bans or pending deletions, and it reads achievements and reviews of people the viewer
    follows without the board-privacy rule (`lib/game/leaderboard-privacy.ts`) — so wiring it as it is would show a
    blocked member's activity, a banned member's reviews and the achievements of a member hidden from boards.
- **Decisions:**
  - **Who appears:** people the viewer follows, minus anyone blocked either way, banned, pending deletion or erased,
    and minus any member whose leaderboard privacy hides them from others (their achievements and badges only; their
    reviews and threads are public posts and stay, as on their profile).
  - **What appears:** "Playing now" (one line each, with the game, only if their playtime privacy lets followers see
    it — the existing `canViewPlaytime` rule), then up to 30 recent events newest first, grouped by day in the
    viewer's locale. Each event links to the game, the review or the thread.
  - **Quiet when empty:** no section at all for a member who follows nobody; "Nobody you follow has played lately" when
    they follow people with nothing to show.
  - **Freshness:** fetched with React Query when the home opens (stale after 60 s); no polling, no socket (R5's rule
    applies in spirit: nothing refreshes at rest).
  - **Names:** read now from the user rows, rendered in `<bdi>`.

## Functional requirements

1. FR-1 `lib/games/activity.server.ts`: `getFriendActivity` filters blocks (either way), bans, pending deletions and
   tombstones in its follow read, and applies the board-privacy rule to achievements and badges
   (`leaderboardHiddenUserIds` from `lib/game/leaderboard-privacy.server.ts`); listed in `BOARD_PRIVACY_READ_PATHS` under
   the Wave 0 anchor.
2. FR-2 Endpoint `GET /api/games/friends/activity` (registered module `lib/games/api/games.friends.activity.server.ts`,
   contract `lib/games/friends.contract.ts`, new, `rateLimit: 'read'`, signed-in).
3. FR-3 `components/steam/FriendActivity.tsx` (new): "Playing now" and the event list with day headings, loading
   (skeleton), empty and error states; mounted on `LibraryHomePage.tsx`; content arrives with the M9 fade
   (`components/ui/arrive.tsx`).
4. FR-4 Labels for each event kind as literal keys in the new component (no computed keys).

## Non-functional requirements

- **Privacy:** every rule above has a test; nothing reveals a follow list (only the viewer's own follows are read).
- **Performance:** one endpoint call; the six reads run in parallel as they do now, each bounded (`take`).
- **Accessibility:** the list is a list with headings; each event is one link with its full sentence as text.

## Data model and API

No schema change. `GET /api/games/friends/activity` → `FriendActivity` (`inGame`, `events`).

## Testing requirements

- Main suite `lib/games/__tests__/friend-activity.test.ts`: a blocked (either way), banned, pending-deletion or erased
  followee is absent; a board-hidden followee's achievements and badges are absent and their review stays; playtime
  privacy is honoured for "Playing now"; signed-out is 401.
- Product suite: the existing `assembleActivity` tests stay green; add day grouping in
  `lib/games/__tests__/friend-activity-days.product.test.ts`.
- `components/steam/__tests__/friend-activity.test.tsx` (`renderToStaticMarkup`): empty, playing-now and events.
- Gates: board privacy (`lib/game/__tests__/board-privacy-paths.test.ts`), follow-list privacy, user-text direction, arrival
  coverage.

## Acceptance criteria

- [ ] A member who follows two players sees one of them under "Playing now" while they play.
- [ ] A followee's new achievement appears in the list with a link to the game.
- [ ] A followee the member has blocked never appears.
- [ ] A followee hidden from boards shows no achievements.

## Out of scope

Notifications for friend activity, activity of people who follow the member, inviting a friend into a game.
