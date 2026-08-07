# Multiplayer wave — requests across file boundaries

From the wave implementing `N1` (spectating), `N2` (teams), `N7` (song voting)
and `N9` (invite links) in
[`../plans/2026-08-06-slice-it-feature-ideas.md`](../plans/2026-08-06-slice-it-feature-ideas.md).

Nothing here blocks the branch — every item below has a working stopgap in the
files this wave owns. What follows is what somebody who owns the _other_ files
has to do for these features to work well, plus what was deliberately left out.

---

## 1. `/slice-it` strips the invite parameters (`N9`) — owner: library wave

`app/routes/slice-it/index.tsx` sets `validateSearch: librarySearchSchema`
(`lib/slice-it/library-filters.ts`). That is a `z.object()`, and a zod object
**strips keys it does not declare** — so `?lobby=ABC123` and `?watch=1` are
parsed away before `useSearch()` ever sees them. The invite link the lobby has
been copying to the clipboard since before this wave therefore arrived as an
ordinary `/slice-it` visit.

**Stopgap in place.** `MultiplayerLobby` reads `window.location.search` as well
as the router's parsed search, so links work today and keep working unchanged
once the route declares the parameters.

**The ask.** Add to `librarySearchSchema`:

```ts
/** Invite link (`N9`). Shape-checked again in the client before any join. */
lobby: z.string().trim().max(6).optional().catch(undefined),
/** `1` watches instead of joining (`N1`). */
watch: z.string().trim().max(1).optional().catch(undefined),
```

`.catch(undefined)` rather than a stricter regex on purpose: a malformed code is
a _message in the menu_, which the client already produces, not a route that
fails to render. Once that lands, the `window.location` fallback in
`MultiplayerLobby` can go — it is three lines and one comment.

## 2. Nothing in the menu offers to _watch_ — owner: whoever owns `MainMenu.tsx`

Spectating is reachable three ways today: the eye button beside every row of the
open-lobby list, a `?lobby=CODE&watch=1` link, and `net.spectateLobby(code)`. It
is **not** reachable from the main menu, because `MainMenu.tsx` is outside this
wave. A "Watch a lobby" entry that takes a code and calls `spectateLobby` would
be six lines; the component to render afterwards is
`components/slice-it/spectate/SpectatorView.tsx`, which takes `{ code, onLeave }`
and reads everything else from the store.

## 3. A spectator still needs a session — owner: `net/client.ts` + hub auth

The hub does **not** require an identity to spectate (`slice:spectate` checks no
`identity()`, matching `slice:browse`) — but `connectSliceIt()` refuses to open a
socket without a Better Auth token or a Discord Activity token, so an anonymous
visitor with a spectator link is bounced at the sign-in gate rather than shown
the match. Making anonymous watching real means letting the client connect with
no credential at all, which is a decision about the whole hub's soft auth and not
about Slice It. Left alone deliberately.

## 4. The store has no spectator flag — owner: `lib/slice-it/store.ts`

"Am I watching or seated" lives in `MultiplayerLobby`'s local state and in a
module-level `spectatingCode` in `net/client.ts` (which is what the reconnect
path reads, so a blip re-enters the spectator room instead of silently taking a
seat). A spectator's store holds an ordinary `LobbySnapshot` — that is the point
of the role — so any _other_ component that needs to know will have to be told.
If a second one appears, promote it to the store rather than passing it down.

## 5. Not built, on purpose

- **`slice:song` is still the host's** even in vote mode; the host picking a
  track cancels an open ballot rather than being refused. A room that wants pure
  democracy has no way to take that away from the host.
- **Teams are self-service plus a host balance.** The host cannot move another
  player to a side — only even the room out. `slice:team` is per-seat.
- **Team size is two.** `TeamId` is `'a' | 'b'`; N sides is a different feature
  with a different UI, not a wider union.
- **No `friendsInLobbies`** (the second half of `N9`). It needs
  `lib/messages.server.ts` and the platform friend graph, both outside this wave,
  and the hub has no database read on the browse path today — adding one to
  `slice:browse` would put a query on an event that fires every eight seconds per
  connected client.
- **Vote history is not persisted.** Ballots live and die in lobby memory; the
  server explains a tie-break in a system chat line and a `slice_vote_resolved`
  log, and nothing writes a row.
