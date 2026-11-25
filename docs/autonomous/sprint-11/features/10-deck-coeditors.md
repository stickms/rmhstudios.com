# 10 — Edit a flashcard deck together

Surface: the deck page (`/study/$deckId`: "Editors"), the deck editor (`/study/$deckId/edit`), `/study` ("Shared with
you"), the inbox (an invitation, an acceptance). Wave 2. Namespace `deck-coeditors`. Site tier (Steel).

## User story

As a student in a study group, I want to invite my classmates to add and fix cards in one deck we all study, each on our
own schedule, so that we split the work of writing the cards instead of each making the same deck alone.

## Requirements elicitation

- **What exists (verified):**
  - A deck has one owner (`FlashcardDeck.userId`, `prisma/schema/rmhstudy.prisma`). Every write in
    `lib/study/deck-editor.server.ts` scopes by it (`where: { id: deckId, userId }`, `deck: { userId }` on cards), and
    the readers do the same (`lib/study.server.ts` `getDeck`, `getTestCards`; `lib/study/queue.server.ts`).
  - Reviews are already per member: `FlashcardReview` is unique on `(userId, cardId)`, so two people can study the same
    cards on separate schedules without any change to scheduling.
  - Sharing today is copying: a public deck is cloned (`cloneDeck`), copies get the author's changes by sync (sprint 06
    08), and studiers can suggest corrections the author accepts (sprint 10 04). Nobody but the owner can edit a deck.
  - Per-owner deck fields: `folderId`, `newPerDay`, `testDate`, `extraNew*`, `notifyUpdates` ("Owner only, never
    copied"). Card sounds are heard by their recorder only (sprint 10 02, `CARD_SOUND_READ_PATHS`,
    `lib/study/card-sound.ts`).
- **Decisions:**
  - **Inviting:** the owner invites a member by handle; up to 10 editors per deck, 50 pending invitations per owner.
    Refused: a member blocked either way, a banned or deletion-pending account, the owner, someone already invited, a
    deck that is a copy of another member's public deck (`clonedFromId` set: its cards come from the source by sync).
  - **Accepting:** the invitee gets a notice and accepts or declines on the deck page or in `/study`; the owner gets a
    notice when an invitation is accepted. Invitations expire after 14 days.
  - **An editor can:** see the deck in "Shared with you" on `/study`, study it on their own schedule (their own
    `FlashcardReview` rows, their own due counts and statistics), add, edit, delete and reorder cards, import cards, add
    pictures. **An editor cannot:** change the title, description, visibility, suggestions setting or pace; delete the
    deck; invite or remove others; add or change card sounds (sounds stay with their recorder, so an editor does not
    receive the sound fields at all, and a card an editor saves keeps its sounds untouched).
  - **Removing:** the owner removes an editor; an editor leaves. Their review history stays theirs (it is their study),
    and their cards stay in the deck.
  - **One access rule:** `lib/study/deck-access.server.ts` `deckRole(userId, deckId)` → `'owner' | 'editor' | null`
    (`editor` only for an accepted row). Every card write calls it; every reader that served the owner only accepts an
    editor for study and cards and still returns owner-only fields to the owner alone. A registry `DECK_ACCESS_PATHS`
    (in `lib/study/deck-access.ts`) lists each server file that checks deck ownership, as `role` (calls `deckRole`) or
    `owner-only` (with the reason); a source scan fails a file that filters decks by `userId` and is in neither list.
  - **Copies and suggestions:** an editor's card edits are author edits: copies receive them by sync. Suggestions still
    go to the owner only.
  - **Public decks:** a public deck may have editors; the public page shows "By <owner> with N editors" and no names.
  - **Erasure:** the member's own editor rows (as the editor) are erased. Rows on decks the member owns are kept: the
    decks themselves stay at deletion today (`FlashcardDeck` is `owner` in the erasure registry, the open public-decks
    decision), so their editors keep studying and editing them, and `invitedById` points at the tombstone; nobody can
    invite to such a deck any more. Pictures an editor added stay in the deck (they belong to its cards). **Export:**
    decks the member edits (title, owner's display name, accepted at) and the invitations they sent.

## Functional requirements

1. FR-1 Model `DeckEditor`; the caps under `lockKey(tx, 'deck-editors:<deckId>')` and
   `lockKey(tx, 'deck-invites:<ownerId>')`.
2. FR-2 `lib/study/deck-access.server.ts` (`deckRole`, `requireDeckRole`) and `lib/study/deck-access.ts` (the registry).
3. FR-3 `lib/study/deck-editors.server.ts`: invite, accept, decline, remove, leave, list (owner: every row; editor: the
   owner and the count).
4. FR-4 Card writes in `deck-editor.server.ts`, card pictures (`card-images.server.ts` claims under the uploader's id,
   as today) and import accept an editor; deck settings, delete, visibility, suggestions, pace and sounds stay
   owner-only.
5. FR-5 Readers: `listDecks` (a "Shared with you" group), `getDeck`, the review queue, due counts
   (`DUE_COUNT_READ_PATHS`), practice tests and per-deck statistics accept an editor.
6. FR-6 Registered endpoints with contracts in `lib/study/deck-editors.contract.ts`; writes `rateLimit: 'write'`.
7. FR-7 UI: `components/study/DeckEditors.tsx` (owner's list, invite by handle, remove), the invitation line on the deck
   page, the "Shared with you" group in `components/study/DeckFolderList.tsx`, the editor's reduced editor.
8. FR-8 Notices `deck-editor-invited`, `deck-editor-accepted` with labels and previews; erasure, registry, export under
   the anchors.

## Non-functional requirements

- **Privacy:** the owner-only fields never reach an editor; an invitee who has not accepted sees only the invitation
  line (deck title and owner's name).
- **Integrity:** no path lets an editor change what only the owner may; the registry scan holds it.
- **Accessibility:** names in `<bdi>`; the invite field is labelled and `dir="auto"`.

## Data model and API

- `DeckEditor` (`@@map("deck_editor")`: `deckId` → `FlashcardDeck` (cascade), `userId` → `User` (relation
  `DeckEditorOf`), `invitedById` → `User` (relation `DeckEditorInvites`), `status` `@db.VarChar(10)`
  (`pending | accepted`), `createdAt`, `acceptedAt DateTime?`, `@@id([deckId, userId])`, `@@index([userId, status])`,
  `@@index([invitedById, status])`) in `prisma/schema/rmhstudy.prisma`. Migration `20261201020200_s11_deck_coeditors`.
- Erasure registry: `erase`, with the reason above (rows as the editor erased; rows on the member's kept decks stay).

## Testing requirements

- Main suite `lib/study/__tests__/deck-editors.test.ts`: invite refusals (blocks either way, bans, copies, caps under
  the lock, duplicates); accept and decline; expiry; an editor adds and edits cards but is refused settings, delete,
  visibility, suggestions, pace and sounds; an editor's queue uses their own reviews; removing an editor stops every
  read; a pending invitee reads only the invitation.
- Main suite `lib/study/__tests__/deck-access-registry.test.ts`: the source scan (comments stripped) finds every file
  that filters `flashcardDeck` or `deck:` by `userId` and requires it in `DECK_ACCESS_PATHS`.
- Main suite `lib/account/__tests__/deck-editors-erasure.test.ts`.
- Card-sound registry test (no sound field to an editor), due-count registry, notice-key catalogue and preview ratchet,
  notification labels, route table, `useEffect` ratchet.

## Acceptance criteria

- [ ] An owner invites a classmate, who accepts, adds ten cards and studies them; the owner sees the ten cards and
      studies them on their own schedule.
- [ ] The editor cannot rename or delete the deck.
- [ ] Removing the editor removes the deck from their `/study` at once; their cards stay.
- [ ] A member who has blocked the owner cannot be invited.

## Out of scope

Editors on copied decks, roles beyond owner and editor, per-card authorship display, transferring ownership.
