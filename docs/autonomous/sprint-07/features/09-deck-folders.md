# 09 — Folders for flashcard decks

Surface: the `/study` deck list (`components/feed/FlashcardsColumn.tsx`) and
the deck page. Wave 4. Namespace `deck-folders`.

## User story

As a student with forty decks across four courses, I want to put them in
folders — "Biology 201", "Spanish", "Driving test" — collapse the ones I am not
studying this term, and review one folder's due cards together, so that my deck
list is not one long column.

## Requirements elicitation

- **What exists (verified):**
  - A member may own up to `MAX_DECKS_PER_MEMBER = 200` decks
    (`lib/study/limits.ts`). `listDecks` (`lib/study.server.ts`) returns them
    as one flat list, rendered by `components/feed/FlashcardsColumn.tsx`, with
    copied public decks (sprint 06 08) mixed in.
  - `FlashcardDeck` (`prisma/schema/rmhstudy.prisma`) has no folder, tag or
    grouping (`grep -i "folder\|tag" prisma/schema/rmhstudy.prisma` finds
    nothing for decks). Saves have folders (`SaveFolder`,
    `prisma/schema/library.prisma`), which is the shape to copy: name, sort
    order, per member.
  - Feature 08 (Wave 1) adds the cross-deck review queue
    (`lib/study/queue.server.ts`, `/study/review`) and due counts that exclude
    suspended cards.
- **Decisions:**
  - **Folders are private to the owner**; at most **30 folders** per member,
    names ≤ 40 characters, unique per member ignoring case; one level (no
    nesting). A deck is in at most one folder (`FlashcardDeck.folderId`); decks
    with no folder are listed under "No folder" at the end.
  - A deck's folder is the **owner's** organisation: public decks keep their
    folder private (the folder is never in a public payload, the marketplace or
    the developer API), and a copied deck starts with no folder.
  - **Collapse state** is a per-member column (`collapsed`) so it follows the
    member across devices.
  - The list shows each folder as a heading row with its deck count and due
    count (from 08's counting, which excludes suspended cards) and a "Review"
    action that opens `/study/review?folder=<id>`; 08's queue gains an optional
    `folder` filter (cards from that folder's decks only, same caps).
  - Moving: each deck's menu gains "Move to folder" (a menu of folders plus
    "New folder…" through `usePrompt`); a folder's menu has Rename (`usePrompt`),
    Move up, Move down, and Delete (`useConfirm`: "Delete the folder; its decks
    move to No folder"). Drag and drop is not required (the move menu is the
    accessible path; drag would be an extra).
  - Deleting a folder never deletes decks.

## Functional requirements

1. FR-1 Folder CRUD and ordering from the deck list.
2. FR-2 The grouped list with collapse, counts and Review per folder.
3. FR-3 "Move to folder" on every owned deck row and on the deck page's menu.
4. FR-4 `/study/review?folder=<id>` reviews one folder (an unknown or foreign
   folder id is a 404 page state, not an empty queue).
5. FR-5 An empty folder shows "No decks yet" in its row; a member with no
   folders sees the list exactly as today plus "New folder".

## Non-functional requirements

- **Correctness:** the 30-folder cap is a check-then-insert under
  `lockKey(tx, 'deck-folders:' + userId)`; moving a deck checks that both the
  deck and the folder belong to the caller in one `updateMany` with both
  conditions.
- **Security:** `auth: 'required'`, `rateLimit: 'write'` on writes; a folder id
  from another member is a 404.
- **Performance:** `listDecks` gains one query for folders; decks are grouped
  in memory (≤ 200). The deck read by folder uses a new index on
  `flashcard_deck(userId, folderId)` — an existing table, so
  `CREATE INDEX CONCURRENTLY` alone in its migration plus `_ensure_valid`.
- **Privacy:** folders are erased with the account and exported (name, order,
  deck ids).
- **Steel:** folder headings are `t-heading` rows on rules, not boxes;
  collapse uses a chevron button with `aria-expanded`.
- **Accessibility:** every action reachable by keyboard; the move menu is a
  menu, not drag-only.
- **i18n:** `deck-folders`.

## Data model and API

- `DeckFolder { id String @id @default(cuid()), userId, name VarChar(40),
  position Int, collapsed Boolean @default(false), createdAt @default(now()) }`,
  `@@index([userId, position])`, relation to `User` (cascade),
  `@@map("deck_folder")`; `FlashcardDeck.folderId String?` with a relation to
  `DeckFolder` (`onDelete: SetNull`) and `@@index([userId, folderId])`.
  Migrations `20261127040100_s07_deck_folders` (table, column, FK),
  `20261127040101_s07_deck_folder_index` (`CREATE INDEX CONCURRENTLY
  "flashcard_deck_userId_folderId_idx" ON "flashcard_deck"("userId",
  "folderId")`, the Prisma default name), `20261127040102_s07_deck_folder_index_ensure_valid`.
  `User` back-relation under the auth anchor.
- `lib/study/folders.ts` (pure: limits, name normalisation, ordering moves),
  `folders-schema.ts`, `folders.contract.ts`, `folders.server.ts`
  (`listFolders`, `createFolder`, `renameFolder`, `moveFolder`,
  `deleteFolder`, `setCollapsed`, `moveDeck`, `deckFolderErasureOps`,
  `exportDeckFolders`).
- Modules `lib/study/api/study.folders.server.ts` (GET, POST),
  `study.folders.$id.server.ts` (PATCH, DELETE),
  `study.decks.$id.folder.server.ts` (PUT `{ folderId | null }`).
- `listDecks` returns `folderId` for owned decks and the folders;
  `lib/study/queue.server.ts` (08) gains the `folder` filter.
- UI: `components/study/DeckFolderRow.tsx`, `MoveToFolderMenu.tsx`; edits to
  `FlashcardsColumn.tsx`, the deck page header menu,
  `app/routes/_site/study/review.tsx` (search param).

## Testing requirements

- Main suite `lib/study/__tests__/deck-folders.test.ts`: CRUD and the cap under
  two concurrent creates; moving a deck into another member's folder refused;
  moving someone else's deck refused; delete moves decks to no folder; a
  public deck's payloads (marketplace, deck page for another viewer, developer
  API) never include `folderId`; the folder filter on the review queue.
- Main suite `lib/account/__tests__/deck-folders-erasure.test.ts`.
- Product suite `lib/study/__tests__/folders.product.test.ts`.
- Gate tests: migration safety, `useeffect-fetch-ratchet`, native-dialog ratchet.

## Acceptance criteria

- [ ] A member makes three folders, moves twelve decks into them, collapses
      one, and sees the same arrangement on another device.
- [ ] "Review" on a folder reviews only that folder's due cards.
- [ ] Deleting a folder keeps its decks.
- [ ] Nobody else can see the folder names.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Nested folders, tags, sharing a folder, folders for public decks in the
marketplace, folders in the developer API.
