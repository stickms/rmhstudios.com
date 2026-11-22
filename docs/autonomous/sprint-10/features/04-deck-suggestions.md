# 04 — Suggest a correction to a public deck

Surface: a public deck's page, a copied card's menu, the author's deck editor (`/study/$deckId/edit`), notifications.
Wave 4. Namespace `deck-suggestions`. Site tier (Steel).

## User story

As someone studying from another member's public deck, I want to point out a wrong answer or a typo to its author with
the fix, and as the author, I want to accept it in one step so that everyone who copied the deck gets it, so that public
decks get better instead of every copy fixing the same mistake privately.

## Requirements elicitation

- **What exists (verified):**
  - Public decks and copies: `FlashcardDeck.isPublic`, `clonedFromId`, and per card `originCardId` / `originHash`
    (`prisma/schema/rmhstudy.prisma`); the author's changes reach copies through sprint 06 08's sync
    (`lib/study/deck-sync.server.ts`, `cardsChangedAt`, `DeckUpdatesDialog.tsx`).
  - The author edits a card with `updateCard` (`lib/study/deck-editor.server.ts`), which sets `cardsChangedAt`.
  - The direction from a copier back to the author does not exist: no suggestion, comment or report on a card.
  - Blocks (`UserBlock`), site bans (`User.bannedUntil`) and the notification path (`createNotification`, `notice()`
    keys, sprint 09 19) are the standard gates.
- **Decisions:**
  - **What can be suggested:** a new front and back for an existing basic, reversible or cloze card (occlusion masks and
    pictures are out of scope), plus an optional note (up to 500 characters). Not new cards, not deletions.
  - **Who:** any signed-in member who can read the deck (it is public, or they hold a copy of it), except the author, a
    member blocked in either direction, a site-banned member, and an account younger than 7 days (`User.createdAt`; the
    account-age idea communities already use in `lib/communities/verification.ts`, applied here as a fixed rule). At
    most 20 open suggestions per member per deck, 30 suggestions a day per member (rate limit), and at most 200 open
    suggestions per deck in total (the author's inbox is bounded; the 201st is refused with "This deck has too many open
    suggestions"). A suggestion identical to an open one on the same card (same front and back after trimming) is
    refused as a duplicate, and one that changes nothing is refused.
  - **The author consents (validation pass 2).** Suggestions are inbound writing from strangers, so they are off until
    the author turns them on: `acceptsSuggestions` defaults to **false** for every deck, existing and new. The deck
    editor of a public deck shows one line, "Let people who study this deck suggest fixes", with the switch; turning it
    off hides the action and leaves open suggestions listed for the author to decide. Accepting is always the author's
    explicit act; nothing a suggester sends changes a card on its own.
  - **The author decides:** "Suggestions (N)" in the deck editor lists open ones oldest first with a word-level diff of
    each side; "Accept" applies the text through `updateCardIn` inside the decision's transaction (so copies get it
    through sync), "Accept with edits" opens it in the card form, "Decline" takes an optional reason (up to 200
    characters). A suggestion whose card changed since it was made (its `baseHash` differs) is marked "The card changed
    since" and can still be accepted (the diff is against the current text).
  - **Switch.** "Accept suggestions" on the deck (default off, above); off hides the suggest action and declines nothing
    already open.
  - **Notices.** The author gets one "New suggestions on <deck>" notice while an earlier one for that deck is unread
    (`createNotification`'s `dedupeUnread` on the deck entity; grouping in `lib/notifications/group.ts` is display-only
    and does not limit writes), the suggester "Your suggestion to <deck> was accepted" or "… was not taken" (with the
    reason when given). All through `notice()` keys.
  - **Privacy:** a suggestion is seen by its author and the deck's author only; the deck's public page never lists them.
  - **Erasure:** the suggester's suggestions are erased (open ones disappear from the author's list). A deck author's
    deletion follows the deck's open owner decision (decks stay), so suggestions to their decks stay until declined.
  - **Export:** the suggestions the member made (deck title, card id, proposed text, note, status).

## Functional requirements

1. FR-1 Model `DeckSuggestion` and the deck column `acceptsSuggestions`.
2. FR-2 `lib/study/suggestions.server.ts`: create (gates, the per-member cap under
   `lockKey(tx, 'deck-suggest:<deckId>:<userId>')` and the per-deck cap under `lockKey(tx, 'deck-suggest:<deckId>')`,
   taken in that fixed order: deck key first), list for the author, list mine, accept (applies through `updateCardIn` in
   the same transaction as the status change, compare-and-set on `status = 'open'`), accept-with-edits, decline,
   withdraw.
3. FR-3 Registered endpoints with contracts: `POST /api/study/decks/$id/suggestions`,
   `GET /api/study/decks/$id/suggestions`, `POST /api/study/suggestions/$id/decision`,
   `DELETE /api/study/suggestions/$id`.
4. FR-4 "Suggest a fix" on a public deck's card rows and in a copied card's menu; the author's panel with diffs; the
   switch in the deck settings.
5. FR-5 Three notice keys and their labels; the export section; the registry entry and the erasure operation.

## Non-functional requirements

- **Security:** the author check and the status compare-and-set run inside the transaction; the suggester never learns
  anything about the deck beyond what its public page shows (a deck that turned private after a copy was made shows the
  suggester only their own copy's card); the decline reason is the only author text a suggester sees.
- **Moderation:** suggestion text renders as text (no links made live), `dir="auto"` (`USER_TEXT_RENDERERS`); the author
  can "Decline and block" from the panel (the existing block action), which declines every open suggestion from that
  member.
- **Accessibility:** the diff marks changes with `<ins>`/`<del>` and a text summary ("2 words changed"), never colour
  alone.

## Data model and API

- `DeckSuggestion` (`@@map("deck_suggestion")`): `id`, `deckId` → `FlashcardDeck` (cascade), `cardId` → `Flashcard`
  (cascade), `suggesterId` → `User` (relation name `DeckSuggestions`, cascade), `front`, `back` (limits of the card
  kind), `note String?`, `baseHash`, `status` (`open | accepted | declined | withdrawn`), `declineReason String?`,
  `decidedAt DateTime?`, `createdAt`; `@@index([deckId, status, createdAt])`, `@@index([suggesterId, createdAt])`,
  `@@index([cardId])`. `FlashcardDeck.acceptsSuggestions Boolean @default(false)`. Migration
  `20261130040100_s10_deck_suggestions`.
- New `lib/study/suggestions.ts` (pure: diff, gates), `suggestions-schema.ts`, `suggestions.contract.ts`,
  `suggestions.server.ts`, four endpoint modules under `lib/study/api/`, `components/study/SuggestFixDialog.tsx`,
  `components/study/DeckSuggestions.tsx`.
- Edits: `components/feed/DeckStudyColumn.tsx`, `components/study/CardRow.tsx`, `components/study/DeckEditor.tsx`,
  `prisma/schema/auth.prisma` (anchor), `lib/account/deletion.server.ts` (anchor),
  `lib/account/export-sprint-10.server.ts` (anchor), `lib/account/erasure-registry.ts` (one entry),
  `lib/notifications/notice-keys.ts` and `components/feed/notice-previews.ts` (anchors),
  `components/feed/notification-labels.ts` and its test (anchor), `lib/i18n/user-text.ts` (anchor).

## Testing requirements

- Main suite `lib/study/__tests__/deck-suggestions.test.ts`: the author cannot suggest to their own deck; blocked either
  way refused; banned refused; a deck with suggestions off refused; a private deck without a copy refused; the 20-open
  cap and the 200-per-deck cap under their locks; a duplicate and a no-op refused; accept applies through `updateCardIn`
  and sets `cardsChangedAt`; a second accept of the same suggestion does nothing; decline stores the reason; withdraw by
  the suggester only.
- Main suite `lib/account/__tests__/deck-suggestions-erasure.test.ts` (copy `study-erasure.test.ts`).
- Product suite `lib/study/__tests__/suggestions-diff.product.test.ts`: the word diff and its summary.
- Notice-key catalogue test, notification labels test, notice-preview ratchet, erasure coverage, user-text direction.

## Acceptance criteria

- [ ] A member studying a copy suggests a corrected back; the author sees the diff and accepts; the member's copy then
      offers the change through "Updates from the author".
- [ ] A declined suggestion tells the suggester, with the reason.
- [ ] A deck whose author never turned suggestions on shows no "Suggest a fix"; with the switch on, it appears.
- [ ] A blocked member cannot suggest.

## Out of scope

Suggesting new cards or deletions, public discussion on cards, suggestions to pictures, sounds or occlusion masks,
voting on suggestions.
