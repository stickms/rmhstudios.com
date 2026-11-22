# Syncing

An app that keeps its own copy of your highlights, decks, cards, bookmarks or shelf entries needs two things: what
**changed** since its last sync, and what was **deleted**. Each sync is two calls per kind.

| Kind (`kind=`) | Changed since                                            | Scope            |
| -------------- | -------------------------------------------------------- | ---------------- |
| `highlight`    | `GET /api/v1/me/highlights?since=` (updated after)       | `read:reading`   |
| `shelf_entry`  | `GET /api/v1/me/shelves` (the whole list, at most 500)   | `read:reading`   |
| `deck`         | `GET /api/v1/me/decks` (by update time, newest first)    | `read:study`     |
| `card`         | `GET /api/v1/me/decks/{id}/cards?since=` (created after) | `read:study`     |
| `bookmark`     | `GET /api/v1/me/bookmarks?since=` (bookmarked after)     | `read:bookmarks` |

## The loop

1. Note the time `T` before you start. Page through the changed-since call, following `nextCursor`, and store what comes
   back.
2. Page through `GET /api/v1/me/deleted?kind=<kind>&since=<last sync time>`, following `nextCursor`, and remove each
   `id` from your copy.
3. Save `T` as the last sync time for the next round.

```bash
curl "https://rmhstudios.com/api/v1/me/deleted?kind=highlight&since=2026-11-20T00:00:00.000Z" \
  -H "Authorization: Bearer $RMH_KEY"
# { "data": [ { "id": "clhl1", "kind": "highlight", "deletedAt": "2026-11-22T12:00:00.000Z" } ], "nextCursor": null }
```

Deletions come oldest first, with a cursor on (`deletedAt`, id), at most 500 to a page. An item carries only its `id`,
`kind` and `deletedAt`, never any content. The key needs the read scope of the kind it asks for.

## What a tombstone means

- Deletions are kept for **90 days**. A `since` older than that gets `410 sync_window_expired`; the error message names
  the window. Do a full resync (read every list again, drop what is no longer there) and start the loop from the time it
  began. A `since` inside the window is always complete.
- Deleting a deck is **one** `deck` item. Drop the deck's cards with it; there is no `card` item for each.
- Cards generated from another card (the reverse side, cloze and occlusion cards) are not API objects and are never
  reported.
- A highlight, deck or card id is never reused. A **bookmark's** id is the post's id and a **shelf entry's** id is the
  book's slug, so either can come back after a deletion. Apply a deletion only when its `deletedAt` is later than the
  `bookmarkedAt` or `updatedAt` of the copy you hold.
- Deleting something twice reports it once. Deleting a whole account removes its tombstones.
- Deletions are not sent as webhooks, and posts, comments and follows have no tombstones.
