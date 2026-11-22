# 10 — Deletions in the sync APIs

Surface: `GET /api/v1/me/deleted`, `?since=` on the bookmarks and cards lists, the delete paths of highlights, decks,
cards, bookmarks and shelf entries. Wave 5. No namespace (no UI strings).

## User story

As a developer whose app keeps a copy of my highlights, decks and bookmarks in step with the site, I want to ask "what
was deleted since my last sync", so that something I removed on the site disappears from my app too instead of living
there forever.

## Requirements elicitation

- **What exists (verified):**
  - Sprint 07 12's owner follow-up: "the since-sync cannot report deleted highlights (no soft delete); clients compare
    ids". The route says so: `app/routes/api/v1/me/highlights/$id.ts` — "DELETE … Not tombstoned";
    `GET /api/v1/me/highlights?since=` returns rows updated after an instant (`lib/api/v1/reading-schema.ts`).
  - The same hole exists for decks and cards (`/api/v1/me/decks*`, sprint 06 13; decks page by `updatedAt`,
    `lib/api/v1/study-schema.ts`), bookmarks (`/api/v1/me/bookmarks`) and shelf entries (`/api/v1/me/shelves*`).
  - Every deletion goes through one function per kind on the site and the API alike: `deleteHighlight`
    (`lib/reading/highlights.server.ts`), `deleteDeck` and `deleteCard` (`lib/study/deck-editor.server.ts`; 03 edited
    the card write path in wave 1), the bookmark removal and the shelf-entry removal (the implementer names them; every
    caller must go through them — grep for direct `delete`/`deleteMany` on those models outside them and route them
    through, or record each in the test).
- **Decisions:**
  - **A tombstone table.** New `SyncTombstone (id BigInt, userId, kind VarChar(16), entityId VarChar(64), deletedAt)`,
    `@@index([userId, kind, deletedAt])`, `@@index([deletedAt])`; `kind` ∈
    `highlight | deck | card | bookmark | shelf_entry`. Written in the same transaction as the deletion (or immediately
    after, where the deletion is not transactional — say which). A deck deletion writes one `deck` tombstone and **no**
    per-card tombstones (a client drops a deck's cards with the deck; documented). A card's generated siblings are not
    tombstoned (they are not API objects).
  - **Retention:** 90 days. A daily job (`sync.tombstones.prune`, jobs anchor `s09-10`) deletes older rows in batches of
    5 000. A client whose `since` is older than the retention window gets `410 sync_window_expired` and must do a full
    resync (documented, with the window in the error message).
  - **Endpoint:** `GET /api/v1/me/deleted?kind=&since=&cursor=` — the key owner's tombstones of one kind, oldest first
    after `since`, keyset by (`deletedAt`, `id`), page size at most 500. Scope: the read scope of the kind
    (`read:reading` for highlight and shelf_entry, `read:study` for deck and card, `read:bookmarks` for bookmark).
  - **Since on the lists:** `GET /api/v1/me/bookmarks` and `GET /api/v1/me/decks/{id}/cards` accept `since` (updated or
    created after) where they do not already; additive.
  - **Account deletion** erases the member's tombstones (registry `erase`); keys are revoked then anyway. Not exported
    (ids and times of things the member deleted; recorded in the specification).

## Functional requirements

1. FR-1 The model, migration, back-relation (anchor), registry entry.
2. FR-2 Tombstone writes in the five deletion functions, and every other deletion path of those models routed through
   them or listed.
3. FR-3 `GET /api/v1/me/deleted` and the 410 rule.
4. FR-4 `since` on bookmarks and cards.
5. FR-5 The prune job.
6. FR-6 Registry (anchor), SDK, docs, changelog (anchor), `NULLABLE` lines; the guide `docs/developer-api/` gains a
   "Syncing" section describing the two-call loop (changed since, deleted since).

## Non-functional requirements

- **Correctness:** a tombstone is never written for a row that was not deleted (write it from the deletion's own result
  count); deleting twice writes one tombstone (the second deletion deletes nothing); a highlight re-created with the
  same id cannot happen (cuid ids) — documented.
- **Performance:** one insert per deletion; the prune is batched; the read uses the composite index.
- **Privacy:** tombstones carry no content.

## Data model and API

- `SyncTombstone` in new `prisma/schema/sync.prisma` (`@@map("sync_tombstone")`), `User` back-relation under
  `// s09-10 api-sync-deletions`; migration `20261129050100_s09_sync_tombstones`.
- New `lib/sync/tombstones.server.ts` (write, read, prune), `lib/sync/tombstones.ts` (pure: kinds, scope per kind,
  window check), `app/routes/api/v1/me/deleted.ts`. Edits: the five deletion functions, the bookmarks and cards list
  routes and schemas, `server/jobs/index.ts` (anchor), `lib/account/deletion.server.ts` (anchor),
  `lib/account/erasure-registry.ts`, `docs/account-deletion.md`, `lib/api/registry.ts`, `scripts/generate-sdk.ts`,
  `docs/developer-api/changelog.md`.

## Testing requirements

- Main suite `lib/sync/__tests__/tombstones.test.ts` (mock Prisma): each deletion function writes exactly one tombstone
  with its kind; a no-op deletion writes none; a deck deletion writes one; the prune deletes only rows older than 90
  days in batches.
- Main suite `lib/api/v1/__tests__/deleted-api.test.ts`: scope per kind, ordering and cursor, 410 for an expired
  `since`, another member's tombstones never returned.
- Main suite `lib/account/__tests__/sync-tombstone-erasure.test.ts`.
- A source-scan test that no file outside the five deletion functions calls `delete`/`deleteMany` on those five models
  without being listed with a reason (account erasure is listed).

## Acceptance criteria

- [ ] A client syncs highlights, the member deletes one on the site, and the next
      `GET /api/v1/me/deleted?kind=highlight&since=…` returns its id.
- [ ] The same works for a deck, a card, a bookmark and a shelf entry.
- [ ] A `since` older than 90 days returns 410 with the window.
- [ ] Tombstones older than 90 days are gone after the nightly job.

## Out of scope

Tombstones for posts, comments or follows; webhooks for deletions; a change feed of every model.
