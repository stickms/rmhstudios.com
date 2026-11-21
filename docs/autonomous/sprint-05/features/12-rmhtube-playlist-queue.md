# 12 — Queue a playlist in RMHTube

Surface: RMHTube rooms — the Add media dialog
(`components/rmhtube/AddMediaModal.tsx`), the queue (`MediaQueue.tsx`) and the
realtime hub (`server/rmhtube/media-queue.ts`, `schemas.ts`,
`lib/rmhtube/events.ts`). Full-screen app tier. Wave 3. Namespace
`rmhtube-playlists`.

## User story

As a watch-party host, I want to put one of my saved playlists into the room's
queue in one step — and add the room's queue to a playlist when the party was
good — so that the playlists I keep are actually usable where I watch.

## Requirements elicitation

- **What exists (verified):** durable playlists (`Playlist`, `PlaylistItem`,
  `PlaylistCollaborator` in `prisma/schema/rmhtube.prisma`;
  `lib/playlists.server.ts`, `lib/playlists/playlists.contract.ts`) with owner
  and collaborator rights. In a room, each queue item has "Add to playlist"
  (`QueueItem.tsx` → `AddToPlaylistDialog`). The reverse does not exist: the hub
  accepts one URL per `QUEUE_ADD` (`MediaQueue.addToQueue`, validated by
  `QueueAddSchema`, permission "host, or anyone when `allowMemberQueue`",
  capacity `MAX_QUEUE_SIZE = 100`, each URL parsed by `parseMedia` and, failing
  that, probed). `grep -ri "importPlaylist\|queuePlaylist"` finds nothing.
- **Decisions:** (1) a new hub event `QUEUE_ADD_PLAYLIST { playlistId }`: the
  hub loads the playlist from the database, checks the caller owns it or
  collaborates on it, and appends its items in order up to the room's remaining
  capacity, with the same per-item rules as a single add — but **without**
  probing (an item `parseMedia` cannot place is skipped and counted), because
  probing up to 100 URLs is an outbound-request amplifier; (2) "Save queue as
  playlist" in the queue header creates a new playlist from the current queue (≤
  200 items, the playlist module's own cap if lower) through the existing
  playlists API.

## Functional requirements

1. FR-1 The Add media dialog gains a "From a playlist" tab
   (`components/ui/tabs.tsx`) listing the member's playlists and the ones they
   collaborate on (name, item count); choosing one queues it and closes the
   dialog.
2. FR-2 The room sees one system chat line, "{{name}} queued {{count}} videos
   from {{playlist}}", and the queue updates once (one broadcast, not one per
   item).
3. FR-3 If the queue would overflow, only what fits is added and the adder sees
   "Added 12 of 30: the queue is full"; skipped items (no URL, unplaceable) are
   reported as "{{count}} could not be played here".
4. FR-4 Permission is the single-add rule; a member without queue rights does
   not see the tab.
5. FR-5 The queue header gains "Save as playlist" (signed-in members), asking
   for a name in an app-tier dialog (no `window.prompt`), creating the playlist
   and toasting a link to it.

## Non-functional requirements

- **Security:** the payload is zod-validated (`playlistId` cuid). The hub reads
  the playlist with its own Prisma client (`server/rmhtube/prisma-client.ts`),
  selecting only `items.url/title/durationMs/thumbnail`; ownership or
  collaboration is checked against the authenticated socket user, never a client
  claim. A playlist the caller cannot access answers the same error as a missing
  one. URLs pass through `parseMedia` exactly as single adds do. Rate-limited
  per socket with the hub's limiter (`server/rmhtube/rate-limit.ts`): 5 playlist
  adds a minute.
- **Performance:** one query for the playlist (items ordered by position, `take`
  = remaining capacity + skipped allowance ≤ 200); one queue broadcast.
- **Blocks:** a playlist owned by someone who blocked the caller (a
  collaborator's view of an owner who later blocked them) is refused like a
  missing one.
- **i18n:** `rmhtube-playlists` for the dialog, notices and chat line (the chat
  line is rendered client-side from a typed system event, not stored English
  text — follow how existing system lines are rendered in `ChatPanel.tsx`).
- **Design:** RMHTube is a full-screen app (L8): `--app-*` tokens and
  `components/rmhtube/rmhtube.css`; no site-tier CSS.
- **Accessibility:** the playlist list is a labelled listbox; the result notice
  is a polite live region.

## Data model and API

No schema change. `lib/rmhtube/events.ts` gains `QUEUE_ADD_PLAYLIST`;
`server/rmhtube/schemas.ts` gains `QueueAddPlaylistSchema`;
`server/rmhtube/media-queue.ts` gains `addPlaylistToQueue`; pure planning (which
items fit, which are skipped, the notice counts) in
`lib/rmhtube/playlist-queue.ts`. Save-as-playlist calls the existing create and
add-item contracts (check `lib/playlists/playlists.contract.ts` for a bulk add;
if none exists, add `POST /api/playlists/$id/items/bulk` as a registered module
with `implement()` and the module's item cap).

## Testing requirements

- Product suite `lib/rmhtube/__tests__/playlist-queue.product.test.ts`: capacity
  planning, skip counting, order preservation.
- Main suite `server/rmhtube/__tests__/playlist-queue.test.ts` (fake socket and
  Prisma, like the existing hub tests in `server/rmhtube/__tests__/`): owner and
  collaborator can queue; a stranger and a blocked collaborator get the
  not-found error; permission follows `allowMemberQueue`; the room is broadcast
  once; no probe is made.

## Acceptance criteria

- [ ] A host queues a 20-item playlist in one action and everyone sees it in
      order.
- [ ] A full queue takes what fits and says so.
- [ ] A member cannot queue someone else's private playlist.
- [ ] "Save as playlist" creates a playlist matching the queue.
- [ ] RMHTube's own look at 390 px and 1280 px, `ar`.

## Out of scope

Shuffling on add, syncing a playlist live with a room, public playlists.
